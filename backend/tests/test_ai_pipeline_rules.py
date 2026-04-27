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
