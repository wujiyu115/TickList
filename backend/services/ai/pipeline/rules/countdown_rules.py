# -*- coding: utf-8 -*-
"""Rule definitions for countdown CRUD."""

import re
from typing import Optional

from database.dao.countdown_dao import countdown_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.date_parser import extract_date
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条)?倒数日[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条)?倒数日[:：]?\s*(.+)$"
)
_QUERY_PATTERN = re.compile(r"^(?:查看|查询|列出|显示|查)(?:所有|全部)?(?:的)?倒数日$")

def _resolve_countdown_target(user_id: str, keyword: str) -> list[dict]:
    items = countdown_dao.get_user_countdowns(user_id, limit=200)
    return match_entities(keyword, items)

class CreateCountdownRule:
    name = "create_countdown"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        body = m.group(1).strip()
        if not body:
            return None
        title, target_date = extract_date(body)
        if target_date is None:
            # 倒数日必须有目标日期，让 LLM 兜底询问
            return ResolutionResult(status=ResolutionStatus.PASS)
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_countdown",
            params={"title": title, "target_date": target_date.isoformat()},
            reply_text=f"已添加倒数日：{title}",
            source="rule",
        )

class DeleteCountdownRule:
    name = "delete_countdown"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_countdown_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            cd = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_countdown",
                params={"countdown_id": cd["id"]},
                reply_text=f"准备删除倒数日：{cd['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_countdown",
            candidates=[{"id": cd["id"], "title": cd["title"]} for cd in matches],
            reply_text=f"找到 {len(matches)} 个匹配的倒数日，请选择要删除的：",
            source="rule",
        )

class QueryCountdownsRule:
    name = "query_countdowns"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        if _QUERY_PATTERN.match(ctx.message.strip()):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_countdowns",
                params={},
                reply_text="倒数日列表：",
                source="rule",
            )
        return None

RULES = [CreateCountdownRule(), DeleteCountdownRule(), QueryCountdownsRule()]

__all__ = ["CreateCountdownRule", "DeleteCountdownRule", "QueryCountdownsRule", "RULES"]
