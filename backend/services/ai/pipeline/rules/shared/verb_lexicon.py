# -*- coding: utf-8 -*-
"""Verb lexicons for action-intent matching.

Sets are kept disjoint where semantically appropriate (e.g. "完成" never
appears in DELETE_VERBS) so a single regex match maps unambiguously to one
intent class.
"""

import re
from typing import Iterable, Pattern

CREATE_VERBS: set[str] = {"加", "添加", "新建", "创建", "新增"}
DELETE_VERBS: set[str] = {"删", "删除", "去掉", "移除"}
COMPLETE_VERBS: set[str] = {"完成", "搞定", "做完", "勾掉", "打钩"}
UPDATE_VERBS: set[str] = {"改", "修改", "更新", "调整"}
QUERY_VERBS: set[str] = {"查", "查询", "看", "列出", "显示"}

def verbs_pattern(verbs: Iterable[str]) -> Pattern[str]:
    """Compile a regex that matches any verb in ``verbs`` exactly.

    Verbs are sorted by descending length so longer prefixes ("添加") are
    preferred over shorter ones ("加") under regex alternation.
    """
    sorted_verbs = sorted(verbs, key=len, reverse=True)
    alternation = "|".join(re.escape(v) for v in sorted_verbs)
    return re.compile(f"^(?:{alternation})$")

__all__ = [
    "CREATE_VERBS",
    "DELETE_VERBS",
    "COMPLETE_VERBS",
    "UPDATE_VERBS",
    "QUERY_VERBS",
    "verbs_pattern",
]
