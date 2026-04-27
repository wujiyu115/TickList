# -*- coding: utf-8 -*-
"""Layer 2: ask the LLM for a structured intent JSON without TOOLS schema.

Cheaper than full tool calling because the prompt embeds only a compact
schema rather than the full TOOLS array. ``chitchat`` short-circuits
(no DAO call); ``unknown`` and parse failures fall through to Layer 3.
"""

import asyncio
import json
from typing import AsyncGenerator, Optional

from utils.logger import logger

from ..system_prompt import _build_system_prompt
from .base import ChatContext, Handler, ResolutionResult, ResolutionStatus, sse_event
from .executor import execute_resolution

_JSON_MODE_TIMEOUT_SECONDS = 8
_JSON_MODE_MAX_TOKENS = 1024

_VALID_INTENTS = {
    "create_task", "update_task", "delete_task", "list_tasks",
    "create_note", "update_note", "delete_note", "list_notes",
    "create_countdown", "update_countdown", "delete_countdown", "list_countdowns",
    "create_counter", "update_counter", "delete_counter", "list_counters",
    "create_list", "update_list", "delete_list", "list_lists",
    "create_tag", "update_tag", "delete_tag", "list_tags",
    "chitchat", "unknown",
}

def _build_json_mode_prompt(user_id: str) -> str:
    """Reuse the data snapshot builder but append JSON-mode instructions."""
    base = _build_system_prompt(user_id)
    json_instr = """
---
请严格输出以下结构的 JSON（只输出 JSON，不要任何额外解释）：
{
  "intent": "create_task | update_task | delete_task | list_tasks | create_note | ... | chitchat | unknown",
  "params": { ... 与 intent 对应的参数（同 tools 的 input schema） ... },
  "needs_confirmation": false,
  "reply": "给用户的自然语言回复"
}
- 闲聊（你好/感谢/介绍自己）→ intent="chitchat"，reply 写自然回复，params 空对象
- 无法识别 → intent="unknown"，reply 空字符串
- 删除类操作 → needs_confirmation=true
- 涉及到现有实体时，必须从上方数据快照中找到对应 id 填入 params
- 不要返回 schema 之外的字段
"""
    return base + json_instr

def _parse_json_payload(raw: str) -> dict:
    """Parse and validate the LLM JSON payload."""
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("payload is not a dict")
    intent = payload.get("intent")
    if intent not in _VALID_INTENTS:
        raise ValueError(f"invalid intent: {intent!r}")
    if not isinstance(payload.get("params", {}), dict):
        raise ValueError("params must be a dict")
    return payload

class JsonModeHandler(Handler):
    async def _call_llm_json_mode(self, ctx: ChatContext) -> str:
        """Call the configured LLM in JSON mode and return the raw string."""
        from config.config_loader import config

        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")
        prompt = _build_json_mode_prompt(ctx.user_id)

        if provider == "openai":
            from openai import OpenAI
            client = OpenAI(
                api_key=ai_config.get("openai_api_key") or ai_config.get("api_key"),
                base_url=ai_config.get("openai_base_url") or None,
            )
            # Run the sync SDK in a thread to remain async-friendly.
            def _sync_call() -> str:
                resp = client.chat.completions.create(
                    model=ai_config.get("openai_model") or ai_config.get("model"),
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": ctx.message},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=_JSON_MODE_MAX_TOKENS,
                    temperature=0,
                )
                return resp.choices[0].message.content or ""
            return await asyncio.to_thread(_sync_call)

        # Claude path: no native json mode; rely on prompt + low temperature.
        import anthropic
        client = anthropic.Anthropic(api_key=ai_config["api_key"])
        def _sync_call_claude() -> str:
            resp = client.messages.create(
                model=ai_config["model"],
                max_tokens=_JSON_MODE_MAX_TOKENS,
                system=prompt + "\n严禁输出 JSON 之外的任何字符。",
                messages=[{"role": "user", "content": ctx.message}],
                temperature=0,
            )
            parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
            return "".join(parts)
        return await asyncio.to_thread(_sync_call_claude)

    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        try:
            raw = await asyncio.wait_for(
                self._call_llm_json_mode(ctx), timeout=_JSON_MODE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(f"json_mode timeout for user={ctx.user_id}")
            ctx.trace.append("json:fail:Timeout")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": "timeout"}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应超时，请重试"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return
        except Exception as e:
            logger.error(f"json_mode call failed: {e}")
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": str(e)[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 调用失败"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        try:
            payload = _parse_json_payload(raw)
        except Exception as e:
            logger.warning(f"json_mode parse failed: {e} raw={raw[:200]!r}")
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "raw": raw[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应格式异常"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        intent = payload["intent"]
        reply_text = payload.get("reply", "") or ""

        if intent == "unknown":
            ctx.trace.append("json:unknown")
            ctx.upstream_hint = {"reason": "json_mode_unknown"}
            if self.next_handler is None:
                yield sse_event("text", {"content": "没听懂，请换种说法"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        if intent == "chitchat":
            ctx.trace.append("json:chitchat")
            yield sse_event("text", {"content": reply_text or "（无回复）"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return

        ctx.trace.append(f"json:{intent}")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent=intent,
            params=payload.get("params", {}) or {},
            reply_text=reply_text,
            source="json_mode",
        )
        async for ev in execute_resolution(result, ctx):
            yield ev

__all__ = ["JsonModeHandler"]
