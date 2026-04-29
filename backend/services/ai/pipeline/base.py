# -*- coding: utf-8 -*-
"""Pipeline core abstractions: Handler, ChatContext, ResolutionResult.

Every concrete handler subclasses :class:`Handler` and decides whether to
handle a request itself (yield SSE events) or delegate to ``self.next_handler``.
``ResolutionResult`` is the canonical representation produced by the rule
layer and the JSON-mode layer; the executor turns it into SSE events.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Optional, Union

class ResolutionStatus(str, Enum):
    EXECUTABLE = "executable"
    NEED_DISAMBIGUATION = "need_disambiguation"
    NEED_CONFIRMATION = "need_confirmation"
    PASS = "pass"

@dataclass
class ResolutionResult:
    status: ResolutionStatus
    intent: Optional[str] = None
    params: dict = field(default_factory=dict)
    candidates: Optional[list[dict]] = None
    reply_text: Optional[str] = None
    source: str = "rule"

@dataclass
class ChatContext:
    user_id: str
    message: str
    conversation_id: str
    upstream_hint: Optional[dict] = None
    trace: list[str] = field(default_factory=list)

class Handler(ABC):
    """Abstract base for pipeline handlers."""

    def __init__(self, next_handler: Optional["Handler"] = None) -> None:
        self.next_handler = next_handler

    @abstractmethod
    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings (already terminated with ``\\n\\n``)."""
        if False:  # pragma: no cover - keeps type checker happy for abstract async gen
            yield ""

SseEventPayload = Union[str, dict]

# trace 前缀 → 友好层名。pipeline.py 和 chat_stream.py 的 done 日志会读这个表。
_TRACE_PREFIX_TO_LAYER: list[tuple[str, str]] = [
    ("rule:miss", "L1-rule-miss"),
    ("rule:", "L1-rule"),
    ("json:miss", "L2-json-miss"),
    ("json:fail", "L2-json-fail"),
    ("json:unknown", "L2-json-unknown"),
    ("json:", "L2-json"),
    ("tools:fail", "L3-tools-fail"),
    ("tools:", "L3-tools"),
]


def summarize_hit(trace: list[str]) -> tuple[str, Optional[str]]:
    """从 ctx.trace 解析"最终命中的层 + 意图"，用于 done 日志一行直观展示。

    Returns:
        ``(hit_layer, hit_intent)``：
        - ``hit_layer``：``L1-rule`` / ``L2-json`` / ``L3-tools`` / ``L1-rule-miss`` 等；
          没有任何 trace 时返回 ``"none"``。
        - ``hit_intent``：trace entry 冒号后的子串（如 ``query_tasks`` / ``list_tasks``），
          没有意图（如 ``rule:miss``）时返回 ``None``。

    解析规则：
        优先以**最后一条非 exec、非 fallback** 的 trace 为准，因为后续的 ``exec:ok``
        只代表"成功执行"，不代表"哪一层产出的结果"。
    """
    if not trace:
        return "none", None
    # 反向找：跳过 exec:* 这种"执行结果"标记，找到真正决定意图的那一条。
    for entry in reversed(trace):
        if entry.startswith("exec:"):
            continue
        for prefix, layer in _TRACE_PREFIX_TO_LAYER:
            if entry.startswith(prefix):
                # 提取意图：取冒号后的部分；miss/fail/unknown 这种没有 intent
                intent_part = entry.split(":", 1)[1] if ":" in entry else ""
                intent = intent_part if intent_part and intent_part not in {
                    "miss", "fail", "unknown",
                } and not intent_part.startswith("fail:") else None
                return layer, intent
    # trace 全是 exec:* 之类，没找到匹配前缀
    return "unknown", None


def sse_event(event_type: str, payload: SseEventPayload) -> str:
    """Format a single SSE event line.

    ``payload`` can be a dict (merged with ``{"type": event_type}``) or a
    string (treated as ``content`` for text-like events).

    Notes:
        - If ``payload`` is a dict with a ``"type"`` key, it is silently
          overridden by ``event_type`` so the caller always controls the
          event type. Don't rely on payload-supplied ``type``.
        - JSON serialization uses ``ensure_ascii=False`` (Chinese passes
          through verbatim) and ``default=str`` (datetime / dataclass /
          Enum fall back to ``str(...)``). Callers that need ISO-8601
          datetimes must convert before calling.
    """
    if isinstance(payload, str):
        body: dict[str, Any] = {"type": event_type, "content": payload}
    else:
        body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False, default=str)}\n\n"

__all__ = [
    "ChatContext",
    "Handler",
    "ResolutionResult",
    "ResolutionStatus",
    "sse_event",
    "summarize_hit",
]
