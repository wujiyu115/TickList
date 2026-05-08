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

from utils.logger import logger

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
        """检查到期的任务和倒数日，合并发送推送

        消息项统一格式：(text, notified_marker)
          - 任务的 marker 为 due_date 的分钟级 ISO 串（YYYY-MM-DDTHH:MM）
          - 倒数日的 marker 为日期串（YYYY-MM-DD）
        """
        from database.connection import db_connection
        from services.push_service import push_service

        session = db_connection.get_session()
        try:
            # {user_id: [(text, marker)]}
            user_messages: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
            # [(record, marker)]
            tasks_to_mark: List[Tuple[Any, str]] = []
            countdowns_to_mark: List[Tuple[Any, str]] = []

            # 检查任务到期（精确到分钟）
            task_messages, task_records = self._collect_task_due(session)
            for user_id, items in task_messages.items():
                user_messages[user_id].extend(items)
            tasks_to_mark.extend(task_records)

            # 检查倒数日到期（按天）
            countdown_messages, countdown_records = self._collect_countdown_due(session)
            for user_id, items in countdown_messages.items():
                user_messages[user_id].extend(items)
            countdowns_to_mark.extend(countdown_records)

            # 合并发送推送（按 batch_size 分批）
            from database.dao.settings_dao import settings_dao

            for user_id, items in user_messages.items():
                if not items:
                    continue

                user_settings = settings_dao.get_settings(user_id)
                batch_size = max(1, user_settings.get('push_batch_size', 5))

                for i in range(0, len(items), batch_size):
                    batch = items[i:i + batch_size]
                    try:
                        title = "TickList 到期提醒"
                        if len(batch) == 1:
                            content = batch[0][0]
                        else:
                            content = "以下任务/倒数日已到期：\n" + "\n".join(f"- {text}" for text, _ in batch)

                        push_service.send(
                            user_id=user_id,
                            title=title,
                            content=content
                        )
                        logger.info(f"Push batch sent: {len(batch)} items to user {user_id}")
                    except Exception as e:
                        logger.error(f"Push batch failed for user {user_id}: {e}")

            # 标记已推送的任务（marker 为分钟级，避免同一时间点重复推送）
            for task, marker in tasks_to_mark:
                task.push_notified_date = marker

            # 标记已推送的倒数日（marker 为日期）
            for countdown, marker in countdowns_to_mark:
                countdown.push_notified_date = marker

            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Check due notifications error: {e}")
        finally:
            session.close()
    
    def _collect_task_due(self, session) -> Tuple[Dict[str, List[Tuple[str, str]]], List[Tuple[Any, str]]]:
        """
        收集任务 due_date 到期的消息（精度：分钟级）

        触发条件：
          - push_due_notify=True 且未删除、未完成
          - 解析后的到期时间 <= 当前时间
          - push_notified_date 与本次到期时间标记不同（避免重复推送，
            修改 due_date 后由 DAO 重置 push_notified_date 即可触发新一轮）

        返回:
          user_messages: {user_id: [(message, notified_marker)]}
          records_to_mark: [(task, notified_marker)]
        """
        from database.models import TaskModel

        now = datetime.now()
        today = now.date()
        user_messages: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        records_to_mark: List[Tuple[Any, str]] = []

        # 数据库层只做粗筛：开启了通知 / due_date 非空 / 未完成 / 未删除
        # 是否到点、是否已通知由 Python 层精细判断（精度到分钟）
        tasks = session.query(TaskModel).filter(
            and_(
                TaskModel.push_due_notify == True,
                TaskModel.due_date != None,
                TaskModel.status != 'completed',
                TaskModel.deleted_at == None
            )
        ).all()

        for task in tasks:
            task_due = task.due_date
            if not task_due:
                continue
            try:
                due_dt = self._parse_due_datetime(task_due)
                if due_dt is None:
                    continue

                # 仅推送"今天"到期且当前时间已到达 due 时间的任务
                # （避免历史未推送的过期任务无限堆积重复推送）
                if due_dt.date() != today:
                    continue
                if now < due_dt:
                    continue

                # 用到期时间的分钟级 ISO 串作为通知标记，避免同一时间点重复推送
                notified_marker = due_dt.strftime('%Y-%m-%dT%H:%M')
                if task.push_notified_date == notified_marker:
                    continue

                user_messages[task.user_id].append(
                    (f"任务「{task.title}」已到期", notified_marker)
                )
                records_to_mark.append((task, notified_marker))
            except Exception as e:
                logger.error(f"Parse due_date error for task {task.id}: {e}")

        return user_messages, records_to_mark

    @staticmethod
    def _parse_due_datetime(value):
        """将 due_date 解析为 datetime（naive，本地时区视角）

        - 字符串 ISO（带或不带时区、带 Z）均支持
        - 仅日期 'YYYY-MM-DD' 视为当天 00:00
        - 已是 datetime/date 对象的也兼容
        - 解析失败返回 None
        """
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None) if value.tzinfo else value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return None
            try:
                dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
            except ValueError:
                # 兜底：仅日期格式
                try:
                    return datetime.combine(date.fromisoformat(text[:10]), datetime.min.time())
                except Exception:
                    return None
            # 带时区 → 转成本地时间再去掉 tzinfo，方便与 datetime.now() 比较
            if dt.tzinfo is not None:
                dt = dt.astimezone().replace(tzinfo=None)
            return dt
        return None
    
    def _collect_countdown_due(self, session) -> Tuple[Dict[str, List[Tuple[str, str]]], List[Tuple[Any, str]]]:
        """
        收集倒数日 target_date 到期的消息（按天粒度）

        返回:
          user_messages: {user_id: [(message, notified_marker)]}
          records_to_mark: [(countdown, notified_marker)]
        """
        from database.models import CountdownModel

        today = date.today()
        today_str = today.isoformat()
        user_messages: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        records_to_mark: List[Tuple[Any, str]] = []

        # 查询: push_due_notify=True, push_notified_date 不等于今天, target_date 不为空
        countdowns = session.query(CountdownModel).filter(
            and_(
                CountdownModel.push_due_notify == True,
                or_(CountdownModel.push_notified_date == None, CountdownModel.push_notified_date != today_str),
                CountdownModel.target_date != None
            )
        ).all()

        for countdown in countdowns:
            target_date = countdown.target_date
            if not target_date:
                continue
            try:
                if isinstance(target_date, str):
                    countdown_date = datetime.fromisoformat(target_date.replace('Z', '+00:00')).date()
                else:
                    countdown_date = target_date.date() if hasattr(target_date, 'date') else target_date

                if countdown_date == today:
                    user_messages[countdown.user_id].append(
                        (f"倒数日「{countdown.title}」今天到期", today_str)
                    )
                    records_to_mark.append((countdown, today_str))
            except Exception as e:
                logger.error(f"Parse target_date error for countdown {countdown.id}: {e}")

        return user_messages, records_to_mark


# 全局实例
scheduler_service = SchedulerService()
