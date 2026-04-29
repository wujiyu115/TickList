# -*- coding: utf-8 -*-
"""Pipeline assembly + public ``pipeline_chat_stream`` entry point.

Reads ``ai.pipeline.*`` config to decide which handlers participate in the
chain. Skipped layers are simply not instantiated so they incur zero
runtime cost (no per-request "skip" branch).
"""

import json
import time
from typing import AsyncGenerator, Optional

from config.config_loader import config
from utils.logger import logger

from .base import ChatContext, Handler, summarize_hit

def _build_pipeline() -> Optional[Handler]:
    """Construct the handler chain based on current config. Returns the
    head handler, or ``None`` if pipeline is fully disabled."""
    ai_config = config.get_ai_config()
    pipe_cfg = ai_config.get("pipeline", {}) or {}
    if not pipe_cfg.get("enabled", False):
        return None

    use_rule = pipe_cfg.get("enable_rule_layer", True)
    use_json = pipe_cfg.get("enable_json_mode_layer", True)

    # Build from tail to head so each layer can wrap the next.
    from .tools_call_handler import ToolsCallHandler
    tail: Handler = ToolsCallHandler(next_handler=None)

    head: Handler = tail
    if use_json:
        from .json_mode_handler import JsonModeHandler
        head = JsonModeHandler(next_handler=head)
    if use_rule:
        from .rule_handler import RuleHandler
        head = RuleHandler(next_handler=head)

    layers = []
    cur: Optional[Handler] = head
    while cur is not None:
        layers.append(type(cur).__name__)
        cur = cur.next_handler
    logger.info(f"[AI][pipeline] built layers={layers} (rule={use_rule} json={use_json})")
    return head

async def pipeline_chat_stream(
    user_id: str,
    message: str,
    conversation_id: str,
) -> AsyncGenerator[str, None]:
    """Run the full pipeline for one user message."""
    head = _build_pipeline()
    if head is None:
        # Should not happen if caller already checked the flag; safe-guard.
        logger.warning(f"[AI][pipeline] no pipeline built, abort user={user_id}")
        return
    ctx = ChatContext(
        user_id=user_id, message=message, conversation_id=conversation_id,
    )
    started = time.time()
    logger.info(
        f"[AI][pipeline] enter head={type(head).__name__} user={user_id} conv={conversation_id}"
    )
    # 与 legacy claude_stream / openai_stream 一致：流首事件是 conversation_id，
    # 否则前端拿不到 conv_id（旧 legacy 实现的契约 = 第一行就发 conversation_id）。
    yield (
        f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conversation_id})}"
        "\n\n"
    )
    async for ev in head.handle(ctx):
        yield ev
    hit_layer, hit_intent = summarize_hit(ctx.trace)
    hit_desc = f"{hit_layer}:{hit_intent}" if hit_intent else hit_layer
    logger.info(
        f"[AI][pipeline] done user={user_id} conv={conversation_id} "
        f"hit={hit_desc} trace={ctx.trace} elapsed={time.time() - started:.2f}s"
    )

__all__ = ["pipeline_chat_stream", "_build_pipeline"]
