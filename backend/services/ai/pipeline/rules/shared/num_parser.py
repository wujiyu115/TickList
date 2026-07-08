# -*- coding: utf-8 -*-
"""Parse an amount token (Arabic or Chinese numerals) into an int.

Supports 1-99. Empty / None / unparseable input falls back to 1 so that
bare verbs like "游泳加" mean +1 and noise never crashes the rule layer.
"""

from typing import Optional

_CN_DIGITS = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
}


def parse_amount(s: Optional[str]) -> int:
    if s is None:
        return 1
    s = s.strip()
    if not s:
        return 1
    if s.isdigit():
        return int(s)

    # Chinese numerals 1-99
    if "十" not in s:
        # single digit like 三 / 两
        if len(s) == 1 and s in _CN_DIGITS:
            return _CN_DIGITS[s] or 1
        return 1

    # contains 十: forms are 十 / 十X / X十 / X十Y
    tens_part, _, ones_part = s.partition("十")
    tens = _CN_DIGITS.get(tens_part, 1) if tens_part else 1
    ones = _CN_DIGITS.get(ones_part, 0) if ones_part else 0
    value = tens * 10 + ones
    return value if value > 0 else 1


__all__ = ["parse_amount"]
