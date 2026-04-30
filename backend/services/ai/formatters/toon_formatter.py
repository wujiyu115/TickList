# -*- coding: utf-8 -*-
"""TOON (Token-Oriented Object Notation) formatter.

参考：https://github.com/toon-format/toon

核心思路：对同构的对象数组采用「表头 + CSV 行」的方式，让字段名只出现一次，
显著降低 token 数量。

输出示例：
tasks[2]{id,title,status,priority,due_date,tags}:
  t1,写周报,pending,high,2026-05-01,work|urgent
  t2,买菜,pending,low,,
notes[0]:
counters[1]{id,name,value}:
  c1,跑步,12

约定：
- 数组为空时输出 `<key>[0]:`
- 字段值为 None / 空列表时输出空字符串
- 字符串中含有逗号、换行、引号时用双引号包裹并对内部引号转义
- 列表型字段（如 tags）用 `|` 连接元素，避免与外层 `,` 冲突
"""

from typing import Any, Dict, List, Sequence

# 各实体使用的字段顺序（与原 system_prompt.py 中的 *_summaries 保持一致）
_SCHEMAS = {
    "tasks":      ["id", "title", "status", "priority", "due_date", "list_id", "tags", "content"],
    "notes":      ["id", "title", "folder_id", "tags"],
    "counters":   ["id", "name", "value"],
    "countdowns": ["id", "title", "target_date"],
    "lists":      ["id", "name", "type"],
    "tags":       ["id", "name"],
}


def _escape_cell(value: Any) -> str:
    """把单个字段值转成 CSV cell 字符串。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (list, tuple)):
        # 列表型字段用 | 连接，元素再各自转义
        parts = [_escape_cell(v) for v in value]
        joined = "|".join(parts)
        return _maybe_quote(joined)
    s = str(value)
    return _maybe_quote(s)


def _maybe_quote(s: str) -> str:
    if s == "":
        return ""
    # 出现逗号、换行、双引号时需要包裹
    if any(c in s for c in (",", "\n", "\r", '"')):
        escaped = s.replace('"', '""')
        return f'"{escaped}"'
    return s


def _format_section(key: str, items: Sequence[Dict[str, Any]], schema: List[str]) -> str:
    n = len(items)
    if n == 0:
        return f"{key}[0]:"
    header = ",".join(schema)
    lines = [f"{key}[{n}]{{{header}}}:"]
    for item in items:
        row = ",".join(_escape_cell(item.get(field)) for field in schema)
        lines.append(f"  {row}")
    return "\n".join(lines)


def format_snapshot(data: Dict[str, List[Dict[str, Any]]]) -> str:
    sections = []
    for key, schema in _SCHEMAS.items():
        items = data.get(key, []) or []
        sections.append(_format_section(key, items, schema))
    return "\n".join(sections)


__all__ = ["format_snapshot"]
