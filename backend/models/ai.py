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