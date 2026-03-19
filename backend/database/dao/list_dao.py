# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import TASK_LISTS, TASKS
from models import TaskList


class TaskListDAO:
    """清单数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(TASK_LISTS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID索引
            self.collection.create_index("user_id")
            # 父ID索引
            self.collection.create_index("parent_id")
            # 复合索引：用户ID + 类型
            self.collection.create_index([("user_id", 1), ("type", 1)])
            # 复合索引：用户ID + 是否归档
            self.collection.create_index([("user_id", 1), ("is_archived", 1)])
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def create_list(self, task_list: TaskList) -> Dict:
        """创建清单"""
        list_dict = task_list.to_dict()
        self.collection.insert_one(list_dict)
        # 移除 MongoDB 的 _id 字段
        list_dict.pop('_id', None)
        return list_dict
    
    def get_list_by_id(self, user_id: str, list_id: str) -> Optional[Dict]:
        """根据ID获取清单"""
        task_list = self.collection.find_one({"id": list_id, "user_id": user_id})
        if task_list:
            task_list.pop('_id', None)
        return task_list
    
    def update_list(self, user_id: str, list_id: str, update_data: Dict) -> bool:
        """更新清单"""
        update_data['updated_at'] = datetime.now().isoformat()
        result = self.collection.update_one(
            {"id": list_id, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def delete_list(self, user_id: str, list_id: str) -> bool:
        """删除清单"""
        result = self.collection.delete_one({"id": list_id, "user_id": user_id})
        return result.deleted_count > 0
    
    def get_user_lists(
        self,
        user_id: str,
        type: Optional[str] = None,
        is_archived: bool = False,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户清单列表"""
        query = {"user_id": user_id, "is_archived": is_archived}
        
        if type:
            query["type"] = type
        
        # 按排序顺序、创建时间排序
        lists = self.collection.find(query).sort([
            ("order", 1),
            ("created_at", -1)
        ]).skip(skip).limit(limit)
        
        # 移除所有清单的 _id 字段
        result = []
        for task_list in lists:
            task_list.pop('_id', None)
            result.append(task_list)
        return result
    
    def count_tasks_in_list(self, user_id: str, list_id: str) -> int:
        """统计清单中的任务数量"""
        tasks_collection = get_collection(TASKS)
        return tasks_collection.count_documents({"user_id": user_id, "list_id": list_id})
    
    def count_user_lists(self, user_id: str, type: Optional[str] = None, is_archived: bool = False) -> int:
        """统计用户清单数量"""
        query = {"user_id": user_id, "is_archived": is_archived}
        if type:
            query["type"] = type
        return self.collection.count_documents(query)


# 全局实例
list_dao = TaskListDAO()
