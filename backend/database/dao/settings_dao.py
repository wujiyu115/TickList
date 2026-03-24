# -*- coding: utf-8 -*-

from typing import Dict
from datetime import datetime
from database.connection import db_connection
from database.models import UserSettingsModel
from utils.logger import logger


class SettingsDAO:
    """用户设置数据访问对象"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._initialized = True
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _get_default_settings(self, user_id: str) -> Dict:
        """获取默认设置"""
        return {
            'user_id': user_id,
            'theme': 'default',
            'language': 'zh-CN',
            'default_view': 'tasks',
            'default_task_view': 'list',
            'default_priority': 0,
            'default_list_id': None,
            'week_start_day': 1,
            'date_format': 'MM-DD',
            'time_format': '24h',
            'timezone': 'Asia/Shanghai',
            'pomodoro_duration': 25,
            'short_break_duration': 5,
            'long_break_duration': 15,
            'pomodoro_auto_start': False,
            'notification_enabled': True,
            'notification_sound': True,
            'created_at': None,
            'updated_at': None
        }
    
    def _model_to_dict(self, model: UserSettingsModel) -> Dict:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        return {
            'id': model.id,
            'user_id': model.user_id,
            'theme': model.theme,
            'language': model.language,
            'default_view': model.default_view,
            'default_task_view': model.default_task_view,
            'default_priority': model.default_priority,
            'default_list_id': model.default_list_id,
            'week_start_day': model.week_start_day,
            'date_format': model.date_format,
            'time_format': model.time_format,
            'timezone': model.timezone,
            'pomodoro_duration': model.pomodoro_duration,
            'short_break_duration': model.short_break_duration,
            'long_break_duration': model.long_break_duration,
            'pomodoro_auto_start': model.pomodoro_auto_start,
            'notification_enabled': model.notification_enabled,
            'notification_sound': model.notification_sound,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }
    
    def get_settings(self, user_id: str) -> Dict:
        """获取用户设置，不存在则返回默认设置"""
        session = self._get_session()
        try:
            settings_model = session.query(UserSettingsModel).filter(
                UserSettingsModel.user_id == user_id
            ).first()
            
            if settings_model:
                settings = self._model_to_dict(settings_model)
                # 合并默认值，确保新增字段存在
                default_settings = self._get_default_settings(user_id)
                for key, value in default_settings.items():
                    if key not in settings or settings[key] is None:
                        settings[key] = value
                return settings
            
            # 返回默认设置
            return self._get_default_settings(user_id)
        except Exception as e:
            logger.error(f"Failed to get settings for user {user_id}: {e}")
            return self._get_default_settings(user_id)
        finally:
            session.close()
    
    def update_settings(self, user_id: str, settings: Dict) -> Dict:
        """更新用户设置，不存在则创建（upsert）"""
        session = self._get_session()
        try:
            now = datetime.now().isoformat()
            
            # 移除不允许修改的字段
            settings.pop('user_id', None)
            settings.pop('id', None)
            settings.pop('created_at', None)
            
            # 设置更新时间
            settings['updated_at'] = now
            
            # 查找现有记录
            existing = session.query(UserSettingsModel).filter(
                UserSettingsModel.user_id == user_id
            ).first()
            
            if existing:
                # 更新现有记录
                for key, value in settings.items():
                    if hasattr(existing, key):
                        setattr(existing, key, value)
                session.commit()
                return self._model_to_dict(existing)
            else:
                # 创建新记录
                settings_model = UserSettingsModel(
                    user_id=user_id,
                    created_at=now,
                    **settings
                )
                session.add(settings_model)
                session.commit()
                return self._model_to_dict(settings_model)
                
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to update settings for user {user_id}: {e}")
            # 如果失败，返回当前设置
            return self.get_settings(user_id)
        finally:
            session.close()


# 全局实例
settings_dao = SettingsDAO()
