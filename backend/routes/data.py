# -*- coding: utf-8 -*-

from typing import Dict, List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
import uuid
import csv
import io
import re

from middleware.jwt_middleware import get_current_user
from database.dao.task_dao import task_dao
from database.dao.list_dao import list_dao
from database.dao.tag_dao import tag_dao
from database.dao.countdown_dao import countdown_dao
from database.dao.focus_dao import focus_dao
from database.dao.filter_dao import filter_dao
from database.dao.settings_dao import settings_dao

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
        
        # 5. 获取用户所有专注记录
        focus_result = focus_dao.get_sessions(user_id=current_user_id, page=1, page_size=1000000)
        focus_sessions = focus_result.get('sessions', [])
        # 移除导出时不需要的 task_title（运行时关联字段）
        for session_item in focus_sessions:
            session_item.pop('task_title', None)
        
        # 6. 获取用户所有过滤器
        filters = filter_dao.get_user_filters(current_user_id)
        
        # 7. 获取用户设置
        settings = settings_dao.get_settings(current_user_id)
        # 移除内部字段
        settings.pop('id', None)
        
        # 8. 构造导出数据
        export = {
            "version": "1.1",
            "exported_at": datetime.now().isoformat(),
            "data": {
                "tasks": tasks,
                "lists": lists,
                "tags": tags,
                "countdowns": countdowns,
                "focus_sessions": focus_sessions,
                "filters": filters,
                "settings": settings
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
    from database.connection import db_connection
    from database.models import TagModel, TaskListModel, TaskModel, CountdownModel, TaskTagModel, TaskChildModel, FocusSessionModel, FilterModel
    
    try:
        data = import_data.data
        stats = {"tasks": 0, "lists": 0, "tags": 0, "countdowns": 0, "focus_sessions": 0, "filters": 0, "settings": 0}
        
        # ID 映射表（旧ID -> 新ID），用于恢复关联关系
        id_map = {}
        
        session = db_connection.get_session()
        
        try:
            # 1. 先导入标签（无依赖）
            for tag_data in data.get('tags', []):
                old_id = tag_data.get('id')
                new_id = str(uuid.uuid4())
                id_map[old_id] = new_id
                
                # 检查是否已存在同名标签
                existing_tag = tag_dao.get_tag_by_name(current_user_id, tag_data.get('name', ''))
                if existing_tag:
                    # 如果已存在，使用已存在的 ID 作为映射
                    id_map[old_id] = existing_tag['id']
                else:
                    # 创建新标签
                    new_tag = TagModel(
                        id=new_id,
                        user_id=current_user_id,
                        name=tag_data.get('name', ''),
                        color=tag_data.get('color', '#1890ff'),
                        created_at=datetime.now().isoformat()
                    )
                    session.add(new_tag)
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
                
                # 映射 parent_id
                parent_id = None
                if list_data.get('parent_id') and list_data['parent_id'] in id_map:
                    parent_id = id_map[list_data['parent_id']]
                
                new_list = TaskListModel(
                    id=new_id,
                    user_id=current_user_id,
                    name=list_data.get('name', ''),
                    type=list_data.get('type', 'list'),
                    parent_id=parent_id,
                    color=list_data.get('color', '#1677ff'),
                    order=list_data.get('order', 0),
                    is_archived=list_data.get('is_archived', False),
                    created_at=datetime.now().isoformat(),
                    updated_at=datetime.now().isoformat()
                )
                session.add(new_list)
                stats["lists"] += 1
            
            # 3. 导入任务（child_ids 和 list_id 需要映射）
            # 先建立所有任务的 ID 映射
            for task_data in data.get('tasks', []):
                old_id = task_data.get('id')
                new_id = str(uuid.uuid4())
                id_map[old_id] = new_id
            
            # 创建任务（此时所有 ID 映射已建立）
            for task_data in data.get('tasks', []):
                old_id = task_data.get('id')
                new_id = id_map[old_id]
                
                # 映射 list_id
                list_id = None
                if task_data.get('list_id') and task_data['list_id'] in id_map:
                    list_id = id_map[task_data['list_id']]
                
                # 映射 child_ids
                child_ids = []
                if task_data.get('child_ids'):
                    child_ids = [id_map.get(cid, cid) for cid in task_data['child_ids']]
                
                # 映射 tags (JSON 格式)
                tags = task_data.get('tags', [])
                
                new_task = TaskModel(
                    id=new_id,
                    user_id=current_user_id,
                    title=task_data.get('title', ''),
                    description=task_data.get('description', ''),
                    content=task_data.get('content', ''),
                    status=task_data.get('status', 'pending'),
                    priority=task_data.get('priority', 0),
                    list_id=list_id,
                    start_time=task_data.get('start_time'),
                    due_date=task_data.get('due_date'),
                    reminder_time=task_data.get('reminder_time'),
                    is_pinned=task_data.get('is_pinned', False),
                    order=task_data.get('order', 0),
                    push_due_notify=task_data.get('push_due_notify', False),
                    push_notified_date=task_data.get('push_notified_date'),
                    pomodoro_count=task_data.get('pomodoro_count', 0),
                    focus_duration=task_data.get('focus_duration', 0),
                    completed_at=task_data.get('completed_at'),
                    deleted_at=task_data.get('deleted_at'),
                    created_at=task_data.get('created_at', datetime.now().isoformat()),
                    updated_at=datetime.now().isoformat()
                )
                session.add(new_task)
                
                # 通过关系表存储标签关联
                for tag_id in tags:
                    tag_relation = TaskTagModel(
                        task_id=new_id,
                        tag_id=tag_id
                    )
                    session.add(tag_relation)
                
                # 通过关系表存储父子关系
                for child_id in child_ids:
                    child_relation = TaskChildModel(
                        parent_id=new_id,
                        child_id=child_id,
                        user_id=current_user_id
                    )
                    session.add(child_relation)
                
                stats["tasks"] += 1
            
            # 4. 导入倒数日
            for cd_data in data.get('countdowns', []):
                new_id = str(uuid.uuid4())
                
                new_countdown = CountdownModel(
                    id=new_id,
                    user_id=current_user_id,
                    title=cd_data.get('title', ''),
                    target_date=cd_data.get('target_date'),
                    category=cd_data.get('category', 'custom'),
                    is_pinned=cd_data.get('is_pinned', False),
                    color=cd_data.get('color', '#1677ff'),
                    repeat_annually=cd_data.get('repeat_annually', False),
                    note=cd_data.get('note', ''),
                    push_due_notify=cd_data.get('push_due_notify', False),
                    push_notified_date=cd_data.get('push_notified_date'),
                    created_at=datetime.now().isoformat(),
                    updated_at=datetime.now().isoformat()
                )
                session.add(new_countdown)
                stats["countdowns"] += 1
            
            # 5. 导入专注记录（task_id 需要映射）
            for fs_data in data.get('focus_sessions', []):
                new_id = str(uuid.uuid4())
                
                # 映射 task_id
                task_id = None
                if fs_data.get('task_id') and fs_data['task_id'] in id_map:
                    task_id = id_map[fs_data['task_id']]
                
                new_focus = FocusSessionModel(
                    id=new_id,
                    user_id=current_user_id,
                    task_id=task_id,
                    type=fs_data.get('type', 'pomodoro'),
                    duration=fs_data.get('duration', 0),
                    started_at=fs_data.get('started_at', ''),
                    ended_at=fs_data.get('ended_at', ''),
                    created_at=fs_data.get('created_at', datetime.now().isoformat())
                )
                session.add(new_focus)
                stats["focus_sessions"] += 1
            
            # 6. 导入过滤器
            for f_data in data.get('filters', []):
                new_id = str(uuid.uuid4())
                
                # conditions 需要序列化为 JSON 字符串
                import json
                conditions = f_data.get('conditions', {})
                if isinstance(conditions, dict):
                    conditions = json.dumps(conditions)
                
                new_filter = FilterModel(
                    id=new_id,
                    user_id=current_user_id,
                    name=f_data.get('name', ''),
                    conditions=conditions,
                    created_at=datetime.now().isoformat(),
                    updated_at=datetime.now().isoformat()
                )
                session.add(new_filter)
                stats["filters"] += 1
            
            # 7. 导入用户设置（合并到现有设置）
            settings_data = data.get('settings')
            if settings_data and isinstance(settings_data, dict):
                # 移除不应导入的字段
                settings_data.pop('id', None)
                settings_data.pop('user_id', None)
                settings_data.pop('created_at', None)
                settings_data.pop('updated_at', None)
                
                if settings_data:
                    settings_dao.update_settings(current_user_id, settings_data)
                    stats["settings"] = 1
            
            session.commit()
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
        
        return {"message": "导入成功", "stats": stats}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入数据失败: {str(e)}")


def _parse_dida_date(date_str: str) -> Optional[str]:
    """解析滴答清单的日期格式，返回 ISO 8601 字符串"""
    if not date_str or date_str.strip() == '':
        return None
    try:
        # 滴答格式: 2020-05-08T16:00:00+0000
        # 转换为标准 ISO 8601 格式
        return date_str.replace('+0000', '+00:00').replace('+0800', '+08:00')
    except:
        return None


def _map_dida_priority(priority_str: str) -> int:
    """映射滴答清单优先级到 TickList 优先级
    滴答: 0=无, 1=低(蓝旗), 3=中(黄旗), 5=高(红旗)
    TickList: 0=无, 1=高(红旗), 2=中(黄旗), 3=低(蓝旗)
    """
    try:
        priority = int(priority_str)
        if priority == 5:
            return 1  # 红旗/高
        elif priority == 3:
            return 2  # 黄旗/中
        elif priority == 1:
            return 3  # 蓝旗/低
        return 0
    except:
        return 0


def _map_dida_status(status_str: str) -> str:
    """映射滴答清单状态到 TickList 状态
    滴答: 0=Normal, 1=Completed, 2=Archived
    TickList: pending, completed
    """
    try:
        status = int(status_str)
        if status in [1, 2]:
            return 'completed'
        return 'pending'
    except:
        return 'pending'


def _parse_dida_content(content: str) -> dict:
    """解析滴答清单的内容字段
    
    内容可能无换行符，直接用 ▪/▫ 拼接，例如：
      "描述内容▫未完成项▪已完成项"
    解析规则：
      - 第一个 ▪/▫ 之前的文本为 description
      - ▪ 开头的段落 = 已完成检查事项
      - ▫ 开头的段落 = 未完成检查事项
    
    返回: {"description": str, "content": str}
    """
    if not content:
        return {"description": "", "content": ""}
    
    import json
    
    # 用正则按 ▪/▫ 分割，保留分隔符
    parts = re.split(r'([▪▫])', content)
    
    description = ''
    checklist_items = []
    
    i = 0
    # 第一段（在任何 ▪/▫ 之前）是描述
    if i < len(parts) and parts[i] not in ('▪', '▫'):
        description = parts[i].strip()
        i += 1
    
    # 后续成对出现：分隔符 + 文本
    while i + 1 < len(parts):
        marker = parts[i]
        text = parts[i + 1].strip()
        if text:
            checklist_items.append({
                "text": text,
                "checked": marker == '▪'
            })
        i += 2
    
    if checklist_items:
        return {
            "description": description,
            "content": json.dumps(checklist_items, ensure_ascii=False)
        }
    else:
        return {"description": content.strip(), "content": ""}


@router.post('/import-dida')
async def import_dida_csv(
    file: UploadFile = File(...),
    current_user_id: str = Depends(get_current_user)
):
    """
    导入滴答清单 CSV 备份文件
    
    CSV 格式说明：
    - 前6行为元数据，跳过
    - 第7行为表头
    - 第8行起为数据
    """
    from database.connection import db_connection
    from database.models import TagModel, TaskListModel, TaskModel, TaskChildModel, TaskTagModel
    from models import Tag, TaskList, Task
    
    try:
        # 读取文件内容
        content = await file.read()
        try:
            text = content.decode('utf-8')
        except UnicodeDecodeError:
            # 尝试 GBK 编码
            text = content.decode('gbk')
        
        # 分割行，跳过前6行元数据
        lines = text.split('\n')
        if len(lines) < 8:
            raise HTTPException(status_code=400, detail="CSV 文件格式错误：行数不足")
        
        # 从第7行开始（索引6）作为 CSV 内容
        csv_content = '\n'.join(lines[6:])
        
        # 解析 CSV
        reader = csv.DictReader(io.StringIO(csv_content))
        rows = list(reader)
        
        if not rows:
            raise HTTPException(status_code=400, detail="CSV 文件中没有数据")
        
        # 统计信息
        stats = {"tasks": 0, "lists": 0, "folders": 0, "tags": 0, "skipped": 0}
        
        # 映射表
        folder_map = {}  # folder_name -> folder_id
        list_map = {}    # (folder_name, list_name) -> list_id
        tag_map = {}     # tag_name -> tag_id
        dida_id_map = {} # dida_taskId -> ticklist_task_id
        
        session = db_connection.get_session()
        
        try:
            # ========== 第一遍遍历：收集并创建文件夹、清单、标签 ==========
            
            # 收集所有文件夹和清单
            folder_names = set()
            list_keys = set()  # (folder_name, list_name)
            tag_names = set()
            
            for row in rows:
                folder_name = row.get('Folder Name', '').strip()
                list_name = row.get('List Name', '').strip()
                tags_str = row.get('Tags', '').strip()
                
                if folder_name:
                    folder_names.add(folder_name)
                if folder_name and list_name:
                    list_keys.add((folder_name, list_name))
                
                # 解析标签（逗号分隔）
                if tags_str:
                    for tag in tags_str.split(','):
                        tag = tag.strip()
                        if tag:
                            tag_names.add(tag)
            
            # 创建文件夹
            order = 0
            for folder_name in sorted(folder_names):
                # 检查是否已存在同名文件夹
                existing = session.query(TaskListModel).filter(
                    TaskListModel.user_id == current_user_id,
                    TaskListModel.name == folder_name,
                    TaskListModel.type == 'folder'
                ).first()
                
                if existing:
                    folder_map[folder_name] = existing.id
                else:
                    folder_id = str(uuid.uuid4())
                    now = datetime.now().isoformat()
                    folder = TaskListModel(
                        id=folder_id,
                        user_id=current_user_id,
                        name=folder_name,
                        type='folder',
                        parent_id=None,
                        color='#1677ff',
                        order=order,
                        is_archived=False,
                        created_at=now,
                        updated_at=now
                    )
                    session.add(folder)
                    folder_map[folder_name] = folder_id
                    stats["folders"] += 1
                    order += 1
            
            # 创建清单
            order = 0
            for folder_name, list_name in sorted(list_keys):
                # 检查是否已存在同名清单（在同一文件夹下）
                parent_id = folder_map.get(folder_name)
                existing = session.query(TaskListModel).filter(
                    TaskListModel.user_id == current_user_id,
                    TaskListModel.name == list_name,
                    TaskListModel.type == 'list',
                    TaskListModel.parent_id == parent_id
                ).first()
                
                if existing:
                    list_map[(folder_name, list_name)] = existing.id
                else:
                    list_id = str(uuid.uuid4())
                    now = datetime.now().isoformat()
                    task_list = TaskListModel(
                        id=list_id,
                        user_id=current_user_id,
                        name=list_name,
                        type='list',
                        parent_id=parent_id,
                        color='#1677ff',
                        order=order,
                        is_archived=False,
                        created_at=now,
                        updated_at=now
                    )
                    session.add(task_list)
                    list_map[(folder_name, list_name)] = list_id
                    stats["lists"] += 1
                    order += 1
            
            # 创建标签
            for tag_name in sorted(tag_names):
                # 检查是否已存在同名标签
                existing = session.query(TagModel).filter(
                    TagModel.user_id == current_user_id,
                    TagModel.name == tag_name
                ).first()
                
                if existing:
                    tag_map[tag_name] = existing.id
                else:
                    tag_id = str(uuid.uuid4())
                    now = datetime.now().isoformat()
                    tag = TagModel(
                        id=tag_id,
                        user_id=current_user_id,
                        name=tag_name,
                        color='#1677ff',
                        created_at=now
                    )
                    session.add(tag)
                    tag_map[tag_name] = tag_id
                    stats["tags"] += 1
            
            # 提交文件夹、清单、标签
            session.flush()
            
            # ========== 第二遍遍历：创建任务 ==========
            
            # 分离顶级任务和子任务
            top_level_rows = []
            child_rows = []
            
            for row in rows:
                parent_id = row.get('parentId', '').strip()
                if parent_id:
                    child_rows.append(row)
                else:
                    top_level_rows.append(row)
            
            # 先创建顶级任务
            for row in top_level_rows:
                dida_task_id = row.get('taskId', '').strip()
                if not dida_task_id:
                    stats["skipped"] += 1
                    continue
                
                title = row.get('Title', '').strip()
                if not title:
                    stats["skipped"] += 1
                    continue
                
                # 获取清单 ID
                folder_name = row.get('Folder Name', '').strip()
                list_name = row.get('List Name', '').strip()
                list_id = list_map.get((folder_name, list_name))
                
                # 解析标签
                tags_str = row.get('Tags', '').strip()
                tag_ids = []
                if tags_str:
                    for tag in tags_str.split(','):
                        tag = tag.strip()
                        if tag and tag in tag_map:
                            tag_ids.append(tag_map[tag])
                
                # 创建任务
                task_id = str(uuid.uuid4())
                now = datetime.now().isoformat()
                
                parsed = _parse_dida_content(row.get('Content', ''))
                task = TaskModel(
                    id=task_id,
                    user_id=current_user_id,
                    title=title,
                    description=parsed['description'],
                    content=parsed['content'],
                    status=_map_dida_status(row.get('Status', '0')),
                    priority=_map_dida_priority(row.get('Priority', '0')),
                    list_id=list_id,
                    start_time=_parse_dida_date(row.get('Start Date', '')),
                    due_date=_parse_dida_date(row.get('Due Date', '')),
                    reminder_time=_parse_dida_date(row.get('Reminder', '')),
                    is_pinned=False,
                    order=0,
                    push_due_notify=False,
                    pomodoro_count=0,
                    focus_duration=0,
                    created_at=_parse_dida_date(row.get('Created Time', '')) or now,
                    updated_at=now,
                    completed_at=_parse_dida_date(row.get('Completed Time', ''))
                )
                session.add(task)
                
                # 添加标签关系
                for tag_id in tag_ids:
                    tag_relation = TaskTagModel(
                        task_id=task_id,
                        tag_id=tag_id
                    )
                    session.add(tag_relation)
                
                dida_id_map[dida_task_id] = task_id
                stats["tasks"] += 1
            
            # 提交顶级任务
            session.flush()
            
            # 创建子任务
            for row in child_rows:
                dida_task_id = row.get('taskId', '').strip()
                dida_parent_id = row.get('parentId', '').strip()
                
                if not dida_task_id:
                    stats["skipped"] += 1
                    continue
                
                title = row.get('Title', '').strip()
                if not title:
                    stats["skipped"] += 1
                    continue
                
                # 检查父任务是否存在
                parent_task_id = dida_id_map.get(dida_parent_id)
                if not parent_task_id:
                    # 父任务不存在，跳过此子任务
                    stats["skipped"] += 1
                    continue
                
                # 获取清单 ID
                folder_name = row.get('Folder Name', '').strip()
                list_name = row.get('List Name', '').strip()
                list_id = list_map.get((folder_name, list_name))
                
                # 解析标签
                tags_str = row.get('Tags', '').strip()
                tag_ids = []
                if tags_str:
                    for tag in tags_str.split(','):
                        tag = tag.strip()
                        if tag and tag in tag_map:
                            tag_ids.append(tag_map[tag])
                
                # 创建子任务
                task_id = str(uuid.uuid4())
                now = datetime.now().isoformat()
                
                parsed = _parse_dida_content(row.get('Content', ''))
                task = TaskModel(
                    id=task_id,
                    user_id=current_user_id,
                    title=title,
                    description=parsed['description'],
                    content=parsed['content'],
                    status=_map_dida_status(row.get('Status', '0')),
                    priority=_map_dida_priority(row.get('Priority', '0')),
                    list_id=list_id,
                    start_time=_parse_dida_date(row.get('Start Date', '')),
                    due_date=_parse_dida_date(row.get('Due Date', '')),
                    reminder_time=_parse_dida_date(row.get('Reminder', '')),
                    is_pinned=False,
                    order=0,
                    push_due_notify=False,
                    pomodoro_count=0,
                    focus_duration=0,
                    created_at=_parse_dida_date(row.get('Created Time', '')) or now,
                    updated_at=now,
                    completed_at=_parse_dida_date(row.get('Completed Time', ''))
                )
                session.add(task)
                
                # 添加标签关系
                for tag_id in tag_ids:
                    tag_relation = TaskTagModel(
                        task_id=task_id,
                        tag_id=tag_id
                    )
                    session.add(tag_relation)
                
                # 添加父子关系
                child_relation = TaskChildModel(
                    parent_id=parent_task_id,
                    child_id=task_id,
                    user_id=current_user_id
                )
                session.add(child_relation)
                
                dida_id_map[dida_task_id] = task_id
                stats["tasks"] += 1
            
            session.commit()
            
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
        
        return {"message": "滴答清单数据导入成功", "stats": stats}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"导入滴答清单数据失败: {str(e)}")
