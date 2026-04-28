import json
import time
import uuid
from typing import AsyncGenerator, Optional

from utils.logger import logger

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

    # --- 灰度开关：启用三层 pipeline ---
    pipe_cfg = ai_config.get("pipeline", {}) or {}
    pipeline_enabled = pipe_cfg.get("enabled", False)
    provider = ai_config.get("provider", "claude")

    started = time.time()
    msg_preview = (message or "")[:80].replace("\n", " ")
    logger.info(
        f"[AI] chat_stream start user={user_id} conv={conversation_id} "
        f"provider={provider} pipeline={pipeline_enabled} msg={msg_preview!r}"
    )

    if pipeline_enabled:
        from .pipeline import pipeline_chat_stream
        conv_id = conversation_id or str(uuid.uuid4())
        logger.info(f"[AI] -> pipeline mode (conv={conv_id})")
        async for ev in pipeline_chat_stream(user_id, message, conv_id):
            yield ev
        logger.info(
            f"[AI] chat_stream end (pipeline) user={user_id} conv={conv_id} "
            f"elapsed={time.time() - started:.2f}s"
        )
        return

    logger.info(f"[AI] -> legacy mode provider={provider}")

    if provider == "openai":
        api_key = ai_config.get("openai_api_key") or ai_config.get("api_key")
        if not api_key:
            logger.warning(f"[AI] openai api_key missing user={user_id}")
            yield f"data: {json.dumps({'type': 'error', 'content': 'AI 功能未配置，请联系管理员设置 API Key。'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id or str(uuid.uuid4())})}\n\n"
            return
        async for event in _chat_stream_openai(user_id, message, conversation_id, ai_config):
            yield event
    else:
        if not ai_config["api_key"]:
            logger.warning(f"[AI] claude api_key missing user={user_id}")
            yield f"data: {json.dumps({'type': 'error', 'content': 'AI 功能未配置，请联系管理员设置 API Key。'})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id or str(uuid.uuid4())})}\n\n"
            return
        async for event in _chat_stream_claude(user_id, message, conversation_id, ai_config):
            yield event

    logger.info(
        f"[AI] chat_stream end (legacy) user={user_id} conv={conversation_id} "
        f"elapsed={time.time() - started:.2f}s"
    )
