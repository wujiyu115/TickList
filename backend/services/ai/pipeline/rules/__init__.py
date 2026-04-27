# -*- coding: utf-8 -*-
"""Rule layer (Layer 1) of the AI pipeline.

Each domain module (task_rules / note_rules / ...) exposes ``RULES`` which
is a list of :class:`Rule` instances. ``ALL_RULES`` aggregates them in the
priority order used by :class:`RuleHandler`.
"""

# ALL_RULES is populated in a later task once the per-domain rule modules exist.
ALL_RULES: list = []

__all__ = ["ALL_RULES"]
