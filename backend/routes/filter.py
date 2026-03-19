# -*- coding: utf-8 -*-

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.filter_dao import filter_dao
from models import Filter
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["filters"])


# Pydantic 模型
class FilterCreate(BaseModel):
    name: str
    conditions: dict = {}


class FilterUpdate(BaseModel):
    name: Optional[str] = None
    conditions: Optional[dict] = None


@router.post('/filters')
async def create_filter(
    data: FilterCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建过滤器"""
    try:
        # 创建过滤器对象
        filter_obj = Filter(
            id=str(uuid.uuid4()),
            name=data.name,
            user_id=current_user_id,
            conditions=data.conditions
        )
        
        result = filter_dao.create_filter(filter_obj)
        return result
    except Exception as e:
        logger.error(f"创建过滤器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建过滤器失败: {str(e)}')


@router.get('/filters')
async def get_filters(
    current_user_id: str = Depends(get_current_user)
):
    """获取过滤器列表"""
    try:
        filters = filter_dao.get_user_filters(current_user_id)
        
        return {
            'filters': filters,
            'total': filter_dao.count_user_filters(current_user_id)
        }
    except Exception as e:
        logger.error(f"获取过滤器列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取过滤器列表失败: {str(e)}')


@router.put('/filters/{filter_id}')
async def update_filter(
    filter_id: str,
    data: FilterUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新过滤器"""
    try:
        # 检查过滤器是否存在
        existing = filter_dao.get_filter_by_id(filter_id, current_user_id)
        if not existing:
            raise HTTPException(status_code=404, detail='过滤器不存在')
        
        # 构建更新数据
        update_data = {}
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        if not update_data:
            raise HTTPException(status_code=400, detail='没有需要更新的数据')
        
        success = filter_dao.update_filter(filter_id, current_user_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新过滤器失败')
        
        # 返回更新后的过滤器
        updated = filter_dao.get_filter_by_id(filter_id, current_user_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新过滤器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新过滤器失败: {str(e)}')


@router.delete('/filters/{filter_id}')
async def delete_filter(
    filter_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除过滤器"""
    try:
        # 检查过滤器是否存在
        existing = filter_dao.get_filter_by_id(filter_id, current_user_id)
        if not existing:
            raise HTTPException(status_code=404, detail='过滤器不存在')
        
        success = filter_dao.delete_filter(filter_id, current_user_id)
        if not success:
            raise HTTPException(status_code=500, detail='删除过滤器失败')
        
        return {'message': '过滤器已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除过滤器失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除过滤器失败: {str(e)}')
