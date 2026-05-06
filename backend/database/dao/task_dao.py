# -*- coding: utf-8 -*-

import json
from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.orm import Session
from database.connection import db_connection
from database.models import TaskModel, TaskChildModel, TaskTagModel
from models import Task
from utils.logger import logger
import uuid


def _normalize_content_completed_at(content: Optional[str], now_iso: str,
                                    force_check_all: bool = False) -> Optional[str]:
    """归一化任务 content（检查事项 JSON）里子项的 completedAt。

    content schema：``[{text:str, checked:bool, completedAt?:str}]``。
    所有写入路径（REST/AI/导入）都不一定会显式补 completedAt——把这个不变量
    下沉到 DAO 层，保证「checked=true 必然有 completedAt」。

    Args:
        content: 原始 content 字符串。None / 空串 / 非 JSON 数组都原样返回，不做处理。
        now_iso: 兜底用的当前时间 ISO 串。
        force_check_all: True 表示「父任务被置为 completed，所有未勾选的子项也一并勾选」，
            用于级联完成场景；False 仅修复"已勾选但缺 completedAt"的子项。

    Returns:
        归一化后的 content 字符串；若没有任何变更则返回原值（避免无谓写入）。
    """
    if not content:
        return content
    try:
        items = json.loads(content)
    except (ValueError, TypeError):
        # 非 JSON（可能是普通文本备注），原样保留
        return content
    if not isinstance(items, list):
        return content

    changed = False
    for item in items:
        if not isinstance(item, dict):
            continue
        if force_check_all and not item.get('checked'):
            item['checked'] = True
            item['completedAt'] = now_iso
            changed = True
            continue
        if item.get('checked') and not item.get('completedAt'):
            item['completedAt'] = now_iso
            changed = True

    if not changed:
        return content
    return json.dumps(items, ensure_ascii=False)


