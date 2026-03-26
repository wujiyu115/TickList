# -*- coding: utf-8 -*-

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from middleware.jwt_middleware import get_current_user
from database.dao.settings_dao import settings_dao

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsUpdate(BaseModel):
    """设置更新模型（所有字段可选，支持部分更新）"""
    # 外观设置
    theme: Optional[str] = None
    language: Optional[str] = None
    # 任务默认设置
    default_view: Optional[str] = None
    default_task_view: Optional[str] = None  # 默认任务视图模式: list/kanban
    default_priority: Optional[int] = None
    default_list_id: Optional[str] = None
    # 日期与时间
    week_start_day: Optional[int] = None
    date_format: Optional[str] = None
    time_format: Optional[str] = None
    timezone: Optional[str] = None
    # 番茄钟设置
    pomodoro_duration: Optional[int] = None
    short_break_duration: Optional[int] = None
    long_break_duration: Optional[int] = None
    pomodoro_auto_start: Optional[bool] = None
    # 通知设置
    notification_enabled: Optional[bool] = None
    notification_sound: Optional[bool] = None
    # 推送设置
    push_enabled: Optional[bool] = None
    push_channels: Optional[str] = None
    push_interval: Optional[int] = None
    push_batch_size: Optional[int] = None


class PushTestRequest(BaseModel):
    """推送测试请求模型"""
    type: str  # bark / custom_http
    config: dict


@router.get("")
async def get_settings(current_user_id: str = Depends(get_current_user)):
    """获取当前用户的设置"""
    try:
        settings = settings_dao.get_settings(current_user_id)
        return settings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取设置失败: {str(e)}')


@router.put("")
async def update_settings(
    settings_data: SettingsUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新当前用户的设置（部分更新）"""
    try:
        # 只获取有值的字段
        update_data = settings_data.dict(exclude_unset=True)
        
        if not update_data:
            # 如果没有传任何字段，返回当前设置
            return settings_dao.get_settings(current_user_id)
        
        # 更新设置
        updated_settings = settings_dao.update_settings(current_user_id, update_data)
        return updated_settings
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'更新设置失败: {str(e)}')


@router.post("/push/test")
async def test_push(
    request: PushTestRequest,
    current_user_id: str = Depends(get_current_user)
):
    """测试单个推送渠道"""
    try:
        from services.push_service import push_service
        channel_config = {
            'type': request.type,
            'config': request.config
        }
        result = push_service.test_channel(channel_config)
        return {"success": result["success"], "message": result.get("message", "")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'推送测试失败: {str(e)}')
