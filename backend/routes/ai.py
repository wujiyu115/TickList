# -*- coding: utf-8 -*-
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from models.ai import AiChatRequest, AiChatResponse
from middleware.jwt_middleware import get_current_user
from services.ai_service import chat as ai_chat

router = APIRouter(prefix="/api", tags=["ai"])

# Rate limiting: 20 messages per minute per user
_rate_limits: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 20
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(user_id: str):
    now = time.time()
    timestamps = _rate_limits[user_id]
    # Remove old timestamps outside window
    _rate_limits[user_id] = [t for t in timestamps if now - t < _RATE_WINDOW]
    if len(_rate_limits[user_id]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail='消息频率超限，请稍后重试')
    _rate_limits[user_id].append(now)


@router.post('/ai/chat')
async def ai_chat_endpoint(
    request: AiChatRequest,
    current_user_id: str = Depends(get_current_user)
):
    """AI 对话接口"""
    _check_rate_limit(current_user_id)
    result = await ai_chat(
        user_id=current_user_id,
        message=request.message,
        conversation_id=request.conversation_id,
    )
    return result