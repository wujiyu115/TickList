# -*- coding: utf-8 -*-

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.counter_dao import counter_dao
from models import Counter
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["counters"])

class CounterCreate(BaseModel):
    title: str
    initial_value: int = 0
    step: int = 1
    target_value: Optional[int] = None
    is_pinned: bool = False
    color: str = ''
    note: str = ''

class CounterUpdate(BaseModel):
    title: Optional[str] = None
    step: Optional[int] = None
    target_value: Optional[int] = None
    is_pinned: Optional[bool] = None
    color: Optional[str] = None
    note: Optional[str] = None

@router.post('/counters')
async def create_counter(
    data: CounterCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建计数器"""
    try:
        counter = Counter(
            id=str(uuid.uuid4()),
            title=data.title,
            user_id=current_user_id,
            initial_value=data.initial_value,
            current_value=data.initial_value,
            step=data.step,
            target_value=data.target_value,
            is_pinned=data.is_pinned,
            color=data.color,
            note=data.note
        )
        result = counter_dao.create_counter(counter)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建计数器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建计数器失败: {str(e)}')

@router.get('/counters')
async def get_counters(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user_id: str = Depends(get_current_user)
):
    """获取计数器列表"""
    try:
        counters = counter_dao.get_user_counters(
            user_id=current_user_id,
            skip=skip,
            limit=limit
        )
        return {
            'counters': counters,
            'total': counter_dao.count_user_counters(current_user_id)
        }
    except Exception as e:
        logger.error(f"获取计数器列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取计数器列表失败: {str(e)}')

@router.get('/counters/{counter_id}')
async def get_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取计数器详情"""
    counter = counter_dao.get_counter_by_id(current_user_id, counter_id)
    if not counter:
        raise HTTPException(status_code=404, detail='计数器不存在')
    return counter

@router.put('/counters/{counter_id}')
async def update_counter(
    counter_id: str,
    data: CounterUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新计数器"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        
        update_data = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not update_data:
            return existing
        
        success = counter_dao.update_counter(current_user_id, counter_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新计数器失败')
        
        return counter_dao.get_counter_by_id(current_user_id, counter_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新计数器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新计数器失败: {str(e)}')

@router.delete('/counters/{counter_id}')
async def delete_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除计数器"""
    try:
        success = counter_dao.delete_counter(current_user_id, counter_id)
        if not success:
            raise HTTPException(status_code=404, detail='计数器不存在')
        return {'message': '计数器已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除计数器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除计数器失败: {str(e)}')

@router.post('/counters/{counter_id}/increment')
async def increment_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """增加计数"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        if existing['is_completed']:
            raise HTTPException(status_code=400, detail='计数器已完成，无法操作')
        
        result = counter_dao.increment_counter(current_user_id, counter_id, existing['step'])
        if not result:
            raise HTTPException(status_code=500, detail='增加计数失败')
        
        # 检查是否达到目标值
        reached_target = False
        if result['target_value'] is not None:
            if result['initial_value'] <= result['target_value']:
                reached_target = result['current_value'] >= result['target_value']
            else:
                reached_target = result['current_value'] <= result['target_value']
        
        return {**result, 'reached_target': reached_target}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"增加计数失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'增加计数失败: {str(e)}')

@router.post('/counters/{counter_id}/decrement')
async def decrement_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """减少计数"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        if existing['is_completed']:
            raise HTTPException(status_code=400, detail='计数器已完成，无法操作')
        if existing['current_value'] <= 0:
            raise HTTPException(status_code=400, detail='当前值已为0，无法减少')
        
        result = counter_dao.decrement_counter(current_user_id, counter_id, existing['step'])
        if not result:
            raise HTTPException(status_code=500, detail='减少计数失败')
        
        # 检查是否达到目标值
        reached_target = False
        if result['target_value'] is not None:
            if result['initial_value'] <= result['target_value']:
                reached_target = result['current_value'] >= result['target_value']
            else:
                reached_target = result['current_value'] <= result['target_value']
        
        return {**result, 'reached_target': reached_target}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"减少计数失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'减少计数失败: {str(e)}')

@router.put('/counters/{counter_id}/complete')
async def complete_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """标记计数器为已完成"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        
        success = counter_dao.update_counter(current_user_id, counter_id, {'is_completed': True})
        if not success:
            raise HTTPException(status_code=500, detail='操作失败')
        
        return counter_dao.get_counter_by_id(current_user_id, counter_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"标记完成失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'标记完成失败: {str(e)}')

@router.put('/counters/{counter_id}/reopen')
async def reopen_counter(
    counter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """重新打开已完成的计数器"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        
        success = counter_dao.update_counter(current_user_id, counter_id, {'is_completed': False})
        if not success:
            raise HTTPException(status_code=500, detail='操作失败')
        
        return counter_dao.get_counter_by_id(current_user_id, counter_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"重新打开失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'重新打开失败: {str(e)}')

@router.get('/counters/{counter_id}/histories')
async def get_counter_histories(
    counter_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user_id: str = Depends(get_current_user)
):
    """获取计数器操作历史"""
    try:
        existing = counter_dao.get_counter_by_id(current_user_id, counter_id)
        if not existing:
            raise HTTPException(status_code=404, detail='计数器不存在')
        
        histories = counter_dao.get_counter_histories(
            user_id=current_user_id,
            counter_id=counter_id,
            skip=skip,
            limit=limit
        )
        return {
            'histories': histories,
            'total': counter_dao.count_counter_histories(current_user_id, counter_id)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取操作历史失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取操作历史失败: {str(e)}')
