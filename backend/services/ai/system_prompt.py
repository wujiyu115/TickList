# -*- coding: utf-8 -*-
"""Builds the system prompt injected at the start of every AI conversation.

The prompt embeds a compact JSON snapshot of the user's current data
(tasks / notes / counters / countdowns / lists / tags) so the LLM can
reason about what already exists before deciding to call a tool.
"""

import json

from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.note_dao import note_dao
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao


def _build_system_prompt(user_id: str) -> str:
    tasks = task_dao.get_user_tasks(user_id, limit=50)
    notes = note_dao.get_user_notes(user_id, limit=20)
    counters = counter_dao.get_user_counters(user_id, limit=50)
    countdowns = countdown_dao.get_user_countdowns(user_id, limit=50)
    lists = list_dao.get_user_lists(user_id)
    tags = tag_dao.get_user_tags(user_id)

    task_summaries = [
        {"id": t["id"], "title": t["title"], "status": t["status"],
         "priority": t["priority"], "due_date": t.get("due_date"), "tags": t.get("tags", [])}
        for t in tasks
    ]
    note_summaries = [
        {"id": n["id"], "title": n["title"], "folder_id": n.get("folder_id"), "tags": n.get("tags", [])}
        for n in notes
    ]
    counter_summaries = [
        {"id": c["id"], "name": c["title"], "value": c["current_value"]}
        for c in counters
    ]
    countdown_summaries = [
        {"id": c["id"], "title": c["title"], "target_date": c["target_date"]}
        for c in countdowns
    ]
    list_summaries = [
        {"id": l["id"], "name": l["name"], "type": l["type"]}
        for l in lists
    ]
    tag_summaries = [
        {"id": t["id"], "name": t["name"]}
        for t in tags
    ]

    return f"""你是 TickList 的智能助手。用户当前数据：
- 任务：{json.dumps(task_summaries, ensure_ascii=False)}
- 笔记：{json.dumps(note_summaries, ensure_ascii=False)}
- 计数器：{json.dumps(counter_summaries, ensure_ascii=False)}
- 倒数日：{json.dumps(countdown_summaries, ensure_ascii=False)}
- 清单：{json.dumps(list_summaries, ensure_ascii=False)}
- 标签：{json.dumps(tag_summaries, ensure_ascii=False)}

可用操作见 tools 定义。用自然语言回复用户。
删除操作需先确认意图后再执行。"""


__all__ = ["_build_system_prompt"]
