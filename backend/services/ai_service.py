# -*- coding: utf-8 -*-
import json
import uuid
from typing import List, Dict, Any, Optional
from datetime import datetime

from database.dao.task_dao import task_dao
from database.dao.note_dao import note_dao
from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.tag_dao import tag_dao
from utils.logger import logger


# ============ Tool Definitions ============

TOOLS = [
    # --- 任务 ---
    {
        "name": "list_tasks",
        "description": "查询任务列表。可按状态、优先级、清单、标签筛选。",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "description": "任务状态: pending/in_progress/completed", "enum": ["pending", "in_progress", "completed"]},
                "exclude_status": {"type": "string", "description": "排除的状态，如 completed"},
                "list_id": {"type": "string", "description": "清单ID"},
                "tags": {"type": "string", "description": "标签，逗号分隔"},
                "priority": {"type": "string", "description": "优先级，逗号分隔(0-4)"},
                "keyword": {"type": "string", "description": "关键词搜索"},
                "start_date": {"type": "string", "description": "开始日期，ISO格式"},
                "end_date": {"type": "string", "description": "结束日期，ISO格式"},
                "limit": {"type": "integer", "description": "返回数量上限", "default": 50},
            },
        },
    },
    {
        "name": "create_task",
        "description": "创建任务。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "任务标题"},
                "priority": {"type": "integer", "description": "优先级0-4", "default": 0},
                "list_id": {"type": "string", "description": "清单ID"},
                "due_date": {"type": "string", "description": "截止日期，ISO格式"},
                "start_time": {"type": "string", "description": "开始时间，ISO格式"},
                "tags": {"type": "string", "description": "标签，逗号分隔"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_task",
        "description": "更新任务。只需传要修改的字段。",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "任务ID"},
                "title": {"type": "string", "description": "新标题"},
                "status": {"type": "string", "description": "新状态", "enum": ["pending", "in_progress", "completed"]},
                "priority": {"type": "integer", "description": "新优先级"},
                "due_date": {"type": "string", "description": "新截止日期"},
                "tags": {"type": "string", "description": "新标签，逗号分隔（会替换全部标签）"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "delete_task",
        "description": "删除任务。",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string", "description": "任务ID"},
            },
            "required": ["task_id"],
        },
    },
    # --- 笔记 ---
    {
        "name": "list_notes",
        "description": "查询笔记列表。可按文件夹、标签筛选。",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string", "description": "文件夹ID"},
                "tags": {"type": "string", "description": "标签，逗号分隔"},
                "limit": {"type": "integer", "description": "返回数量上限", "default": 50},
            },
        },
    },
    {
        "name": "create_note",
        "description": "创建笔记。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "笔记标题"},
                "content": {"type": "string", "description": "笔记内容"},
                "folder_id": {"type": "string", "description": "文件夹ID"},
                "tags": {"type": "string", "description": "标签，逗号分隔"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_note",
        "description": "更新笔记。只需传要修改的字段。",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "笔记ID"},
                "title": {"type": "string", "description": "新标题"},
                "content": {"type": "string", "description": "新内容"},
                "folder_id": {"type": "string", "description": "新文件夹ID"},
                "tags": {"type": "string", "description": "新标签，逗号分隔"},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "delete_note",
        "description": "删除笔记。",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string", "description": "笔记ID"},
            },
            "required": ["note_id"],
        },
    },
    # --- 倒数日 ---
    {
        "name": "list_countdowns",
        "description": "查询倒数日列表。",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "description": "分类: birthday/anniversary/holiday/custom"},
                "limit": {"type": "integer", "description": "返回数量上限", "default": 50},
            },
        },
    },
    {
        "name": "create_countdown",
        "description": "创建倒数日。",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "倒数日标题"},
                "target_date": {"type": "string", "description": "目标日期，ISO格式(YYYY-MM-DD)"},
                "category": {"type": "string", "description": "分类", "default": "custom"},
            },
            "required": ["title", "target_date"],
        },
    },
    {
        "name": "update_countdown",
        "description": "更新倒数日。",
        "input_schema": {
            "type": "object",
            "properties": {
                "countdown_id": {"type": "string", "description": "倒数日ID"},
                "title": {"type": "string", "description": "新标题"},
                "target_date": {"type": "string", "description": "新目标日期"},
            },
            "required": ["countdown_id"],
        },
    },
    {
        "name": "delete_countdown",
        "description": "删除倒数日。",
        "input_schema": {
            "type": "object",
            "properties": {
                "countdown_id": {"type": "string", "description": "倒数日ID"},
            },
            "required": ["countdown_id"],
        },
    },
    # --- 计数器 ---
    {
        "name": "list_counters",
        "description": "查询计数器列表。",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "返回数量上限", "default": 50},
            },
        },
    },
    {
        "name": "create_counter",
        "description": "创建计数器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "计数器名称"},
                "initial_value": {"type": "integer", "description": "初始值", "default": 0},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_counter",
        "description": "更新计数器。可递增、递减、重置或改名。",
        "input_schema": {
            "type": "object",
            "properties": {
                "counter_id": {"type": "string", "description": "计数器ID"},
                "action": {"type": "string", "description": "操作: increment/decrement/reset", "enum": ["increment", "decrement", "reset"]},
                "title": {"type": "string", "description": "新名称"},
            },
            "required": ["counter_id"],
        },
    },
    {
        "name": "delete_counter",
        "description": "删除计数器。",
        "input_schema": {
            "type": "object",
            "properties": {
                "counter_id": {"type": "string", "description": "计数器ID"},
            },
            "required": ["counter_id"],
        },
    },
    # --- 清单 ---
    {
        "name": "list_lists",
        "description": "查询清单列表。",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "create_list",
        "description": "创建清单或文件夹。",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "清单名称"},
                "type": {"type": "string", "description": "类型: folder/list", "default": "list"},
                "parent_id": {"type": "string", "description": "父文件夹ID（仅 folder 时）"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_list",
        "description": "更新清单。",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string", "description": "清单ID"},
                "name": {"type": "string", "description": "新名称"},
            },
            "required": ["list_id"],
        },
    },
    {
        "name": "delete_list",
        "description": "删除清单。",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string", "description": "清单ID"},
            },
            "required": ["list_id"],
        },
    },
    # --- 标签 ---
    {
        "name": "list_tags",
        "description": "查询标签列表。",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "create_tag",
        "description": "创建标签。",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "标签名称"},
                "color": {"type": "string", "description": "标签颜色"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_tag",
        "description": "更新标签。",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag_id": {"type": "string", "description": "标签ID"},
                "name": {"type": "string", "description": "新名称"},
                "color": {"type": "string", "description": "新颜色"},
            },
            "required": ["tag_id"],
        },
    },
    {
        "name": "delete_tag",
        "description": "删除标签。",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag_id": {"type": "string", "description": "标签ID"},
            },
            "required": ["tag_id"],
        },
    },
]


