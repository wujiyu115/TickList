# -*- coding: utf-8 -*-
"""AI service package.

Public surface is intentionally minimal: only the streaming entry point
``chat_stream`` is re-exported. Internal modules (tools, executor, prompt,
provider-specific stream implementations) are considered implementation
details and should be imported directly via their full path when needed.
"""

from .chat_stream import chat_stream

__all__ = ["chat_stream"]
