# -*- coding: utf-8 -*-
"""Unit tests for services.ai.pipeline rule layer and shared utilities."""

import pytest
from services.ai.pipeline.base import (
    ChatContext,
    ResolutionResult,
    ResolutionStatus,
    sse_event,
)

class TestChatContext:
    def test_default_fields(self):
        ctx = ChatContext(user_id="u1", message="hi", conversation_id="c1")
        assert ctx.upstream_hint is None
        assert ctx.trace == []

    def test_trace_is_independent_per_instance(self):
        a = ChatContext(user_id="u1", message="m", conversation_id="c1")
        b = ChatContext(user_id="u2", message="m", conversation_id="c2")
        a.trace.append("rule:x")
        assert b.trace == []

class TestResolutionResult:
    def test_default_status_only(self):
        r = ResolutionResult(status=ResolutionStatus.PASS)
        assert r.intent is None
        assert r.params == {}
        assert r.candidates is None
        assert r.source == "rule"

class TestSseEvent:
    def test_text_event_format(self):
        s = sse_event("text", {"content": "hi"})
        assert s.startswith("data: ")
        assert s.endswith("\n\n")
        assert '"type": "text"' in s
        assert '"content": "hi"' in s

    def test_payload_can_be_string_for_text(self):
        # sse_event 接受 str（视为 content），也接受 dict
        s = sse_event("text", "hello")
        assert '"content": "hello"' in s

from datetime import datetime, date

from services.ai.pipeline.rules.shared.date_parser import extract_date

class TestDateParser:
    def test_no_date_returns_original_text(self):
        text, parsed = extract_date("买牛奶")
        assert text == "买牛奶"
        assert parsed is None

    def test_today_keyword(self, monkeypatch):
        # Freeze "today" so the assertion is stable
        fixed_now = datetime(2026, 4, 27, 10, 0, 0)
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: fixed_now,
        )
        text, parsed = extract_date("今天 写日报")
        assert "今天" not in text
        assert "写日报" in text
        assert parsed is not None
        assert parsed.date() == date(2026, 4, 27)

    def test_tomorrow_keyword(self, monkeypatch):
        fixed_now = datetime(2026, 4, 27, 10, 0, 0)
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: fixed_now,
        )
        text, parsed = extract_date("明天交周报")
        assert "明天" not in text
        assert parsed.date() == date(2026, 4, 28)

    def test_iso_date(self):
        text, parsed = extract_date("2026-05-01 劳动节活动")
        assert "2026-05-01" not in text
        assert parsed.date() == date(2026, 5, 1)

from services.ai.pipeline.rules.shared.verb_lexicon import (
    CREATE_VERBS,
    DELETE_VERBS,
    COMPLETE_VERBS,
    UPDATE_VERBS,
    QUERY_VERBS,
    verbs_pattern,
)

class TestVerbLexicon:
    def test_create_verbs_have_common_words(self):
        assert "添加" in CREATE_VERBS
        assert "新建" in CREATE_VERBS

    def test_pattern_compiles_to_alternation(self):
        pat = verbs_pattern(CREATE_VERBS)
        assert pat.match("添加")
        assert pat.match("新建")
        assert not pat.match("查询")

    def test_no_overlap_between_complete_and_delete(self):
        assert COMPLETE_VERBS.isdisjoint(DELETE_VERBS)

from unittest.mock import MagicMock, patch, AsyncMock

from services.ai.pipeline.rules.task_rules import (
    CreateTaskRule,
    CompleteTaskRule,
    DeleteTaskRule,
    QueryTasksRule,
)

def _ctx(message: str) -> ChatContext:
    return ChatContext(user_id="u1", message=message, conversation_id="c1")

class TestCreateTaskRule:
    def test_match_basic(self):
        result = CreateTaskRule().try_match(_ctx("加任务 写日报"))
        assert result is not None
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "create_task"
        assert result.params["title"] == "写日报"

    def test_no_match_for_unrelated(self):
        assert CreateTaskRule().try_match(_ctx("今天天气怎样")) is None

    def test_extracts_date(self, monkeypatch):
        from datetime import datetime
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: datetime(2026, 4, 27, 10, 0, 0),
        )
        result = CreateTaskRule().try_match(_ctx("加任务 明天 写周报"))
        assert result.params["title"] == "写周报"
        assert result.params.get("due_date") is not None

