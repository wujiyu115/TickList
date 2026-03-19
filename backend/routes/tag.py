# -*- coding: utf-8 -*-

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao
from models import Tag
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["tags"])


# Pydantic 模型
class TagCreate(BaseModel):
    name: str
    color: str = '#1677ff'


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None


@router.post('/tags')
async def create_tag(
    data: TagCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建标签"""
    try:
        # 检查标签名是否已存在
        existing = tag_dao.get_tag_by_name(current_user_id, data.name)
        if existing:
            raise HTTPException(status_code=400, detail='标签名已存在')
        
        # 创建标签对象
        tag = Tag(
            id=str(uuid.uuid4()),
            name=data.name,
            user_id=current_user_id,
            color=data.color
        )
        
        result = tag_dao.create_tag(tag)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建标签失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建标签失败: {str(e)}')


@router.get('/tags')
async def get_tags(
    current_user_id: str = Depends(get_current_user)
):
    """获取标签列表"""
    try:
        tags = tag_dao.get_user_tags(current_user_id)
        
        return {
            'tags': tags,
            'total': tag_dao.count_user_tags(current_user_id)
        }
    except Exception as e:
        logger.error(f"获取标签列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取标签列表失败: {str(e)}')


@router.get('/tags/{tag_id}')
async def get_tag(
    tag_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取标签详情"""
    tag = tag_dao.get_tag_by_id(current_user_id, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail='标签不存在')
    return tag


@router.put('/tags/{tag_id}')
async def update_tag(
    tag_id: str,
    data: TagUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新标签"""
    try:
        # 检查标签是否存在
        existing = tag_dao.get_tag_by_id(current_user_id, tag_id)
        if not existing:
            raise HTTPException(status_code=404, detail='标签不存在')
        
        # 检查新标签名是否与其他标签冲突
        if data.name and data.name != existing['name']:
            name_conflict = tag_dao.get_tag_by_name(current_user_id, data.name)
            if name_conflict:
                raise HTTPException(status_code=400, detail='标签名已存在')
        
        # 构建更新数据
        update_data = {}
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        success = tag_dao.update_tag(current_user_id, tag_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新标签失败')
        
        # 返回更新后的标签
        updated = tag_dao.get_tag_by_id(current_user_id, tag_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新标签失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新标签失败: {str(e)}')


@router.delete('/tags/{tag_id}')
async def delete_tag(
    tag_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除标签"""
    try:
        # 先获取标签信息
        tag = tag_dao.get_tag_by_id(current_user_id, tag_id)
        if not tag:
            raise HTTPException(status_code=404, detail='标签不存在')
        
        # 检查标签是否被任务引用
        tasks_with_tag = task_dao.collection.count_documents({
            "user_id": current_user_id,
            "tags": tag['name']  # MongoDB 会在数组中搜索
        })
        if tasks_with_tag > 0:
            raise HTTPException(
                status_code=400,
                detail=f'该标签被 {tasks_with_tag} 个任务引用，无法删除。请先移除任务中的该标签。'
            )
        
        success = tag_dao.delete_tag(current_user_id, tag_id)
        if not success:
            raise HTTPException(status_code=404, detail='标签不存在')
        return {'message': '标签已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除标签失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除标签失败: {str(e)}')
