# -*- coding: utf-8 -*-
"""Snapshot formatters for the AI system prompt.

每种 formatter 接收同一个 dict 结构（按实体名分组），返回一段适合
嵌入 system prompt 的紧凑文本。

dict 结构示例:
{
    "tasks":      [{"id": "t1", "title": "...", ...}, ...],
    "notes":      [...],
    "counters":   [...],
    "countdowns": [...],
    "lists":      [...],
    "tags":       [...],
}
"""

from .json_formatter import format_snapshot as format_snapshot_json
from .toon_formatter import format_snapshot as format_snapshot_toon


def get_formatter(fmt: str):
    """根据配置名返回对应的 formatter 函数。未知值默认走 json。"""
    fmt = (fmt or "json").lower()
    if fmt == "toon":
        return format_snapshot_toon
    return format_snapshot_json


__all__ = ["get_formatter", "format_snapshot_json", "format_snapshot_toon"]
