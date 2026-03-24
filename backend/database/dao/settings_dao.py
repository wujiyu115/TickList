# -*- coding: utf-8 -*-

from typing import Dict, Optional
from datetime import datetime
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import SETTINGS
from models import UserSettings


class SettingsDAO:
    """用户设置数据访问对象"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, '_initialized'):
            self.collection: Collection = get_collection(SETTINGS)
            self._ensure_indexes()
            self._initialized = True
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID唯一索引
            self.collection.create_index("user_id", unique=True)
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def get_settings(self, user_id: str) -> Dict:
        """获取用户设置，不存在则返回默认设置"""
        settings = self.collection.find_one({"user_id": user_id})
        if settings:
            settings.pop('_id', None)
            # 合并默认值，确保新增字段存在
            default_settings = UserSettings.get_default_settings(user_id)
            for key, value in default_settings.items():
                if key not in settings:
                    settings[key] = value
            return settings
        # 返回默认设置
        return UserSettings.get_default_settings(user_id)
    
    def update_settings(self, user_id: str, settings: Dict) -> Dict:
        """更新用户设置，不存在则创建（upsert）"""
        now = datetime.now().isoformat()
        
        # 移除不允许修改的字段
        settings.pop('user_id', None)
        settings.pop('_id', None)
        settings.pop('created_at', None)
        
        # 设置更新时间
        settings['updated_at'] = now
        
        # 使用 upsert 确保首次访问时自动创建
        result = self.collection.find_one_and_update(
            {"user_id": user_id},
            {
                "$set": settings,
                "$setOnInsert": {
                    "user_id": user_id,
                    "created_at": now
                }
            },
            upsert=True,
            return_document=True
        )
        
        if result:
            result.pop('_id', None)
            return result
        
        # 如果返回为空，则获取最新数据
        return self.get_settings(user_id)


# 全局实例
settings_dao = SettingsDAO()
