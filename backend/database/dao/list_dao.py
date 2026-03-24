# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import TaskListModel, TaskModel


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
        is_archived: bool = False,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户清单列表"""
        session = self._get_session()
        try:
            query = session.query(TaskListModel).filter(
                TaskListModel.user_id == user_id,
                TaskListModel.is_archived == is_archived
            )
            
            if type:
                query = query.filter(TaskListModel.type == type)
            
            # 按排序顺序、创建时间排序
            lists = query.order_by(
                asc(TaskListModel.order),
                desc(TaskListModel.created_at)
            ).offset(skip).limit(limit).all()
            
            return [self._model_to_dict(task_list) for task_list in lists]
        finally:
            session.close()
    
    def count_tasks_in_list(self, user_id: str, list_id: str) -> int:
        """统计清单中的任务数量"""
        session = self._get_session()
        try:
            return session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id == list_id
            ).count()
        finally:
            session.close()
    
    def count_user_lists(self, user_id: str, type: Optional[str] = None, is_archived: bool = False) -> int:
        """统计用户清单数量"""
        session = self._get_session()
        try:
            query = session.query(TaskListModel).filter(
                TaskListModel.user_id == user_id,
                TaskListModel.is_archived == is_archived
            )
            if type:
                query = query.filter(TaskListModel.type == type)
            return query.count()
        finally:
            session.close()


# 全局实例
list_dao = TaskListDAO()
