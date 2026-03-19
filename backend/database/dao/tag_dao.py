# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from pymongo.collection import Collection
from pymongo import ASCENDING
from database.connection import get_collection
from database.table_names import TAGS
from models import Tag


class TagDAO:
    """标签数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(TAGS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID索引
            self.collection.create_index("user_id")
            # 复合唯一索引：用户ID + 标签名
            self.collection.create_index(
                [("user_id", ASCENDING), ("name", ASCENDING)],
                unique=True
            )
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def create_tag(self, tag: Tag) -> Dict:
        """创建标签"""
        tag_dict = tag.to_dict()
        self.collection.insert_one(tag_dict)
        # 移除 MongoDB 的 _id 字段
        tag_dict.pop('_id', None)
        return tag_dict
    
    def get_tag_by_id(self, user_id: str, tag_id: str) -> Optional[Dict]:
        """根据ID获取标签"""
        tag = self.collection.find_one({"id": tag_id, "user_id": user_id})
        if tag:
            tag.pop('_id', None)
        return tag
    
    def update_tag(self, user_id: str, tag_id: str, update_data: Dict) -> bool:
        """更新标签"""
        result = self.collection.update_one(
            {"id": tag_id, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def delete_tag(self, user_id: str, tag_id: str) -> bool:
        """删除标签"""
        result = self.collection.delete_one({"id": tag_id, "user_id": user_id})
        return result.deleted_count > 0
    
    def get_user_tags(self, user_id: str) -> List[Dict]:
        """获取用户所有标签"""
        tags = self.collection.find({"user_id": user_id}).sort("created_at", -1)
        
        # 移除所有标签的 _id 字段
        result = []
        for tag in tags:
            tag.pop('_id', None)
            result.append(tag)
        return result
    
    def get_tag_by_name(self, user_id: str, name: str) -> Optional[Dict]:
        """根据名称获取标签"""
        tag = self.collection.find_one({"name": name, "user_id": user_id})
        if tag:
            tag.pop('_id', None)
        return tag
    
    def count_user_tags(self, user_id: str) -> int:
        """统计用户标签数量"""
        return self.collection.count_documents({"user_id": user_id})


# 全局实例
tag_dao = TagDAO()
