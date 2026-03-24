# -*- coding: utf-8 -*-

import json
from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc
from database.connection import db_connection
from database.models import FilterModel


class FilterDAO:
    """过滤器数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: FilterModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典（含 conditions JSON 反序列化）"""
        if model is None:
            return None
        result = {col.name: getattr(model, col.name) for col in model.__table__.columns}
        # conditions 从 JSON 字符串反序列化为 dict
        if result.get('conditions') and isinstance(result['conditions'], str):
            try:
                result['conditions'] = json.loads(result['conditions'])
            except json.JSONDecodeError:
                result['conditions'] = {}
        return result
    
    def create_filter(self, filter_obj) -> Dict:
        """创建过滤器"""
        session = self._get_session()
        try:
            filter_dict = filter_obj.to_dict()
            # conditions 序列化为 JSON 字符串
            if 'conditions' in filter_dict and isinstance(filter_dict['conditions'], dict):
                filter_dict['conditions'] = json.dumps(filter_dict['conditions'])
            
            db_model = FilterModel(**filter_dict)
            session.add(db_model)
            session.commit()
            
            # 返回原始 dict（conditions 为 dict 格式）
            result = filter_obj.to_dict()
            return result
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_filter_by_id(self, filter_id: str, user_id: str) -> Optional[Dict]:
        """根据ID获取过滤器"""
        session = self._get_session()
        try:
            filter_data = session.query(FilterModel).filter(
                FilterModel.id == filter_id,
                FilterModel.user_id == user_id
            ).first()
            return self._model_to_dict(filter_data)
        finally:
            session.close()
    
    def get_user_filters(self, user_id: str) -> List[Dict]:
        """获取用户所有过滤器"""
        session = self._get_session()
        try:
            filters = session.query(FilterModel).filter(
                FilterModel.user_id == user_id
            ).order_by(desc(FilterModel.created_at)).all()
            
            return [self._model_to_dict(f) for f in filters]
        finally:
            session.close()
    
    def update_filter(self, filter_id: str, user_id: str, update_data: Dict) -> bool:
        """更新过滤器"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            # conditions 序列化为 JSON 字符串
            if 'conditions' in update_data and isinstance(update_data['conditions'], dict):
                update_data['conditions'] = json.dumps(update_data['conditions'])
            
            result = session.query(FilterModel).filter(
                FilterModel.id == filter_id,
                FilterModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_filter(self, filter_id: str, user_id: str) -> bool:
        """删除过滤器"""
        session = self._get_session()
        try:
            result = session.query(FilterModel).filter(
                FilterModel.id == filter_id,
                FilterModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def count_user_filters(self, user_id: str) -> int:
        """统计用户过滤器数量"""
        session = self._get_session()
        try:
            return session.query(FilterModel).filter(
                FilterModel.user_id == user_id
            ).count()
        finally:
            session.close()


# 全局实例
filter_dao = FilterDAO()
