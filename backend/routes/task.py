# -*- coding: utf-8 -*-

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.task_dao import task_dao
from models import Task

router = APIRouter()

# Pydantic 模型
class TaskCreate(BaseModel):
    title: str
    description: str = ''
    status: str = 'pending'
    priority: int = 0
    parent_task_id: Optional[str] = None  # 创建子任务时传父任务 ID
    list_id: Optional[str] = None
    start_time: Optional[str] = None  # ISO 8601 格式
    due_date: Optional[str] = None
    reminder_time: Optional[str] = None
    is_pinned: bool = False
    tags: List[str] = []
    order: int = 0
    push_due_notify: bool = False

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[int] = None
    list_id: Optional[str] = None
    start_time: Optional[str] = None  # ISO 8601 格式
    due_date: Optional[str] = None
    reminder_time: Optional[str] = None
    is_pinned: Optional[bool] = None
    tags: Optional[List[str]] = None
    order: Optional[int] = None
    push_due_notify: Optional[bool] = None

class TaskMove(BaseModel):
    new_parent_id: Optional[str] = None

class BatchUpdateStatus(BaseModel):
    task_ids: List[str]
    status: str

@router.get('/api/tasks/trash')
async def get_trash_tasks(
    page: int = 1,
    page_size: int = 50,
    current_user_id: str = Depends(get_current_user)
):
    """获取垃圾箱任务"""
    result = task_dao.get_deleted_tasks(current_user_id, page, page_size)
    return result

@router.delete('/api/tasks/trash/empty')
async def empty_trash(current_user_id: str = Depends(get_current_user)):
    """清空垃圾箱"""
    count = task_dao.empty_trash(current_user_id)
    return {'success': True, 'deleted_count': count}

@router.get('/api/tasks/search')
async def search_tasks(
    keyword: str = Query(..., min_length=1),
    current_user_id: str = Depends(get_current_user)
):
    """搜索任务"""
    try:
        tasks = task_dao.search_tasks(current_user_id, keyword)
        return {'tasks': tasks, 'count': len(tasks)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'搜索任务失败: {str(e)}')

@router.post('/api/tasks/batch-update')
async def batch_update_tasks(
    batch_data: BatchUpdateStatus,
    current_user_id: str = Depends(get_current_user)
):
    """批量更新任务状态"""
    try:
        count = task_dao.batch_update_status(
            batch_data.task_ids,
            current_user_id,
            batch_data.status
        )
        return {'message': f'已更新 {count} 个任务', 'updated_count': count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'批量更新失败: {str(e)}')