class TaskDAO:
    """任务数据访问对象 (SQLAlchemy 版本)"""
    
    def __init__(self):
        pass  # 不再需要 collection 初始化
    
    def _get_session(self) -> Session:
        """获取数据库会话"""
        return db_connection.get_session()
    
    # 需要特殊处理默认值的字段（值为 None 时用默认值替代）
    _DEFAULT_VALUES = {
        'content': '',
        'pomodoro_count': 0,
        'focus_duration': 0,
    }

    def _task_to_dict(self, task_model: TaskModel, session: Session) -> Dict:
        """将 TaskModel + 关系数据组装为 Dict（通过反射自动导出所有列字段）"""
        result = {}
        for col in task_model.__table__.columns:
            value = getattr(task_model, col.name)
            # 对特定字段应用默认值
            if value is None and col.name in self._DEFAULT_VALUES:
                value = self._DEFAULT_VALUES[col.name]
            result[col.name] = value
        # 从关系表查询 child_ids
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == task_model.id
        ).all()
        result['child_ids'] = [c[0] for c in children]
        # 从关系表查询 tags
        tags = session.query(TaskTagModel.tag_id).filter(
            TaskTagModel.task_id == task_model.id
        ).all()
        result['tags'] = [t[0] for t in tags]
        return result
    
    def get_max_child_order(self, parent_id: str, user_id: str) -> int:
        """获取指定父任务下子任务的最大 order 值"""
        session = self._get_session()
        try:
            child_ids = session.query(TaskChildModel.child_id).filter(
                TaskChildModel.parent_id == parent_id
            ).all()
            if not child_ids:
                return 0
            max_order = session.query(func.max(TaskModel.order)).filter(
                TaskModel.id.in_([c[0] for c in child_ids]),
                TaskModel.user_id == user_id
            ).scalar()
            return max_order if max_order is not None else 0
        finally:
            session.close()

    def create_task(self, task: Task) -> Dict:
        """创建任务"""
        session = self._get_session()
        try:
            task_dict = task.to_dict()
            
            # 提取 child_ids 和 tags（不存入 tasks 表）
            child_ids = task_dict.pop('child_ids', [])
            tags = task_dict.pop('tags', [])
            
            # 创建 TaskModel
            task_model = TaskModel(
                id=task_dict['id'],
                title=task_dict['title'],
                description=task_dict.get('description'),
                content=task_dict.get('content', ''),
                status=task_dict.get('status', 'pending'),
                priority=task_dict.get('priority', 0),
                user_id=task_dict['user_id'],
                list_id=task_dict.get('list_id'),
                start_time=task_dict.get('start_time'),
                due_date=task_dict.get('due_date'),
                reminder_time=task_dict.get('reminder_time'),
                is_pinned=task_dict.get('is_pinned', False),
                order=task_dict.get('order', 0),
                push_due_notify=task_dict.get('push_due_notify', False),
                pomodoro_count=task_dict.get('pomodoro_count', 0),
                focus_duration=task_dict.get('focus_duration', 0),
                created_at=task_dict.get('created_at'),
                updated_at=task_dict.get('updated_at'),
                completed_at=task_dict.get('completed_at'),
            )
            session.add(task_model)
            
            # 插入 child_ids 关系
            for child_id in child_ids:
                child_relation = TaskChildModel(
                    parent_id=task_dict['id'],
                    child_id=child_id,
                    user_id=task_dict['user_id']
                )
                session.add(child_relation)
            
            # 插入 tags 关系
            for tag_id in tags:
                tag_relation = TaskTagModel(
                    task_id=task_dict['id'],
                    tag_id=tag_id
                )
                session.add(tag_relation)
            
            session.commit()
            
            # 返回完整的 task dict（包含 child_ids 和 tags）
            return self._task_to_dict(task_model, session)
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_task_by_id(self, task_id: str, user_id: str) -> Optional[Dict]:
        """根据ID获取任务"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            ).first()
            if task:
                return self._task_to_dict(task, session)
            return None
        finally:
            session.close()
    
    def update_task(self, task_id: str, user_id: str, update_data: Dict) -> bool:
        """更新任务

        说明：
        - 当 status 被更新为 'completed' 时，会级联将所有子孙任务一并标记为
          completed（仅更新当前未完成且未删除的子孙），并同步设置 completed_at /
          updated_at，整个过程在同一事务中完成。
        - completed_at 兜底（避免各调用方各自补充导致漏写）：
          * status='completed' 且 caller 未显式传 completed_at → 自动写入当前时间
          * status 显式置为非 'completed' 且 caller 未显式传 completed_at → 清空为 None
          * caller 显式传 completed_at（含 None）优先级最高，原样保留（用于数据导入等场景）
        """
        session = self._get_session()
        try:
            now_iso = datetime.now().isoformat()
            update_data['updated_at'] = now_iso

            # completed_at 兜底：仅当 caller 未显式传 completed_at 时才自动补充。
            # 注意用 `not in` 而不是 `not get(...)`，以保留 caller 显式传 None 的语义。
            is_completing = False
            if 'completed_at' not in update_data:
                new_status = update_data.get('status')
                if new_status == 'completed':
                    update_data['completed_at'] = now_iso
                    is_completing = True
                elif new_status is not None and new_status != 'completed':
                    update_data['completed_at'] = None
            else:
                is_completing = update_data.get('status') == 'completed'

            # content 兜底：caller 显式传了 content（可能是 LLM 重写），归一化所有
            # checked=true 的子项，缺 completedAt 的自动补 now，避免前端"已完成时间"为空。
            if 'content' in update_data and update_data['content'] is not None:
                update_data['content'] = _normalize_content_completed_at(
                    update_data['content'], now_iso, force_check_all=False,
                )
            # 父任务被置为 completed 且 caller 没有覆盖 content：也要把当前 content
            # 里所有未勾选的子项一并勾选并补 completedAt（语义对齐"父任务完成 → 检查事项也完成"）。
            elif is_completing:
                current = session.query(TaskModel.content).filter(
                    TaskModel.id == task_id,
                    TaskModel.user_id == user_id,
                ).first()
                if current and current[0]:
                    new_content = _normalize_content_completed_at(
                        current[0], now_iso, force_check_all=True,
                    )
                    if new_content != current[0]:
                        update_data['content'] = new_content

            # 如果 due_date 被修改，重置 push_notified_date
            if 'due_date' in update_data:
                update_data['push_notified_date'] = None
            
            # 提取 child_ids 和 tags（需要单独处理）
            child_ids = update_data.pop('child_ids', None)
            tags = update_data.pop('tags', None)
            
            # 更新 tasks 表
            result = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).update(update_data)
            
            # 级联完成：当本次更新把状态置为 completed 时，把所有子孙任务一起完成
            if update_data.get('status') == 'completed':
                descendant_ids = self._collect_descendant_ids(task_id, session)
                if descendant_ids:
                    cascade_completed_at = update_data.get('completed_at') or now_iso
                    # 子孙任务的 status/completed_at 走批量 update（同一 SQL 高效）；
                    # content 因为每条都不一样，需要逐条归一化后再批量回写——这里
                    # 先一次性查出所有需要回写 content 的子孙，再用 case-when 模式逐条 update。
                    self._cascade_complete_descendants_content(
                        descendant_ids, user_id, cascade_completed_at, session,
                    )
                    cascade_data = {
                        'status': 'completed',
                        'completed_at': cascade_completed_at,
                        'updated_at': update_data['updated_at'],
                    }
                    session.query(TaskModel).filter(
                        TaskModel.id.in_(descendant_ids),
                        TaskModel.user_id == user_id,
                        TaskModel.deleted_at == None,
                        TaskModel.status != 'completed',
                    ).update(cascade_data, synchronize_session=False)
            
            # 如果包含 child_ids，先删除旧关系再插入新关系
            if child_ids is not None:
                session.query(TaskChildModel).filter(
                    TaskChildModel.parent_id == task_id
                ).delete()
                for child_id in child_ids:
                    child_relation = TaskChildModel(
                        parent_id=task_id,
                        child_id=child_id,
                        user_id=user_id
                    )
                    session.add(child_relation)
            
            # 如果包含 tags，先删除旧关系再插入新关系
            if tags is not None:
                session.query(TaskTagModel).filter(
                    TaskTagModel.task_id == task_id
                ).delete()
                for tag_id in tags:
                    tag_relation = TaskTagModel(
                        task_id=task_id,
                        tag_id=tag_id
                    )
                    session.add(tag_relation)
            
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def _collect_descendant_ids(self, task_id: str, session: Session) -> List[str]:
        """递归收集任务的所有子孙任务 ID（BFS 遍历，自动去环）"""
        descendant_ids: List[str] = []
        visited = {task_id}
        frontier = [task_id]
        while frontier:
            rows = session.query(TaskChildModel.child_id).filter(
                TaskChildModel.parent_id.in_(frontier)
            ).all()
            next_frontier: List[str] = []
            for (child_id,) in rows:
                if child_id in visited:
                    continue
                visited.add(child_id)
                descendant_ids.append(child_id)
                next_frontier.append(child_id)
            frontier = next_frontier
        return descendant_ids

    def _cascade_complete_descendants_content(
        self, task_ids: List[str], user_id: str, completed_at_iso: str, session: Session,
    ) -> None:
        """级联完成场景下，对子孙任务的 content 逐条归一化（force_check_all=True）。

        因为每条 task 的 content 都不一样，无法用单条 SQL 批量改写——这里查出
        所有有 content 的子孙，逐条归一化后回写。仅修改有变更的，避免无谓写入。
        外层 session 已开启事务，本方法不 commit。
        """
        if not task_ids:
            return
        rows = session.query(TaskModel.id, TaskModel.content).filter(
            TaskModel.id.in_(task_ids),
            TaskModel.user_id == user_id,
            TaskModel.deleted_at == None,
            TaskModel.status != 'completed',
            TaskModel.content.isnot(None),
            TaskModel.content != '',
        ).all()
        for tid, raw_content in rows:
            new_content = _normalize_content_completed_at(
                raw_content, completed_at_iso, force_check_all=True,
            )
            if new_content != raw_content:
                session.query(TaskModel).filter(
                    TaskModel.id == tid,
                    TaskModel.user_id == user_id,
                ).update({'content': new_content}, synchronize_session=False)
    
    def add_child_to_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """向父任务的 child_ids 添加子任务 ID"""
        session = self._get_session()
        try:
            # 检查父任务是否存在
            parent = session.query(TaskModel).filter(
                TaskModel.id == parent_id,
                TaskModel.user_id == user_id
            ).first()
            if not parent:
                return False
            
            # 检查关系是否已存在
            existing = session.query(TaskChildModel).filter(
                TaskChildModel.parent_id == parent_id,
                TaskChildModel.child_id == child_id
            ).first()
            if existing:
                return False
            
            # 添加关系
            child_relation = TaskChildModel(
                parent_id=parent_id,
                child_id=child_id,
                user_id=user_id
            )
            session.add(child_relation)
            
            # 更新父任务的 updated_at
            parent.updated_at = datetime.now().isoformat()
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def remove_child_from_task(self, parent_id: str, child_id: str, user_id: str) -> bool:
        """从父任务的 child_ids 移除子任务 ID"""
        session = self._get_session()
        try:
            # 删除关系
            result = session.query(TaskChildModel).filter(
                TaskChildModel.parent_id == parent_id,
                TaskChildModel.child_id == child_id
            ).delete()
            
            if result > 0:
                # 更新父任务的 updated_at
                session.query(TaskModel).filter(
                    TaskModel.id == parent_id,
                    TaskModel.user_id == user_id
                ).update({'updated_at': datetime.now().isoformat()})
            
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def find_parent_task(self, child_id: str, user_id: str) -> Optional[Dict]:
        """查找包含指定子任务 ID 的父任务"""
        session = self._get_session()
        try:
            # 从 task_children 表查找父任务 ID
            child_relation = session.query(TaskChildModel).filter(
                TaskChildModel.child_id == child_id,
                TaskChildModel.user_id == user_id
            ).first()
            
            if not child_relation:
                return None
            
            # 获取父任务
            parent = session.query(TaskModel).filter(
                TaskModel.id == child_relation.parent_id,
                TaskModel.user_id == user_id
            ).first()
            
            if parent:
                return self._task_to_dict(parent, session)
            return None
        finally:
            session.close()
    
    def delete_task(self, task_id: str, user_id: str) -> bool:
        """删除任务（软删除：设置 deleted_at）"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            ).first()
            if not task:
                return False
            
            now = datetime.now().isoformat()
            
            # 递归软删除所有子任务
            self._soft_delete_children(task_id, user_id, now, session)
            
            # 从父任务的 child_ids 中移除自己
            session.query(TaskChildModel).filter(
                TaskChildModel.child_id == task_id
            ).delete()
            
            # 软删除任务本身
            task.deleted_at = now
            task.updated_at = now
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def _soft_delete_children(self, task_id: str, user_id: str, deleted_at: str, session: Session):
        """递归软删除 child_ids 中的所有子任务"""
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == task_id
        ).all()
        
        for (child_id,) in children:
            # 递归软删除子任务的子任务
            self._soft_delete_children(child_id, user_id, deleted_at, session)
            # 软删除子任务
            child_task = session.query(TaskModel).filter(
                TaskModel.id == child_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            ).first()
            if child_task:
                child_task.deleted_at = deleted_at
                child_task.updated_at = deleted_at
    
    def get_user_tasks(
        self,
        user_id: str,
        status: Optional[str] = None,
        exclude_status: Optional[str] = None,
        list_id: Optional[str] = None,
        tags: Optional[List[str]] = None,
        is_pinned: Optional[bool] = None,
        priority: Optional[List[int]] = None,
        keyword: Optional[str] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        skip: int = 0,
        limit: int = 100,
        include_deleted: bool = False
    ) -> List[Dict]:
        """获取用户任务列表（筛选匹配的任务，并自动展开子任务树）"""
        session = self._get_session()
        try:
            query = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
            )
            if not include_deleted:
                query = query.filter(TaskModel.deleted_at == None)
            
            if status:
                query = query.filter(TaskModel.status == status)
            elif exclude_status:
                query = query.filter(TaskModel.status != exclude_status)
            
            if list_id is not None:
                query = query.filter(TaskModel.list_id == list_id)
            
            if tags:
                # 通过 JOIN task_tags 筛选包含指定标签的任务
                task_ids_with_tags = session.query(TaskTagModel.task_id).filter(
                    TaskTagModel.tag_id.in_(tags)
                ).distinct().subquery()
                query = query.filter(TaskModel.id.in_(task_ids_with_tags))
            
            if is_pinned is not None:
                query = query.filter(TaskModel.is_pinned == is_pinned)
            
            if priority is not None and len(priority) > 0:
                query = query.filter(TaskModel.priority.in_(priority))
            
            if keyword:
                search_pattern = f'%{keyword}%'
                query = query.filter(
                    or_(
                        TaskModel.title.like(search_pattern),
                        TaskModel.description.like(search_pattern)
                    )
                )
            
            if start_date and end_date:
                start_date_iso = start_date.isoformat()
                end_date_iso = end_date.isoformat()
                query = query.filter(
                    or_(
                        and_(
                            TaskModel.due_date.isnot(None),
                            TaskModel.due_date >= start_date_iso,
                            TaskModel.due_date < end_date_iso,
                        ),
                        and_(
                            TaskModel.due_date.is_(None),
                            TaskModel.start_time.isnot(None),
                            TaskModel.start_time >= start_date_iso,
                            TaskModel.start_time < end_date_iso,
                        ),
                        and_(
                            TaskModel.completed_at.isnot(None),
                            TaskModel.completed_at >= start_date_iso,
                            TaskModel.completed_at < end_date_iso,
                        ),
                    )
                )

            # 排序：已完成任务按完成时间从新到旧，其他任务按置顶、排序、创建时间
            if status == 'completed':
                query = query.order_by(
                    desc(TaskModel.completed_at),
                    desc(TaskModel.created_at)
                )
            else:
                query = query.order_by(
                    desc(TaskModel.is_pinned),
                    asc(TaskModel.order),
                    desc(TaskModel.created_at)
                )
            
            # 分页
            query = query.offset(skip).limit(limit)
            
            tasks = query.all()
            matched_tasks = [self._task_to_dict(t, session) for t in tasks]
            
            # 收集所有匹配任务的 ID
            matched_ids = set(t['id'] for t in matched_tasks)
            
            # 递归展开所有子任务
            all_tasks = list(matched_tasks)  # copy
            visited = set(matched_ids)
            
            for task in matched_tasks:
                children = self._expand_children(task.get('child_ids', []), user_id, visited, session)
                all_tasks.extend(children)
            
            return all_tasks
        finally:
            session.close()
    
    def _expand_children(self, child_ids: List[str], user_id: str, visited: set, session: Session) -> List[Dict]:
        """递归展开所有子任务"""
        result = []
        for child_id in child_ids:
            if child_id in visited:
                continue
            visited.add(child_id)
            task = session.query(TaskModel).filter(
                TaskModel.id == child_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            ).first()
            if task:
                task_dict = self._task_to_dict(task, session)
                result.append(task_dict)
                if task_dict.get('child_ids'):
                    result.extend(self._expand_children(task_dict['child_ids'], user_id, visited, session))
        return result
    
    def get_child_tasks(self, task_id: str, user_id: str) -> List[Dict]:
        """获取子任务列表（通过父任务的 child_ids）"""
        session = self._get_session()
        try:
            # 获取父任务的 child_ids
            children = session.query(TaskChildModel.child_id).filter(
                TaskChildModel.parent_id == task_id
            ).all()
            
            if not children:
                return []
            
            child_ids = [c[0] for c in children]
            child_tasks = session.query(TaskModel).filter(
                TaskModel.id.in_(child_ids),
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            ).order_by(asc(TaskModel.order)).all()
            return [self._task_to_dict(t, session) for t in child_tasks]
        finally:
            session.close()
    
    def move_task(self, task_id: str, user_id: str, new_parent_id: Optional[str]) -> bool:
        """移动任务到新的父任务下"""
        session = self._get_session()
        try:
            if new_parent_id and self._would_create_cycle(task_id, new_parent_id, user_id, session):
                return False
            
            # 从旧父任务的 child_ids 移除
            session.query(TaskChildModel).filter(
                TaskChildModel.child_id == task_id
            ).delete()
            
            # 添加到新父任务的 child_ids
            if new_parent_id:
                child_relation = TaskChildModel(
                    parent_id=new_parent_id,
                    child_id=task_id,
                    user_id=user_id
                )
                session.add(child_relation)
                # 更新新父任务的 updated_at
                session.query(TaskModel).filter(
                    TaskModel.id == new_parent_id,
                    TaskModel.user_id == user_id
                ).update({'updated_at': datetime.now().isoformat()})
            
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def _would_create_cycle(self, task_id: str, new_parent_id: str, user_id: str, session: Session) -> bool:
        """检查将 task_id 设为 new_parent_id 的子任务是否会形成循环"""
        # task_id 不能是 new_parent_id 本身
        if task_id == new_parent_id:
            return True
        # 检查 task_id 的子孙中是否包含 new_parent_id
        return self._is_descendant(task_id, new_parent_id, user_id, set(), session)
    
    def _is_descendant(self, ancestor_id: str, target_id: str, user_id: str, visited: set, session: Session) -> bool:
        """检查 target_id 是否是 ancestor_id 的后代"""
        if ancestor_id in visited:
            return False
        visited.add(ancestor_id)
        
        # 获取 ancestor_id 的子任务 IDs
        children = session.query(TaskChildModel.child_id).filter(
            TaskChildModel.parent_id == ancestor_id
        ).all()
        
        for (child_id,) in children:
            if child_id == target_id:
                return True
            if self._is_descendant(child_id, target_id, user_id, visited, session):
                return True
        return False
    
    def update_task_order(self, task_id: str, user_id: str, new_order: int) -> bool:
        """更新任务排序"""
        return self.update_task(task_id, user_id, {"order": new_order})
    
    def get_tasks_by_status(self, user_id: str, status: str) -> List[Dict]:
        """按状态获取任务"""
        return self.get_user_tasks(user_id=user_id, status=status, limit=1000)
    
    def search_tasks(self, user_id: str, keyword: str) -> List[Dict]:
        """搜索任务"""
        session = self._get_session()
        try:
            # 使用 LIKE 进行模糊搜索（大小写不敏感需要数据库层面支持，SQLite 默认不敏感）
            search_pattern = f'%{keyword}%'
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None,
                or_(
                    TaskModel.title.like(search_pattern),
                    TaskModel.description.like(search_pattern)
                )
            ).order_by(desc(TaskModel.created_at)).limit(100).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def duplicate_task(self, task_id: str, user_id: str) -> Optional[Dict]:
        """复制任务"""
        session = self._get_session()
        try:
            original_task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id
            ).first()
            if not original_task:
                return None
            
            # 获取原任务的 tags
            original_tags = session.query(TaskTagModel.tag_id).filter(
                TaskTagModel.task_id == task_id
            ).all()
            tag_ids = [t[0] for t in original_tags]
            
            # 创建新任务
            new_task_id = str(uuid.uuid4())
            now = datetime.now().isoformat()
            
            new_task = TaskModel(
                id=new_task_id,
                title=f"{original_task.title} (副本)",
                description=original_task.description,
                content=original_task.content or '',
                status='pending',
                priority=original_task.priority,
                user_id=original_task.user_id,
                list_id=original_task.list_id,
                start_time=original_task.start_time,
                due_date=original_task.due_date,
                reminder_time=original_task.reminder_time,
                is_pinned=original_task.is_pinned,
                order=original_task.order,
                push_due_notify=original_task.push_due_notify,
                pomodoro_count=0,  # 复制时不复制专注数据
                focus_duration=0,  # 复制时不复制专注数据
                created_at=now,
                updated_at=now,
                completed_at=None,
            )
            session.add(new_task)
            
            # 复制 tags 关系（副本没有子任务）
            for tag_id in tag_ids:
                tag_relation = TaskTagModel(
                    task_id=new_task_id,
                    tag_id=tag_id
                )
                session.add(tag_relation)
            
            session.commit()
            
            return self._task_to_dict(new_task, session)
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def batch_update_status(self, task_ids: List[str], user_id: str, status: str) -> int:
        """批量更新任务状态

        说明：
        - 当 status == 'completed' 时，会级联将所有传入任务的子孙任务一并标记为
          completed（仅更新当前用户、未删除且未完成的子孙），整个过程在同一事务中完成。
        - completed_at 兜底：completed → 写入当前时间；非 completed → 清空为 None，
          与 update_task 的语义保持对称，避免"反完成"后还残留旧的 completed_at。
        返回值为本次实际被更新的任务总数（包含级联更新的子孙）。
        """
        session = self._get_session()
        try:
            now_iso = datetime.now().isoformat()
            update_data = {
                'status': status,
                'updated_at': now_iso
            }

            if status == 'completed':
                update_data['completed_at'] = now_iso
            else:
                # 反完成（如 completed → pending/in_progress）需清空 completed_at，
                # 否则任务列表里"已完成时间"还会显示历史值，统计也会错乱。
                update_data['completed_at'] = None
            
            # content 兜底：批量完成场景下，把所有传入任务的 content 子项也一并勾选
            # 并补 completedAt（与 update_task 单条完成的语义对齐）。仅在 completed 时处理。
            if status == 'completed':
                self._cascade_complete_descendants_content(
                    list(task_ids), user_id, now_iso, session,
                )

            result = session.query(TaskModel).filter(
                TaskModel.id.in_(task_ids),
                TaskModel.user_id == user_id
            ).update(update_data, synchronize_session=False)
            
            # 级联完成：把所有传入任务的子孙任务一起置为 completed
            if status == 'completed':
                all_descendants: set = set()
                for tid in task_ids:
                    for did in self._collect_descendant_ids(tid, session):
                        all_descendants.add(did)
                # 排除已经在 task_ids 中的，避免重复 update
                cascade_ids = list(all_descendants - set(task_ids))
                if cascade_ids:
                    # 先归一化子孙的 content（逐条处理，因为每条都不一样）
                    self._cascade_complete_descendants_content(
                        cascade_ids, user_id, now_iso, session,
                    )
                    cascade_result = session.query(TaskModel).filter(
                        TaskModel.id.in_(cascade_ids),
                        TaskModel.user_id == user_id,
                        TaskModel.deleted_at == None,
                        TaskModel.status != 'completed',
                    ).update({
                        'status': 'completed',
                        'completed_at': now_iso,
                        'updated_at': now_iso,
                    }, synchronize_session=False)
                    result += cascade_result
            
            session.commit()
            return result
        except Exception as e:
            session.rollback()
            raise
        finally:
            session.close()
    
    def get_tasks_by_due_date(self, user_id: str, start_date: datetime, end_date: datetime) -> List[Dict]:
        """获取指定日期范围内的任务"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None,
                TaskModel.due_date >= start_date.isoformat(),
                TaskModel.due_date <= end_date.isoformat()
            ).order_by(asc(TaskModel.due_date)).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def get_tasks_with_reminders(self, user_id: str) -> List[Dict]:
        """获取有提醒的任务"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None,
                TaskModel.reminder_time.isnot(None),
                TaskModel.status != 'completed'
            ).order_by(asc(TaskModel.reminder_time)).all()
            
            return [self._task_to_dict(t, session) for t in tasks]
        finally:
            session.close()
    
    def count_user_tasks(self, user_id: str, status: Optional[str] = None, exclude_status: Optional[str] = None,
                         list_id: Optional[str] = None, tags: Optional[List[str]] = None,
                         is_pinned: Optional[bool] = None, priority: Optional[List[int]] = None,
                         keyword: Optional[str] = None, start_date: Optional[datetime] = None,
                         end_date: Optional[datetime] = None) -> int:
        """统计用户任务数量（支持与 get_user_tasks 相同的过滤条件）"""
        session = self._get_session()
        try:
            query = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at == None
            )
            if status:
                query = query.filter(TaskModel.status == status)
            elif exclude_status:
                query = query.filter(TaskModel.status != exclude_status)

            if list_id is not None:
                query = query.filter(TaskModel.list_id == list_id)

            if tags:
                task_ids_with_tags = session.query(TaskTagModel.task_id).filter(
                    TaskTagModel.tag_id.in_(tags)
                ).distinct().subquery()
                query = query.filter(TaskModel.id.in_(task_ids_with_tags))

            if is_pinned is not None:
                query = query.filter(TaskModel.is_pinned == is_pinned)

            if priority is not None and len(priority) > 0:
                query = query.filter(TaskModel.priority.in_(priority))

            if keyword:
                search_pattern = f'%{keyword}%'
                query = query.filter(
                    or_(
                        TaskModel.title.like(search_pattern),
                        TaskModel.description.like(search_pattern)
                    )
                )

            if start_date and end_date:
                start_date_iso = start_date.isoformat()
                end_date_iso = end_date.isoformat()
                query = query.filter(
                    or_(
                        and_(
                            TaskModel.due_date.isnot(None),
                            TaskModel.due_date >= start_date_iso,
                            TaskModel.due_date < end_date_iso,
                        ),
                        and_(
                            TaskModel.due_date.is_(None),
                            TaskModel.start_time.isnot(None),
                            TaskModel.start_time >= start_date_iso,
                            TaskModel.start_time < end_date_iso,
                        ),
                        and_(
                            TaskModel.completed_at.isnot(None),
                            TaskModel.completed_at >= start_date_iso,
                            TaskModel.completed_at < end_date_iso,
                        ),
                    )
                )

            return query.count()
        finally:
            session.close()

    def get_deleted_tasks(self, user_id: str, page: int = 1, page_size: int = 50) -> dict:
        """分页获取垃圾箱任务"""
        session = self._get_session()
        try:
            query = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at != None
            )
            total = query.count()
            tasks = query.order_by(desc(TaskModel.deleted_at)).offset((page - 1) * page_size).limit(page_size).all()
            return {
                'tasks': [self._task_to_dict(t, session) for t in tasks],
                'total': total,
                'page': page,
                'page_size': page_size
            }
        except Exception as e:
            logger.error(f"Failed to get deleted tasks: {e}")
            return {'tasks': [], 'total': 0, 'page': page, 'page_size': page_size}
        finally:
            session.close()

    def restore_task(self, task_id: str, user_id: str) -> bool:
        """恢复已删除的任务"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at != None
            ).first()
            if not task:
                return False
            task.deleted_at = None
            task.updated_at = datetime.now().isoformat()
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to restore task: {e}")
            return False
        finally:
            session.close()

    def permanently_delete_task(self, task_id: str, user_id: str) -> bool:
        """永久删除任务（硬删除）"""
        session = self._get_session()
        try:
            task = session.query(TaskModel).filter(
                TaskModel.id == task_id,
                TaskModel.user_id == user_id,
                TaskModel.deleted_at != None  # 只能永久删除已在垃圾箱中的
            ).first()
            if not task:
                return False
            # 删除子任务关系
            session.query(TaskChildModel).filter(
                TaskChildModel.parent_id == task_id
            ).delete()
            session.query(TaskChildModel).filter(
                TaskChildModel.child_id == task_id
            ).delete()
            # 删除任务标签关系
            session.query(TaskTagModel).filter(
                TaskTagModel.task_id == task_id
            ).delete()
            # 删除任务本身
            session.delete(task)
            session.commit()
            return True
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to permanently delete task: {e}")
            return False
        finally:
            session.close()

    def empty_trash(self, user_id: str) -> int:
        """清空垃圾箱，返回删除数量"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.deleted_at != None
            ).all()
            count = len(tasks)
            for task in tasks:
                # 删除关联关系
                session.query(TaskChildModel).filter(
                    TaskChildModel.parent_id == task.id
                ).delete()
                session.query(TaskChildModel).filter(
                    TaskChildModel.child_id == task.id
                ).delete()
                session.query(TaskTagModel).filter(
                    TaskTagModel.task_id == task.id
                ).delete()
                session.delete(task)
            session.commit()
            return count
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to empty trash: {e}")
            return 0
        finally:
            session.close()


# 全局实例
task_dao = TaskDAO()
