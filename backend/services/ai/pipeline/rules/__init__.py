# -*- coding: utf-8 -*-
"""Rule layer (Layer 1) of the AI pipeline.

``ALL_RULES`` is the ordered list consumed by :class:`RuleHandler`. Order
matters: more specific patterns (e.g. counter "+1" shortcuts) come before
more permissive ones to avoid accidental shadowing.
"""

from .countdown_rules import RULES as _COUNTDOWN_RULES
from .counter_rules import RULES as _COUNTER_RULES
from .note_rules import RULES as _NOTE_RULES
from .task_rules import RULES as _TASK_RULES

# Order: high-frequency / very specific first.
ALL_RULES = [
    *_COUNTER_RULES,    # +1/-1 短模式优先
    *_TASK_RULES,
    *_NOTE_RULES,
    *_COUNTDOWN_RULES,
]

__all__ = ["ALL_RULES"]
