# -*- coding: utf-8 -*-
"""Anthropic Claude streaming chat implementation.

Implements the SSE event protocol consumed by the frontend for the Claude
provider, including multi-turn tool-use loops. Canonical history (in
Anthropic format) is read/written via :mod:`conversation_store`.
"""

import json
from typing import AsyncGenerator, Dict, Optional

from utils.logger import logger

from .conversation_store import MAX_HISTORY, _get_or_create_conversation
from .system_prompt import _build_system_prompt
from .tools_executor import _execute_tool
from .tools_schema import TOOLS


async def _chat_stream_claude(
    user_id: str,
    message: str,
    conversation_id: Optional[str],
    ai_config: Dict,
) -> AsyncGenerator[str, None]:
    """Stream chat via Anthropic Claude API with tool use."""
    conv_id, history = _get_or_create_conversation(user_id, conversation_id)

    # Emit conversation_id first
    yield f"data: {json.dumps({'type': 'conversation_id', 'conversation_id': conv_id})}\n\n"

    history.append({"role": "user", "content": message})
    if len(history) > MAX_HISTORY:
        history[:] = history[-MAX_HISTORY:]

    system_prompt = _build_system_prompt(user_id)

    assistant_blocks = []

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ai_config["api_key"])

        messages = history.copy()
        actions = []

        max_iterations = 5
        for _ in range(max_iterations):
            # Use streaming API
            with client.messages.stream(
                model=ai_config["model"],
                max_tokens=ai_config["max_tokens"],
                system=system_prompt,
                tools=TOOLS,
                messages=messages,
            ) as stream:
                # Collect complete response for tool handling
                # But also stream text to frontend
                current_tool_uses = []
                tool_input_buffers = {}

                for event in stream:
                    if event.type == "message_start":
                        pass
                    elif event.type == "content_block_start":
                        if event.content_block.type == "text":
                            yield f"data: {json.dumps({'type': 'text_start'})}\n\n"
                        elif event.content_block.type == "tool_use":
                            current_tool_uses.append({
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input": {},
                            })
                            tool_input_buffers[event.content_block.id] = ""
                            yield f"data: {json.dumps({'type': 'tool_start', 'tool': event.content_block.name})}\n\n"
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            yield f"data: {json.dumps({'type': 'text_delta', 'content': event.delta.text})}\n\n"
                        elif event.delta.type == "input_json_delta":
                            # Accumulate tool input JSON
                            if current_tool_uses:
                                last_tool = current_tool_uses[-1]
                                tool_input_buffers[last_tool["id"]] += event.delta.partial_json
                    elif event.type == "content_block_stop":
                        if current_tool_uses and current_tool_uses[-1]["id"] == event.index:
                            # Parse accumulated input for this tool
                            last_tool = current_tool_uses[-1]
                            try:
                                last_tool["input"] = json.loads(tool_input_buffers.get(last_tool["id"], "{}"))
                            except json.JSONDecodeError:
                                last_tool["input"] = {}
                    elif event.type == "message_stop":
                        pass

                # Get the final accumulated message
                response = stream.get_final_message()

            # Check if response contains tool calls
            has_tool_use = False
            assistant_blocks = []
            tool_results_for_api = []

            for block in response.content:
                if block.type == "text":
                    assistant_blocks.append({"type": "text", "text": block.text})
                elif block.type == "tool_use":
                    has_tool_use = True
                    tool_result = _execute_tool(user_id, block.name, block.input)
                    result_str = json.dumps(tool_result, ensure_ascii=False, default=str)
                    action = {"tool": block.name, "params": block.input, "result": result_str}
                    actions.append(action)

                    # Emit action result to frontend
                    yield f"data: {json.dumps({'type': 'action', 'action': action})}\n\n"

                    assistant_blocks.append({
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    })
                    tool_results_for_api.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result_str,
                    })

            if has_tool_use:
                messages.append({"role": "assistant", "content": assistant_blocks})
                messages.append({"role": "user", "content": tool_results_for_api})

            if not has_tool_use:
                # Final text reply received — save to history
                reply_text = "".join(b.get("text", "") for b in assistant_blocks if b.get("type") == "text")
                history.append({"role": "assistant", "content": reply_text})
                yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"
                return

        # Max iterations reached
        reply_text = "".join(b.get("text", "") for b in assistant_blocks if b.get("type") == "text")
        history.append({"role": "assistant", "content": reply_text})
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"

    except Exception as e:
        logger.error(f"AI chat stream error (Claude): {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'content': 'AI 服务暂时不可用，请稍后重试。'})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'conversation_id': conv_id})}\n\n"


__all__ = ["_chat_stream_claude"]
