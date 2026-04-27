# -*- coding: utf-8 -*-
"""Rule definitions for note CRUD."""

import re
from typing import Optional

from database.dao.note_dao import note_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条|篇)?(?:笔记)[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条|篇)?(?:笔记)[:：]?\s*(.+)$"
)
_QUERY_PATTERN = re.compile(r"^(?:列出|查看|显示|查)(?:所有|全部)?(?:的)?笔记$")

def _resolve_note_target(user_id: str, keyword: str) -> list[dict]:
    notes = note_dao.get_user_notes(user_id, skip=0, limit=200)
    return match_entities(keyword, notes)

class CreateNoteRule:
    name = "create_note"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title = m.group(1).strip()
        if not title:
            return None
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_note",
            params={"title": title},
            reply_text=f"已新建笔记：{title}",
            source="rule",
        )

class DeleteNoteRule:
    name = "delete_note"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_note_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            n = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_note",
                params={"note_id": n["id"]},
                reply_text=f"准备删除笔记：{n['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_note",
            candidates=[{"id": n["id"], "title": n["title"]} for n in matches],
            reply_text=f"找到 {len(matches)} 个匹配的笔记，请选择要删除的：",
            source="rule",
        )

class QueryNotesRule:
    name = "query_notes"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        if _QUERY_PATTERN.match(ctx.message.strip()):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_notes",
                params={},
                reply_text="笔记列表：",
                source="rule",
            )
        return None

RULES = [CreateNoteRule(), DeleteNoteRule(), QueryNotesRule()]

__all__ = ["CreateNoteRule", "DeleteNoteRule", "QueryNotesRule", "RULES"]
