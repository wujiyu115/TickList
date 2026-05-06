# -*- coding: utf-8 -*-
"""Dispatches LLM tool calls to the corresponding DAO operations.

``_execute_tool`` is the single entry point used by both provider-specific
stream implementations. It receives the tool name and parsed input from
the LLM, performs the underlying DAO call, and returns a JSON-serialisable
result (or ``{"error": ...}`` on failure).
"""

from datetime import datetime, timedelta
from typing import Any, Dict

from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.note_dao import note_dao
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao
from utils.logger import logger


def _execute_tool(
    user_id: str,
    tool_name: str,
    tool_input: Dict[str, Any],
    skip_confirmation: bool = False,
) -> Any:
    # 入口统一打印工具名 + 原始入参，便于追溯"前端到底传了什么 → DAO 实际收到什么"
    logger.info(
        f"[AI][tool] enter name={tool_name} user={user_id} "
        f"raw_input_keys={list(tool_input.keys())} raw_input={tool_input}"
    )
    try:
        # --- 删除拦截（统一在此处理）---
        _DELETE_NAMES = {
            "delete_task", "delete_note", "delete_countdown",
            "delete_counter", "delete_list", "delete_tag",
        }
        if tool_name in _DELETE_NAMES and not skip_confirmation:
            # 由调用方（pipeline executor / tools_call_handler）决定如何呈现给用户
            logger.info(f"[AI][tool] {tool_name} -> pending_confirmation (intercepted)")
            return {
                "_pending_confirmation": True,
                "intent": tool_name,
                "params": tool_input,
            }

        # --- 任务 ---
        if tool_name == "list_tasks":
            params = {}
            if tool_input.get("status"): params["status"] = tool_input["status"]
            if tool_input.get("exclude_status"): params["exclude_status"] = tool_input["exclude_status"]
            if tool_input.get("list_id"): params["list_id"] = tool_input["list_id"]
            if tool_input.get("tags"): params["tags"] = [t.strip() for t in tool_input["tags"].split(",")]
            if tool_input.get("keyword"): params["keyword"] = tool_input["keyword"]
            if tool_input.get("priority"): params["priority"] = [int(p.strip()) for p in tool_input["priority"].split(",")]
            if tool_input.get("start_date"):
                params["start_date"] = datetime.fromisoformat(tool_input["start_date"].replace("Z", "+00:00"))
            if tool_input.get("end_date"):
                parsed = datetime.fromisoformat(tool_input["end_date"].replace("Z", "+00:00"))
                # 注意：DAO 端 end_date 用的是 ``<`` 比较（左闭右开），
                # 这里 +1 天是为了兼容"用户只传日期串"的场景（YYYY-MM-DD 视作当天 00:00），
                # 让 [today, today] -> [today 00:00, tomorrow 00:00) 能覆盖整天。
                # 若调用方已传精确到秒/微秒的 ISO 串，会"多覆盖一天"——这是已知的折衷。
                params["end_date"] = parsed + timedelta(days=1)
            limit = tool_input.get("limit", 50)
            logger.info(
                f"[AI][tool] list_tasks -> task_dao.get_user_tasks user={user_id} "
                f"limit={limit} dao_params={params}"
            )
            result = task_dao.get_user_tasks(user_id, skip=0, limit=limit, **params)
            logger.info(f"[AI][tool] list_tasks <- count={len(result)}")
            return {"tasks": result, "count": len(result)}

        elif tool_name == "create_task":
            import uuid as _uuid
            from models import Task
            tags = [t.strip() for t in tool_input.get("tags", "").split(",")] if tool_input.get("tags") else []
            due_date = None
            if tool_input.get("due_date"):
                due_date = datetime.fromisoformat(tool_input["due_date"].replace("Z", "+00:00"))
            start_time = None
            if tool_input.get("start_time"):
                start_time = datetime.fromisoformat(tool_input["start_time"].replace("Z", "+00:00"))
            task = Task(
                id=str(_uuid.uuid4()),
                title=tool_input["title"],
                priority=tool_input.get("priority", 0),
                list_id=tool_input.get("list_id"),
                due_date=due_date,
                start_time=start_time,
                content=tool_input.get("content", ""),
                tags=tags,
                user_id=user_id,
            )
            result = task_dao.create_task(task)
            return result

        elif tool_name == "update_task":
            update_data = {}
            if tool_input.get("title"): update_data["title"] = tool_input["title"]
            if tool_input.get("status"): update_data["status"] = tool_input["status"]
            if tool_input.get("priority"): update_data["priority"] = tool_input["priority"]
            if tool_input.get("due_date"):
                update_data["due_date"] = datetime.fromisoformat(tool_input["due_date"].replace("Z", "+00:00")).isoformat()
            if tool_input.get("tags"):
                update_data["tags"] = [t.strip() for t in tool_input["tags"].split(",")]
            if "content" in tool_input:
                update_data["content"] = tool_input["content"]
            # completed_at 由 task_dao.update_task 内部统一兜底（completed → 写入 now，
            # 反完成 → 清空），这里不再重复设置，避免与 DAO 行为漂移。
            task_dao.update_task(tool_input["task_id"], user_id, update_data)
            return task_dao.get_task_by_id(tool_input["task_id"], user_id)

        elif tool_name == "delete_task":
            task_dao.delete_task(tool_input["task_id"], user_id)
            return {"success": True, "message": "任务已删除"}

        # --- 笔记 ---
        elif tool_name == "list_notes":
            params = {}
            if tool_input.get("folder_id"): params["folder_id"] = tool_input["folder_id"]
            if tool_input.get("tags"): params["tags"] = [t.strip() for t in tool_input["tags"].split(",")]
            limit = tool_input.get("limit", 50)
            logger.info(
                f"[AI][tool] list_notes -> note_dao.get_user_notes user={user_id} "
                f"limit={limit} dao_params={params}"
            )
            result = note_dao.get_user_notes(user_id, skip=0, limit=limit, **params)
            logger.info(f"[AI][tool] list_notes <- count={len(result)}")
            return {"notes": result, "count": len(result)}

        elif tool_name == "create_note":
            import uuid as _uuid
            from models import Note
            tags = [t.strip() for t in tool_input.get("tags", "").split(",")] if tool_input.get("tags") else []
            note = Note(
                id=str(_uuid.uuid4()),
                title=tool_input["title"],
                content=tool_input.get("content", ""),
                folder_id=tool_input.get("folder_id"),
                tags=tags,
                user_id=user_id,
            )
            result = note_dao.create_note(note)
            return result

        elif tool_name == "update_note":
            update_data = {}
            if tool_input.get("title"): update_data["title"] = tool_input["title"]
            if tool_input.get("content"): update_data["content"] = tool_input["content"]
            if tool_input.get("folder_id"): update_data["folder_id"] = tool_input["folder_id"]
            if tool_input.get("tags"): update_data["tags"] = [t.strip() for t in tool_input["tags"].split(",")]
            note_dao.update_note(tool_input["note_id"], user_id, update_data)
            return note_dao.get_note_by_id(tool_input["note_id"], user_id)

        elif tool_name == "delete_note":
            note_dao.delete_note(tool_input["note_id"], user_id)
            return {"success": True, "message": "笔记已删除"}

        # --- 倒数日 ---
        elif tool_name == "list_countdowns":
            category = tool_input.get("category")
            limit = tool_input.get("limit", 50)
            logger.info(
                f"[AI][tool] list_countdowns -> countdown_dao.get_user_countdowns "
                f"user={user_id} category={category!r} limit={limit}"
            )
            result = countdown_dao.get_user_countdowns(user_id, category=category, limit=limit)
            logger.info(f"[AI][tool] list_countdowns <- count={len(result)}")
            return {"countdowns": result, "count": len(result)}

        elif tool_name == "create_countdown":
            import uuid as _uuid
            from models import Countdown
            countdown = Countdown(
                id=str(_uuid.uuid4()),
                title=tool_input["title"],
                target_date=datetime.fromisoformat(tool_input["target_date"].replace("Z", "+00:00")),
                user_id=user_id,
                category=tool_input.get("category", "custom"),
            )
            result = countdown_dao.create_countdown(countdown)
            return result

        elif tool_name == "update_countdown":
            update_data = {}
            if tool_input.get("title"): update_data["title"] = tool_input["title"]
            if tool_input.get("target_date"):
                update_data["target_date"] = datetime.fromisoformat(tool_input["target_date"].replace("Z", "+00:00")).isoformat()
            countdown_dao.update_countdown(user_id, tool_input["countdown_id"], update_data)
            return countdown_dao.get_countdown_by_id(user_id, tool_input["countdown_id"])

        elif tool_name == "delete_countdown":
            countdown_dao.delete_countdown(user_id, tool_input["countdown_id"])
            return {"success": True, "message": "倒数日已删除"}

        # --- 计数器 ---
        elif tool_name == "list_counters":
            limit = tool_input.get("limit", 50)
            logger.info(
                f"[AI][tool] list_counters -> counter_dao.get_user_counters "
                f"user={user_id} limit={limit}"
            )
            result = counter_dao.get_user_counters(user_id, limit=limit)
            logger.info(f"[AI][tool] list_counters <- count={len(result)}")
            return {"counters": result, "count": len(result)}

        elif tool_name == "create_counter":
            import uuid as _uuid
            from models import Counter
            counter = Counter(
                id=str(_uuid.uuid4()),
                title=tool_input["name"],
                initial_value=tool_input.get("initial_value", 0),
                current_value=tool_input.get("initial_value", 0),
                user_id=user_id,
            )
            result = counter_dao.create_counter(counter)
            return result

        elif tool_name == "update_counter":
            counter_id = tool_input["counter_id"]
            action = tool_input.get("action")
            title = tool_input.get("title")
            if title:
                counter_dao.update_counter(user_id, counter_id, {"title": title})
                if not action:
                    return counter_dao.get_counter_by_id(user_id, counter_id)
            if action == "increment":
                existing = counter_dao.get_counter_by_id(user_id, counter_id)
                result = counter_dao.increment_counter(user_id, counter_id, existing["step"])
                return result
            elif action == "decrement":
                existing = counter_dao.get_counter_by_id(user_id, counter_id)
                result = counter_dao.decrement_counter(user_id, counter_id, existing["step"])
                return result
            elif action == "reset":
                existing = counter_dao.get_counter_by_id(user_id, counter_id)
                counter_dao.update_counter(user_id, counter_id, {"current_value": existing["initial_value"]})
                return counter_dao.get_counter_by_id(user_id, counter_id)
            else:
                return {"error": f"未知操作: {action}"}

        elif tool_name == "delete_counter":
            counter_dao.delete_counter(user_id, tool_input["counter_id"])
            return {"success": True, "message": "计数器已删除"}

        # --- 清单 ---
        elif tool_name == "list_lists":
            logger.info(f"[AI][tool] list_lists -> list_dao.get_user_lists user={user_id}")
            result = list_dao.get_user_lists(user_id)
            logger.info(f"[AI][tool] list_lists <- count={len(result)}")
            return {"lists": result, "count": len(result)}

        elif tool_name == "create_list":
            import uuid as _uuid
            from models import TaskList as TL
            tl = TL(
                id=str(_uuid.uuid4()),
                name=tool_input["name"],
                type=tool_input.get("type", "list"),
                parent_id=tool_input.get("parent_id"),
                user_id=user_id,
            )
            result = list_dao.create_list(tl)
            return result

        elif tool_name == "update_list":
            update_data = {}
            if tool_input.get("name"): update_data["name"] = tool_input["name"]
            list_dao.update_list(user_id, tool_input["list_id"], update_data)
            return list_dao.get_list_by_id(user_id, tool_input["list_id"])

        elif tool_name == "delete_list":
            list_dao.delete_list(user_id, tool_input["list_id"])
            return {"success": True, "message": "清单已删除"}

        # --- 标签 ---
        elif tool_name == "list_tags":
            logger.info(f"[AI][tool] list_tags -> tag_dao.get_user_tags user={user_id}")
            result = tag_dao.get_user_tags(user_id)
            logger.info(f"[AI][tool] list_tags <- count={len(result)}")
            return {"tags": result, "count": len(result)}

        elif tool_name == "create_tag":
            import uuid as _uuid
            from models import Tag as TagModel
            tag = TagModel(
                id=str(_uuid.uuid4()),
                name=tool_input["name"],
                color=tool_input.get("color", ""),
                user_id=user_id,
            )
            result = tag_dao.create_tag(tag)
            return result

        elif tool_name == "update_tag":
            update_data = {}
            if tool_input.get("name"): update_data["name"] = tool_input["name"]
            if tool_input.get("color"): update_data["color"] = tool_input["color"]
            tag_dao.update_tag(user_id, tool_input["tag_id"], update_data)
            return tag_dao.get_tag_by_id(user_id, tool_input["tag_id"])

        elif tool_name == "delete_tag":
            tag_dao.delete_tag(user_id, tool_input["tag_id"])
            return {"success": True, "message": "标签已删除"}

        else:
            logger.warning(f"[AI][tool] UNKNOWN_TOOL name={tool_name}")
            return {"error": f"未知工具: {tool_name}"}

    except Exception as e:
        logger.error(
            f"[AI][tool] EXEC_FAIL name={tool_name} user={user_id} "
            f"err={type(e).__name__}: {e}"
        )
        return {"error": str(e)}


__all__ = ["_execute_tool"]
