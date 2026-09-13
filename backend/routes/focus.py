# -*- coding: utf-8 -*-

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional

from middleware.jwt_middleware import get_current_user
from database.dao.focus_dao import focus_dao, FocusSessionTaskNotFoundError

router = APIRouter(prefix="/api/focus", tags=["focus"])


class FocusSessionCreate(BaseModel):
    """创建专注记录请求体"""
    task_id: Optional[str] = None
    type: str = "pomodoro"        # "pomodoro" / "stopwatch"
    duration: int = 0              # 秒
    started_at: str = ""
    ended_at: str = ""
    # 固定小写 UUID 避免 SQLite/MySQL 的大小写、重音及尾空格比较差异。
    # 旧客户端可省略或传 null；非规范键拒绝，不静默归一化/合并记录。
    client_session_id: Optional[str] = Field(
        default=None,
        min_length=36,
        max_length=36,
        pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        description="Canonical lowercase hyphenated UUID; reuse unchanged for retries",
    )


@router.get("/overview")
async def get_focus_overview(current_user_id: str = Depends(get_current_user)):
    """获取专注概览"""
    try:
        return focus_dao.get_overview(current_user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取专注概览失败: {str(e)}')


@router.get("/capabilities")
async def get_focus_capabilities(current_user_id: str = Depends(get_current_user)):
    """返回客户端可用的专注接口能力。"""
    return {"client_session_id": True}


@router.get("/sessions")
async def get_focus_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user_id: str = Depends(get_current_user)
):
    """获取专注记录列表"""
    try:
        return focus_dao.get_sessions(current_user_id, page, page_size, start_date, end_date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取专注记录失败: {str(e)}')


@router.post("/sessions")
async def create_focus_session(
    session: FocusSessionCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建专注记录"""
    try:
        return focus_dao.create_session(current_user_id, session.dict())
    except FocusSessionTaskNotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'创建专注记录失败: {str(e)}')


@router.delete("/sessions/{session_id}")
async def delete_focus_session(
    session_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除专注记录"""
    try:
        success = focus_dao.delete_session(current_user_id, session_id)
        if not success:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'删除专注记录失败: {str(e)}')
