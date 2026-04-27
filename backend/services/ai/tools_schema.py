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

__all__ = ["TOOLS"]
