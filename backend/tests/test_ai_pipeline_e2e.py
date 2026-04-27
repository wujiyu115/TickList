# -*- coding: utf-8 -*-
"""End-to-end tests for pipeline dispatch, executor, and HTTP endpoints."""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from services.ai.pipeline.base import (
    ChatContext,
    ResolutionResult,
    ResolutionStatus,
)
from services.ai.pipeline.executor import execute_resolution

def _events_to_payloads(events: list[str]) -> list[dict]:
    out = []
    for ev in events:
        line = ev.strip()
        assert line.startswith("data: ")
        out.append(json.loads(line[len("data: "):]))
    return out

@pytest.mark.asyncio
class TestExecutorDisambiguation:
    async def test_emits_disambiguation_event(self):
        ctx = ChatContext(user_id="u1", message="完成 报告", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="update_task",
            candidates=[{"id": "t1", "title": "A"}, {"id": "t2", "title": "B"}],
            reply_text="请选择",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert payloads[0]["type"] == "disambiguation"
        assert payloads[0]["pending_intent"] == "update_task"
        assert len(payloads[0]["candidates"]) == 2
        assert payloads[-1]["type"] == "done"

@pytest.mark.asyncio
class TestExecutorDeleteInterception:
    @patch("services.ai.pipeline.executor._describe_delete_target")
    async def test_delete_intent_forced_to_confirmation(self, mock_desc):
        mock_desc.return_value = "周五前交报告"
        ctx = ChatContext(user_id="u1", message="删除", conversation_id="c1")
        # 即便规则层返回的是 EXECUTABLE，executor 也必须拦截
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="delete_task",
            params={"task_id": "t1"},
            reply_text="准备删除",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert payloads[0]["type"] == "confirmation"
        assert payloads[0]["pending_intent"] == "delete_task"
        assert payloads[0]["target_description"] == "周五前交报告"
        assert payloads[-1]["type"] == "done"

@pytest.mark.asyncio
class TestExecutorExecutable:
    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_calls_execute_tool_and_emits_result(self, mock_exec):
        mock_exec.return_value = {"id": "t-new", "title": "写日报"}
        ctx = ChatContext(user_id="u1", message="加任务 写日报", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params={"title": "写日报"},
            reply_text="已添加任务：写日报",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        types = [p["type"] for p in payloads]
        assert "tool_result" in types
        assert "text" in types
        assert types[-1] == "done"
        mock_exec.assert_called_once_with("u1", "create_task", {"title": "写日报"})

    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_dao_exception_emits_error(self, mock_exec):
        mock_exec.side_effect = RuntimeError("db down")
        ctx = ChatContext(user_id="u1", message="x", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params={"title": "x"},
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert any(p["type"] == "error" for p in payloads)
        assert payloads[-1]["type"] == "done"

from services.ai.pipeline.json_mode_handler import JsonModeHandler

@pytest.mark.asyncio
class TestJsonModeHandler:
    class _StubNext:
        def __init__(self):
            self.calls = []

        async def handle(self, ctx):
            self.calls.append(ctx)
            yield 'data: {"type":"stub_next"}\n\n'

    async def test_chitchat_short_circuits(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='{"intent":"chitchat","params":{},"needs_confirmation":false,"reply":"你好呀"}')):
            ctx = ChatContext(user_id="u1", message="你好", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert nxt.calls == []
        joined = "".join(events)
        assert "你好呀" in joined
        assert "json:chitchat" in ctx.trace

    async def test_unknown_falls_through(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='{"intent":"unknown","params":{},"needs_confirmation":false,"reply":""}')):
            ctx = ChatContext(user_id="u1", message="???", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.calls) == 1
        assert ctx.upstream_hint == {"reason": "json_mode_unknown"}

    async def test_invalid_json_falls_through(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='this is not json')):
            ctx = ChatContext(user_id="u1", message="复杂请求", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.calls) == 1
        assert ctx.upstream_hint and ctx.upstream_hint["reason"] == "json_mode_failed"
        assert any(t.startswith("json:fail") for t in ctx.trace)

    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_executable_intent_dispatches_to_executor(self, mock_exec):
        mock_exec.return_value = {"id": "t1", "title": "x"}
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        payload = '{"intent":"create_task","params":{"title":"x"},"needs_confirmation":false,"reply":"已添加 x"}'
        with patch.object(handler, "_call_llm_json_mode", new=AsyncMock(return_value=payload)):
            ctx = ChatContext(user_id="u1", message="帮我加个 x", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert nxt.calls == []
        joined = "".join(events)
        assert '"create_task"' in joined
        assert "json:create_task" in ctx.trace
