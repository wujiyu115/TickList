# -*- coding: utf-8 -*-
"""STUB - replaced in Task 10."""

from typing import AsyncGenerator

from .base import ChatContext, ResolutionResult, sse_event

async def execute_resolution(
    result: ResolutionResult, ctx: ChatContext
) -> AsyncGenerator[str, None]:
    yield sse_event("text", {"content": f"[stub] {result.intent}"})
    yield sse_event("done", {"conversation_id": ctx.conversation_id})

__all__ = ["execute_resolution"]
