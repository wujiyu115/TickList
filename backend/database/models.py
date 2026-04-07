# -*- coding: utf-8 -*-
"""
SQLAlchemy ORM 模型定义

基于 backend/models.py 中的 Pydantic 模型定义，用于数据库操作。
Pydantic 模型继续用于 API 请求/响应验证。
"""

from sqlalchemy import Column, String, Integer, Boolean, Text, ForeignKey, Index, UniqueConstraint
from database.connection import Base


class UserModel(Base):
    """用户表"""
    __tablename__ = 'users'
    
    id = Column(String(36), primary_key=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password = Column(String(200), nullable=False)
    email = Column(String(200))
    name = Column(String(100))
    role_group = Column(String(50), default='user')
    created_at = Column(String(50))


class TaskModel(Base):
    """任务表"""
    __tablename__ = 'tasks'
    
    id = Column(String(36), primary_key=True)
    title = Column(String(500), nullable=False)
    description = Column(Text)
    status = Column(String(50), default='pending', index=True)  # pending/in_progress/completed/cancelled
    priority = Column(Integer, default=0)  # 0-4 (0=无, 1=红旗, 2=黄旗, 3=蓝旗, 4=灰旗)
    user_id = Column(String(36), nullable=False, index=True)
    list_id = Column(String(36), index=True)
    start_time = Column(String(50))
    due_date = Column(String(50))
    reminder_time = Column(String(50))
    is_pinned = Column(Boolean, default=False)
    order = Column(Integer, default=0)
    push_due_notify = Column(Boolean, default=False)
    push_notified_date = Column(String(10), nullable=True, default=None)  # 格式 "YYYY-MM-DD"
    pomodoro_count = Column(Integer, default=0)    # 累计番茄数
    focus_duration = Column(Integer, default=0)     # 累计专注秒数
    created_at = Column(String(50))
    updated_at = Column(String(50))
    completed_at = Column(String(50))
    deleted_at = Column(String(50), nullable=True, default=None)
    
    # 复合索引
    __table_args__ = (
        Index('idx_tasks_user_status', 'user_id', 'status'),
        Index('idx_tasks_user_list', 'user_id', 'list_id'),
    )


class TaskChildModel(Base):
    """任务父子关系表（子任务关联）"""
    __tablename__ = 'task_children'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    parent_id = Column(String(36), ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    child_id = Column(String(36), ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(String(36), nullable=False)
    
    __table_args__ = (
        Index('idx_task_children_parent', 'parent_id'),
        Index('idx_task_children_child', 'child_id'),
        UniqueConstraint('parent_id', 'child_id', name='uq_task_children_parent_child'),
    )


class TaskTagModel(Base):
    """任务标签关联表"""
    __tablename__ = 'task_tags'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(36), ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False)
    tag_id = Column(String(36), ForeignKey('tags.id', ondelete='CASCADE'), nullable=False)
    
    __table_args__ = (
        Index('idx_task_tags_task', 'task_id'),
        Index('idx_task_tags_tag', 'tag_id'),
        UniqueConstraint('task_id', 'tag_id', name='uq_task_tags_task_tag'),
    )


class TaskListModel(Base):
    """清单表"""
    __tablename__ = 'task_lists'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(200), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    type = Column(String(50), default='list')  # 'folder' | 'list'
    parent_id = Column(String(36))  # 父文件夹 ID
    color = Column(String(50), default='#1677ff')
    order = Column(Integer, default=0)
    is_archived = Column(Boolean, default=False)
    created_at = Column(String(50))
    updated_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_task_lists_user', 'user_id'),
    )


class TagModel(Base):
    """标签表"""
    __tablename__ = 'tags'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(100), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    color = Column(String(50), default='#1677ff')
    created_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_tags_user', 'user_id'),
        UniqueConstraint('user_id', 'name', name='uq_tags_user_name'),
    )


class TokenModel(Base):
    """令牌表（用于刷新令牌或 API 密钥管理）"""
    __tablename__ = 'tokens'
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    token = Column(String(500), nullable=False, unique=True)
    token_type = Column(String(50), default='refresh')  # refresh/api_key
    expires_at = Column(String(50))
    created_at = Column(String(50))
    revoked = Column(Boolean, default=False)
    
    __table_args__ = (
        Index('idx_tokens_user', 'user_id'),
        Index('idx_tokens_token', 'token'),
    )


