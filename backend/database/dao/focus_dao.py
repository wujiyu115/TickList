# -*- coding: utf-8 -*-

from typing import Dict, Optional
from datetime import datetime, date
from sqlalchemy import and_, case, func, desc
from sqlalchemy.exc import IntegrityError
from database.connection import db_connection
from database.models import FocusSessionModel, TaskModel
from utils.logger import logger
import uuid


class FocusSessionTaskNotFoundError(ValueError):
    """专注记录引用了不存在或不属于当前用户的任务。"""


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
            'created_at': model.created_at,
            'client_session_id': model.client_session_id,
        }
    
    def _resolve_task_id(self, session, user_id, task_id, client_session_id):
        if not task_id:
            return None
        # 一次按 ID 读取真实 owner，不能把“当前用户查不到”当成任务不存在。
        # 行锁持续到提交；SQLite 由下方条件 UPDATE 的写锁保护提交窗口。
        # 只取标量列，避免并发更新后 ORM identity map 返回旧 owner。
        owner = session.query(TaskModel.user_id).filter(
            TaskModel.id == task_id,
        ).with_for_update().first()
        if owner is not None:
            if owner[0] != user_id:
                raise FocusSessionTaskNotFoundError(task_id)
            return task_id
        if client_session_id is not None:
            raise FocusSessionTaskNotFoundError(task_id)
        # 旧客户端可能离线记录了已永久删除的任务，保留记录但清掉引用。
        return None

    def create_session(self, user_id: str, session_data: dict) -> dict:
        """
        创建专注记录，同时更新关联任务的 pomodoro_count/focus_duration
        """
        session = self._get_session()
        client_session_id = session_data.get('client_session_id') or None
        task_id = session_data.get('task_id') or None
        try:
            # 客户端重试时先按用户范围查找，避免重复增加任务统计。查询
            # 必须带 user_id，确保相同的客户端 ID 在不同账户之间隔离。
            if client_session_id is not None:
                existing_session = session.query(FocusSessionModel).filter(
                    FocusSessionModel.user_id == user_id,
                    FocusSessionModel.client_session_id == client_session_id,
                ).first()
                if existing_session:
                    return self._model_to_dict(existing_session)

            task_id = self._resolve_task_id(
                session, user_id, task_id, client_session_id
            )

            session_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            focus_session = FocusSessionModel(
                id=session_id,
                user_id=user_id,
                task_id=task_id,
                type=session_data.get('type', 'pomodoro'),
                duration=session_data.get('duration', 0),
                started_at=session_data.get('started_at', ''),
                ended_at=session_data.get('ended_at', ''),
                created_at=now,
                client_session_id=client_session_id,
            )
            session.add(focus_session)
            
            duration = session_data.get('duration', 0)
            session_type = session_data.get('type', 'pomodoro')

            if task_id:
                # 统计更新必须用 SQL 原子增量：两个不同幂等键的并发提交
                # 若各自读旧值再回写会丢失其中一次计数。update() 让
                # SQLite/MySQL 在行锁保护下完成加法。影响行数为 0 时
                # 重新区分永久删除与 owner 变化，旧请求仅在确实不存在时
                # 降级为独立专注。软删除仍沿用原有累计语义。
                update_values = {
                    TaskModel.focus_duration: func.coalesce(TaskModel.focus_duration, 0) + duration,
                    TaskModel.updated_at: now,
                }
                if session_type == 'pomodoro':
                    update_values[TaskModel.pomodoro_count] = (
                        func.coalesce(TaskModel.pomodoro_count, 0) + 1
                    )
                updated_rows = session.query(TaskModel).filter(
                    TaskModel.id == task_id,
                    TaskModel.user_id == user_id,
                ).update(update_values, synchronize_session=False)
                if updated_rows == 0:
                    remaining_task_id = self._resolve_task_id(
                        session, user_id, task_id, client_session_id
                    )
                    if remaining_task_id is not None:
                        raise FocusSessionTaskNotFoundError(task_id)
                    focus_session.task_id = None
            
            session.commit()
            return self._model_to_dict(focus_session)
            
        except FocusSessionTaskNotFoundError:
            session.rollback()
            raise
        except IntegrityError:
            # 唯一索引处理并发重试：若两个相同幂等键的请求同时到达，
            # 后提交者回滚后读取先提交的那条记录即可。其他完整性错误
            # 仍然向上抛出，避免掩盖真实问题。
            session.rollback()
            if client_session_id is not None:
                existing_session = session.query(FocusSessionModel).filter(
                    FocusSessionModel.user_id == user_id,
                    FocusSessionModel.client_session_id == client_session_id,
                ).first()
                if existing_session:
                    return self._model_to_dict(existing_session)
            logger.error(f"Failed to create focus session for user {user_id}: integrity error")
            raise
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
                and_(
                    FocusSessionModel.task_id == TaskModel.id,
                    FocusSessionModel.user_id == TaskModel.user_id,
                )
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
        删除专注记录，同时回滚关联任务的计数。

        同一记录的并发 DELETE 只有一个请求拥有删除权：条件 DELETE 的
        rowcount 为 1 的请求才扣减任务统计；rowcount 为 0 的请求已被
        其他并发删除抢先，不得改动任何计数，返回 False 由路由层转成
        404。旧实现先 query 预读、再原子减法回滚统计、最后 ORM
        delete()，而 delete() 不检查影响行数——两个都预读到记录的并发
        请求会各自扣一遍同一条记录的统计（后提交者的 DELETE 实际删 0
        行，却已经完成了减量）。
        """
        session = self._get_session()
        try:
            focus_session = session.query(FocusSessionModel).filter(
                FocusSessionModel.id == session_id,
                FocusSessionModel.user_id == user_id
            ).first()

            if not focus_session:
                return False

            # 预读只为取得该记录绑定的统计参数；这些字段创建后不再变
            # 化，因此只要下方条件 DELETE 真正删掉了这一行（rowcount
            # ==1），删掉的就是刚读到的这条记录，参数可信。
            task_id = focus_session.task_id
            duration = focus_session.duration or 0
            session_type = focus_session.type
            session.expunge(focus_session)

            deleted_rows = session.query(FocusSessionModel).filter(
                FocusSessionModel.id == session_id,
                FocusSessionModel.user_id == user_id
            ).delete(synchronize_session=False)
            if deleted_rows == 0:
                # 记录已被其他并发 DELETE 删除：不重复扣减统计。
                session.rollback()
                return False

            if task_id:
                # 与 create_session 相同：回滚统计使用 SQL 原子减法，
                # 保留原有"不为负"的钳制语义，但不再依赖读旧值再回写。
                focus_expr = func.coalesce(TaskModel.focus_duration, 0) - duration
                update_values = {
                    TaskModel.focus_duration: case((focus_expr < 0, 0), else_=focus_expr),
                    TaskModel.updated_at: datetime.now().isoformat(),
                }
                if session_type == 'pomodoro':
                    pomodoro_expr = func.coalesce(TaskModel.pomodoro_count, 0) - 1
                    update_values[TaskModel.pomodoro_count] = case(
                        (pomodoro_expr < 0, 0), else_=pomodoro_expr
                    )
                session.query(TaskModel).filter(
                    TaskModel.id == task_id,
                    TaskModel.user_id == user_id
                ).update(update_values, synchronize_session=False)

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
