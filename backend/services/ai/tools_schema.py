# -*- coding: utf-8 -*-
"""Anthropic-format tool schemas exposed to the LLM.

This module is data-only: it defines the ``TOOLS`` list consumed by both
the Claude streaming path (directly) and the OpenAI streaming path (after
conversion via ``openai_stream._anthropic_tools_to_openai_tools``).
"""

TOOLS = [
    # --- 任务 ---
    {
        "name": "list_tasks",
        "description": "查询任务",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                "exclude_status": {"type": "string"},
                "list_id": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔"},
                "priority": {"type": "string", "description": "0-4,逗号分隔"},
                "keyword": {"type": "string"},
                "start_date": {"type": "string", "description": "ISO日期"},
                "end_date": {"type": "string", "description": "ISO日期"},
                "limit": {"type": "integer", "default": 50},
            },
        },
    },
    {
        "name": "create_task",
        "description": "创建任务",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "priority": {"type": "integer", "default": 0},
                "list_id": {"type": "string"},
                "due_date": {"type": "string", "description": "ISO日期"},
                "start_time": {"type": "string", "description": "ISO时间"},
                "tags": {"type": "string", "description": "逗号分隔"},
                "content": {"type": "string", "description": "检查事项JSON字符串，格式: [{text:string,checked:boolean}]，completedAt 由后端自动补，无需传"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_task",
        "description": "更新任务，只传要改的字段",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                "priority": {"type": "integer"},
                "due_date": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔,替换全部"},
                "content": {"type": "string", "description": "检查事项JSON字符串，格式: [{text:string,checked:boolean}]，completedAt 由后端自动补，无需传"},
            },
            "required": ["task_id"],
        },
    },
    {
        "name": "delete_task",
        "description": "删除任务",
        "input_schema": {
            "type": "object",
            "properties": {"task_id": {"type": "string"}},
            "required": ["task_id"],
        },
    },
    # --- 笔记 ---
    {
        "name": "list_notes",
        "description": "查询笔记",
        "input_schema": {
            "type": "object",
            "properties": {
                "folder_id": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔"},
                "limit": {"type": "integer", "default": 50},
            },
        },
    },
    {
        "name": "create_note",
        "description": "创建笔记",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string"},
                "folder_id": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔"},
            },
            "required": ["title"],
        },
    },
    {
        "name": "update_note",
        "description": "更新笔记，只传要改的字段",
        "input_schema": {
            "type": "object",
            "properties": {
                "note_id": {"type": "string"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "folder_id": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔"},
            },
            "required": ["note_id"],
        },
    },
    {
        "name": "delete_note",
        "description": "删除笔记",
        "input_schema": {
            "type": "object",
            "properties": {"note_id": {"type": "string"}},
            "required": ["note_id"],
        },
    },
    # --- 倒数日 ---
    {
        "name": "list_countdowns",
        "description": "查询倒数日",
        "input_schema": {
            "type": "object",
            "properties": {
                "category": {"type": "string", "enum": ["birthday", "anniversary", "holiday", "custom"]},
                "limit": {"type": "integer", "default": 50},
            },
        },
    },
    {
        "name": "create_countdown",
        "description": "创建倒数日",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "target_date": {"type": "string", "description": "YYYY-MM-DD"},
                "category": {"type": "string", "default": "custom"},
            },
            "required": ["title", "target_date"],
        },
    },
    {
        "name": "update_countdown",
        "description": "更新倒数日",
        "input_schema": {
            "type": "object",
            "properties": {
                "countdown_id": {"type": "string"},
                "title": {"type": "string"},
                "target_date": {"type": "string"},
            },
            "required": ["countdown_id"],
        },
    },
    {
        "name": "delete_countdown",
        "description": "删除倒数日",
        "input_schema": {
            "type": "object",
            "properties": {"countdown_id": {"type": "string"}},
            "required": ["countdown_id"],
        },
    },
    # --- 计数器 ---
    {
        "name": "list_counters",
        "description": "查询计数器",
        "input_schema": {
            "type": "object",
            "properties": {"limit": {"type": "integer", "default": 50}},
        },
    },
    {
        "name": "create_counter",
        "description": "创建计数器",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "initial_value": {"type": "integer", "default": 0},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_counter",
        "description": "更新计数器(递增/递减/重置/改名)",
        "input_schema": {
            "type": "object",
            "properties": {
                "counter_id": {"type": "string"},
                "action": {"type": "string", "enum": ["increment", "decrement", "reset"]},
                "title": {"type": "string"},
            },
            "required": ["counter_id"],
        },
    },
    {
        "name": "delete_counter",
        "description": "删除计数器",
        "input_schema": {
            "type": "object",
            "properties": {"counter_id": {"type": "string"}},
            "required": ["counter_id"],
        },
    },
    # --- 清单 ---
    {
        "name": "list_lists",
        "description": "查询清单",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_list",
        "description": "创建清单/文件夹",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "type": {"type": "string", "enum": ["folder", "list"], "default": "list"},
                "parent_id": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_list",
        "description": "更新清单",
        "input_schema": {
            "type": "object",
            "properties": {
                "list_id": {"type": "string"},
                "name": {"type": "string"},
            },
            "required": ["list_id"],
        },
    },
    {
        "name": "delete_list",
        "description": "删除清单",
        "input_schema": {
            "type": "object",
            "properties": {"list_id": {"type": "string"}},
            "required": ["list_id"],
        },
    },
    # --- 标签 ---
    {
        "name": "list_tags",
        "description": "查询标签",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "create_tag",
        "description": "创建标签",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "color": {"type": "string"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "update_tag",
        "description": "更新标签",
        "input_schema": {
            "type": "object",
            "properties": {
                "tag_id": {"type": "string"},
                "name": {"type": "string"},
                "color": {"type": "string"},
            },
            "required": ["tag_id"],
        },
    },
    {
        "name": "delete_tag",
        "description": "删除标签",
        "input_schema": {
            "type": "object",
            "properties": {"tag_id": {"type": "string"}},
            "required": ["tag_id"],
        },
    },
]

__all__ = ["TOOLS"]
