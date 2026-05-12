# -*- coding: utf-8 -*-

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.list_dao import list_dao
from models import TaskList
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["lists"])


# Pydantic 模型
class ListCreate(BaseModel):
    name: str
    type: str = 'list'  # folder | list
    parent_id: Optional[str] = None
    color: str = '#1677ff'
    font_color: Optional[str] = None
    order: int = 0


class ListUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    color: Optional[str] = None
    font_color: Optional[str] = None
    order: Optional[int] = None
    is_archived: Optional[bool] = None
    is_pinned: Optional[bool] = None


class ReorderItem(BaseModel):
    id: str
    order: int


@router.post('/lists')
async def create_list(
    data: ListCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建清单"""
    try:
        # 创建清单对象
        task_list = TaskList(
            id=str(uuid.uuid4()),
            name=data.name,
            user_id=current_user_id,
            type=data.type,
            parent_id=data.parent_id,
            color=data.color,
            font_color=data.font_color,
            order=data.order
        )
        
        result = list_dao.create_list(task_list)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建清单失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建清单失败: {str(e)}')


@router.get('/lists')
async def get_lists(
    type: Optional[str] = Query(None),
    is_archived: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user_id: str = Depends(get_current_user)
):
    """获取清单列表"""
    try:
        lists = list_dao.get_user_lists(
            user_id=current_user_id,
            type=type,
            is_archived=is_archived,
            skip=skip,
            limit=limit
        )
        
        return {
            'lists': lists,
            'total': list_dao.count_user_lists(current_user_id, type, is_archived)
        }
    except Exception as e:
        logger.error(f"获取清单列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取清单列表失败: {str(e)}')


@router.get('/lists/{list_id}')
async def get_list(
    list_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取清单详情"""
    task_list = list_dao.get_list_by_id(current_user_id, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail='清单不存在')
    return task_list


@router.get('/lists/{list_id}/task-count')
async def get_list_task_count(
    list_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取清单中的任务数量"""
    task_list = list_dao.get_list_by_id(current_user_id, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail='清单不存在')

    if task_list['type'] == 'folder':
        result = list_dao.count_tasks_in_folder(current_user_id, list_id)
        return {'list_id': list_id, 'type': 'folder', 'sublist_count': result['sublist_count'], 'task_count': result['task_count']}
    else:
        count = list_dao.count_tasks_in_list(current_user_id, list_id)
        return {'list_id': list_id, 'type': 'list', 'task_count': count}


@router.put('/lists/{list_id}')
async def update_list(
    list_id: str,
    data: ListUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新清单"""
    try:
        # 检查清单是否存在
        existing = list_dao.get_list_by_id(current_user_id, list_id)
        if not existing:
            raise HTTPException(status_code=404, detail='清单不存在')
        
        # 构建更新数据（允许可空字段被显式设为 None）
        nullable_fields = {'font_color'}
        # 布尔字段：None 表示不更新，False 表示取消
        bool_fields = {'is_archived', 'is_pinned'}
        update_data = {}
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None or field in nullable_fields:
                update_data[field] = value
            elif field in bool_fields and value is None:
                # bool 字段未显式设置时不更新（已被 exclude_unset 过滤）
                pass
        
        success = list_dao.update_list(current_user_id, list_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新清单失败')
        
        # 返回更新后的清单
        updated = list_dao.get_list_by_id(current_user_id, list_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新清单失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新清单失败: {str(e)}')


@router.delete('/lists/{list_id}')
async def delete_list(
    list_id: str,
    action: Optional[str] = Query(None, description='处理任务方式: delete_tasks, move_tasks'),
    target_list_id: Optional[str] = Query(None, description='移动任务的目标清单ID，空值=收集箱'),
    current_user_id: str = Depends(get_current_user)
):
    """删除清单，可选择处理其中的任务"""
    try:
        result = list_dao.delete_list_with_handling(
            current_user_id, list_id, action, target_list_id
        )
        if not result.get('success'):
            detail = result.get('error', '清单不存在')
            raise HTTPException(status_code=400 if '目标' in detail or '不能' in detail else 404, detail=detail)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除清单失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除清单失败: {str(e)}')


@router.post('/lists/reorder')
async def reorder_lists(
    items: List[ReorderItem],
    current_user_id: str = Depends(get_current_user)
):
    """批量更新清单排序"""
    try:
        for item in items:
            # 检查清单是否存在且属于当前用户
            existing = list_dao.get_list_by_id(current_user_id, item.id)
            if not existing:
                raise HTTPException(status_code=404, detail=f'清单 {item.id} 不存在')
            # 更新排序
            list_dao.update_list(current_user_id, item.id, {'order': item.order})
        return {'message': '排序已更新'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量更新排序失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'批量更新排序失败: {str(e)}')
