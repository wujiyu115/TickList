# -*- coding: utf-8 -*-

from typing import Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.connection import get_collection
from database.table_names import TASKS, TASK_LISTS, TAGS, COUNTDOWNS
from database.dao.task_dao import task_dao
from database.dao.list_dao import list_dao
from database.dao.tag_dao import tag_dao
from database.dao.countdown_dao import countdown_dao

router = APIRouter(prefix="/api/data", tags=["data"])


class ImportData(BaseModel):
    """导入数据模型"""
    version: str = "1.0"
    data: dict


@router.get('/export')
async def export_data(current_user_id: str = Depends(get_current_user)):
    """
    导出当前用户的所有数据为 JSON
    
    返回包含用户所有任务、清单、标签和倒数日的 JSON 数据
    """
    try:
        # 1. 获取用户所有任务（不筛选，limit 设大）
        tasks = task_dao.get_user_tasks(user_id=current_user_id, limit=100000)
        
        # 2. 获取用户所有清单（包括已归档的）
        lists_active = list_dao.get_user_lists(current_user_id, is_archived=False, limit=10000)
        lists_archived = list_dao.get_user_lists(current_user_id, is_archived=True, limit=10000)
        lists = lists_active + lists_archived
        
        # 3. 获取用户所有标签
        tags = tag_dao.get_user_tags(current_user_id)
        
        # 4. 获取用户所有倒数日
        countdowns = countdown_dao.get_user_countdowns(current_user_id, limit=10000)
        
        # 5. 构造导出数据
        export = {
            "version": "1.0",
            "exported_at": datetime.now().isoformat(),
            "data": {
                "tasks": tasks,
                "lists": lists,
                "tags": tags,
                "countdowns": countdowns
            }
        }
        
        return export
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导出数据失败: {str(e)}")


@router.post('/import')
async def import_data(
    import_data: ImportData,
    current_user_id: str = Depends(get_current_user)
):
    """
    导入数据（JSON格式）
    
    接收从导出接口获取的 JSON 数据，导入到当前用户账户下。
    所有数据的 ID 会被重新生成，关联关系会被正确映射。
    """
    try:
        data = import_data.data
        stats = {"tasks": 0, "lists": 0, "tags": 0, "countdowns": 0}
        
        # ID 映射表（旧ID -> 新ID），用于恢复关联关系
        id_map = {}
        
        # 获取数据库集合
        tags_collection = get_collection(TAGS)
        lists_collection = get_collection(TASK_LISTS)
        tasks_collection = get_collection(TASKS)
        countdowns_collection = get_collection(COUNTDOWNS)
        
        # 1. 先导入标签（无依赖）
        for tag_data in data.get('tags', []):
            old_id = tag_data.get('id')
            new_id = str(uuid.uuid4())
            id_map[old_id] = new_id
            
            # 准备新标签数据
            new_tag = {
                'id': new_id,
                'user_id': current_user_id,
                'name': tag_data.get('name', ''),
                'color': tag_data.get('color', '#1890ff'),
                'created_at': datetime.now().isoformat()
            }
            
            # 检查是否已存在同名标签
            existing_tag = tag_dao.get_tag_by_name(current_user_id, new_tag['name'])
            if existing_tag:
                # 如果已存在，使用已存在的 ID 作为映射
                id_map[old_id] = existing_tag['id']
            else:
                # 创建新标签
                tags_collection.insert_one(new_tag)
                stats["tags"] += 1
        
        # 2. 导入清单（parent_id 需要映射）
        # 先建立所有清单的 ID 映射
        for list_data in data.get('lists', []):
            old_id = list_data.get('id')
            new_id = str(uuid.uuid4())
            id_map[old_id] = new_id
        
        # 再创建清单（此时所有清单 ID 映射已建立）
        for list_data in data.get('lists', []):
            old_id = list_data.get('id')
            new_id = id_map[old_id]
            
            # 准备新清单数据
            new_list = {
                'id': new_id,
                'user_id': current_user_id,
                'name': list_data.get('name', ''),
                'description': list_data.get('description', ''),
                'color': list_data.get('color', '#1890ff'),
                'icon': list_data.get('icon', ''),
                'type': list_data.get('type', 'custom'),
                'order': list_data.get('order', 0),
                'is_archived': list_data.get('is_archived', False),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            # parent_id 映射
            if list_data.get('parent_id') and list_data['parent_id'] in id_map:
                new_list['parent_id'] = id_map[list_data['parent_id']]
            else:
                new_list['parent_id'] = list_data.get('parent_id')
            
            lists_collection.insert_one(new_list)
            stats["lists"] += 1
        
        # 3. 导入任务（child_ids 和 list_id 需要映射）
        # 先建立所有任务的 ID 映射
        for task_data in data.get('tasks', []):
            old_id = task_data.get('id')
            new_id = str(uuid.uuid4())
            id_map[old_id] = new_id
        
        # 第二遍：创建任务（此时所有 ID 映射已建立）
        for task_data in data.get('tasks', []):
            old_id = task_data.get('id')
            new_id = id_map[old_id]
            
            # 准备新任务数据
            new_task = {
                'id': new_id,
                'user_id': current_user_id,
                'title': task_data.get('title', ''),
                'description': task_data.get('description', ''),
                'status': task_data.get('status', 'pending'),
                'priority': task_data.get('priority', 0),
                'due_date': task_data.get('due_date'),
                'start_time': task_data.get('start_time'),
                'reminder_time': task_data.get('reminder_time'),
                'tags': task_data.get('tags', []),
                'order': task_data.get('order', 0),
                'is_pinned': task_data.get('is_pinned', False),
                'completed_at': task_data.get('completed_at'),
                'created_at': task_data.get('created_at', datetime.now().isoformat()),
                'updated_at': datetime.now().isoformat()
            }
            
            # 映射 list_id
            if task_data.get('list_id') and task_data['list_id'] in id_map:
                new_task['list_id'] = id_map[task_data['list_id']]
            else:
                new_task['list_id'] = task_data.get('list_id')
            
            # 映射 child_ids
            if task_data.get('child_ids'):
                new_task['child_ids'] = [
                    id_map.get(cid, cid) for cid in task_data['child_ids']
                ]
            else:
                new_task['child_ids'] = []
            
            tasks_collection.insert_one(new_task)
            stats["tasks"] += 1
        
        # 4. 导入倒数日
        for cd_data in data.get('countdowns', []):
            old_id = cd_data.get('id')
            new_id = str(uuid.uuid4())
            
            # 准备新倒数日数据
            new_countdown = {
                'id': new_id,
                'user_id': current_user_id,
                'title': cd_data.get('title', ''),
                'target_date': cd_data.get('target_date'),
                'category': cd_data.get('category', ''),
                'color': cd_data.get('color', '#1890ff'),
                'is_pinned': cd_data.get('is_pinned', False),
                'repeat_type': cd_data.get('repeat_type'),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat()
            }
            
            countdowns_collection.insert_one(new_countdown)
            stats["countdowns"] += 1
        
        return {"message": "导入成功", "stats": stats}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入数据失败: {str(e)}")
