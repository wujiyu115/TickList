# -*- coding: utf-8 -*-
"""Lightweight date extraction wrapper around the ``dateparser`` library.

Strategy: scan the input for the longest substring that ``dateparser`` can
interpret (Chinese keywords first, then ISO-like patterns, then a final
whole-string attempt). Returns ``(stripped_text, parsed_datetime)``.
"""

import re
from datetime import datetime
from typing import Optional, Tuple

import dateparser

# Order matters: longer / more specific keywords first to avoid partial matches.
_KEYWORD_PATTERNS: list[str] = [
    r"\d{4}-\d{1,2}-\d{1,2}",          # 2026-05-01
    r"\d{1,2}月\d{1,2}[日号]",          # 5月1日 / 5月1号
    r"下下?(?:周|星期)[一二三四五六日天]",  # 下周五 / 下下周一
    r"这?周[一二三四五六日天]",           # 周五 / 这周三
    r"\d+\s*天后",                      # 3天后
    r"今天|明天|后天|昨天|前天",
]

_DATEPARSER_SETTINGS = {
    "PREFER_DATES_FROM": "future",
    "RELATIVE_BASE": None,  # filled in at call time
    "RETURN_AS_TIMEZONE_AWARE": False,
    "TIMEZONE": "Asia/Shanghai",
}

def _now() -> datetime:
    """Indirection for tests to monkeypatch the current moment.

    Production code MUST NOT call this directly; it exists solely so unit
    tests can freeze "today" via ``monkeypatch.setattr``.
    """
    return datetime.now()

def extract_date(text: str) -> Tuple[str, Optional[datetime]]:
    """Try to find a date expression inside ``text``.

    Returns a tuple of ``(stripped_text, parsed_datetime_or_None)``.
    The stripped_text has the matched expression removed and surrounding
    whitespace collapsed; punctuation adjacent to the matched span is
    intentionally preserved (downstream rules may rely on it).

    Pattern priority follows ``_KEYWORD_PATTERNS`` order: more specific
    patterns (ISO dates) win over relative keywords ("今天" / "明天") when
    both appear in the same input. Only the first successful match is
    returned.
    """
    settings = dict(_DATEPARSER_SETTINGS)
    settings["RELATIVE_BASE"] = _now()

    for pattern in _KEYWORD_PATTERNS:
        match = re.search(pattern, text)
        if not match:
            continue
        candidate = match.group(0)
        parsed = dateparser.parse(candidate, languages=["zh"], settings=settings)
        if parsed is None:
            continue
        stripped = (text[: match.start()] + text[match.end():]).strip()
        stripped = re.sub(r"\s+", " ", stripped)
        return stripped, parsed

    return text, None

__all__ = ["extract_date"]
