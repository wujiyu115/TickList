# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import CounterModel, CounterHistoryModel

class CounterDAO:
    """计数器数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_counter(self, counter) -> Dict:
        """创建计数器"""
        session = self._get_session()
        try:
            counter_dict = counter.to_dict()
            db_model = CounterModel(**counter_dict)
            session.add(db_model)
            session.commit()
            return counter_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_counter_by_id(self, user_id: str, counter_id: str) -> Optional[Dict]:
        """根据ID获取计数器"""
        session = self._get_session()
        try:
            counter = session.query(CounterModel).filter(
                CounterModel.id == counter_id,
                CounterModel.user_id == user_id
            ).first()
            return self._model_to_dict(counter)
        finally:
            session.close()
    
    def update_counter(self, user_id: str, counter_id: str, update_data: Dict) -> bool:
        """更新计数器"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            result = session.query(CounterModel).filter(
                CounterModel.id == counter_id,
                CounterModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_counter(self, user_id: str, counter_id: str) -> bool:
        """删除计数器及其历史记录"""
        session = self._get_session()
        try:
            # 先删除关联的历史记录
            session.query(CounterHistoryModel).filter(
                CounterHistoryModel.counter_id == counter_id,
                CounterHistoryModel.user_id == user_id
            ).delete()
            # 再删除计数器
            result = session.query(CounterModel).filter(
                CounterModel.id == counter_id,
                CounterModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_user_counters(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict]:
        """获取用户计数器列表"""
        session = self._get_session()
        try:
            counters = session.query(CounterModel).filter(
                CounterModel.user_id == user_id
            ).order_by(
                desc(CounterModel.is_pinned),
                desc(CounterModel.created_at)
            ).offset(skip).limit(limit).all()
            return [self._model_to_dict(c) for c in counters]
        finally:
            session.close()
    
    def count_user_counters(self, user_id: str) -> int:
        """统计用户计数器数量"""
        session = self._get_session()
        try:
            return session.query(CounterModel).filter(
                CounterModel.user_id == user_id
            ).count()
        finally:
            session.close()
    
    def increment_counter(self, user_id: str, counter_id: str, step: int) -> Optional[Dict]:
        """增加计数器值，返回更新后的计数器"""
        session = self._get_session()
        try:
            counter = session.query(CounterModel).filter(
                CounterModel.id == counter_id,
                CounterModel.user_id == user_id
            ).first()
            if not counter:
                return None
            
            before_value = counter.current_value
            counter.current_value = before_value + step
            counter.updated_at = datetime.now().isoformat()
            
            # 创建历史记录
            import uuid
            history = CounterHistoryModel(
                id=str(uuid.uuid4()),
                counter_id=counter_id,
                user_id=user_id,
                action='increment',
                change_value=step,
                before_value=before_value,
                after_value=counter.current_value,
                created_at=datetime.now().isoformat()
            )
            session.add(history)
            session.commit()
            return self._model_to_dict(counter)
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def decrement_counter(self, user_id: str, counter_id: str, step: int) -> Optional[Dict]:
        """减少计数器值，返回更新后的计数器。最低为0"""
        session = self._get_session()
        try:
            counter = session.query(CounterModel).filter(
                CounterModel.id == counter_id,
                CounterModel.user_id == user_id
            ).first()
            if not counter:
                return None
            
            before_value = counter.current_value
            new_value = max(0, before_value - step)
            if new_value == before_value:
                return self._model_to_dict(counter)
            
            counter.current_value = new_value
            counter.updated_at = datetime.now().isoformat()
            
            # 创建历史记录
            import uuid
            history = CounterHistoryModel(
                id=str(uuid.uuid4()),
                counter_id=counter_id,
                user_id=user_id,
                action='decrement',
                change_value=before_value - new_value,
                before_value=before_value,
                after_value=new_value,
                created_at=datetime.now().isoformat()
            )
            session.add(history)
            session.commit()
            return self._model_to_dict(counter)
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_counter_histories(
        self,
        user_id: str,
        counter_id: str,
        skip: int = 0,
        limit: int = 20
    ) -> List[Dict]:
        """获取计数器操作历史"""
        session = self._get_session()
        try:
            histories = session.query(CounterHistoryModel).filter(
                CounterHistoryModel.counter_id == counter_id,
                CounterHistoryModel.user_id == user_id
            ).order_by(
                desc(CounterHistoryModel.created_at)
            ).offset(skip).limit(limit).all()
            return [self._model_to_dict(h) for h in histories]
        finally:
            session.close()
    
    def count_counter_histories(self, user_id: str, counter_id: str) -> int:
        """统计计数器操作历史数量"""
        session = self._get_session()
        try:
            return session.query(CounterHistoryModel).filter(
                CounterHistoryModel.counter_id == counter_id,
                CounterHistoryModel.user_id == user_id
            ).count()
        finally:
            session.close()

# 全局实例
counter_dao = CounterDAO()
