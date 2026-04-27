# -*- coding: utf-8 -*-
"""Fuzzy entity matching used by rule layer when resolving "完成 报告" etc.

Three-stage strategy:
1. Exact title equality.
2. Title contains keyword as substring (returns all hits).
3. difflib similarity >= 0.6 fallback (returns hits sorted by score).
"""

from difflib import SequenceMatcher
from typing import Iterable

_FUZZY_THRESHOLD = 0.6

def match_entities(keyword: str, items: Iterable[dict]) -> list[dict]:
    """Return matched items. Each item is a dict that MUST contain ``title``.

    Empty ``keyword`` always returns ``[]``.
    """
    keyword = keyword.strip()
    if not keyword:
        return []

    items_list = list(items)

    # Stage 1: exact equality
    exact = [it for it in items_list if it.get("title") == keyword]
    if exact:
        return exact

    # Stage 2: substring containment
    substring = [it for it in items_list if keyword in (it.get("title") or "")]
    if substring:
        return substring

    # Stage 3: fuzzy
    scored: list[tuple[float, dict]] = []
    for it in items_list:
        title = it.get("title") or ""
        ratio = SequenceMatcher(None, keyword, title).ratio()
        if ratio >= _FUZZY_THRESHOLD:
            scored.append((ratio, it))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored]

__all__ = ["match_entities"]
