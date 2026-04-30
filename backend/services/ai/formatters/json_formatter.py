# -*- coding: utf-8 -*-
"""JSON formatter（基线格式）。

输出形如：
- 任务：[{...}, {...}]
- 笔记：[{...}]
...
"""

import json
from typing import Dict, List, Any

# 实体名 -> 显示标题
_SECTION_TITLES = {
    "tasks": "任务",
    "notes": "笔记",
    "counters": "计数器",
    "countdowns": "倒数日",
    "lists": "清单",
    "tags": "标签",
}


def format_snapshot(data: Dict[str, List[Dict[str, Any]]]) -> str:
    lines = []
    for key, title in _SECTION_TITLES.items():
        items = data.get(key, [])
        lines.append(f"- {title}：{json.dumps(items, ensure_ascii=False)}")
    return "\n".join(lines)


__all__ = ["format_snapshot"]
