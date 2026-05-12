# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import TaskListModel, TaskModel, TaskChildModel, TaskTagModel


class TaskListDAO:
    """清单数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: TaskListModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_list(self, task_list) -> Dict:
        """创建清单"""
        session = self._get_session()
        try:
            list_dict = task_list.to_dict()
            db_model = TaskListModel(**list_dict)
            session.add(db_model)
            session.commit()
            return list_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_list_by_id(self, user_id: str, list_id: str) -> Optional[Dict]:
        """根据ID获取清单"""
        session = self._get_session()
        try:
            task_list = session.query(TaskListModel).filter(
                TaskListModel.id == list_id,
                TaskListModel.user_id == user_id
            ).first()
            return self._model_to_dict(task_list)
        finally:
            session.close()
    
    def update_list(self, user_id: str, list_id: str, update_data: Dict) -> bool:
        """更新清单"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            result = session.query(TaskListModel).filter(
                TaskListModel.id == list_id,
                TaskListModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_list(self, user_id: str, list_id: str) -> bool:
        """删除清单"""
        session = self._get_session()
        try:
            result = session.query(TaskListModel).filter(
                TaskListModel.id == list_id,
                TaskListModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_user_lists(
        self,
        user_id: str,
        type: Optional[str] = None,
        is_archived: Optional[bool] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户清单列表"""
        session = self._get_session()
        try:
            query = session.query(TaskListModel).filter(
                TaskListModel.user_id == user_id
            )
            
            if is_archived is not None:
                query = query.filter(TaskListModel.is_archived == is_archived)
            
            if type:
                query = query.filter(TaskListModel.type == type)
            
            # 置顶清单优先，再按排序顺序、创建时间排序
            lists = query.order_by(
                desc(TaskListModel.is_pinned),
                asc(TaskListModel.order),
                desc(TaskListModel.created_at)
            ).offset(skip).limit(limit).all()
            
            return [self._model_to_dict(task_list) for task_list in lists]
        finally:
            session.close()
    
    def count_tasks_in_list(self, user_id: str, list_id: str) -> int:
        """统计清单中的任务数量（排除已软删除的任务）"""
        session = self._get_session()
        try:
            return session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id == list_id,
                TaskModel.deleted_at == None
            ).count()
        finally:
            session.close()
    
    def _hard_delete_task_tree(self, session, task_id: str):
        """递归硬删除任务及其所有子任务"""
        children = session.query(TaskChildModel).filter(
            TaskChildModel.parent_id == task_id
        ).all()
        for child_rel in children:
            self._hard_delete_task_tree(session, child_rel.child_id)
        session.query(TaskChildModel).filter(
            TaskChildModel.parent_id == task_id
        ).delete()
        session.query(TaskChildModel).filter(
            TaskChildModel.child_id == task_id
        ).delete()
        session.query(TaskTagModel).filter(
            TaskTagModel.task_id == task_id
        ).delete()
        task = session.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task:
            session.delete(task)

    def delete_list_with_handling(self, user_id: str, list_id: str, action: Optional[str] = None, target_list_id: Optional[str] = None) -> Dict:
        """删除清单，同时处理其中的任务和子清单

        action: None (无任务时), 'delete_tasks', 'move_tasks'
        target_list_id: 移动任务的目标清单ID，None=收集箱
        """
        session = self._get_session()
        try:
            task_list = session.query(TaskListModel).filter(
                TaskListModel.id == list_id,
                TaskListModel.user_id == user_id
            ).first()
            if not task_list:
                return {'success': False, 'error': '清单不存在'}

            affected_list_ids = [list_id]
            sublists = []
            if task_list.type == 'folder':
                sublists = session.query(TaskListModel).filter(
                    TaskListModel.parent_id == list_id,
                    TaskListModel.user_id == user_id
                ).all()
                affected_list_ids.extend([s.id for s in sublists])

            total_tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id.in_(affected_list_ids),
                TaskModel.deleted_at == None
            ).count()

            deleted_count = 0
            moved_count = 0
            if action == 'delete_tasks' and total_tasks > 0:
                tasks = session.query(TaskModel).filter(
                    TaskModel.user_id == user_id,
                    TaskModel.list_id.in_(affected_list_ids),
                    TaskModel.deleted_at == None
                ).all()
                for task in tasks:
                    self._hard_delete_task_tree(session, task.id)
                    deleted_count += 1
            elif action == 'move_tasks' and total_tasks > 0:
                if target_list_id is not None:
                    target = session.query(TaskListModel).filter(
                        TaskListModel.id == target_list_id,
                        TaskListModel.user_id == user_id
                    ).first()
                    if not target:
                        return {'success': False, 'error': '目标清单不存在'}
                    if target_list_id == list_id or target_list_id in affected_list_ids:
                        return {'success': False, 'error': '不能将任务移动到正在删除的清单'}

                tasks = session.query(TaskModel).filter(
                    TaskModel.user_id == user_id,
                    TaskModel.list_id.in_(affected_list_ids),
                    TaskModel.deleted_at == None
                ).all()
                for task in tasks:
                    task.list_id = target_list_id
                    task.updated_at = datetime.now().isoformat()
                    moved_count += 1

            if task_list.type == 'folder':
                for sublist in sublists:
                    session.delete(sublist)

            session.delete(task_list)
            session.commit()
            return {
                'success': True,
                'message': '清单已删除',
                'deleted_tasks': deleted_count,
                'moved_tasks': moved_count
            }
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def count_tasks_in_folder(self, user_id: str, folder_id: str) -> Dict:
        """统计文件夹下所有子清单的任务数量"""
        session = self._get_session()
        try:
            sublists = session.query(TaskListModel).filter(
                TaskListModel.parent_id == folder_id,
                TaskListModel.user_id == user_id
            ).all()
            sublist_ids = [s.id for s in sublists]
            if sublist_ids:
                total_tasks = session.query(TaskModel).filter(
                    TaskModel.user_id == user_id,
                    TaskModel.list_id.in_(sublist_ids),
                    TaskModel.deleted_at == None
                ).count()
            else:
                total_tasks = 0
            return {
                'sublist_count': len(sublists),
                'task_count': total_tasks
            }
        finally:
            session.close()

    def count_user_lists(self, user_id: str, type: Optional[str] = None, is_archived: Optional[bool] = None) -> int:
        """统计用户清单数量"""
        session = self._get_session()
        try:
            query = session.query(TaskListModel).filter(
                TaskListModel.user_id == user_id
            )
            if is_archived is not None:
                query = query.filter(TaskListModel.is_archived == is_archived)
            if type:
                query = query.filter(TaskListModel.type == type)
            return query.count()
        finally:
            session.close()


# 全局实例
list_dao = TaskListDAO()
