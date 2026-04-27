# -*- coding: utf-8 -*-
"""Backwards-compatibility shim.

The implementation was split into the :mod:`services.ai` package on
2026-04-27. This module is kept so existing callers
(``from services.ai_service import chat_stream``) continue to work
unchanged. New code should import from :mod:`services.ai` directly.
"""

from services.ai import chat_stream

__all__ = ["chat_stream"]
