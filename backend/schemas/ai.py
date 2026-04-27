# -*- coding: utf-8 -*-
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class AiChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None


class ToolAction(BaseModel):
    tool: str
    params: Dict[str, Any]
    result: str


class AiChatResponse(BaseModel):
    reply: str
    conversation_id: str
    actions: List[ToolAction] = []

class AiDisambiguateRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    selected_id: str
    extra_params: Dict[str, Any] = {}

class AiConfirmRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    params: Dict[str, Any]
    confirmed: bool