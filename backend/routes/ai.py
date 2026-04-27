# -*- coding: utf-8 -*-
import time
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
import json

from schemas.ai import AiChatRequest, AiConfirmRequest, AiDisambiguateRequest
from middleware.jwt_middleware import get_current_user
from services.ai_service import chat_stream as ai_chat_stream
from services.ai.tools_executor import _execute_tool

router = APIRouter(prefix="/api", tags=["ai"])

# Rate limiting: 20 messages per minute per user
_rate_limits: dict[str, list[float]] = defaultdict(list)
_RATE_LIMIT = 20
_RATE_WINDOW = 60  # seconds


def _check_rate_limit(user_id: str):
    now = time.time()
    timestamps = _rate_limits[user_id]
    _rate_limits[user_id] = [t for t in timestamps if now - t < _RATE_WINDOW]
    if len(_rate_limits[user_id]) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail='消息频率超限，请稍后重试')
    _rate_limits[user_id].append(now)


@router.post('/ai/chat')
async def ai_chat_endpoint(
    request: AiChatRequest,
    current_user_id: str = Depends(get_current_user)
):
    """AI 对话接口 (SSE streaming)"""
    _check_rate_limit(current_user_id)
    return StreamingResponse(
        ai_chat_stream(
            user_id=current_user_id,
            message=request.message,
            conversation_id=request.conversation_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )

# Map intent -> the param key carrying the entity id (used by /disambiguate).
_INTENT_ID_FIELD: dict[str, str] = {
    "update_task": "task_id",
    "delete_task": "task_id",
    "update_note": "note_id",
    "delete_note": "note_id",
    "update_countdown": "countdown_id",
    "delete_countdown": "countdown_id",
    "update_counter": "counter_id",
    "delete_counter": "counter_id",
    "update_list": "list_id",
    "delete_list": "list_id",
    "update_tag": "tag_id",
    "delete_tag": "tag_id",
}

def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"

@router.post('/ai/disambiguate')
async def ai_disambiguate(
    request: AiDisambiguateRequest,
    current_user_id: str = Depends(get_current_user),
):
    """Resolve a previous disambiguation by executing the chosen entity."""
    _check_rate_limit(current_user_id)

    id_field = _INTENT_ID_FIELD.get(request.pending_intent)
    if not id_field:
        raise HTTPException(status_code=400, detail=f"不支持的 intent: {request.pending_intent}")

    params = {**request.extra_params, id_field: request.selected_id}

    async def _stream():
        try:
            result = _execute_tool(current_user_id, request.pending_intent, params)
            # 删除类需走 /confirm；这里不应再返回 _pending_confirmation
            yield _sse({"type": "tool_result", "tool": request.pending_intent,
                        "result": result, "source": "user_disambiguation"})
            yield _sse({"type": "text", "content": "已执行"})
        except Exception as e:
            yield _sse({"type": "error", "content": f"执行失败：{e}"})
        yield _sse({"type": "done", "conversation_id": request.conversation_id})

    return StreamingResponse(_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
    })

@router.post('/ai/confirm')
async def ai_confirm(
    request: AiConfirmRequest,
    current_user_id: str = Depends(get_current_user),
):
    """Resolve a confirmation prompt. Cancel does NOT consume rate limit."""
    if not request.confirmed:
        async def _cancel_stream():
            yield _sse({"type": "text", "content": "已取消"})
            yield _sse({"type": "done", "conversation_id": request.conversation_id})
        return StreamingResponse(_cancel_stream(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
        })

    # confirmed=True: actually execute, only now consume rate limit
    _check_rate_limit(current_user_id)

    async def _exec_stream():
        try:
            result = _execute_tool(
                current_user_id, request.pending_intent, request.params,
                skip_confirmation=True,
            )
            yield _sse({"type": "tool_result", "tool": request.pending_intent,
                        "result": result, "source": "user_confirmation"})
            yield _sse({"type": "text", "content": "已执行"})
        except Exception as e:
            yield _sse({"type": "error", "content": f"执行失败：{e}"})
        yield _sse({"type": "done", "conversation_id": request.conversation_id})

    return StreamingResponse(_exec_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
    })