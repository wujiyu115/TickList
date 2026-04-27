# -*- coding: utf-8 -*-
"""End-to-end tests for the AI processing pipeline.

Verifies that the full handler chain (RuleHandler -> JsonModeHandler -> ToolsCallHandler)
correctly processes user messages and produces the expected SSE events.
"""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from services.ai.pipeline.base import (
    ChatContext,
    Handler,
    ResolutionResult,
    ResolutionStatus,
    sse_event,
)
from services.ai.pipeline.executor import execute_resolution
from services.ai.pipeline.json_mode_handler import JsonModeHandler
from services.ai.pipeline.tools_call_handler import ToolsCallHandler


@pytest.mark.asyncio
class TestPipelineAssembly:
    @patch("services.ai.pipeline.pipeline.config")
    async def test_full_chain_assembled_when_all_layers_enabled(self, mock_config):
        mock_config.get_ai_config.return_value = {
            "provider": "claude", "api_key": "fake", "model": "m", "max_tokens": 100,
            "pipeline": {"enabled": True, "enable_rule_layer": True,
                         "enable_json_mode_layer": True},
        }
        from services.ai.pipeline.pipeline import _build_pipeline
        head = _build_pipeline()
        # 链路应为 RuleHandler -> JsonModeHandler -> ToolsCallHandler
        from services.ai.pipeline.rule_handler import RuleHandler
        from services.ai.pipeline.json_mode_handler import JsonModeHandler
        from services.ai.pipeline.tools_call_handler import ToolsCallHandler
        assert isinstance(head, RuleHandler)
        assert isinstance(head.next_handler, JsonModeHandler)
        assert isinstance(head.next_handler.next_handler, ToolsCallHandler)
        assert head.next_handler.next_handler.next_handler is None

    @patch("services.ai.pipeline.pipeline.config")
    async def test_rule_layer_skipped(self, mock_config):
        mock_config.get_ai_config.return_value = {
            "provider": "claude", "api_key": "fake", "model": "m", "max_tokens": 100,
            "pipeline": {"enabled": True, "enable_rule_layer": False,
                         "enable_json_mode_layer": True},
        }
        from services.ai.pipeline.pipeline import _build_pipeline
        from services.ai.pipeline.json_mode_handler import JsonModeHandler
        head = _build_pipeline()
        assert isinstance(head, JsonModeHandler)


class TestToolsExecutorSkipConfirmation:
    """Verify the new skip_confirmation flag short-circuits delete confirmation."""

    @patch("services.ai.tools_executor.task_dao")
    def test_delete_returns_pending_when_not_skipping(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        mock_dao.get_task_by_id.return_value = {"id": "t1", "title": "x"}
        result = _execute_tool("u1", "delete_task", {"task_id": "t1"})
        assert isinstance(result, dict)
        assert result.get("_pending_confirmation") is True
        # 未真正删除
        mock_dao.delete_task.assert_not_called()

    @patch("services.ai.tools_executor.task_dao")
    def test_delete_executes_when_skipping(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        result = _execute_tool("u1", "delete_task", {"task_id": "t1"}, skip_confirmation=True)
        mock_dao.delete_task.assert_called_once_with("t1", "u1")

from fastapi.testclient import TestClient

@pytest.mark.asyncio
class TestEndpoints:
    def _client_with_user(self, user_id="u1"):
        from app import app
        from middleware.jwt_middleware import get_current_user
        app.dependency_overrides[get_current_user] = lambda: user_id
        return TestClient(app)

    def test_disambiguate_endpoint_streams_executable_result(self):
        client = self._client_with_user()
        with patch("routes.ai._execute_tool") as mock_exec:
            mock_exec.return_value = {"id": "t1", "status": "completed"}
            resp = client.post("/api/ai/disambiguate", json={
                "conversation_id": "c1",
                "pending_intent": "update_task",
                "selected_id": "t1",
                "extra_params": {"status": "completed"},
            })
            assert resp.status_code == 200
            body = resp.text
            assert "tool_result" in body or '"type": "tool_result"' in body
            assert '"type": "done"' in body
            mock_exec.assert_called_once()

    def test_confirm_cancel_does_not_consume_rate_limit(self):
        client = self._client_with_user("u_cancel")
        # 调取 21 次取消，正常 chat 限额 20/min；如果消耗配额第 21 次会 429
        for _ in range(21):
            resp = client.post("/api/ai/confirm", json={
                "conversation_id": "c1",
                "pending_intent": "delete_task",
                "params": {"task_id": "x"},
                "confirmed": False,
            })
            assert resp.status_code == 200, f"unexpected status {resp.status_code}"
        # 后续 chat 仍未受影响
        # （此处仅断言取消未消耗，不再验证 chat 实调）

    def test_confirm_executes_with_skip_confirmation(self):
        client = self._client_with_user()
        with patch("routes.ai._execute_tool") as mock_exec:
            mock_exec.return_value = {"success": True}
            resp = client.post("/api/ai/confirm", json={
                "conversation_id": "c1",
                "pending_intent": "delete_task",
                "params": {"task_id": "t1"},
                "confirmed": True,
            })
            assert resp.status_code == 200
            assert mock_exec.call_args.kwargs.get("skip_confirmation") is True