# -*- coding: utf-8 -*-
"""Rule definitions for counter CRUD and quick +1/-1 operations."""

import re
from typing import Optional

from database.dao.counter_dao import counter_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.entity_matcher import match_entities
from .shared.num_parser import parse_amount

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
# 数量 token：阿拉伯数字 或 中文数字（含全角数字）
_NUM = r"(?:[0-9０-９]+|[零一二三四五六七八九十两]+)"
# 可选量词单位
_UNIT = r"(?:次|下|个)?"
# 递增：
#   后缀形（名字在前）: <name>(+|＋|加)<num?><unit?>
#   前缀形（符号在前）: (+|＋)<num?> <name>
_INCREMENT_PATTERN = re.compile(
    rf"^\s*(?:(?P<name_a>.+?)\s*(?:\+|＋|加)\s*(?P<num_a>{_NUM})?\s*{_UNIT}"
    rf"|(?:\+|＋)\s*(?P<num_b>{_NUM})?\s+(?P<name_b>.+?))\s*$"
)
# 递减：同结构，动词换成 - / － / 减
_DECREMENT_PATTERN = re.compile(
    rf"^\s*(?:(?P<name_a>.+?)\s*(?:-|－|减)\s*(?P<num_a>{_NUM})?\s*{_UNIT}"
    rf"|(?:-|－)\s*(?P<num_b>{_NUM})?\s+(?P<name_b>.+?))\s*$"
)

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
    ctx: ChatContext, action: str, keyword: str, amount: int
) -> ResolutionResult:
    matches = _resolve_counter_target(ctx.user_id, keyword)
    if not matches:
        return ResolutionResult(status=ResolutionStatus.PASS)
    if len(matches) == 1:
        c = matches[0]
        sign = "+" if action == "increment" else "-"
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="update_counter",
            params={"counter_id": c["id"], "action": action, "amount": amount},
            reply_text=f"{c['title']} {sign}{amount}",
            source="rule",
        )
    return ResolutionResult(
        status=ResolutionStatus.NEED_DISAMBIGUATION,
        intent="update_counter",
        candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
        params={"action": action, "amount": amount},
        reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择：",
        source="rule",
    )

class IncrementCounterRule:
    name = "increment_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _INCREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group("name_a") or m.group("name_b") or "").strip()
        if not keyword:
            return None
        amount = parse_amount(m.group("num_a") or m.group("num_b"))
        return _build_inc_dec_result(ctx, "increment", keyword, amount)

class DecrementCounterRule:
    name = "decrement_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DECREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group("name_a") or m.group("name_b") or "").strip()
        if not keyword:
            return None
        amount = parse_amount(m.group("num_a") or m.group("num_b"))
        return _build_inc_dec_result(ctx, "decrement", keyword, amount)

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
