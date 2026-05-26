# -*- coding: utf-8 -*-

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any

from middleware.jwt_middleware import get_current_user
from services.debug_log_service import debug_log_service

router = APIRouter(prefix="/api/debug-logs", tags=["debug-logs"])


class DebugLogEntry(BaseModel):
    tag: str
    data: dict[str, Any] = {}


@router.post("")
async def create_log(entry: DebugLogEntry, current_user_id: str = Depends(get_current_user)):
    debug_log_service.add(current_user_id, entry.tag, entry.data)
    return {"status": "ok"}


@router.get("")
async def get_logs(current_user_id: str = Depends(get_current_user)):
    return {"logs": debug_log_service.get(current_user_id)}


@router.delete("")
async def clear_logs(current_user_id: str = Depends(get_current_user)):
    debug_log_service.clear(current_user_id)
    return {"status": "ok"}
