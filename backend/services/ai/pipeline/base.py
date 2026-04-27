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
]
