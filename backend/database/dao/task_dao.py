# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import TASKS
from models import Task
import uuid

class TaskDAO:
    """任务数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(TASKS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID索引
            self.collection.create_index("user_id")
            # 子任务ID索引
            self.collection.create_index("child_ids")
            # 状态索引
            self.collection.create_index("status")
            # 截止日期索引
            self.collection.create_index("due_date")
            # 开始时间索引
            self.collection.create_index("start_time")
            # 排序索引
            self.collection.create_index([("user_id", 1), ("order", 1)])
            # 标签索引
            self.collection.create_index("tags")
            # 置顶索引
            self.collection.create_index([("user_id", 1), ("is_pinned", -1)])
            # 清单ID索引
            self.collection.create_index([("user_id", 1), ("list_id", 1)])
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def create_task(self, task: Task) -> Dict:
        """创建任务"""
        task_dict = task.to_dict()
        self.collection.insert_one(task_dict)
        # 移除 MongoDB 的 _id 字段
        task_dict.pop('_id', None)
        return task_dict
    
    def get_task_by_id(self, task_id: str, user_id: str) -> Optional[Dict]:
        """根据ID获取任务"""
        task = self.collection.find_one({"id": task_id, "user_id": user_id})
        if task:
            task.pop('_id', None)
        return task
    
    def update_task(self, task_id: str, user_id: str, update_data: Dict) -> bool:
        """更新任务"""
        update_data['updated_at'] = datetime.now().isoformat()
        result = self.collection.update_one(
            {"id": task_id, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count > 0
    
    def add_child_to_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """向父任务的 child_ids 添加子任务 ID"""
        result = self.collection.update_one(
            {"id": parent_id, "user_id": user_id},
            {"$push": {"child_ids": child_id}, "$set": {"updated_at": datetime.now().isoformat()}}
        )
        return result.modified_count > 0
    
    def remove_child_from_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """从父任务的 child_ids 移除子任务 ID"""
        result = self.collection.update_one(
            {"id": parent_id, "user_id": user_id},
            {"$pull": {"child_ids": child_id}, "$set": {"updated_at": datetime.now().isoformat()}}
        )
        return result.modified_count > 0
    
    def find_parent_task(self, child_id: str, user_id: str) -> Optional[Dict]:
        """查找包含指定子任务 ID 的父任务"""
        parent = self.collection.find_one({"child_ids": child_id, "user_id": user_id})
        if parent:
            parent.pop('_id', None)
        return parent
    
    def delete_task(self, task_id: str, user_id: str) -> bool:
        """删除任务（级联删除子任务）"""
        task = self.get_task_by_id(task_id, user_id)
        if not task:
            return False
        # 递归删除所有子任务（通过 child_ids）
        self._delete_children_by_child_ids(task, user_id)
        # 从父任务的 child_ids 中移除自己
        parent = self.find_parent_task(task_id, user_id)
        if parent:
            self.remove_child_from_task(parent['id'], task_id, user_id)
        # 删除任务本身
        result = self.collection.delete_one({"id": task_id, "user_id": user_id})
        return result.deleted_count > 0
    
    def _delete_children_by_child_ids(self, task: Dict, user_id: str):
        """递归删除 child_ids 中的所有子任务"""
        for child_id in task.get('child_ids', []):
            child = self.get_task_by_id(child_id, user_id)
            if child:
                self._delete_children_by_child_ids(child, user_id)
                self.collection.delete_one({"id": child_id, "user_id": user_id})
    
    def get_user_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        list_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_pinned: Optional[bool] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        no_start_time: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户任务列表（筛选匹配的任务，并自动展开子任务树）"""
        query = {"user_id": user_id}
        
        if status:
            query["status"] = status
        
        if list_id is not None:
            query["list_id"] = list_id
        
        if tags:
            query["tags"] = {"$in": tags}
        
        if is_pinned is not None:
            query["is_pinned"] = is_pinned
        
        if start_date and end_date:
            query["start_time"] = {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        elif no_start_time:
            query["$or"] = [
                {"start_time": None},
                {"start_time": {"$exists": False}}
            ]
        
        # 查询匹配的任务
        tasks = self.collection.find(query).sort([
            ("is_pinned", -1),
            ("order", 1),
            ("created_at", -1)
        ]).skip(skip).limit(limit)
        
        matched_tasks = []
        for task in tasks:
            task.pop('_id', None)
            matched_tasks.append(task)
        
        # 收集所有匹配任务的 ID
        matched_ids = set(t['id'] for t in matched_tasks)
        
        # 递归展开所有子任务
        all_tasks = list(matched_tasks)  # copy
        visited = set(matched_ids)
        
        for task in matched_tasks:
            children = self._expand_children(task.get('child_ids', []), user_id, visited)
            all_tasks.extend(children)
        
        return all_tasks
    
    def _expand_children(self, child_ids: List[str], user_id: str, visited: set) -> List[Dict]:
        """递归展开所有子任务"""
        result = []
        for child_id in child_ids:
            if child_id in visited:
                continue
            visited.add(child_id)
            task = self.get_task_by_id(child_id, user_id)
            if task:
                result.append(task)
                if task.get('child_ids'):
                    result.extend(self._expand_children(task['child_ids'], user_id, visited))
        return result
    
    def get_child_tasks(self, task_id: str, user_id: str) -> List[Dict]:
        """获取子任务列表（通过父任务的 child_ids）"""
        parent = self.get_task_by_id(task_id, user_id)
        if not parent or not parent.get('child_ids'):
            return []
        result = []
        for child_id in parent['child_ids']:
            child = self.get_task_by_id(child_id, user_id)
            if child:
                result.append(child)
        return result
    
    def move_task(self, task_id: str, user_id: str, new_parent_id: Optional[str]) -> bool:
        """移动任务到新的父任务下"""
        if new_parent_id and self._would_create_cycle(task_id, new_parent_id, user_id):
            return False
        
        # 从旧父任务的 child_ids 移除
        old_parent = self.find_parent_task(task_id, user_id)
        if old_parent:
            self.remove_child_from_task(old_parent['id'], task_id, user_id)
        
        # 添加到新父任务的 child_ids
        if new_parent_id:
            self.add_child_to_task(new_parent_id, task_id, user_id)
        
        return True
    
    def _would_create_cycle(self, task_id: str, new_parent_id: str, user_id: str) -> bool:
        """检查将 task_id 设为 new_parent_id 的子任务是否会形成循环"""
        # task_id 不能是 new_parent_id 本身
        if task_id == new_parent_id:
            return True
        # 检查 task_id 的子孙中是否包含 new_parent_id
        return self._is_descendant(task_id, new_parent_id, user_id, set())
    
    def _is_descendant(self, ancestor_id: str, target_id: str, user_id: str, visited: set) -> bool:
        """检查 target_id 是否是 ancestor_id 的后代"""
        if ancestor_id in visited:
            return False
        visited.add(ancestor_id)
        task = self.get_task_by_id(ancestor_id, user_id)
        if not task:
            return False
        for child_id in task.get('child_ids', []):
            if child_id == target_id:
                return True
            if self._is_descendant(child_id, target_id, user_id, visited):
                return True
        return False
    
    def update_task_order(self, task_id: str, user_id: str, new_order: int) -> bool:
        """更新任务排序"""
        return self.update_task(task_id, user_id, {"order": new_order})
    
    def get_tasks_by_status(self, user_id: str, status: str) -> List[Dict]:
        """按状态获取任务"""
        return self.get_user_tasks(user_id=user_id, status=status, limit=1000)
    
    def search_tasks(self, user_id: str, keyword: str) -> List[Dict]:
        """搜索任务"""
        query = {
            "user_id": user_id,
            "$or": [
                {"title": {"$regex": keyword, "$options": "i"}},
                {"description": {"$regex": keyword, "$options": "i"}}
            ]
        }
        tasks = list(self.collection.find(query).sort("created_at", -1).limit(100))
        # 移除所有任务的 _id 字段
        for task in tasks:
            task.pop('_id', None)
        return tasks
    
    def duplicate_task(self, task_id: str, user_id: str) -> Optional[Dict]:
        """复制任务"""
        original_task = self.get_task_by_id(task_id, user_id)
        if not original_task:
            return None
        
        # 创建新任务
        new_task_dict = original_task.copy()
        new_task_dict['id'] = str(uuid.uuid4())
        new_task_dict['title'] = f"{original_task['title']} (副本)"
        new_task_dict['created_at'] = datetime.now().isoformat()
        new_task_dict['updated_at'] = datetime.now().isoformat()
        new_task_dict['completed_at'] = None
        new_task_dict['status'] = 'pending'
        # 副本没有子任务
        new_task_dict['child_ids'] = []
        # 移除旧的 parent_id（如果残留）
        new_task_dict.pop('parent_id', None)
        
        self.collection.insert_one(new_task_dict)
        # 移除 MongoDB 的 _id 字段
        new_task_dict.pop('_id', None)
        return new_task_dict
    
    def batch_update_status(self, task_ids: List[str], user_id: str, status: str) -> int:
        """批量更新任务状态"""
        update_data = {
            "status": status,
            "updated_at": datetime.now().isoformat()
        }
        
        if status == 'completed':
            update_data['completed_at'] = datetime.now().isoformat()
        
        result = self.collection.update_many(
            {"id": {"$in": task_ids}, "user_id": user_id},
            {"$set": update_data}
        )
        return result.modified_count
    
    def get_tasks_by_due_date(self, user_id: str, start_date: datetime, end_date: datetime) -> List[Dict]:
        """获取指定日期范围内的任务"""
        query = {
            "user_id": user_id,
            "due_date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        tasks = list(self.collection.find(query).sort("due_date", 1))
        # 移除所有任务的 _id 字段
        for task in tasks:
            task.pop('_id', None)
        return tasks
    
    def get_tasks_with_reminders(self, user_id: str) -> List[Dict]:
        """获取有提醒的任务"""
        query = {
            "user_id": user_id,
            "reminder_time": {"$ne": None},
            "status": {"$ne": "completed"}
        }
        tasks = list(self.collection.find(query).sort("reminder_time", 1))
        # 移除所有任务的 _id 字段
        for task in tasks:
            task.pop('_id', None)
        return tasks
    
    def count_user_tasks(self, user_id: str, status: Optional[str] = None) -> int:
        """统计用户任务数量"""
        query = {"user_id": user_id}
        if status:
            query["status"] = status
        return self.collection.count_documents(query)

# 全局实例
task_dao = TaskDAO()