class UserSettingsModel(Base):
    """用户设置表（扁平化所有设置字段）"""
    __tablename__ = 'user_settings'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), unique=True, nullable=False, index=True)
    
    # 外观设置
    theme = Column(String(50), default='default')  # default/blue/green/purple/orange/rose/dark/midnight
    language = Column(String(20), default='zh-CN')  # zh-CN/en-US
    
    # 任务默认设置
    default_view = Column(String(50), default='tasks')  # tasks/calendar/statistics/pomodoro
    default_task_view = Column(String(50), default='list')  # list/kanban
    default_priority = Column(Integer, default=0)  # 0-4
    default_list_id = Column(String(36))
    
    # 日期与时间
    week_start_day = Column(Integer, default=1)  # 0=周日, 1=周一
    date_format = Column(String(50), default='MM-DD')  # MM-DD/DD-MM/YYYY-MM-DD
    time_format = Column(String(10), default='24h')  # 24h/12h
    timezone = Column(String(100), default='Asia/Shanghai')
    
    # 番茄钟设置
    pomodoro_duration = Column(Integer, default=25)  # 分钟
    short_break_duration = Column(Integer, default=5)
    long_break_duration = Column(Integer, default=15)
    pomodoro_auto_start = Column(Boolean, default=False)
    focus_min_duration = Column(Integer, default=5)  # 最短专注时长（分钟）
    
    # 通知设置
    notification_enabled = Column(Boolean, default=True)
    notification_sound = Column(Boolean, default=True)
    
    # 推送设置
    push_enabled = Column(Boolean, default=False)
    push_channels = Column(Text, default='[]')  # JSON 字符串
    push_interval = Column(Integer, default=30)  # 推送检查间隔（分钟）
    push_batch_size = Column(Integer, default=5)  # 每次推送合并的最大条数
    
    # 时间戳
    created_at = Column(String(50))
    updated_at = Column(String(50))


class TaskStatisticsModel(Base):
    """任务统计表"""
    __tablename__ = 'task_statistics'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), nullable=False, index=True)
    date = Column(String(50), nullable=False)  # 日期字符串，如 2024-01-01
    total_tasks = Column(Integer, default=0)
    completed_tasks = Column(Integer, default=0)
    pending_tasks = Column(Integer, default=0)
    in_progress_tasks = Column(Integer, default=0)
    cancelled_tasks = Column(Integer, default=0)
    completion_rate = Column(Integer, default=0)  # 百分比，如 75 表示 75%
    created_at = Column(String(50))
    updated_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_task_statistics_user_date', 'user_id', 'date'),
        UniqueConstraint('user_id', 'date', name='uq_task_statistics_user_date'),
    )


class CountdownModel(Base):
    """倒数日表"""
    __tablename__ = 'countdowns'
    
    id = Column(String(36), primary_key=True)
    title = Column(String(200), nullable=False)
    target_date = Column(String(50), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    category = Column(String(50), default='custom')  # birthday/anniversary/holiday/custom
    is_pinned = Column(Boolean, default=False)
    color = Column(String(50), default='')
    repeat_annually = Column(Boolean, default=False)
    note = Column(Text)
    push_due_notify = Column(Boolean, default=False)
    push_notified_date = Column(String(10), nullable=True, default=None)  # 格式 "YYYY-MM-DD"
    created_at = Column(String(50))
    updated_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_countdowns_user', 'user_id'),
    )


class FocusSessionModel(Base):
    """专注记录表"""
    __tablename__ = 'focus_sessions'
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    task_id = Column(String(36), nullable=True)  # 可空，支持独立专注
    type = Column(String(20), nullable=False)     # "pomodoro" / "stopwatch"
    duration = Column(Integer, default=0)          # 实际专注秒数
    started_at = Column(String(50))
    ended_at = Column(String(50))
    created_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_focus_sessions_user', 'user_id'),
        Index('idx_focus_sessions_user_started', 'user_id', 'started_at'),
    )


class FilterModel(Base):
    """过滤器表"""
    __tablename__ = 'filters'
    
    id = Column(String(36), primary_key=True)
    name = Column(String(200), nullable=False)
    user_id = Column(String(36), nullable=False, index=True)
    # conditions 使用 Text 列存储 JSON 字符串（兼容 SQLite）
    # 结构示例: {"list_id": "xxx", "tags": ["tag1"], "date_range": "today", ...}
    conditions = Column(Text, default='{}')
    created_at = Column(String(50))
    updated_at = Column(String(50))
    
    __table_args__ = (
        Index('idx_filters_user', 'user_id'),
    )
