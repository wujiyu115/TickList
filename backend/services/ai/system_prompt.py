# -*- coding: utf-8 -*-
"""Builds the system prompt injected at the start of every AI conversation.

The prompt embeds a compact snapshot of the user's current data
(tasks / notes / counters / countdowns / lists / tags) so the LLM can
reason about what already exists before deciding to call a tool.

快照格式由 ai.system_prompt_format 配置项控制（json | toon）。
- json: 自描述、稳定、tokenizer 友好，作为基线
- toon: Token-Oriented Object Notation，对同构数组用「表头+CSV行」节省 token
"""

from config.config_loader import config

from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.note_dao import note_dao
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao
from utils.logger import logger

from .formatters import get_formatter


def _collect_snapshot(user_id: str) -> dict:
    """从 DAO 拉取用户数据并整理成统一的 dict 结构（与 formatters 约定一致）。"""
    # 排除已完成任务：LLM 在做意图判断时关心的是"还能操作的实体"，
    # 已完成任务对 create/update/delete 决策几乎无价值，反而占用 token 和注意力。
    # 用户若需要查询已完成任务，会通过 list_tasks 工具显式发起。
    tasks = task_dao.get_user_tasks(user_id, exclude_status="completed", limit=50)
    notes = note_dao.get_user_notes(user_id, limit=20)
    counters = counter_dao.get_user_counters(user_id, limit=50)
    countdowns = countdown_dao.get_user_countdowns(user_id, limit=50)
    lists = list_dao.get_user_lists(user_id)
    tags = tag_dao.get_user_tags(user_id)

    return {
        "tasks": [
            {"id": t["id"], "title": t["title"], "status": t["status"],
             "priority": t["priority"], "due_date": t.get("due_date"),
             "list_id": t.get("list_id"), "tags": t.get("tags", [])}
            for t in tasks
        ],
        "notes": [
            {"id": n["id"], "title": n["title"], "folder_id": n.get("folder_id"), "tags": n.get("tags", [])}
            for n in notes
        ],
        "counters": [
            {"id": c["id"], "name": c["title"], "value": c["current_value"]}
            for c in counters
        ],
        "countdowns": [
            {"id": c["id"], "title": c["title"], "target_date": c["target_date"]}
            for c in countdowns
        ],
        "lists": [
            {"id": l["id"], "name": l["name"], "type": l["type"]}
            for l in lists
        ],
        "tags": [
            {"id": t["id"], "name": t["name"]}
            for t in tags
        ],
    }


def _build_system_prompt(user_id: str) -> str:
    snapshot = _collect_snapshot(user_id)

    fmt = config.get("ai.system_prompt_format", "toon", "AI_SYSTEM_PROMPT_FORMAT") or "toon"
    formatter = get_formatter(fmt)
    snapshot_text = formatter(snapshot)

    logger.debug(f"[AI][system_prompt] format={fmt} snapshot_chars={len(snapshot_text)}")

    if fmt.lower() == "toon":
        # TOON 格式说明，提示 LLM 如何解读
        format_hint = (
            "用户当前数据快照（TOON 格式）：每段以 `<entity>[N]{字段头}:` 开头，"
            "随后每行是一条记录，字段顺序与表头一致，逗号分隔；列表型字段（如 tags）"
            "内部用 `|` 分隔；空字段用空字符串表示。"
        )
    else:
        format_hint = "用户当前数据（JSON 格式）："

    return f"""你是 TickList 的智能助手。{format_hint}
{snapshot_text}

可用操作见 tools 定义。用自然语言回复用户。
删除操作需先确认意图后再执行。"""


__all__ = ["_build_system_prompt"]