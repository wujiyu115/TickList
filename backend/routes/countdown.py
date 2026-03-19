# -*- coding: utf-8 -*-

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.countdown_dao import countdown_dao
from models import Countdown
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["countdowns"])


# Pydantic 模型
class CountdownCreate(BaseModel):
    title: str
    target_date: str
    category: str = 'custom'
    is_pinned: bool = False
    color: str = ''
    repeat_annually: bool = False
    note: str = ''


class CountdownUpdate(BaseModel):
    title: Optional[str] = None
    target_date: Optional[str] = None
    category: Optional[str] = None
    is_pinned: Optional[bool] = None
    color: Optional[str] = None
    repeat_annually: Optional[bool] = None
    note: Optional[str] = None


@router.post('/countdowns')
async def create_countdown(
    data: CountdownCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建倒数日"""
    try:
        # 解析目标日期
        target_date = datetime.fromisoformat(data.target_date.replace('Z', '+00:00'))
        
        # 创建倒数日对象
        countdown = Countdown(
            id=str(uuid.uuid4()),
            title=data.title,
            target_date=target_date,
            user_id=current_user_id,
            category=data.category,
            is_pinned=data.is_pinned,
            color=data.color,
            repeat_annually=data.repeat_annually,
            note=data.note
        )
        
        result = countdown_dao.create_countdown(countdown)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建倒数日失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建倒数日失败: {str(e)}')


@router.get('/countdowns')
async def get_countdowns(
    category: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user_id: str = Depends(get_current_user)
):
    """获取倒数日列表"""
    try:
        countdowns = countdown_dao.get_user_countdowns(
            user_id=current_user_id,
            category=category,
            skip=skip,
            limit=limit
        )
        
        return {
            'countdowns': countdowns,
            'total': countdown_dao.count_user_countdowns(current_user_id, category)
        }
    except Exception as e:
        logger.error(f"获取倒数日列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取倒数日列表失败: {str(e)}')


@router.get('/countdowns/{countdown_id}')
async def get_countdown(
    countdown_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取倒数日详情"""
    countdown = countdown_dao.get_countdown_by_id(current_user_id, countdown_id)
    if not countdown:
        raise HTTPException(status_code=404, detail='倒数日不存在')
    return countdown


@router.put('/countdowns/{countdown_id}')
async def update_countdown(
    countdown_id: str,
    data: CountdownUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新倒数日"""
    try:
        # 检查倒数日是否存在
        existing = countdown_dao.get_countdown_by_id(current_user_id, countdown_id)
        if not existing:
            raise HTTPException(status_code=404, detail='倒数日不存在')
        
        # 构建更新数据
        update_data = {}
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                # 处理目标日期字段
                if field == 'target_date' and isinstance(value, str):
                    try:
                        update_data[field] = datetime.fromisoformat(value.replace('Z', '+00:00')).isoformat()
                    except:
                        update_data[field] = value
                else:
                    update_data[field] = value
        
        success = countdown_dao.update_countdown(current_user_id, countdown_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新倒数日失败')
        
        # 返回更新后的倒数日
        updated = countdown_dao.get_countdown_by_id(current_user_id, countdown_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新倒数日失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新倒数日失败: {str(e)}')


@router.delete('/countdowns/{countdown_id}')
async def delete_countdown(
    countdown_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除倒数日"""
    try:
        success = countdown_dao.delete_countdown(current_user_id, countdown_id)
        if not success:
            raise HTTPException(status_code=404, detail='倒数日不存在')
        return {'message': '倒数日已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除倒数日失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除倒数日失败: {str(e)}')
