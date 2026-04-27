# -*- coding: utf-8 -*-
"""OpenAI-compatible streaming chat implementation.

Handles the OpenAI function-calling protocol (also used by DeepSeek and
other compatible providers). Translates the canonical Anthropic-style
history kept in :mod:`conversation_store` into the role/tool message
shape required by ``chat.completions``.

Special care is taken for thinking-mode models (e.g. DeepSeek v4) that
require ``reasoning_content`` to be round-tripped on subsequent turns.
"""

import json
from typing import AsyncGenerator, Dict, List, Optional

from utils.logger import logger

from .conversation_store import MAX_HISTORY, _get_or_create_conversation
from .system_prompt import _build_system_prompt
from .tools_executor import _execute_tool
from .tools_schema import TOOLS


def _anthropic_tools_to_openai_tools() -> List[Dict]:
    """Convert Anthropic tool format to OpenAI function calling format."""
    openai_tools = []
    for tool in TOOLS:
        openai_tools.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool["description"],
                "parameters": tool["input_schema"],
            },
        })
    return openai_tools


async def _chat_stream_openai(
    user_id: str,
    message: str,
    conversation_id: Optional[str],
    ai_config: Dict,
) -> AsyncGenerator[str, None]:
    """Stream chat via OpenAI API with function calling."""
    conv_id, history = _get_or_create_conversation(user_id, conversation_id)

    yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conv_id})}\n\n"

    history.append({"role": "user", "content": message})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    system_prompt = _build_system_prompt(user_id)
    openai_tools = _anthropic_tools_to_openai_tools()

    try:
        from openai import OpenAI
        base_url = ai_config.get("openai_base_url") or None
        client = OpenAI(
            api_key=ai_config.get("openai_api_key") or ai_config.get("api_key"),
            base_url=base_url if base_url else None,
        )

        # Convert history (Anthropic-style) to OpenAI message format
        oai_messages = [{"role": "system", "content": system_prompt}]
        for h in history:
            if h["role"] == "user":
                if isinstance(h["content"], str):
                    oai_messages.append({"role": "user", "content": h["content"]})
                elif isinstance(h["content"], list):
                    # Anthropic represents tool results as user message with list of tool_result blocks.
                    # OpenAI requires each tool result to be a separate {role:"tool", tool_call_id, content} message,
                    # placed immediately after the assistant message that contains the matching tool_calls.
                    for block in h["content"]:
                        if isinstance(block, dict) and block.get("type") == "tool_result":
                            tool_call_id = block.get("tool_use_id") or block.get("tool_call_id") or ""
                            raw_content = block.get("content", "")
                            if not isinstance(raw_content, str):
                                raw_content = json.dumps(raw_content, ensure_ascii=False, default=str)
                            oai_messages.append({
                                "role": "tool",
                                "tool_call_id": tool_call_id,
                                "content": raw_content,
                            })
                        else:
                            # Fallback: treat unknown blocks as plain user text to avoid losing context.
                            oai_messages.append({
                                "role": "user",
                                "content": json.dumps(block, ensure_ascii=False, default=str)
                                if not isinstance(block, str) else block,
                            })
            elif h["role"] == "assistant":
                if isinstance(h["content"], str):
                    # Plain text assistant message. May carry sibling 'reasoning_content'
                    # field that we previously persisted for thinking-mode models (e.g. DeepSeek).
                    msg = {"role": "assistant", "content": h["content"]}
                    if h.get("reasoning_content"):
                        msg["reasoning_content"] = h["reasoning_content"]
                    oai_messages.append(msg)
                elif isinstance(h["content"], list):
                    text_parts = [b["text"] for b in h["content"] if b.get("type") == "text"]
                    reasoning_parts = [b["text"] for b in h["content"] if b.get("type") == "thinking"]
                    tool_calls = []
                    for b in h["content"]:
                        if b.get("type") == "tool_use":
                            tool_calls.append({
                                "id": b["id"],
                                "type": "function",
                                "function": {
                                    "name": b["name"],
                                    "arguments": json.dumps(b.get("input", {}), ensure_ascii=False),
                                },
                            })
                    msg = {"role": "assistant"}
                    if text_parts:
                        msg["content"] = "".join(text_parts)
                    if tool_calls:
                        msg["tool_calls"] = tool_calls
                    # Thinking-mode models (DeepSeek v4 etc.) reject follow-up requests
                    # if the assistant message that triggered tool_calls does not carry
                    # back the original reasoning_content.
                    if reasoning_parts:
                        msg["reasoning_content"] = "".join(reasoning_parts)
                    oai_messages.append(msg)

        actions = []
        max_iterations = 5

        for _iter_idx in range(max_iterations):
            # ===== DEBUG: dump request payload =====
            try:
                _msgs_dump = json.dumps(oai_messages, ensure_ascii=False, indent=2, default=str)
                logger.info(
                    f"[OpenAI request] iter={_iter_idx} "
                    f"model={ai_config.get('openai_model', 'gpt-4o')} "
                    f"message_count={len(oai_messages)}\nmessages={_msgs_dump}"
                )
            except Exception as _log_err:
                logger.warning(f"[OpenAI request] failed to dump messages: {_log_err}")

            try:
                stream = client.chat.completions.create(
                    model=ai_config.get("openai_model", "gpt-4o"),
                    messages=oai_messages,
                    tools=openai_tools if openai_tools else None,
                    stream=True,
                )
            except Exception as _req_err:
                # Try to surface OpenAI's full error body for diagnosis.
                _resp_body = None
                _resp = getattr(_req_err, "response", None)
                if _resp is not None:
                    try:
                        _resp_body = _resp.text
                    except Exception:
                        _resp_body = None
                logger.error(
                    f"[OpenAI response] request failed. error={_req_err} body={_resp_body}"
                )
                raise

            collected_text = ""
            collected_reasoning = ""
            collected_tool_calls = {}

            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue

                if delta.content:
                    collected_text += delta.content
                    yield f"data: {json.dumps({'type': 'text_delta', 'content': delta.content})}\n\n"

                # Thinking-mode models (e.g. DeepSeek v4) emit a separate `reasoning_content`
                # field on the delta. We must collect and round-trip it back on the next
                # request; otherwise the API rejects the call with 400.
                # The OpenAI SDK exposes unknown fields via model_extra / attribute access.
                _reasoning_chunk = getattr(delta, "reasoning_content", None)
                if _reasoning_chunk:
                    collected_reasoning += _reasoning_chunk

                if delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in collected_tool_calls:
                            collected_tool_calls[idx] = {"id": tc_delta.id or "", "name": tc_delta.function.name or "", "arguments": ""}
                        if tc_delta.id:
                            collected_tool_calls[idx]["id"] = tc_delta.id
                        if tc_delta.function and tc_delta.function.name:
                            collected_tool_calls[idx]["name"] = tc_delta.function.name
                        if tc_delta.function and tc_delta.function.arguments:
                            collected_tool_calls[idx]["arguments"] += tc_delta.function.arguments

            has_tool_use = len(collected_tool_calls) > 0

            if has_tool_use:
                assistant_msg = {"role": "assistant"}
                if collected_text:
                    assistant_msg["content"] = collected_text
                if collected_reasoning:
                    # Required by thinking-mode models on subsequent turns within this loop too.
                    assistant_msg["reasoning_content"] = collected_reasoning
                assistant_msg["tool_calls"] = []
                assistant_blocks = []
                if collected_reasoning:
                    # Persist reasoning before text so reconstruction order is stable.
                    assistant_blocks.append({"type": "thinking", "text": collected_reasoning})
                if collected_text:
                    assistant_blocks.append({"type": "text", "text": collected_text})

                # Collect per-tool results so we can build history correctly afterwards
                # without relying on loop-leaked variables (avoids cross-tool content bleed).
                tool_result_pairs: List[Dict[str, str]] = []

                for idx, tc in sorted(collected_tool_calls.items()):
                    try:
                        tool_input = json.loads(tc["arguments"])
                    except json.JSONDecodeError:
                        tool_input = {}

                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': tc['name']})}\n\n"

                    tool_result = _execute_tool(user_id, tc["name"], tool_input)
                    result_str = json.dumps(tool_result, ensure_ascii=False, default=str)
                    action = {"tool": tc["name"], "params": tool_input, "result": result_str}
                    actions.append(action)
                    yield f"data: {json.dumps({'type': 'action', 'action': action})}\n\n"

                    # Append the corresponding tool message immediately so OpenAI sees
                    # assistant.tool_calls -> tool messages -> next assistant.
                    oai_messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result_str})

                    assistant_msg["tool_calls"].append({
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"],
                        },
                    })

                    assistant_blocks.append({
                        "type": "tool_use",
                        "id": tc["id"],
                        "name": tc["name"],
                        "input": tool_input,
                    })

                    tool_result_pairs.append({"id": tc["id"], "result": result_str})

                # OpenAI requires the assistant message (with tool_calls) to come BEFORE
                # the corresponding tool result messages. We've appended tool messages above,
                # so insert the assistant message just before them.
                insert_at = len(oai_messages) - len(tool_result_pairs)
                oai_messages.insert(insert_at, assistant_msg)

                # Save to history in Anthropic format. Use the per-tool collected pairs
                # so each tool_result carries its own content (not the last tool's content).
                history.append({"role": "assistant", "content": assistant_blocks})
                history.append({
                    "role": "user",
                    "content": [
                        {"type": "tool_result", "tool_use_id": pair["id"], "content": pair["result"]}
                        for pair in tool_result_pairs
                    ],
                })

            if not has_tool_use:
                reply_text = collected_text
                # If a reasoning trace exists, persist it as a structured block list so
                # the next turn can round-trip `reasoning_content` back to the API.
                if collected_reasoning:
                    history.append({
                        "role": "assistant",
                        "content": [
                            {"type": "thinking", "text": collected_reasoning},
                            {"type": "text", "text": reply_text},
                        ],
                    })
                else:
                    history.append({"role": "assistant", "content": reply_text})
                yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"
                return

        # Max iterations reached — same persistence rule as above.
        if collected_reasoning:
            history.append({
                "role": "assistant",
                "content": [
                    {"type": "thinking", "text": collected_reasoning},
                    {"type": "text", "text": collected_text},
                ],
            })
        else:
            history.append({"role": "assistant", "content": collected_text})
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"

    except Exception as e:
        # Try to extract OpenAI's full error body if this is an APIError-like object.
        _resp_body = None
        _resp = getattr(e, "response", None)
        if _resp is not None:
            try:
                _resp_body = _resp.text
            except Exception:
                _resp_body = None
        try:
            _msgs_dump = (
                json.dumps(oai_messages, ensure_ascii=False, indent=2, default=str)
                if 'oai_messages' in locals() else None
            )
        except Exception:
            _msgs_dump = "<unserializable oai_messages>"
        logger.error(
            f"AI chat stream error (OpenAI): {e} | response_body={_resp_body} "
            f"| last_oai_messages={_msgs_dump}"
        )
        yield f"data: {json.dumps({'type': 'error', 'content': 'AI 服务暂时不可用，请稍后重试。'})}\n\n"


__all__ = ["_anthropic_tools_to_openai_tools", "_chat_stream_openai"]
