# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from datetime import datetime, date, timedelta
from pymongo.collection import Collection
from database.connection import get_collection
from database.table_names import TASK_STATISTICS, TASKS
from models import TaskStatistics

class StatisticsDAO:
    """统计数据访问对象"""
    
    def __init__(self):
        self.statistics_collection: Collection = get_collection(TASK_STATISTICS)
        self.tasks_collection: Collection = get_collection(TASKS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 用户ID和日期组合索引
            self.statistics_collection.create_index([("user_id", 1), ("date", -1)])
        except Exception as e:
            print(f"创建索引失败: {e}")
    
    def update_daily_statistics(self, user_id: str, target_date: date) -> Dict:
        """更新每日统计"""
        # 统计当天的任务数据
        date_str = target_date.isoformat()
        
        # 获取所有任务
        all_tasks = list(self.tasks_collection.find({"user_id": user_id}))
        
        # 统计各状态任务数
        total_tasks = len(all_tasks)
        completed_tasks = len([t for t in all_tasks if t.get('status') == 'completed'])
        pending_tasks = len([t for t in all_tasks if t.get('status') == 'pending'])
        in_progress_tasks = len([t for t in all_tasks if t.get('status') == 'in_progress'])
        cancelled_tasks = len([t for t in all_tasks if t.get('status') == 'cancelled'])
        
        # 创建统计对象
        stats = TaskStatistics(
            user_id=user_id,
            date=target_date,
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            pending_tasks=pending_tasks,
            in_progress_tasks=in_progress_tasks,
            cancelled_tasks=cancelled_tasks
        )
        
        stats_dict = stats.to_dict()
        
        # 更新或插入统计数据
        self.statistics_collection.update_one(
            {"user_id": user_id, "date": date_str},
            {"$set": stats_dict},
            upsert=True
        )
        
        return stats_dict
    
    def get_statistics_by_date(self, user_id: str, target_date: date) -> Optional[Dict]:
        """获取指定日期的统计"""
        date_str = target_date.isoformat()
        return self.statistics_collection.find_one({"user_id": user_id, "date": date_str})
    
    def get_statistics_by_date_range(
        self,
        user_id: str,
        start_date: date,
        end_date: date
    ) -> List[Dict]:
        """获取时间范围内的统计"""
        query = {
            "user_id": user_id,
            "date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        return list(self.statistics_collection.find(query).sort("date", 1))
    
    def get_user_statistics(self, user_id: str) -> Dict:
        """获取用户统计概览"""
        # 获取实时统计
        all_tasks = list(self.tasks_collection.find({"user_id": user_id}))
        
        total_tasks = len(all_tasks)
        completed_tasks = len([t for t in all_tasks if t.get('status') == 'completed'])
        pending_tasks = len([t for t in all_tasks if t.get('status') == 'pending'])
        in_progress_tasks = len([t for t in all_tasks if t.get('status') == 'in_progress'])
        cancelled_tasks = len([t for t in all_tasks if t.get('status') == 'cancelled'])
        
        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0
        
        # 获取最近7天的统计
        end_date = date.today()
        start_date = end_date - timedelta(days=6)
        daily_stats = self.get_statistics_by_date_range(user_id, start_date, end_date)
        
        # 统计标签分布
        tag_distribution = {}
        for task in all_tasks:
            for tag in task.get('tags', []):
                tag_distribution[tag] = tag_distribution.get(tag, 0) + 1
        
        # 统计优先级分布
        priority_distribution = {0: 0, 1: 0, 2: 0, 3: 0, 4: 0}
        for task in all_tasks:
            priority = task.get('priority', 0)
            priority_distribution[priority] = priority_distribution.get(priority, 0) + 1
        
        return {
            'total_tasks': total_tasks,
            'completed_tasks': completed_tasks,
            'pending_tasks': pending_tasks,
            'in_progress_tasks': in_progress_tasks,
            'cancelled_tasks': cancelled_tasks,
            'completion_rate': round(completion_rate, 2),
            'daily_stats': daily_stats,
            'tag_distribution': tag_distribution,
            'priority_distribution': priority_distribution
        }
    
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