@router.post('/api/tasks')
async def create_task(
    task_data: TaskCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建任务"""
    try:
        # 解析日期时间
        start_time = None
        if task_data.start_time:
            try:
                start_time = datetime.fromisoformat(task_data.start_time.replace('Z', '+00:00'))
            except:
                pass
        
        due_date = None
        if task_data.due_date:
            try:
                due_date = datetime.fromisoformat(task_data.due_date.replace('Z', '+00:00'))
            except:
                pass
        
        reminder_time = None
        if task_data.reminder_time:
            try:
                reminder_time = datetime.fromisoformat(task_data.reminder_time.replace('Z', '+00:00'))
            except:
                pass
        
        # 创建任务对象
        task = Task(
            id=str(uuid.uuid4()),
            title=task_data.title,
            description=task_data.description,
            status=task_data.status,
            priority=task_data.priority,
            list_id=task_data.list_id,
            user_id=current_user_id,
            start_time=start_time,
            due_date=due_date,
            reminder_time=reminder_time,
            is_pinned=task_data.is_pinned,
            tags=task_data.tags,
            order=task_data.order,
            push_due_notify=task_data.push_due_notify
        )
        
        result = task_dao.create_task(task)
        
        # 如果指定了父任务，将新任务添加到父任务的 child_ids
        if task_data.parent_task_id:
            task_dao.add_child_to_task(task_data.parent_task_id, task.id, current_user_id)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'创建任务失败: {str(e)}')

@router.get('/api/tasks')
async def get_tasks(
    status: Optional[str] = Query(None),
    exclude_status: Optional[str] = Query(None, description="排除的任务状态，如 completed"),
    list_id: Optional[str] = Query(None),
    tags: Optional[str] = Query(None),
    is_pinned: Optional[bool] = Query(None),
    priority: Optional[str] = Query(None),       # 优先级筛选，逗号分隔
    keyword: Optional[str] = Query(None),         # 关键词筛选
    start_date: Optional[str] = Query(None),      # 开始时间范围 - 起始日期
    end_date: Optional[str] = Query(None),        # 开始时间范围 - 结束日期
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user_id: str = Depends(get_current_user)
):
    """获取任务列表"""
    try:
        # 解析标签
        tag_list = None
        if tags:
            tag_list = [t.strip() for t in tags.split(',') if t.strip()]
        
        # 解析优先级
        priority_list = None
        if priority:
            try:
                priority_list = [int(p.strip()) for p in priority.split(',') if p.strip()]
            except ValueError:
                pass
        
        # 解析日期范围参数
        start_date_dt = None
        end_date_dt = None
        if start_date:
            try:
                start_date_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            except:
                pass
        if end_date:
            try:
                end_date_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            except:
                pass
        
        tasks = task_dao.get_user_tasks(
            user_id=current_user_id,
            status=status,
            exclude_status=exclude_status,
            list_id=list_id,
            tags=tag_list,
            is_pinned=is_pinned,
            priority=priority_list,
            keyword=keyword,
            start_date=start_date_dt,
            end_date=end_date_dt,
            skip=skip,
            limit=limit
        )
        
        return {
            'tasks': tasks,
            'total': task_dao.count_user_tasks(
                user_id=current_user_id,
                status=status,
                exclude_status=exclude_status,
                list_id=list_id,
                tags=tag_list,
                is_pinned=is_pinned,
                priority=priority_list,
                keyword=keyword,
                start_date=start_date_dt,
                end_date=end_date_dt,
            )
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取任务列表失败: {str(e)}')

@router.get('/api/tasks/{task_id}')
async def get_task(
    task_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取任务详情"""
    task = task_dao.get_task_by_id(task_id, current_user_id)
    if not task:
        raise HTTPException(status_code=404, detail='任务不存在')
    return task

@router.put('/api/tasks/{task_id}')
async def update_task(
    task_id: str,
    task_data: TaskUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新任务"""
    try:
        # 检查任务是否存在
        existing_task = task_dao.get_task_by_id(task_id, current_user_id)
        if not existing_task:
            raise HTTPException(status_code=404, detail='任务不存在')
        
        # 构建更新数据
        update_data = {}
        for field, value in task_data.dict(exclude_unset=True).items():
            if value is not None:
                # 处理日期时间字段
                if field in ['start_time', 'due_date', 'reminder_time'] and isinstance(value, str):
                    try:
                        update_data[field] = datetime.fromisoformat(value.replace('Z', '+00:00')).isoformat()
                    except:
                        update_data[field] = value
                else:
                    update_data[field] = value
        
        # 如果状态变为completed，设置完成时间
        if update_data.get('status') == 'completed':
            update_data['completed_at'] = datetime.now().isoformat()
        elif update_data.get('status') and update_data.get('status') != 'completed':
            update_data['completed_at'] = None
        
        success = task_dao.update_task(task_id, current_user_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新任务失败')
        
        # 返回更新后的任务
        updated_task = task_dao.get_task_by_id(task_id, current_user_id)
        
        return updated_task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'更新任务失败: {str(e)}')

@router.delete('/api/tasks/{task_id}')
async def delete_task(
    task_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除任务"""
    try:
        success = task_dao.delete_task(task_id, current_user_id)
        if not success:
            raise HTTPException(status_code=404, detail='任务不存在')
        return {'message': '任务已删除'}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'删除任务失败: {str(e)}')

@router.post('/api/tasks/{task_id}/move')
async def move_task(
    task_id: str,
    move_data: TaskMove,
    current_user_id: str = Depends(get_current_user)
):
    """移动任务"""
    try:
        success = task_dao.move_task(task_id, current_user_id, move_data.new_parent_id)
        if not success:
            raise HTTPException(status_code=400, detail='移动任务失败，可能会形成循环引用')
        
        updated_task = task_dao.get_task_by_id(task_id, current_user_id)
        return updated_task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'移动任务失败: {str(e)}')

@router.post('/api/tasks/{task_id}/duplicate')
async def duplicate_task(
    task_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """复制任务"""
    try:
        new_task = task_dao.duplicate_task(task_id, current_user_id)
        if not new_task:
            raise HTTPException(status_code=404, detail='任务不存在')
        return new_task
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'复制任务失败: {str(e)}')

@router.post('/api/tasks/{task_id}/restore')
async def restore_task(task_id: str, current_user_id: str = Depends(get_current_user)):
    """恢复已删除的任务"""
    success = task_dao.restore_task(task_id, current_user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found in trash")
    return {'success': True}

@router.delete('/api/tasks/{task_id}/permanent')
async def permanent_delete_task(task_id: str, current_user_id: str = Depends(get_current_user)):
    """永久删除任务"""
    success = task_dao.permanently_delete_task(task_id, current_user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found in trash")
    return {'success': True}

@router.get('/api/tasks/{task_id}/children')
async def get_child_tasks(
    task_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取子任务"""
    try:
        children = task_dao.get_child_tasks(task_id, current_user_id)
        return {'children': children, 'count': len(children)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取子任务失败: {str(e)}')