class TestCompleteTaskRule:
    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_single_match_executable(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [
            {"id": "t1", "title": "写日报"},
        ]
        result = CompleteTaskRule().try_match(_ctx("完成 写日报"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.params == {"task_id": "t1", "status": "completed"}

    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_multi_match_disambiguation(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [
            {"id": "t1", "title": "周五前交报告"},
            {"id": "t2", "title": "改报告 PPT"},
        ]
        result = CompleteTaskRule().try_match(_ctx("完成 报告"))
        assert result.status == ResolutionStatus.NEED_DISAMBIGUATION
        assert len(result.candidates) == 2

    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_zero_match_returns_pass(self, mock_dao):
        mock_dao.get_user_tasks.return_value = []
        result = CompleteTaskRule().try_match(_ctx("完成 不存在"))
        assert result.status == ResolutionStatus.PASS

class TestDeleteTaskRule:
    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_single_match_returns_executable_for_executor_to_intercept(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [{"id": "t1", "title": "写日报"}]
        result = DeleteTaskRule().try_match(_ctx("删除任务 写日报"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_task"
        assert result.params == {"task_id": "t1"}

class TestQueryTasksRule:
    def test_today_keyword(self):
        result = QueryTasksRule().try_match(_ctx("今天的任务"))
        assert result is not None
        assert result.intent == "list_tasks"
        assert result.params.get("filter") == "today" or "start_date" in result.params

    def test_unfinished_keyword(self):
        result = QueryTasksRule().try_match(_ctx("未完成的任务"))
        assert result.intent == "list_tasks"

from services.ai.pipeline.rules.note_rules import (
    CreateNoteRule,
    DeleteNoteRule,
    QueryNotesRule,
)

class TestCreateNoteRule:
    def test_match_basic(self):
        result = CreateNoteRule().try_match(_ctx("新建笔记 读书心得"))
        assert result is not None
        assert result.intent == "create_note"
        assert result.params["title"] == "读书心得"

    def test_no_match_for_task(self):
        assert CreateNoteRule().try_match(_ctx("加任务 写日报")) is None

class TestDeleteNoteRule:
    @patch("services.ai.pipeline.rules.note_rules.note_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_notes.return_value = [{"id": "n1", "title": "读书心得"}]
        result = DeleteNoteRule().try_match(_ctx("删除笔记 读书心得"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_note"
        assert result.params == {"note_id": "n1"}

    @patch("services.ai.pipeline.rules.note_rules.note_dao")
    def test_zero_match_pass(self, mock_dao):
        mock_dao.get_user_notes.return_value = []
        result = DeleteNoteRule().try_match(_ctx("删除笔记 不存在"))
        assert result.status == ResolutionStatus.PASS

class TestQueryNotesRule:
    def test_list_all(self):
        result = QueryNotesRule().try_match(_ctx("列出所有笔记"))
        assert result.intent == "list_notes"

from services.ai.pipeline.rules.countdown_rules import (
    CreateCountdownRule,
    DeleteCountdownRule,
    QueryCountdownsRule,
)

from services.ai.pipeline.rules.counter_rules import (
    CreateCounterRule,
    IncrementCounterRule,
    DecrementCounterRule,
    DeleteCounterRule,
)

class TestCreateCountdownRule:
    def test_match_with_date(self, monkeypatch):
        from datetime import datetime
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: datetime(2026, 4, 27, 10, 0, 0),
        )
        result = CreateCountdownRule().try_match(_ctx("添加倒数日 高考 2026-06-07"))
        assert result is not None
        assert result.intent == "create_countdown"
        assert result.params["title"] == "高考"
        assert "target_date" in result.params

    def test_no_date_returns_pass(self):
        # 倒数日必须有日期，没有则放行让 LLM 兜底（询问日期）
        result = CreateCountdownRule().try_match(_ctx("添加倒数日 没日期"))
        assert result is None or result.status == ResolutionStatus.PASS

class TestDeleteCountdownRule:
    @patch("services.ai.pipeline.rules.countdown_rules.countdown_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_countdowns.return_value = [{"id": "cd1", "title": "高考"}]
        result = DeleteCountdownRule().try_match(_ctx("删除倒数日 高考"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_countdown"

class TestQueryCountdownsRule:
    def test_list_all(self):
        result = QueryCountdownsRule().try_match(_ctx("查看倒数日"))
        assert result.intent == "list_countdowns"

class TestCreateCounterRule:
    def test_match(self):
        result = CreateCounterRule().try_match(_ctx("新建计数器 喝水"))
        assert result is not None
        assert result.intent == "create_counter"
        assert result.params["name"] == "喝水"

class TestIncrementCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_plus_one_pattern(self, mock_dao):
        # 形式 1："喝水 +1"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水 +1"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "update_counter"
        assert result.params == {"counter_id": "c1", "action": "increment"}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_zero_match_pass(self, mock_dao):
        mock_dao.get_user_counters.return_value = []
        result = IncrementCounterRule().try_match(_ctx("不存在 +1"))
        assert result.status == ResolutionStatus.PASS

class TestDecrementCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_minus_one_pattern(self, mock_dao):
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = DecrementCounterRule().try_match(_ctx("喝水 -1"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.params == {"counter_id": "c1", "action": "decrement"}

class TestDeleteCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = DeleteCounterRule().try_match(_ctx("删除计数器 喝水"))
        assert result.intent == "delete_counter"

from services.ai.pipeline.rule_handler import RuleHandler
from services.ai.pipeline.rules import ALL_RULES

class TestRulesRegistry:
    def test_all_rules_aggregates_four_domains(self):
        names = {r.name for r in ALL_RULES}
        # 至少各覆盖 1 条
        assert "create_task" in names
        assert "create_note" in names
        assert "create_countdown" in names
        assert "create_counter" in names

class _StubNext:
    """Async-iterable stub used as next_handler."""

    def __init__(self):
        self.called_with: list = []

    async def handle(self, ctx):
        self.called_with.append(ctx)
        yield 'data: {"type": "stub"}\n\n'

@pytest.mark.asyncio
class TestRuleHandlerDispatch:
    async def test_match_short_circuits_next_handler(self):
        nxt = _StubNext()
        handler = RuleHandler(next_handler=nxt)
        ctx = ChatContext(user_id="u1", message="加任务 写日报", conversation_id="c1")
        events = [ev async for ev in handler.handle(ctx)]
        # 命中 create_task；不应调用 next_handler
        assert nxt.called_with == []
        assert any('"create_task"' in ev or "create_task" in ev for ev in events)
        assert any("rule:create_task" in t for t in ctx.trace)

    async def test_no_rule_match_falls_through(self):
        nxt = _StubNext()
        handler = RuleHandler(next_handler=nxt)
        ctx = ChatContext(user_id="u1", message="今天的天气如何", conversation_id="c1")
        events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.called_with) == 1
        assert ctx.upstream_hint == {"reason": "no_rule_match"}
        assert "rule:miss" in ctx.trace
        assert any('"stub"' in ev for ev in events)
