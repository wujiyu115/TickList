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

_JSON_MODE_TIMEOUT_SECONDS_DEFAULT = 15
_JSON_MODE_MAX_TOKENS = 1024


def _get_json_mode_timeout() -> int:
    """从配置 ai.pipeline.json_mode_timeout 读取超时秒数，默认 15s。"""
    from config.config_loader import config
    return config.get("ai.pipeline.json_mode_timeout",
                      _JSON_MODE_TIMEOUT_SECONDS_DEFAULT,
                      "AI_PIPELINE_JSON_MODE_TIMEOUT")

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
只输出JSON，不要解释。格式：
{"intent":"<意图>","params":{...},"needs_confirmation":false,"reply":""}

意图：create_task|update_task|delete_task|list_tasks|create_note|update_note|delete_note|list_notes|create_countdown|update_countdown|delete_countdown|list_countdowns|create_counter|update_counter|delete_counter|list_counters|create_list|update_list|delete_list|list_lists|create_tag|update_tag|delete_tag|list_tags|chitchat|unknown

params参考：
- list_tasks: {status?, priority?, list_id?, tag?, due_date_start?, due_date_end?}
- create_task: {title, priority?, due_date?, list_id?, tags?}
- update_task: {id, title?, status?, priority?, due_date?}
- delete_task: {id}
- 其他实体同理

