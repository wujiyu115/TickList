# -*- coding: utf-8 -*-
"""AI processing pipeline (Layer 1 rules, Layer 2 JSON mode, Layer 3 tools call).

Public surface: only ``pipeline_chat_stream`` is intended for use by
``services.ai.chat_stream``. All handlers and helpers are implementation
details.
"""

from .pipeline import pipeline_chat_stream

__all__ = ["pipeline_chat_stream"]
