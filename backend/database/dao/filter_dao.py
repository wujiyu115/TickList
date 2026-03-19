# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import FILTERS
from models import Filter


class FilterDAO:
    """过滤器数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(FILTERS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID索引
            self.collection.create_index("user_id")
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def create_filter(self, filter_obj: Filter) -> Dict:
        """创建过滤器"""
        filter_dict = filter_obj.to_dict()
        self.collection.insert_one(filter_dict)
        # 移除 MongoDB 的 _id 字段
        filter_dict.pop('_id', None)
        return filter_dict
    
    def get_filter_by_id(self, filter_id: str, user_id: str) -> Optional[Dict]:
        """根据ID获取过滤器"""
        filter_data = self.collection.find_one({"id": filter_id, "user_id": user_id})
        if filter_data:
            filter_data.pop('_id', None)
        return filter_data
    
    def get_user_filters(self, user_id: str) -> List[Dict]:
        """获取用户所有过滤器"""
        filters = self.collection.find({"user_id": user_id}).sort("created_at", -1)
        
        # 移除所有过滤器的 _id 字段
        result = []
        for f in filters:
            f.pop('_id', None)
            result.append(f)
        return result
    
    def update_filter(self, filter_id: str, user_id: str, update_data: Dict) -> bool:
        """更新过滤器"""
        update_data['updated_at'] = datetime.now().isoformat()
        result = self.collection.update_one(
            {"id": filter_id, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def delete_filter(self, filter_id: str, user_id: str) -> bool:
        """删除过滤器"""
        result = self.collection.delete_one({"id": filter_id, "user_id": user_id})
        return result.deleted_count > 0
    
    def count_user_filters(self, user_id: str) -> int:
        """统计用户过滤器数量"""
        return self.collection.count_documents({"user_id": user_id})


# 全局实例
filter_dao = FilterDAO()