关键规则：
1. 用户提到清单名（如"当周工作""生活"等）→ 从上方 lists 快照找到对应 id 填入 list_id
2. 用户提到标签名 → 从上方 tags 快照找到对应 id/name 填入 tag
3. 用户提到任务名 → 从上方 tasks 快照匹配 id
4. 状态映射：未完成/待办→status="pending"，已完成/做完→status="completed"，进行中→status="in_progress"
5. 闲聊→intent="chitchat"，reply填回复
6. 无法识别→intent="unknown"
7. 删除→needs_confirmation=true
8. 非chitchat时reply留空
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
        import time as _time
        from config.config_loader import config

        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")

        _t_prompt0 = _time.time()
        prompt = _build_json_mode_prompt(ctx.user_id)
        _prompt_elapsed = _time.time() - _t_prompt0
        logger.info(
            f"[AI][L2-json][call] provider={provider} build_prompt_elapsed={_prompt_elapsed:.2f}s "
            f"prompt_chars={len(prompt)} user_msg_chars={len(ctx.message)}"
        )

        if provider == "openai":
            from openai import OpenAI
            base_url = ai_config.get("openai_base_url") or None
            model = ai_config.get("openai_model") or ai_config.get("model")
            logger.info(
                f"[AI][L2-json][call] openai base_url={base_url} model={model} "
                f"max_tokens={_JSON_MODE_MAX_TOKENS}"
            )
            client = OpenAI(
                api_key=ai_config.get("openai_api_key") or ai_config.get("api_key"),
                base_url=base_url,
                timeout=_get_json_mode_timeout(),
            )
            # Run the sync SDK in a thread to remain async-friendly.
            def _sync_call() -> str:
                _t_sdk0 = _time.time()
                logger.info(f"[AI][L2-json][sdk] openai.create begin model={model}")
                try:
                    resp = client.chat.completions.create(
                        model=model,
                        messages=[
                            {"role": "system", "content": prompt},
                            {"role": "user", "content": ctx.message},
                        ],
                        response_format={"type": "json_object"},
                        max_tokens=_JSON_MODE_MAX_TOKENS,
                        temperature=0,
                    )
                except Exception as e:
                    logger.error(
                        f"[AI][L2-json][sdk] openai.create FAILED elapsed={_time.time()-_t_sdk0:.2f}s "
                        f"err={type(e).__name__}: {e}"
                    )
                    raise
                _sdk_elapsed = _time.time() - _t_sdk0
                content = resp.choices[0].message.content or ""
                usage = getattr(resp, "usage", None)
                logger.info(
                    f"[AI][L2-json][sdk] openai.create OK elapsed={_sdk_elapsed:.2f}s "
                    f"resp_chars={len(content)} usage={usage}"
                )
                return content
            return await asyncio.to_thread(_sync_call)

        # Claude path: no native json mode; rely on prompt + low temperature.
        import anthropic
        model = ai_config["model"]
        logger.info(f"[AI][L2-json][call] claude model={model} max_tokens={_JSON_MODE_MAX_TOKENS}")
        client = anthropic.Anthropic(api_key=ai_config["api_key"])
        def _sync_call_claude() -> str:
            _t_sdk0 = _time.time()
            logger.info(f"[AI][L2-json][sdk] claude.messages.create begin model={model}")
            try:
                resp = client.messages.create(
                    model=model,
                    max_tokens=_JSON_MODE_MAX_TOKENS,
                    system=prompt + "\n严禁输出 JSON 之外的任何字符。",
                    messages=[{"role": "user", "content": ctx.message}],
                    temperature=0,
                )
            except Exception as e:
                logger.error(
                    f"[AI][L2-json][sdk] claude.create FAILED elapsed={_time.time()-_t_sdk0:.2f}s "
                    f"err={type(e).__name__}: {e}"
                )
                raise
            _sdk_elapsed = _time.time() - _t_sdk0
            parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
            text = "".join(parts)
            logger.info(
                f"[AI][L2-json][sdk] claude.create OK elapsed={_sdk_elapsed:.2f}s "
                f"resp_chars={len(text)} usage={getattr(resp, 'usage', None)}"
            )
            return text
        return await asyncio.to_thread(_sync_call_claude)

    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        import time as _time
        _timeout = _get_json_mode_timeout()
        logger.info(f"[AI][L2-json] enter user={ctx.user_id} timeout={_timeout}s")
        _t0 = _time.time()
        try:
            raw = await asyncio.wait_for(
                self._call_llm_json_mode(ctx), timeout=_timeout,
            )
        except asyncio.TimeoutError:
            logger.warning(
                f"[AI][L2-json] TIMEOUT user={ctx.user_id} elapsed={_time.time() - _t0:.2f}s"
            )
            ctx.trace.append("json:fail:Timeout")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": "timeout"}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应超时，请重试"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            logger.info(f"[AI][L2-json] -> fallback next={type(self.next_handler).__name__}")
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return
        except Exception as e:
            logger.error(
                f"[AI][L2-json] call FAILED user={ctx.user_id} err={type(e).__name__}: {e}"
            )
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": str(e)[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 调用失败"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            logger.info(f"[AI][L2-json] -> fallback next={type(self.next_handler).__name__}")
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        logger.info(
            f"[AI][L2-json] llm_resp_ok user={ctx.user_id} elapsed={_time.time() - _t0:.2f}s "
            f"raw_len={len(raw)} raw={raw[:500]!r}"
        )

        try:
            payload = _parse_json_payload(raw)
        except Exception as e:
            logger.warning(
                f"[AI][L2-json] PARSE_FAIL user={ctx.user_id} err={type(e).__name__}: {e} "
                f"raw={raw[:500]!r}"
            )
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "raw": raw[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应格式异常"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            logger.info(f"[AI][L2-json] -> fallback next={type(self.next_handler).__name__}")
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        intent = payload["intent"]
        params = payload.get("params", {}) or {}
        reply_text = payload.get("reply", "") or ""

        logger.info(
            f"[AI][L2-json] parsed user={ctx.user_id} intent={intent} "
            f"params={json.dumps(params, ensure_ascii=False)[:300]} "
            f"reply={reply_text[:200]!r} "
            f"needs_confirmation={payload.get('needs_confirmation')}"
        )

        if intent == "unknown":
            logger.info(f"[AI][L2-json] intent=UNKNOWN user={ctx.user_id} reply={reply_text[:200]!r} -> fallback to L3")
            ctx.trace.append("json:unknown")
            ctx.upstream_hint = {"reason": "json_mode_unknown"}
            if self.next_handler is None:
                # 对齐 legacy 事件契约：text_delta（不是 text）
                yield sse_event("text_delta", {"content": "没听懂，请换种说法"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        if intent == "chitchat":
            logger.info(f"[AI][L2-json] HIT intent=chitchat user={ctx.user_id}")
            ctx.trace.append("json:chitchat")
            # 对齐 legacy 事件契约：text_delta（不是 text）
            yield sse_event("text_delta", {"content": reply_text or "（无回复）"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return

        logger.info(f"[AI][L2-json] HIT intent={intent} user={ctx.user_id} params_keys={list((payload.get('params') or {}).keys())}")
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
