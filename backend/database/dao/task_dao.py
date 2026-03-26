# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import or_, desc, asc
from sqlalchemy.orm import Session
from database.connection import db_connection
from database.models import TaskModel, TaskChildModel, TaskTagModel
from models import Task
import uuid


class TaskDAO:
    """任务数据访问对象 (SQLAlchemy 版本)"""
    
    def __init__(self):
        pass  # 不再需要 collection 初始化
    
    def _get_session(self) -> Session:
        """获取数据库会话"""
        return db_connection.get_session()
    
    def _task_to_dict(self, task_model: TaskModel, session: Session) -> Dict:
        """将 TaskModel + 关系数据组装为 Dict"""
        result = {
            'id': task_model.id,
            'title': task_model.title,
            'description': task_model.description,
            'status': task_model.status,
            'priority': task_model.priority,
            'user_id': task_model.user_id,
            'list_id': task_model.list_id,
            'start_time': task_model.start_time,
            'due_date': task_model.due_date,
            'reminder_time': task_model.reminder_time,
            'is_pinned': task_model.is_pinned,
            'order': task_model.order,
            'push_due_notify': task_model.push_due_notify,
            'push_notified_date': task_model.push_notified_date,
            'created_at': task_model.created_at,
            'updated_at': task_model.updated_at,
            'completed_at': task_model.completed_at,
        }
        # 从关系表查询 child_ids
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == task_model.id
        ).all()
        result['child_ids'] = [c[0] for c in children]
        # 从关系表查询 tags
        tags = session.query(TaskTagModel.tag_id).filter(
            TaskTagModel.task_id == task_model.id
        ).all()
        result['tags'] = [t[0] for t in tags]
        return result
    
    def create_task(self, task: Task) -> Dict:
        """创建任务"""
        session = self._get_session()
        try:
            task_dict = task.to_dict()
            
            # 提取 child_ids 和 tags（不存入 tasks 表）
            child_ids = task_dict.pop('child_ids', [])
            tags = task_dict.pop('tags', [])
            
            # 创建 TaskModel
            task_model = TaskModel(
                id=task_dict['id'],
                title=task_dict['title'],
                description=task_dict.get('description'),
                status=task_dict.get('status', 'pending'),
                priority=task_dict.get('priority', 0),
                user_id=task_dict['user_id'],
                list_id=task_dict.get('list_id'),
                start_time=task_dict.get('start_time'),
                due_date=task_dict.get('due_date'),
                reminder_time=task_dict.get('reminder_time'),
                is_pinned=task_dict.get('is_pinned', False),
                order=task_dict.get('order', 0),
                push_due_notify=task_dict.get('push_due_notify', False),
                created_at=task_dict.get('created_at'),
                updated_at=task_dict.get('updated_at'),
                completed_at=task_dict.get('completed_at'),
            )
            session.add(task_model)
            
            # 插入 child_ids 关系
            for child_id in child_ids:
                child_relation = TaskChildModel(
                    parent_id=task_dict['id'],
                    child_id=child_id,
                    user_id=task_dict['user_id']
                )
                session.add(child_relation)
            
            # 插入 tags 关系
            for tag_id in tags:
                tag_relation = TaskTagModel(
                    task_id=task_dict['id'],
                    tag_id=tag_id
                )
                session.add(tag_relation)
            
            session.commit()
            
            # 返回完整的 task dict（包含 child_ids 和 tags）
            return self._task_to_dict(task_model, session)
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_task_by_id(self, task_id: str, user_id: str) -> Optional[Dict]:
        """根据ID获取任务"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).first()
            if task:
                return self._task_to_dict(task, session)
            return None
        finally:
            session.close()
    
    def update_task(self, task_id: str, user_id: str, update_data: Dict) -> bool:
        """更新任务"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            
            # 如果 due_date 被修改，重置 push_notified_date
            if 'due_date' in update_data:
                update_data['push_notified_date'] = None
            
            # 提取 child_ids 和 tags（需要单独处理）
            child_ids = update_data.pop('child_ids', None)
            tags = update_data.pop('tags', None)
            
            # 更新 tasks 表
            result = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).update(update_data)
            
            # 如果包含 child_ids，先删除旧关系再插入新关系
            if child_ids is not None:
                session.query(TaskChildModel).filter(
                    TaskChildModel.parent_id == task_id
                ).delete()
                for child_id in child_ids:
                    child_relation = TaskChildModel(
                        parent_id=task_id,
                        child_id=child_id,
                        user_id=user_id
                    )
                    session.add(child_relation)
            
            # 如果包含 tags，先删除旧关系再插入新关系
            if tags is not None:
                session.query(TaskTagModel).filter(
                    TaskTagModel.task_id == task_id
                ).delete()
                for tag_id in tags:
                    tag_relation = TaskTagModel(
                        task_id=task_id,
                        tag_id=tag_id
                    )
                    session.add(tag_relation)
            
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def add_child_to_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """向父任务的 child_ids 添加子任务 ID"""
        session = self._get_session()
        try:
            # 检查父任务是否存在
            parent = session.query(TaskModel).filter(
                TaskModel.id == parent_id,
                TaskModel.user_id == user_id
            ).first()
            if not parent:
                return False
            
            # 检查关系是否已存在
            existing = session.query(TaskChildModel).filter(
                TaskChildModel.parent_id == parent_id,
                TaskChildModel.child_id == child_id
            ).first()
            if existing:
                return False
            
            # 添加关系
            child_relation = TaskChildModel(
                parent_id=parent_id,
                child_id=child_id,
                user_id=user_id
            )
            session.add(child_relation)
            
            # 更新父任务的 updated_at
            parent.updated_at = datetime.now().isoformat()
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def remove_child_from_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """从父任务的 child_ids 移除子任务 ID"""
        session = self._get_session()
        try:
            # 删除关系
            result = session.query(TaskChildModel).filter(
                TaskChildModel.parent_id == parent_id,
                TaskChildModel.child_id == child_id
            ).delete()
            
            if result > 0:
                # 更新父任务的 updated_at
                session.query(TaskModel).filter(
                    TaskModel.id == parent_id,
                    TaskModel.user_id == user_id
                ).update({'updated_at': datetime.now().isoformat()})
            
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def find_parent_task(self, child_id: str, user_id: str) -> Optional[Dict]:
        """查找包含指定子任务 ID 的父任务"""
        session = self._get_session()
        try:
            # 从 task_children 表查找父任务 ID
            child_relation = session.query(TaskChildModel).filter(
                TaskChildModel.child_id == child_id,
                TaskChildModel.user_id == user_id
            ).first()
            
            if not child_relation:
                return None
            
            # 获取父任务
            parent = session.query(TaskModel).filter(
                TaskModel.id == child_relation.parent_id,
                TaskModel.user_id == user_id
            ).first()
            
            if parent:
                return self._task_to_dict(parent, session)
            return None
        finally:
            session.close()
    
    def delete_task(self, task_id: str, user_id: str) -> bool:
        """删除任务（级联删除子任务）"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).first()
            if not task:
                return False
            
            # 递归删除所有子任务（通过 child_ids）
            self._delete_children_by_child_ids(task_id, user_id, session)
            
            # 从父任务的 child_ids 中移除自己
            session.query(TaskChildModel).filter(
                TaskChildModel.child_id == task_id
            ).delete()
            
            # 删除任务本身（CASCADE 会自动删除关联的 task_children 和 task_tags）
            session.delete(task)
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def _delete_children_by_child_ids(self, task_id: str, user_id: str, session: Session):
        """递归删除 child_ids 中的所有子任务"""
        # 获取所有子任务 ID
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == task_id
        ).all()
        
        for (child_id,) in children:
            # 递归删除子任务的子任务
            self._delete_children_by_child_ids(child_id, user_id, session)
            # 删除子任务
            child_task = session.query(TaskModel).filter(
                TaskModel.id == child_id,
                TaskModel.user_id == user_id
            ).first()
            if child_task:
                session.delete(child_task)
    
    def get_user_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        list_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_pinned: Optional[bool] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户任务列表（筛选匹配的任务，并自动展开子任务树）"""
        session = self._get_session()
        try:
            query = session.query(TaskModel).filter(TaskModel.user_id == user_id)
            
            if status:
                query = query.filter(TaskModel.status == status)
            
            if list_id is not None:
                query = query.filter(TaskModel.list_id == list_id)
            
            if tags:
                # 通过 JOIN task_tags 筛选包含指定标签的任务
                task_ids_with_tags = session.query(TaskTagModel.task_id).filter(
                    TaskTagModel.tag_id.in_(tags)
                ).distinct().subquery()
                query = query.filter(TaskModel.id.in_(task_ids_with_tags))
            
            if is_pinned is not None:
                query = query.filter(TaskModel.is_pinned == is_pinned)
            
            if start_date and end_date:
                query = query.filter(
                    TaskModel.start_time >= start_date.isoformat(),
                    TaskModel.start_time <= end_date.isoformat()
                )
            
            # 排序
            query = query.order_by(
                desc(TaskModel.is_pinned),
                asc(TaskModel.order),
                desc(TaskModel.created_at)
            )
            
            # 分页
            query = query.offset(skip).limit(limit)
            
            tasks = query.all()
            matched_tasks = [self._task_to_dict(t, session) for t in tasks]
            
            # 收集所有匹配任务的 ID
            matched_ids = set(t['id'] for t in matched_tasks)
            
            # 递归展开所有子任务
            all_tasks = list(matched_tasks)  # copy
            visited = set(matched_ids)
            
            for task in matched_tasks:
                children = self._expand_children(task.get('child_ids', []), user_id, visited, session)
                all_tasks.extend(children)
            
            return all_tasks
        finally:
            session.close()
    
    def _expand_children(self, child_ids: List[str], user_id: str, visited: set, session: Session) -> List[Dict]:
        """递归展开所有子任务"""
        result = []
        for child_id in child_ids:
            if child_id in visited:
                continue
            visited.add(child_id)
            task = session.query(TaskModel).filter(
                TaskModel.id == child_id,
                TaskModel.user_id == user_id
            ).first()
            if task:
                task_dict = self._task_to_dict(task, session)
                result.append(task_dict)
                if task_dict.get('child_ids'):
                    result.extend(self._expand_children(task_dict['child_ids'], user_id, visited, session))
        return result
    
    def get_child_tasks(self, task_id: str, user_id: str) -> List[Dict]:
        """获取子任务列表（通过父任务的 child_ids）"""
        session = self._get_session()
        try:
            # 获取父任务的 child_ids
            children = session.query(TaskChildModel.child_id).filter(
                TaskChildModel.parent_id == task_id
            ).all()
            
            if not children:
                return []
            
            child_ids = [c[0] for c in children]
            result = []
            for child_id in child_ids:
                child = session.query(TaskModel).filter(
                    TaskModel.id == child_id,
                    TaskModel.user_id == user_id
                ).first()
                if child:
                    result.append(self._task_to_dict(child, session))
            return result
        finally:
            session.close()
    
    def move_task(self, task_id: str, user_id: str, new_parent_id: Optional[str]) -> bool:
        """移动任务到新的父任务下"""
        session = self._get_session()
        try:
            if new_parent_id and self._would_create_cycle(task_id, new_parent_id, user_id, session):
                return False
            
            # 从旧父任务的 child_ids 移除
            session.query(TaskChildModel).filter(
                TaskChildModel.child_id == task_id
            ).delete()
            
            # 添加到新父任务的 child_ids
            if new_parent_id:
                child_relation = TaskChildModel(
                    parent_id=new_parent_id,
                    child_id=task_id,
                    user_id=user_id
                )
                session.add(child_relation)
                # 更新新父任务的 updated_at
                session.query(TaskModel).filter(
                    TaskModel.id == new_parent_id,
                    TaskModel.user_id == user_id
                ).update({'updated_at': datetime.now().isoformat()})
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def _would_create_cycle(self, task_id: str, new_parent_id: str, user_id: str, session: Session) -> bool:
        """检查将 task_id 设为 new_parent_id 的子任务是否会形成循环"""
        # task_id 不能是 new_parent_id 本身
        if task_id == new_parent_id:
            return True
        # 检查 task_id 的子孙中是否包含 new_parent_id
        return self._is_descendant(task_id, new_parent_id, user_id, set(), session)
    
    def _is_descendant(self, ancestor_id: str, target_id: str, user_id: str, visited: set, session: Session) -> bool:
        """检查 target_id 是否是 ancestor_id 的后代"""
        if ancestor_id in visited:
            return False
        visited.add(ancestor_id)
        
        # 获取 ancestor_id 的子任务 IDs
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == ancestor_id
        ).all()
        
        for (child_id,) in children:
            if child_id == target_id:
                return True
            if self._is_descendant(child_id, target_id, user_id, visited, session):
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
        session = self._get_session()
        try:
            # 使用 LIKE 进行模糊搜索（大小写不敏感需要数据库层面支持，SQLite 默认不敏感）
            search_pattern = f'%{keyword}%'
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                or_(
                    TaskModel.title.like(search_pattern),
                    TaskModel.description.like(search_pattern)
                )
            ).order_by(desc(TaskModel.created_at)).limit(100).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def duplicate_task(self, task_id: str, user_id: str) -> Optional[Dict]:
        """复制任务"""
        session = self._get_session()
        try:
            original_task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).first()
            if not original_task:
                return None
            
            # 获取原任务的 tags
            original_tags = session.query(TaskTagModel.tag_id).filter(
                TaskTagModel.task_id == task_id
            ).all()
            tag_ids = [t[0] for t in original_tags]
            
            # 创建新任务
            new_task_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            new_task = TaskModel(
                id=new_task_id,
                title=f"{original_task.title} (副本)",
                description=original_task.description,
                status='pending',
                priority=original_task.priority,
                user_id=original_task.user_id,
                list_id=original_task.list_id,
                start_time=original_task.start_time,
                due_date=original_task.due_date,
                reminder_time=original_task.reminder_time,
                is_pinned=original_task.is_pinned,
                order=original_task.order,
                push_due_notify=original_task.push_due_notify,
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            session.add(new_task)
            
            # 复制 tags 关系（副本没有子任务）
            for tag_id in tag_ids:
                tag_relation = TaskTagModel(
                    task_id=new_task_id,
                    tag_id=tag_id
                )
                session.add(tag_relation)
            
            session.commit()
            
            return self._task_to_dict(new_task, session)
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def batch_update_status(self, task_ids: List[str], user_id: str, status: str) -> int:
        """批量更新任务状态"""
        session = self._get_session()
        try:
            update_data = {
                'status': status,
                'updated_at': datetime.now().isoformat()
            }
            
            if status == 'completed':
                update_data['completed_at'] = datetime.now().isoformat()
            
            result = session.query(TaskModel).filter(
                TaskModel.id.in_(task_ids),
                TaskModel.user_id == user_id
            ).update(update_data, synchronize_session=False)
            
            session.commit()
            return result
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_tasks_by_due_date(self, user_id: str, start_date: datetime, end_date: datetime) -> List[Dict]:
        """获取指定日期范围内的任务"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.due_date >= start_date.isoformat(),
                TaskModel.due_date <= end_date.isoformat()
            ).order_by(asc(TaskModel.due_date)).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def get_tasks_with_reminders(self, user_id: str) -> List[Dict]:
        """获取有提醒的任务"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.reminder_time.isnot(None),
                TaskModel.status != 'completed'
            ).order_by(asc(TaskModel.reminder_time)).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def count_user_tasks(self, user_id: str, status: Optional[str] = None) -> int:
        """统计用户任务数量"""
        session = self._get_session()
        try:
            query = session.query(TaskModel).filter(TaskModel.user_id == user_id)
            if status:
                query = query.filter(TaskModel.status == status)
            return query.count()
        finally:
            session.close()


# 全局实例
task_dao = TaskDAO()
