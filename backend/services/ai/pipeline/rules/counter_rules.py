# -*- coding: utf-8 -*-
"""Rule definitions for counter CRUD and quick +1/-1 operations."""

import re
from typing import Optional

from database.dao.counter_dao import counter_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
# 匹配 "喝水 +1" / "喝水+1" / "+1 喝水"
_INCREMENT_PATTERN = re.compile(r"^\s*(?:(.+?)\s*\+1|\+1\s+(.+?))\s*$")
_DECREMENT_PATTERN = re.compile(r"^\s*(?:(.+?)\s*-1|-1\s+(.+?))\s*$")

def _resolve_counter_target(user_id: str, keyword: str) -> list[dict]:
    items = counter_dao.get_user_counters(user_id, limit=200)
    return match_entities(keyword, items)

class CreateCounterRule:
    name = "create_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        name = m.group(1).strip()
        if not name:
            return None
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_counter",
            params={"name": name},
            reply_text=f"已新建计数器：{name}",
            source="rule",
        )

def _build_inc_dec_result(
    ctx: ChatContext, action: str, keyword: str
) -> ResolutionResult:
    matches = _resolve_counter_target(ctx.user_id, keyword)
    if not matches:
        return ResolutionResult(status=ResolutionStatus.PASS)
    if len(matches) == 1:
        c = matches[0]
        verb = "+1" if action == "increment" else "-1"
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="update_counter",
            params={"counter_id": c["id"], "action": action},
            reply_text=f"{c['title']} {verb}",
            source="rule",
        )
    return ResolutionResult(
        status=ResolutionStatus.NEED_DISAMBIGUATION,
        intent="update_counter",
        candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
        params={"action": action},
        reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择：",
        source="rule",
    )

class IncrementCounterRule:
    name = "increment_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _INCREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group(1) or m.group(2) or "").strip()
        if not keyword:
            return None
        return _build_inc_dec_result(ctx, "increment", keyword)

class DecrementCounterRule:
    name = "decrement_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DECREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group(1) or m.group(2) or "").strip()
        if not keyword:
            return None
        return _build_inc_dec_result(ctx, "decrement", keyword)

class DeleteCounterRule:
    name = "delete_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_counter_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            c = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_counter",
                params={"counter_id": c["id"]},
                reply_text=f"准备删除计数器：{c['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_counter",
            candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
            reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择要删除的：",
            source="rule",
        )

RULES = [
    CreateCounterRule(),
    IncrementCounterRule(),
    DecrementCounterRule(),
    DeleteCounterRule(),
]

__all__ = [
    "CreateCounterRule",
    "IncrementCounterRule",
    "DecrementCounterRule",
    "DeleteCounterRule",
    "RULES",
]
