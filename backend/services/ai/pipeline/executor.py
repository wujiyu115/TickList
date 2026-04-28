# -*- coding: utf-8 -*-
"""Translates :class:`ResolutionResult` into SSE events.

Responsible for cross-cutting concerns:
- multi-match disambiguation (NEED_DISAMBIGUATION)
- delete confirmation interception (any DELETE_INTENTS becomes a
  ``confirmation`` event before reaching the DAO layer)
- DAO invocation via the existing ``tools_executor._execute_tool``
"""

from typing import AsyncGenerator

from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.note_dao import note_dao
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao
from utils.logger import logger

from ..tools_executor import _execute_tool
from .base import ChatContext, ResolutionResult, ResolutionStatus, sse_event

DELETE_INTENTS: set[str] = {
    "delete_task",
    "delete_note",
    "delete_countdown",
    "delete_counter",
    "delete_list",
    "delete_tag",
}

def _describe_delete_target(user_id: str, intent: str, params: dict) -> str:
    """Look up the human-readable name of the entity about to be deleted."""
    try:
        if intent == "delete_task":
            t = task_dao.get_task_by_id(params["task_id"], user_id)
            return t["title"] if t else "(未找到)"
        if intent == "delete_note":
            n = note_dao.get_note_by_id(user_id, params["note_id"])
            return n["title"] if n else "(未找到)"
        if intent == "delete_countdown":
            cd = countdown_dao.get_countdown_by_id(user_id, params["countdown_id"])
            return cd["title"] if cd else "(未找到)"
        if intent == "delete_counter":
            c = counter_dao.get_counter_by_id(user_id, params["counter_id"])
            return c["title"] if c else "(未找到)"
        if intent == "delete_list":
            lst = list_dao.get_list_by_id(user_id, params["list_id"])
            return lst["name"] if lst else "(未找到)"
        if intent == "delete_tag":
            tg = tag_dao.get_tag_by_id(user_id, params["tag_id"])
            return tg["name"] if tg else "(未找到)"
    except Exception as e:
        logger.warning(f"_describe_delete_target failed: {intent} {e}")
    return "(未知目标)"

async def execute_resolution(
    result: ResolutionResult, ctx: ChatContext
) -> AsyncGenerator[str, None]:
    """Convert a ResolutionResult into the canonical SSE event stream."""
    logger.info(
        f"[AI][exec] enter intent={result.intent} status={result.status.value} "
        f"source={result.source} user={ctx.user_id}"
    )

    # 1) Multi-match: ask the user to pick one
    if result.status == ResolutionStatus.NEED_DISAMBIGUATION:
        logger.info(
            f"[AI][exec] NEED_DISAMBIGUATION intent={result.intent} "
            f"candidates_count={len(result.candidates or [])}"
        )
        yield sse_event("disambiguation", {
            "pending_intent": result.intent,
            "candidates": result.candidates or [],
            "extra_params": {k: v for k, v in result.params.items()
                             if k not in {"task_id", "note_id", "countdown_id", "counter_id"}},
            "reply": result.reply_text or "请选择：",
            "source": result.source,
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        ctx.trace.append("exec:disambiguation")
        return

    # 2) Delete intents: force confirmation regardless of incoming status
    if result.intent in DELETE_INTENTS and result.status != ResolutionStatus.NEED_CONFIRMATION:
        target_desc = _describe_delete_target(ctx.user_id, result.intent, result.params)
        logger.info(
            f"[AI][exec] NEED_CONFIRMATION intent={result.intent} target={target_desc!r}"
        )
        yield sse_event("confirmation", {
            "pending_intent": result.intent,
            "params": result.params,
            "target_description": target_desc,
            "reply": f"确认删除「{target_desc}」？",
            "source": result.source,
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        ctx.trace.append("exec:confirmation")
        return

    # 3) Executable: hit the DAO
    if result.status == ResolutionStatus.EXECUTABLE:
        try:
            logger.info(
                f"[AI][exec] EXECUTE intent={result.intent} user={ctx.user_id} "
                f"params_keys={list(result.params.keys())}"
            )
            tool_result = _execute_tool(ctx.user_id, result.intent, result.params)
            logger.info(f"[AI][exec] EXECUTE_OK intent={result.intent} user={ctx.user_id}")
            yield sse_event("tool_result", {
                "tool": result.intent,
                "result": tool_result,
                "source": result.source,
            })
            if result.reply_text:
                yield sse_event("text", {"content": result.reply_text})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            ctx.trace.append("exec:ok")
        except Exception as e:
            logger.error(
                f"[AI][exec] EXECUTE_FAIL intent={result.intent} user={ctx.user_id} "
                f"err={type(e).__name__}: {e}"
            )
            yield sse_event("error", {"content": f"执行失败：{e}"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            ctx.trace.append("exec:error")
        return

    # Unexpected status: treat as a no-op done event
    logger.warning(f"[AI][exec] UNEXPECTED status={result.status} intent={result.intent}")
    yield sse_event("done", {"conversation_id": ctx.conversation_id})

__all__ = ["execute_resolution", "DELETE_INTENTS", "_describe_delete_target"]
