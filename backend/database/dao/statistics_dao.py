# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from sqlalchemy import func
from database.connection import db_connection
from database.models import TaskStatisticsModel, TaskModel, TaskTagModel, TagModel
from utils.logger import logger


class StatisticsDAO:
    """统计数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: TaskStatisticsModel) -> Optional[Dict]:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        return {
            'id': model.id,
            'user_id': model.user_id,
            'date': model.date,
            'total_tasks': model.total_tasks,
            'completed_tasks': model.completed_tasks,
            'pending_tasks': model.pending_tasks,
            'in_progress_tasks': model.in_progress_tasks,
            'completion_rate': model.completion_rate,
            'created_at': model.created_at,
            'updated_at': model.updated_at
        }
    
    def update_daily_statistics(self, user_id: str, target_date: date) -> Dict:
        """更新每日统计"""
        session = self._get_session()
        try:
            date_str = target_date.isoformat()
            now = datetime.now().isoformat()
            
            # 统计各状态任务数
            total_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id
            ).scalar() or 0
            
            completed_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'completed'
            ).scalar() or 0
            
            pending_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'pending'
            ).scalar() or 0
            
            in_progress_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'in_progress'
            ).scalar() or 0
            
            completion_rate = int(completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            
            # 查找现有统计记录
            existing = session.query(TaskStatisticsModel).filter(
                TaskStatisticsModel.user_id == user_id,
                TaskStatisticsModel.date == date_str
            ).first()
            
            if existing:
                # 更新现有记录
                existing.total_tasks = total_tasks
                existing.completed_tasks = completed_tasks
                existing.pending_tasks = pending_tasks
                existing.in_progress_tasks = in_progress_tasks
                existing.completion_rate = completion_rate
                existing.updated_at = now
                session.commit()
                return self._model_to_dict(existing)
            else:
                # 创建新记录
                stats_model = TaskStatisticsModel(
                    user_id=user_id,
                    date=date_str,
                    total_tasks=total_tasks,
                    completed_tasks=completed_tasks,
                    pending_tasks=pending_tasks,
                    in_progress_tasks=in_progress_tasks,
                    completion_rate=completion_rate,
                    created_at=now,
                    updated_at=now
                )
                session.add(stats_model)
                session.commit()
                return self._model_to_dict(stats_model)
                
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to update daily statistics for user {user_id}: {e}")
            return {}
        finally:
            session.close()
    
    def get_all_statistics(self, user_id: str) -> List[Dict]:
        """获取用户所有每日统计记录（用于导出）"""
        session = self._get_session()
        try:
            stats = session.query(TaskStatisticsModel).filter(
                TaskStatisticsModel.user_id == user_id
            ).order_by(TaskStatisticsModel.date).all()
            return [self._model_to_dict(s) for s in stats]
        except Exception as e:
            logger.error(f"Failed to get all statistics for user {user_id}: {e}")
            return []
        finally:
            session.close()

    def get_statistics_by_date(self, user_id: str, target_date: date) -> Optional[Dict]:
        """获取指定日期的统计"""
        session = self._get_session()
        try:
            date_str = target_date.isoformat()
            stats = session.query(TaskStatisticsModel).filter(
                TaskStatisticsModel.user_id == user_id,
                TaskStatisticsModel.date == date_str
            ).first()
            return self._model_to_dict(stats)
        except Exception as e:
            logger.error(f"Failed to get statistics by date for user {user_id}: {e}")
            return None
        finally:
            session.close()
    
    def get_statistics_by_date_range(
        self,
        user_id: str,
        start_date: date,
        end_date: date
    ) -> List[Dict]:
        """获取时间范围内的统计"""
        session = self._get_session()
        try:
            stats = session.query(TaskStatisticsModel).filter(
                TaskStatisticsModel.user_id == user_id,
                TaskStatisticsModel.date >= start_date.isoformat(),
                TaskStatisticsModel.date <= end_date.isoformat()
            ).order_by(TaskStatisticsModel.date).all()
            return [self._model_to_dict(s) for s in stats]
        except Exception as e:
            logger.error(f"Failed to get statistics by date range for user {user_id}: {e}")
            return []
        finally:
            session.close()
    
    def get_user_statistics(self, user_id: str) -> Dict:
        """获取用户统计概览"""
        session = self._get_session()
        try:
            # 获取实时统计
            total_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id
            ).scalar() or 0
            
            completed_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'completed'
            ).scalar() or 0
            
            pending_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'pending'
            ).scalar() or 0
            
            in_progress_tasks = session.query(func.count(TaskModel.id)).filter(
                TaskModel.user_id == user_id,
                TaskModel.status == 'in_progress'
            ).scalar() or 0
            
            completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
            
            # 获取最近7天的统计
            end_date = date.today()
            start_date = end_date - timedelta(days=6)
            daily_stats = self.get_statistics_by_date_range(user_id, start_date, end_date)
            
            # 统计标签分布 - 通过关联表查询
            tag_distribution = {}
            tag_stats = session.query(
                TagModel.name,
                func.count(TaskTagModel.task_id)
            ).join(
                TaskTagModel, TagModel.id == TaskTagModel.tag_id
            ).join(
                TaskModel, TaskTagModel.task_id == TaskModel.id
            ).filter(
                TaskModel.user_id == user_id
            ).group_by(TagModel.name).all()
            
            for tag_name, count in tag_stats:
                tag_distribution[tag_name] = count
            
            # 统计优先级分布
            priority_distribution = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
            priority_stats = session.query(
                TaskModel.priority,
                func.count(TaskModel.id)
            ).filter(
                TaskModel.user_id == user_id
            ).group_by(TaskModel.priority).all()
            
            for priority, count in priority_stats:
                if priority in priority_distribution:
                    priority_distribution[priority] = count
            
            return {
                'total_tasks': total_tasks,
                'completed_tasks': completed_tasks,
                'pending_tasks': pending_tasks,
                'in_progress_tasks': in_progress_tasks,
                'completion_rate': round(completion_rate, 2),
                'daily_stats': daily_stats,
                'tag_distribution': tag_distribution,
                'priority_distribution': priority_distribution
            }
        except Exception as e:
            logger.error(f"Failed to get user statistics for user {user_id}: {e}")
            return {
                'total_tasks': 0,
                'completed_tasks': 0,
                'pending_tasks': 0,
                'in_progress_tasks': 0,
                'completion_rate': 0,
                'daily_stats': [],
                'tag_distribution': {},
                'priority_distribution': {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
            }
        finally:
            session.close()
    
    def get_completion_trend(self, user_id: str, days: int = 30) -> List[Dict]:
        """获取完成趋势"""
        end_date = date.today()
        start_date = end_date - timedelta(days=days-1)
        
        stats = self.get_statistics_by_date_range(user_id, start_date, end_date)
        
        # 填充缺失的日期
        date_map = {s['date']: s for s in stats}
        result = []
        
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.isoformat()
            if date_str in date_map:
                result.append(date_map[date_str])
            else:
                # 如果没有数据，创建空统计
                result.append({
                    'date': date_str,
                    'total_tasks': 0,
                    'completed_tasks': 0,
                    'completion_rate': 0
                })
            current_date += timedelta(days=1)
        
        return result


# 全局实例
statistics_dao = StatisticsDAO()
