# -*- coding: utf-8 -*-

from typing import Dict, Optional
from datetime import datetime, date
from sqlalchemy import func, desc
from database.connection import db_connection
from database.models import FocusSessionModel, TaskModel
from utils.logger import logger
import uuid


class FocusSessionDAO:
    """专注记录数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: FocusSessionModel) -> Optional[Dict]:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        return {
            'id': model.id,
            'user_id': model.user_id,
            'task_id': model.task_id,
            'type': model.type,
            'duration': model.duration,
            'started_at': model.started_at,
            'ended_at': model.ended_at,
            'created_at': model.created_at
        }
    
    def create_session(self, user_id: str, session_data: dict) -> dict:
        """
        创建专注记录，同时更新关联任务的 pomodoro_count/focus_duration
        """
        session = self._get_session()
        try:
            session_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            focus_session = FocusSessionModel(
                id=session_id,
                user_id=user_id,
                task_id=session_data.get('task_id'),
                type=session_data.get('type', 'pomodoro'),
                duration=session_data.get('duration', 0),
                started_at=session_data.get('started_at', ''),
                ended_at=session_data.get('ended_at', ''),
                created_at=now
            )
            session.add(focus_session)
            
            # 如果有关联任务，更新任务的专注统计
            task_id = session_data.get('task_id')
            duration = session_data.get('duration', 0)
            session_type = session_data.get('type', 'pomodoro')
            
            if task_id:
                task = session.query(TaskModel).filter(
                    TaskModel.id == task_id,
                    TaskModel.user_id == user_id
                ).first()
                
                if task:
                    # 更新专注时长
                    task.focus_duration = (task.focus_duration or 0) + duration
                    
                    # 如果是番茄钟类型，增加番茄计数
                    if session_type == 'pomodoro':
                        task.pomodoro_count = (task.pomodoro_count or 0) + 1
                    
                    task.updated_at = now
            
            session.commit()
            return self._model_to_dict(focus_session)
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create focus session for user {user_id}: {e}")
            raise
        finally:
            session.close()
    
    def get_sessions(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 50,
        start_date: str = None,
        end_date: str = None
    ) -> dict:
        """
        获取用户专注记录列表，支持分页和日期范围
        """
        session = self._get_session()
        try:
            query = session.query(
                FocusSessionModel,
                TaskModel.title.label('task_title')
            ).outerjoin(
                TaskModel,
                FocusSessionModel.task_id == TaskModel.id
            ).filter(
                FocusSessionModel.user_id == user_id
            )
            
            # 日期范围过滤
            if start_date:
                query = query.filter(FocusSessionModel.started_at >= start_date)
            if end_date:
                # 结束日期加上时间部分以包含当天
                end_date_full = end_date + "T23:59:59" if 'T' not in end_date else end_date
                query = query.filter(FocusSessionModel.started_at <= end_date_full)
            
            # 获取总数
            total = query.count()
            
            # 按 started_at 倒序排列，分页
            offset = (page - 1) * page_size
            rows = query.order_by(desc(FocusSessionModel.started_at)).offset(offset).limit(page_size).all()
            
            sessions_list = []
            for focus_model, task_title in rows:
                d = self._model_to_dict(focus_model)
                d['task_title'] = task_title
                sessions_list.append(d)
            
            return {
                'sessions': sessions_list,
                'total': total,
                'page': page,
                'page_size': page_size
            }
            
        except Exception as e:
            logger.error(f"Failed to get focus sessions for user {user_id}: {e}")
            return {
                'sessions': [],
                'total': 0,
                'page': page,
                'page_size': page_size
            }
        finally:
            session.close()
    
    def get_overview(self, user_id: str) -> dict:
        """
        获取专注概览统计
        返回今日和总计的番茄数、专注时长
        """
        session = self._get_session()
        try:
            today_str = date.today().isoformat()
            
            # 今日统计 - 番茄数
            today_pomodoro_count = session.query(func.count(FocusSessionModel.id)).filter(
                FocusSessionModel.user_id == user_id,
                FocusSessionModel.type == 'pomodoro',
                FocusSessionModel.started_at >= today_str
            ).scalar() or 0
            
            # 今日统计 - 专注时长
            today_focus_duration = session.query(func.sum(FocusSessionModel.duration)).filter(
                FocusSessionModel.user_id == user_id,
                FocusSessionModel.started_at >= today_str
            ).scalar() or 0
            
            # 总计统计 - 番茄数
            total_pomodoro_count = session.query(func.count(FocusSessionModel.id)).filter(
                FocusSessionModel.user_id == user_id,
                FocusSessionModel.type == 'pomodoro'
            ).scalar() or 0
            
            # 总计统计 - 专注时长
            total_focus_duration = session.query(func.sum(FocusSessionModel.duration)).filter(
                FocusSessionModel.user_id == user_id
            ).scalar() or 0
            
            return {
                'today_pomodoro_count': today_pomodoro_count,
                'today_focus_duration': int(today_focus_duration or 0),
                'total_pomodoro_count': total_pomodoro_count,
                'total_focus_duration': int(total_focus_duration or 0)
            }
            
        except Exception as e:
            logger.error(f"Failed to get focus overview for user {user_id}: {e}")
            return {
                'today_pomodoro_count': 0,
                'today_focus_duration': 0,
                'total_pomodoro_count': 0,
                'total_focus_duration': 0
            }
        finally:
            session.close()
    
    def delete_session(self, user_id: str, session_id: str) -> bool:
        """
        删除专注记录，同时回滚关联任务的计数
        """
        session = self._get_session()
        try:
            focus_session = session.query(FocusSessionModel).filter(
                FocusSessionModel.id == session_id,
                FocusSessionModel.user_id == user_id
            ).first()
            
            if not focus_session:
                return False
            
            # 如果有关联任务，回滚任务的专注统计
            task_id = focus_session.task_id
            duration = focus_session.duration or 0
            session_type = focus_session.type
            
            if task_id:
                task = session.query(TaskModel).filter(
                    TaskModel.id == task_id,
                    TaskModel.user_id == user_id
                ).first()
                
                if task:
                    # 回滚专注时长
                    task.focus_duration = max(0, (task.focus_duration or 0) - duration)
                    
                    # 如果是番茄钟类型，减少番茄计数
                    if session_type == 'pomodoro':
                        task.pomodoro_count = max(0, (task.pomodoro_count or 0) - 1)
                    
                    task.updated_at = datetime.now().isoformat()
            
            session.delete(focus_session)
            session.commit()
            return True
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to delete focus session {session_id} for user {user_id}: {e}")
            return False
        finally:
            session.close()


# 全局实例
focus_dao = FocusSessionDAO()
