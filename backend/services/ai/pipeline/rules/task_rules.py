# -*- coding: utf-8 -*-
"""Rule definitions for task CRUD via natural-language commands.

All rules implement the same shape:
    - ``name``: stable identifier used in trace logs.
    - ``try_match(ctx) -> Optional[ResolutionResult]`` returning ``None`` if
      the rule does not apply.

Multi-match scenarios produce ``NEED_DISAMBIGUATION``; zero-match scenarios
return ``status=PASS`` so the dispatcher can try the next rule (or fall
through to the next handler).
"""

import re
from datetime import datetime, timedelta
from typing import Optional

from database.dao.task_dao import task_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.date_parser import extract_date

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条)?(?:任务)?[:：]?\s*(.+)$"
)
_COMPLETE_PATTERN = re.compile(
    r"^(?:完成|搞定|做完|勾掉|打钩)(?:任务)?[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条)?(?:任务)?[:：]?\s*(.+)$"
)
_QUERY_TODAY_PATTERN = re.compile(r"^(?:今天|今日)的?任务$")
_QUERY_UNFINISHED_PATTERN = re.compile(r"^(?:未完成|没做完|待办)的?任务$")
_QUERY_OVERDUE_PATTERN = re.compile(r"^(?:过期|逾期)(?:的)?任务$")

class CreateTaskRule:
    name = "create_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title_raw = m.group(1).strip()
        if not title_raw:
            return None
        title, due_date = extract_date(title_raw)
        params: dict = {"title": title}
        if due_date is not None:
            params["due_date"] = due_date.isoformat()
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params=params,
            reply_text=f"已添加任务：{title}",
            source="rule",
        )

def _resolve_task_target(user_id: str, keyword: str) -> list[dict]:
    """Lookup user's open tasks and apply entity_matcher."""
    from .shared.entity_matcher import match_entities
    tasks = task_dao.get_user_tasks(user_id, skip=0, limit=200)
    return match_entities(keyword, tasks)

class CompleteTaskRule:
    name = "complete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _COMPLETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="update_task",
                params={"task_id": t["id"], "status": "completed"},
                reply_text=f"已完成：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="update_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            params={"status": "completed"},
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要完成的：",
            source="rule",
        )

class DeleteTaskRule:
    name = "delete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_task",
                params={"task_id": t["id"]},
                reply_text=f"准备删除：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要删除的：",
            source="rule",
        )

class QueryTasksRule:
    name = "query_tasks"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        msg = ctx.message.strip()

        if _QUERY_TODAY_PATTERN.match(msg):
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={
                    "filter": "today",
                    "start_date": today.isoformat(),
                    "end_date": today.isoformat(),
                },
                reply_text="今天的任务如下：",
                source="rule",
            )

        if _QUERY_UNFINISHED_PATTERN.match(msg):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={"filter": "unfinished", "exclude_status": "completed"},
                reply_text="未完成的任务：",
                source="rule",
            )

        if _QUERY_OVERDUE_PATTERN.match(msg):
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday = today - timedelta(days=1)
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={
                    "filter": "overdue",
                    "end_date": yesterday.isoformat(),
                    "exclude_status": "completed",
                },
                reply_text="过期的任务：",
                source="rule",
            )

        return None

RULES = [
    CreateTaskRule(),
    CompleteTaskRule(),
    DeleteTaskRule(),
    QueryTasksRule(),
]

__all__ = [
    "CreateTaskRule",
    "CompleteTaskRule",
    "DeleteTaskRule",
    "QueryTasksRule",
    "RULES",
]
