# -*- coding: utf-8 -*-
"""Public entry point for AI streaming chat.

Selects the provider implementation (Claude vs OpenAI-compatible) based
on runtime config, validates that an API key is configured, and delegates
to the matching ``_chat_stream_*`` async generator.
"""

import json
import uuid
from typing import AsyncGenerator, Optional

from .claude_stream import _chat_stream_claude
from .openai_stream import _chat_stream_openai


async def chat_stream(
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
) -> AsyncGenerator[str, None]:
    """Stream a chat response via SSE events. Dispatches to Claude or OpenAI based on config."""
    from config.config_loader import config

    ai_config = config.get_ai_config()
    provider = ai_config.get("provider", "claude")

    if provider == "openai":
        api_key = ai_config.get("openai_api_key") or ai_config.get("api_key")
        if not api_key:
            yield f"data: {json.dumps({'type': 'error', 'content': 'AI 功能未配置，请联系管理员设置 API Key。'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id or str(uuid.uuid4())})}\n\n"
            return
        async for event in _chat_stream_openai(user_id, message, conversation_id, ai_config):
            yield event
    else:
        if not ai_config["api_key"]:
            yield f"data: {json.dumps({'type': 'error', 'content': 'AI 功能未配置，请联系管理员设置 API Key。'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id or str(uuid.uuid4())})}\n\n"
            return
        async for event in _chat_stream_claude(user_id, message, conversation_id, ai_config):
            yield event


__all__ = ["chat_stream"]
