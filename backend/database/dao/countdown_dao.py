# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import COUNTDOWNS
from models import Countdown


class CountdownDAO:
    """倒数日数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(COUNTDOWNS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID索引
            self.collection.create_index("user_id")
            # 目标日期索引
            self.collection.create_index("target_date")
            # 分类索引
            self.collection.create_index("category")
            # 复合索引：用户ID + 置顶
            self.collection.create_index([("user_id", 1), ("is_pinned", -1)])
            # 复合索引：用户ID + 目标日期
            self.collection.create_index([("user_id", 1), ("target_date", 1)])
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def create_countdown(self, countdown: Countdown) -> Dict:
        """创建倒数日"""
        countdown_dict = countdown.to_dict()
        self.collection.insert_one(countdown_dict)
        # 移除 MongoDB 的 _id 字段
        countdown_dict.pop('_id', None)
        return countdown_dict
    
    def get_countdown_by_id(self, user_id: str, countdown_id: str) -> Optional[Dict]:
        """根据ID获取倒数日"""
        countdown = self.collection.find_one({"id": countdown_id, "user_id": user_id})
        if countdown:
            countdown.pop('_id', None)
        return countdown
    
    def update_countdown(self, user_id: str, countdown_id: str, update_data: Dict) -> bool:
        """更新倒数日"""
        update_data['updated_at'] = datetime.now().isoformat()
        result = self.collection.update_one(
            {"id": countdown_id, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def delete_countdown(self, user_id: str, countdown_id: str) -> bool:
        """删除倒数日"""
        result = self.collection.delete_one({"id": countdown_id, "user_id": user_id})
        return result.deleted_count > 0
    
    def get_user_countdowns(
        self,
        user_id: str,
        category: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict]:
        """获取用户倒数日列表"""
        query = {"user_id": user_id}
        
        if category:
            query["category"] = category
        
        # 按置顶降序、目标日期升序排序
        countdowns = self.collection.find(query).sort([
            ("is_pinned", -1),
            ("target_date", 1)
        ]).skip(skip).limit(limit)
        
        # 移除所有倒数日的 _id 字段
        result = []
        for countdown in countdowns:
            countdown.pop('_id', None)
            result.append(countdown)
        return result
    
    def count_user_countdowns(self, user_id: str, category: Optional[str] = None) -> int:
        """统计用户倒数日数量"""
        query = {"user_id": user_id}
        if category:
            query["category"] = category
        return self.collection.count_documents(query)


# 全局实例
countdown_dao = CountdownDAO()
