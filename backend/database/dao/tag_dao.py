# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from sqlalchemy import desc
from database.connection import db_connection
from database.models import TagModel, TaskTagModel


class TagDAO:
    """标签数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: TagModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_tag(self, tag) -> Dict:
        """创建标签"""
        session = self._get_session()
        try:
            tag_dict = tag.to_dict()
            db_model = TagModel(**tag_dict)
            session.add(db_model)
            session.commit()
            return tag_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_tag_by_id(self, user_id: str, tag_id: str) -> Optional[Dict]:
        """根据ID获取标签"""
        session = self._get_session()
        try:
            tag = session.query(TagModel).filter(
                TagModel.id == tag_id,
                TagModel.user_id == user_id
            ).first()
            return self._model_to_dict(tag)
        finally:
            session.close()
    
    def update_tag(self, user_id: str, tag_id: str, update_data: Dict) -> bool:
        """更新标签"""
        session = self._get_session()
        try:
            result = session.query(TagModel).filter(
                TagModel.id == tag_id,
                TagModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_tag(self, user_id: str, tag_id: str) -> bool:
        """删除标签（同时清理 task_tags 关系表）"""
        session = self._get_session()
        try:
            # 先删除 task_tags 中引用该 tag 的记录
            session.query(TaskTagModel).filter(TaskTagModel.tag_id == tag_id).delete()
            
            # 再删除标签本身
            result = session.query(TagModel).filter(
                TagModel.id == tag_id,
                TagModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_user_tags(self, user_id: str) -> List[Dict]:
        """获取用户所有标签"""
        session = self._get_session()
        try:
            tags = session.query(TagModel).filter(
                TagModel.user_id == user_id
            ).order_by(desc(TagModel.created_at)).all()
            
            return [self._model_to_dict(tag) for tag in tags]
        finally:
            session.close()
    
    def get_tag_by_name(self, user_id: str, name: str) -> Optional[Dict]:
        """根据名称获取标签"""
        session = self._get_session()
        try:
            tag = session.query(TagModel).filter(
                TagModel.user_id == user_id,
                TagModel.name == name
            ).first()
            return self._model_to_dict(tag)
        finally:
            session.close()
    
    def count_user_tags(self, user_id: str) -> int:
        """统计用户标签数量"""
        session = self._get_session()
        try:
            return session.query(TagModel).filter(
                TagModel.user_id == user_id
            ).count()
        finally:
            session.close()


# 全局实例
tag_dao = TagDAO()
