# -*- coding: utf-8 -*-

"""
调度服务：后台定时检查到期任务和倒数日，自动发送推送通知
支持多条消息合并发送
"""

import logging
from datetime import date, datetime
from typing import Dict, List, Tuple, Any
from collections import defaultdict
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import and_, or_

logger = logging.getLogger(__name__)


class SchedulerService:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
    
    def start(self):
        """启动调度器，添加定时任务"""
        # 每分钟检查一次到期任务和倒数日
        self.scheduler.add_job(
            self.check_due_notifications,
            'interval',
            minutes=1,
            id='check_due_notifications',
            replace_existing=True
        )
        self.scheduler.start()
        logger.info("Scheduler service started")
    
    def shutdown(self):
        """关闭调度器"""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Scheduler service stopped")
    
    def check_due_notifications(self):
        """检查到期的任务和倒数日，合并发送推送"""
        from database.connection import db_connection
        from services.push_service import push_service
        
        session = db_connection.get_session()
        try:
            # 收集所有用户的到期消息
            user_messages: Dict[str, List[str]] = defaultdict(list)
            tasks_to_mark: List[Any] = []
            countdowns_to_mark: List[Any] = []
            
            # 检查任务到期
            task_messages, task_records = self._collect_task_due(session)
            for user_id, messages in task_messages.items():
                user_messages[user_id].extend(messages)
            tasks_to_mark.extend(task_records)
            
            # 检查倒数日到期
            countdown_messages, countdown_records = self._collect_countdown_due(session)
            for user_id, messages in countdown_messages.items():
                user_messages[user_id].extend(messages)
            countdowns_to_mark.extend(countdown_records)
            
            # 合并发送推送（按 batch_size 分批）
            from database.dao.settings_dao import settings_dao
            
            for user_id, messages in user_messages.items():
                if not messages:
                    continue
                
                # 获取用户的 push_batch_size 设置（只获取一次）
                user_settings = settings_dao.get_settings(user_id)
                batch_size = user_settings.get('push_batch_size', 5)
                # 确保 batch_size 最小为 1
                batch_size = max(1, batch_size)
                
                # 按 batch_size 分批发送
                for i in range(0, len(messages), batch_size):
                    batch = messages[i:i + batch_size]
                    try:
                        title = "TickList 到期提醒"
                        if len(batch) == 1:
                            content = batch[0]
                        else:
                            content = "以下任务/倒数日今天到期：\n" + "\n".join(f"- {msg}" for msg in batch)
                        
                        push_service.send(
                            user_id=user_id,
                            title=title,
                            content=content
                        )
                        logger.info(f"Push batch sent: {len(batch)} items to user {user_id}")
                    except Exception as e:
                        logger.error(f"Push batch failed for user {user_id}: {e}")
            
            # 标记已推送的任务
            today_str = date.today().isoformat()
            for task in tasks_to_mark:
                task.push_notified_date = today_str
            
            # 标记已推送的倒数日
            for countdown in countdowns_to_mark:
                countdown.push_notified_date = today_str
            
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Check due notifications error: {e}")
        finally:
            session.close()
    
    def _collect_task_due(self, session) -> Tuple[Dict[str, List[str]], List[Any]]:
        """
        收集任务 due_date 到期的消息
        返回: (user_messages, records_to_mark)
        """
        from database.models import TaskModel
        
        today = date.today()
        today_str = today.isoformat()
        user_messages: Dict[str, List[str]] = defaultdict(list)
        records_to_mark: List[Any] = []
        
        # 查询: push_due_notify=True, push_notified_date 为空或不等于今天, due_date不为空, status != 'completed'
        tasks = session.query(TaskModel).filter(
            and_(
                TaskModel.push_due_notify == True,
                or_(TaskModel.push_notified_date == None, TaskModel.push_notified_date != today_str),
                TaskModel.due_date != None,
                TaskModel.status != 'completed',
                TaskModel.deleted_at == None
            )
        ).all()
        
        for task in tasks:
            task_due = task.due_date
            if task_due:
                try:
                    if isinstance(task_due, str):
                        # 解析 ISO 格式字符串 (可能包含时间部分)
                        task_due_date = datetime.fromisoformat(task_due.replace('Z', '+00:00')).date()
                    else:
                        task_due_date = task_due.date() if hasattr(task_due, 'date') else task_due
                    
                    if task_due_date == today:
                        user_messages[task.user_id].append(f"任务「{task.title}」今天到期")
                        records_to_mark.append(task)
                except Exception as e:
                    logger.error(f"Parse due_date error for task {task.id}: {e}")
        
        return user_messages, records_to_mark
    
    def _collect_countdown_due(self, session) -> Tuple[Dict[str, List[str]], List[Any]]:
        """
        收集倒数日 target_date 到期的消息
        返回: (user_messages, records_to_mark)
        """
        from database.models import CountdownModel
        
        today = date.today()
        today_str = today.isoformat()
        user_messages: Dict[str, List[str]] = defaultdict(list)
        records_to_mark: List[Any] = []
        
        # 查询: push_due_notify=True, push_notified_date 为空或不等于今天, target_date不为空
        countdowns = session.query(CountdownModel).filter(
            and_(
                CountdownModel.push_due_notify == True,
                or_(CountdownModel.push_notified_date == None, CountdownModel.push_notified_date != today_str),
                CountdownModel.target_date != None
            )
        ).all()
        
        for countdown in countdowns:
            target_date = countdown.target_date
            if target_date:
                try:
                    if isinstance(target_date, str):
                        # 解析 ISO 格式字符串
                        countdown_date = datetime.fromisoformat(target_date.replace('Z', '+00:00')).date()
                    else:
                        countdown_date = target_date.date() if hasattr(target_date, 'date') else target_date
                    
                    if countdown_date == today:
                        user_messages[countdown.user_id].append(f"倒数日「{countdown.title}」今天到期")
                        records_to_mark.append(countdown)
                except Exception as e:
                    logger.error(f"Parse target_date error for countdown {countdown.id}: {e}")
        
        return user_messages, records_to_mark


# 全局实例
scheduler_service = SchedulerService()
