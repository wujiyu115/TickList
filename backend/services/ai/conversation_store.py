# -*- coding: utf-8 -*-
"""In-memory conversation history store for AI chat sessions.

Each conversation is keyed by ``f"{user_id}:{conversation_id}"`` and stores
a sliding window (``MAX_HISTORY``) of message dicts in Anthropic-style
format. Provider-specific stream modules are responsible for translating
this canonical history into their own wire format.
"""

import uuid
from typing import Dict, List, Optional


_conversations: Dict[str, Dict] = {}
MAX_HISTORY = 20


def _get_or_create_conversation(
    user_id: str, conversation_id: Optional[str]
) -> tuple[str, List[Dict]]:
    if not conversation_id:
        conversation_id = str(uuid.uuid4())
    key = f"{user_id}:{conversation_id}"
    if key not in _conversations:
        _conversations[key] = {"user_id": user_id, "messages": []}
    return conversation_id, _conversations[key]["messages"]


__all__ = ["MAX_HISTORY", "_get_or_create_conversation"]