# ============ Conversation Store (in-memory) ============

_conversations: Dict[str, Dict] = {}
_MAX_HISTORY = 20


def _get_or_create_conversation(user_id: str, conversation_id: Optional[str]) -> tuple[str, List[Dict]]:
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
    key = f"{user_id}:{conversation_id}"
    if key not in _conversations:
        _conversations[key] = {"user_id": user_id, "messages": []}
    return conversation_id, _conversations[key]["messages"]


# ============ System Prompt ============

def _build_system_prompt(user_id: str) -> str:
    tasks = task_dao.get_user_tasks(user_id, limit=50)
    notes = note_dao.get_user_notes(user_id, limit=20)
    counters = counter_dao.get_user_counters(user_id, limit=50)
    countdowns = countdown_dao.get_user_countdowns(user_id, limit=50)
    lists = list_dao.get_user_lists(user_id)
    tags = tag_dao.get_user_tags(user_id)

    # Simplify data for prompt
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


# ============ Tool Execution ============

def _execute_tool(user_id: str, tool_name: str, tool_input: Dict[str, Any]) -> Any:
    """Execute a tool by dispatching to existing DAO methods."""
    try:
        # --- 任务 ---
        if tool_name == "list_tasks":
            from datetime import timedelta
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
                params["end_date"] = parsed + timedelta(days=1)
            limit = tool_input.get("limit", 50)
            result = task_dao.get_user_tasks(user_id, skip=0, limit=limit, **params)
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
            if update_data.get("status") == "completed":
                update_data["completed_at"] = datetime.now().isoformat()
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
            result = note_dao.get_user_notes(user_id, skip=0, limit=limit, **params)
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
            result = countdown_dao.get_user_countdowns(user_id, category=tool_input.get("category"), limit=tool_input.get("limit", 50))
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
            result = counter_dao.get_user_counters(user_id, limit=tool_input.get("limit", 50))
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
            # Handle title rename
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
            result = list_dao.get_user_lists(user_id)
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
            result = tag_dao.get_user_tags(user_id)
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
            return {"error": f"未知工具: {tool_name}"}

    except Exception as e:
        logger.error(f"Tool execution error: {tool_name} - {str(e)}")
        return {"error": str(e)}


