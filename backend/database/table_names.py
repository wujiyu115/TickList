# -*- coding: utf-8 -*-
"""
数据库表名常量

与 SQLAlchemy 模型的 __tablename__ 保持一致
"""

# 核心表
USERS = "users"
TASKS = "tasks"
TASK_LISTS = "task_lists"
TAGS = "tags"

# 关联表
TASK_CHILDREN = "task_children"
TASK_TAGS = "task_tags"

# 功能表
TOKENS = "tokens"
USER_SETTINGS = "user_settings"
TASK_STATISTICS = "task_statistics"
COUNTDOWNS = "countdowns"
FILTERS = "filters"
FOCUS_SESSIONS = "focus_sessions"
WEBAUTHN_CREDENTIALS = "webauthn_credentials"

# 兼容旧代码（别名）
SETTINGS = USER_SETTINGS
