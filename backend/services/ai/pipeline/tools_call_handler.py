# -*- coding: utf-8 -*-
"""Layer 3 (terminal): wraps the existing provider-specific tool-calling
streams. Never delegates further; this is the bottom of the pipeline.
"""

from typing import AsyncGenerator

from config.config_loader import config

from ..claude_stream import _chat_stream_claude
from ..openai_stream import _chat_stream_openai
from .base import ChatContext, Handler, sse_event

class ToolsCallHandler(Handler):
    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        ctx.trace.append("tools_call")

        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")

        suffix = ""
        if ctx.upstream_hint:
            reason = ctx.upstream_hint.get("reason")
            if reason:
                suffix = f"\n\n⚠️ 注：上游处理（{reason}）未能识别，请仔细分析用户意图。"

        if provider == "openai":
            api_key = ai_config.get("openai_api_key") or ai_config.get("api_key")
            if not api_key:
                yield sse_event("error", {"content": "AI 功能未配置，请联系管理员设置 API Key。"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in _chat_stream_openai(
                ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
                system_prompt_suffix=suffix,
            ):
                yield ev
            return

        if not ai_config.get("api_key"):
            yield sse_event("error", {"content": "AI 功能未配置，请联系管理员设置 API Key。"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return
        async for ev in _chat_stream_claude(
            ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
            system_prompt_suffix=suffix,
        ):
            yield ev

__all__ = ["ToolsCallHandler"]
