# -*- coding: utf-8 -*-

from typing import Dict, List, Optional
from datetime import datetime

class User:
    """用户模型"""
    def __init__(self, id: str, username: str, password: str, email: str = '', role_group: str = 'user'):
        self.id = id
        self.username = username
        self.password = password  # 加密后的密码
        self.email = email
        self.role_group = role_group  # 用户组
        self.created_at = datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'username': self.username,
            'password': self.password,
            'email': self.email,
            'role_group': self.role_group,
            'created_at': self.created_at.isoformat()
        }
    
    def get_name(self) -> str:
        return self.username


class Task:
    """任务模型"""
    def __init__(
        self,
        id: str,
        title: str,
        user_id: str,
        description: str = '',
        status: str = 'pending',
        priority: int = 0,
        child_ids: Optional[List[str]] = None,
        list_id: Optional[str] = None,
        start_time: Optional[datetime] = None,
        due_date: Optional[datetime] = None,
        reminder_time: Optional[datetime] = None,
        is_pinned: bool = False,
        tags: Optional[List[str]] = None,
        order: int = 0
    ):
        self.id = id
        self.title = title
        self.description = description
        self.status = status  # pending, in_progress, completed, cancelled
        self.priority = priority  # 0-4 (0=无, 1=红旗, 2=黄旗, 3=蓝旗, 4=灰旗)
        self.child_ids = child_ids or []
        self.list_id = list_id
        self.user_id = user_id
        self.start_time = start_time
        self.due_date = due_date
        self.reminder_time = reminder_time
        self.is_pinned = is_pinned
        self.tags = tags or []
        self.order = order
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
        self.completed_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'priority': self.priority,
            'child_ids': self.child_ids,
            'list_id': self.list_id,
            'user_id': self.user_id,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'reminder_time': self.reminder_time.isoformat() if self.reminder_time else None,
            'is_pinned': self.is_pinned,
            'tags': self.tags,
            'order': self.order,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }
    
    def update_status(self, status: str):
        """更新任务状态"""
        self.status = status
        self.updated_at = datetime.now()
        if status == 'completed':
            self.completed_at = datetime.now()
        elif self.completed_at:
            self.completed_at = None
    
    def update(self, **kwargs):
        """更新任务属性"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self.updated_at = datetime.now()


class TaskStatistics:
    """任务统计模型"""
    def __init__(
        self,
        user_id: str,
        date: datetime,
        total_tasks: int = 0,
        completed_tasks: int = 0,
        pending_tasks: int = 0,
        in_progress_tasks: int = 0,
        cancelled_tasks: int = 0
    ):
        self.user_id = user_id
        self.date = date
        self.total_tasks = total_tasks
        self.completed_tasks = completed_tasks
        self.pending_tasks = pending_tasks
        self.in_progress_tasks = in_progress_tasks
        self.cancelled_tasks = cancelled_tasks
        self.completion_rate = (
            (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        )
        self.created_at = datetime.now()
        self.updated_at = datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'user_id': self.user_id,
            'date': self.date.isoformat() if isinstance(self.date, datetime) else self.date,
            'total_tasks': self.total_tasks,
            'completed_tasks': self.completed_tasks,
            'pending_tasks': self.pending_tasks,
            'in_progress_tasks': self.in_progress_tasks,
            'cancelled_tasks': self.cancelled_tasks,
            'completion_rate': round(self.completion_rate, 2),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat()
        }


class Countdown:
    """倒数日模型"""
    def __init__(
        self,
        id: str,
        title: str,
        target_date: datetime,
        user_id: str,
        category: str = 'custom',
        is_pinned: bool = False,
        color: str = '',
        repeat_annually: bool = False,
        note: str = '',
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.title = title
        self.target_date = target_date
        self.user_id = user_id
        self.category = category  # birthday/anniversary/holiday/custom
        self.is_pinned = is_pinned
        self.color = color
        self.repeat_annually = repeat_annually
        self.note = note
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'title': self.title,
            'target_date': self.target_date.isoformat() if isinstance(self.target_date, datetime) else self.target_date,
            'user_id': self.user_id,
            'category': self.category,
            'is_pinned': self.is_pinned,
            'color': self.color,
            'repeat_annually': self.repeat_annually,
            'note': self.note,
            'created_at': self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
            'updated_at': self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else self.updated_at,
        }

    def update(self, **kwargs):
        """更新倒数日属性"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self.updated_at = datetime.now()


class TaskList:
    """清单模型"""
    def __init__(
        self,
        id: str,
        name: str,
        user_id: str,
        type: str = 'list',  # 'folder' | 'list'
        parent_id: Optional[str] = None,
        color: str = '#1677ff',
        order: int = 0,
        is_archived: bool = False,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.name = name
        self.user_id = user_id
        self.type = type
        self.parent_id = parent_id
        self.color = color
        self.order = order
        self.is_archived = is_archived
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'user_id': self.user_id,
            'type': self.type,
            'parent_id': self.parent_id,
            'color': self.color,
            'order': self.order,
            'is_archived': self.is_archived,
            'created_at': self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
            'updated_at': self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else self.updated_at,
        }

    def update(self, **kwargs):
        """更新清单属性"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self.updated_at = datetime.now()


class Tag:
    """标签模型"""
    def __init__(
        self,
        id: str,
        name: str,
        user_id: str,
        color: str = '#1677ff',
        created_at: Optional[datetime] = None
    ):
        self.id = id
        self.name = name
        self.user_id = user_id
        self.color = color
        self.created_at = created_at or datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'user_id': self.user_id,
            'color': self.color,
            'created_at': self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
        }


class Filter:
    """过滤器模型"""
    def __init__(
        self,
        id: str,
        name: str,
        user_id: str,
        conditions: Dict = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None
    ):
        self.id = id
        self.name = name
        self.user_id = user_id
        self.conditions = conditions or {}
        # conditions 结构示例:
        # {
        #   "list_id": "xxx",        # 清单ID，None表示所有
        #   "tags": ["tag1"],         # 标签列表
        #   "date_range": "today",    # 日期范围: today/week/month/all
        #   "priority": [1, 2],       # 优先级列表
        #   "status": "pending",      # 状态
        #   "keyword": "搜索词",      # 内容包含
        # }
        self.created_at = created_at or datetime.now()
        self.updated_at = updated_at or datetime.now()
    
    def to_dict(self) -> Dict:
        return {
            'id': self.id,
            'name': self.name,
            'user_id': self.user_id,
            'conditions': self.conditions,
            'created_at': self.created_at.isoformat() if isinstance(self.created_at, datetime) else self.created_at,
            'updated_at': self.updated_at.isoformat() if isinstance(self.updated_at, datetime) else self.updated_at,
        }
    
    def update(self, **kwargs):
        """更新过滤器属性"""
        for key, value in kwargs.items():
            if hasattr(self, key):
                setattr(self, key, value)
        self.updated_at = datetime.now()