# ============ Main Chat Method ============

async def chat(user_id: str, message: str, conversation_id: Optional[str] = None) -> Dict[str, Any]:
    """Process a chat message: call LLM, execute tools, return reply."""
    from config.config_loader import config

    ai_config = config.get_ai_config()
    if not ai_config["api_key"]:
        return {"reply": "AI 功能未配置，请联系管理员设置 API Key。", "conversation_id": conversation_id or str(uuid.uuid4()), "actions": []}

    conv_id, history = _get_or_create_conversation(user_id, conversation_id)

    # Add user message to history
    history.append({"role": "user", "content": message})
    # Trim history
    if len(history) > _MAX_HISTORY:
        history[:] = history[-_MAX_HISTORY:]

    system_prompt = _build_system_prompt(user_id)

    # Call LLM API
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ai_config["api_key"])

        actions = []
        messages = history.copy()

        # Loop: LLM may return multiple tool calls in sequence
        max_iterations = 5
        for _ in range(max_iterations):
            response = client.messages.create(
                model=ai_config["model"],
                max_tokens=ai_config["max_tokens"],
                system=system_prompt,
                tools=TOOLS,
                messages=messages,
            )

            # Check if response contains tool calls
            has_tool_use = False
            assistant_content = response.content

            # Build assistant message blocks and collect tool results
            assistant_blocks = []
            tool_results = []
            for block in assistant_content:
                if block.type == "text":
                    assistant_blocks.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    has_tool_use = True
                    tool_result = _execute_tool(user_id, block.name, block.input)
                    result_str = json.dumps(tool_result, ensure_ascii=False, default=str)
                    actions.append({
                        "tool": block.name,
                        "params": block.input,
                        "result": result_str,
                    })
                    assistant_blocks.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str,
                    })

            if has_tool_use:
                # Group all tool_use blocks into ONE assistant message
                # and all tool_results into ONE user message
                messages.append({"role": "assistant", "content": assistant_blocks})
                messages.append({"role": "user", "content": tool_results})

            if not has_tool_use:
                # No tool calls — LLM gave a final text reply
                reply_text = "".join(b.get("text", "") for b in assistant_blocks if b.get("type") == "text")
                # Add final assistant reply to history
                history.append({"role": "assistant", "content": reply_text})
                return {
                    "reply": reply_text,
                    "conversation_id": conv_id,
                    "actions": actions,
                }

        # Max iterations reached — return last text
        reply_text = "".join(b.get("text", "") for b in assistant_blocks if b.get("type") == "text")
        history.append({"role": "assistant", "content": reply_text})
        return {
            "reply": reply_text or "操作过多，请简化请求。",
            "conversation_id": conv_id,
            "actions": actions,
        }

    except Exception as e:
        logger.error(f"AI chat error: {str(e)}")
        return {
            "reply": "AI 服务暂时不可用，请稍后重试。",
            "conversation_id": conv_id,
            "actions": [],
        }