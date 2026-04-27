# -*- coding: utf-8 -*-
"""Rule layer (Layer 1) of the AI pipeline.

``ALL_RULES`` is the ordered list consumed by :class:`RuleHandler`. Order
matters: more specific patterns (e.g. counter "+1" shortcuts and the
domain-keyword create rules for countdown/note/counter) come before the
catch-all task rules. The task ``_CREATE_PATTERN`` accepts an optional
"任务" keyword, which means it would otherwise greedily swallow inputs
like "加倒数日 高考 2026-06-07" as a task title. Putting task rules last
makes them the natural fallback for ambiguous create commands.
"""

from .countdown_rules import RULES as _COUNTDOWN_RULES
from .counter_rules import RULES as _COUNTER_RULES
from .note_rules import RULES as _NOTE_RULES
from .task_rules import RULES as _TASK_RULES

# Order: most specific (counter shortcuts + domain-keyword required) first;
# task rules are kept last as the catch-all create handler.
ALL_RULES = [
    *_COUNTER_RULES,    # +1/-1 短模式优先
    *_COUNTDOWN_RULES,  # "倒数日" 关键词必须出现，先于 task 兜底
    *_NOTE_RULES,       # "笔记" 关键词必须出现，先于 task 兜底
    *_TASK_RULES,       # task 的 "(?:任务)?" 可选，作为兜底
]

__all__ = ["ALL_RULES"]
