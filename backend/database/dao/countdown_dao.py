# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import CountdownModel


class CountdownDAO:
    """倒数日数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: CountdownModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_countdown(self, countdown) -> Dict:
        """创建倒数日"""
        session = self._get_session()
        try:
            countdown_dict = countdown.to_dict()
            db_model = CountdownModel(**countdown_dict)
            session.add(db_model)
            session.commit()
            return countdown_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_countdown_by_id(self, user_id: str, countdown_id: str) -> Optional[Dict]:
        """根据ID获取倒数日"""
        session = self._get_session()
        try:
            countdown = session.query(CountdownModel).filter(
                CountdownModel.id == countdown_id,
                CountdownModel.user_id == user_id
            ).first()
            return self._model_to_dict(countdown)
        finally:
            session.close()
    
    def update_countdown(self, user_id: str, countdown_id: str, update_data: Dict) -> bool:
        """更新倒数日"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            
            # 如果 target_date 被修改，重置 push_notified_date
            if 'target_date' in update_data:
                update_data['push_notified_date'] = None
            
            result = session.query(CountdownModel).filter(
                CountdownModel.id == countdown_id,
                CountdownModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_countdown(self, user_id: str, countdown_id: str) -> bool:
        """删除倒数日"""
        session = self._get_session()
        try:
            result = session.query(CountdownModel).filter(
                CountdownModel.id == countdown_id,
                CountdownModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_user_countdowns(
        self,
        user_id: str,
        category: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict]:
        """获取用户倒数日列表"""
        session = self._get_session()
        try:
            query = session.query(CountdownModel).filter(
                CountdownModel.user_id == user_id
            )
            
            if category:
                query = query.filter(CountdownModel.category == category)
            
            # 按置顶降序、目标日期升序排序
            countdowns = query.order_by(
                desc(CountdownModel.is_pinned),
                asc(CountdownModel.target_date)
            ).offset(skip).limit(limit).all()
            
            return [self._model_to_dict(countdown) for countdown in countdowns]
        finally:
            session.close()
    
    def count_user_countdowns(self, user_id: str, category: Optional[str] = None) -> int:
        """统计用户倒数日数量"""
        session = self._get_session()
        try:
            query = session.query(CountdownModel).filter(
                CountdownModel.user_id == user_id
            )
            if category:
                query = query.filter(CountdownModel.category == category)
            return query.count()
        finally:
            session.close()


# 全局实例
countdown_dao = CountdownDAO()
