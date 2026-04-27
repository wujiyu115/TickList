# Delete List with Task Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task handling options (hard delete or move to target list) when deleting a list or folder, with a confirmation dialog that adapts based on whether tasks exist.

**Architecture:** Single `DELETE /lists/{id}` endpoint with `action` and `target_list_id` query params. Backend handles all task/list operations in one transaction. Frontend shows a dynamic Modal with action selection when tasks exist, or a simple confirm when no tasks.

**Tech Stack:** Python/FastAPI (backend), React/Ant Design (frontend), SQLAlchemy (ORM)

---

### Task 1: Backend — Update DAO with hard-delete-tasks-by-list and move-tasks-by-list methods

**Files:**
- Modify: `backend/database/dao/list_dao.py:66-80` (delete_list method)
- Modify: `backend/database/dao/list_dao.py:113-122` (count_tasks_in_list method)
- Modify: `backend/database/dao/list_dao.py:7` (imports — add TaskChildModel, TaskTagModel)

- [ ] **Step 1: Add import for TaskChildModel and TaskTagModel**

In `backend/database/dao/list_dao.py`, line 7, change the import to also include `TaskChildModel` and `TaskTagModel`:

```python
from database.models import TaskListModel, TaskModel, TaskChildModel, TaskTagModel
```

- [ ] **Step 2: Fix count_tasks_in_list to exclude soft-deleted tasks**

In `backend/database/dao/list_dao.py`, replace lines 113-122 (`count_tasks_in_list` method) with:

```python
    def count_tasks_in_list(self, user_id: str, list_id: str) -> int:
        """统计清单中的任务数量（排除已软删除的任务）"""
        session = self._get_session()
        try:
            return session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id == list_id,
                TaskModel.deleted_at == None
            ).count()
        finally:
            session.close()
```

- [ ] **Step 3: Add hard_delete_tasks_in_list method**

Add a new method after `delete_list` (after line 80) in `backend/database/dao/list_dao.py`:

```python
    def hard_delete_tasks_in_list(self, user_id: str, list_id: str) -> int:
        """硬删除清单下所有任务（含子任务树），返回删除数量"""
        session = self._get_session()
        try:
            # 找出所有 list_id 指向该清单的任务（排除已软删除的，那些在垃圾箱中独立管理）
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id == list_id,
                TaskModel.deleted_at == None
            ).all()
            deleted_count = 0
            for task in tasks:
                # 递归硬删除所有子任务
                self._hard_delete_task_tree(session, task.id)
                deleted_count += 1
            session.commit()
            return deleted_count
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

    def _hard_delete_task_tree(self, session, task_id: str):
        """递归硬删除任务及其所有子任务"""
        # 找出所有子任务
        children = session.query(TaskChildModel).filter(
            TaskChildModel.parent_id == task_id
        ).all()
        for child_rel in children:
            self._hard_delete_task_tree(session, child_rel.child_id)
        # 删除该任务的 TaskChildModel 关系（parent 和 child 两边）
        session.query(TaskChildModel).filter(
            TaskChildModel.parent_id == task_id
        ).delete()
        session.query(TaskChildModel).filter(
            TaskChildModel.child_id == task_id
        ).delete()
        # 删除该任务的 TaskTagModel 关系
        session.query(TaskTagModel).filter(
            TaskTagModel.task_id == task_id
        ).delete()
        # 删除任务本身
        task = session.query(TaskModel).filter(TaskModel.id == task_id).first()
        if task:
            session.delete(task)
```

- [ ] **Step 4: Add move_tasks_to_list method**

Add a new method after `_hard_delete_task_tree` in `backend/database/dao/list_dao.py`:

```python
    def move_tasks_to_list(self, user_id: str, source_list_id: str, target_list_id: Optional[str]) -> int:
        """将清单下所有任务移动到目标清单（target_list_id=None 时移到收集箱）"""
        session = self._get_session()
        try:
            tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id == source_list_id,
                TaskModel.deleted_at == None
            ).all()
            count = 0
            for task in tasks:
                task.list_id = target_list_id
                task.updated_at = datetime.now().isoformat()
                count += 1
            session.commit()
            return count
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
```

Also add `Optional` to the imports at line 3:
```python
from typing import List, Optional, Dict
```

- [ ] **Step 5: Add delete_sublists_and_tasks method for folder deletion**

Add a new method after `move_tasks_to_list` in `backend/database/dao/list_dao.py`:

```python
    def delete_list_with_handling(self, user_id: str, list_id: str, action: Optional[str] = None, target_list_id: Optional[str] = None) -> Dict:
        """删除清单，同时处理其中的任务和子清单

        action: None (无任务时), 'delete_tasks', 'move_tasks'
        target_list_id: 移动任务的目标清单ID，None=收集箱
        """
        session = self._get_session()
        try:
            # 获取清单信息
            task_list = session.query(TaskListModel).filter(
                TaskListModel.id == list_id,
                TaskListModel.user_id == user_id
            ).first()
            if not task_list:
                return {'success': False, 'error': '清单不存在'}

            # 收集所有受影响的清单ID（文件夹包含子清单）
            affected_list_ids = [list_id]
            if task_list.type == 'folder':
                sublists = session.query(TaskListModel).filter(
                    TaskListModel.parent_id == list_id,
                    TaskListModel.user_id == user_id
                ).all()
                affected_list_ids.extend([s.id for s in sublists])

            # 统计受影响的任务总数
            total_tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id.in_(affected_list_ids),
                TaskModel.deleted_at == None
            ).count()

            # 处理任务
            deleted_count = 0
            moved_count = 0
            if action == 'delete_tasks' and total_tasks > 0:
                # 硬删除所有任务
                tasks = session.query(TaskModel).filter(
                    TaskModel.user_id == user_id,
                    TaskModel.list_id.in_(affected_list_ids),
                    TaskModel.deleted_at == None
                ).all()
                for task in tasks:
                    self._hard_delete_task_tree(session, task.id)
                    deleted_count += 1
            elif action == 'move_tasks' and total_tasks > 0:
                # 移动所有任务到目标清单
                # 验证目标清单（如果指定了非空的target_list_id）
                if target_list_id is not None:
                    target = session.query(TaskListModel).filter(
                        TaskListModel.id == target_list_id,
                        TaskListModel.user_id == user_id
                    ).first()
                    if not target:
                        return {'success': False, 'error': '目标清单不存在'}
                    if target_list_id == list_id or target_list_id in affected_list_ids:
                        return {'success': False, 'error': '不能将任务移动到正在删除的清单'}

                tasks = session.query(TaskModel).filter(
                    TaskModel.user_id == user_id,
                    TaskModel.list_id.in_(affected_list_ids),
                    TaskModel.deleted_at == None
                ).all()
                for task in tasks:
                    task.list_id = target_list_id
                    task.updated_at = datetime.now().isoformat()
                    moved_count += 1

            # 删除子清单（文件夹情况下）
            if task_list.type == 'folder':
                for sublist in sublists:
                    session.delete(sublist)

            # 删除清单本身
            session.delete(task_list)
            session.commit()
            return {
                'success': True,
                'message': '清单已删除',
                'deleted_tasks': deleted_count,
                'moved_tasks': moved_count
            }
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
```

- [ ] **Step 6: Commit**

```bash
git add backend/database/dao/list_dao.py
git commit -m "feat: add task handling methods to list DAO for delete/move"
```

---

### Task 2: Backend — Update DELETE route to accept action and target_list_id params

**Files:**
- Modify: `backend/routes/list.py:151-166` (delete_list route)

- [ ] **Step 1: Update delete_list route with action params**

Replace lines 151-166 in `backend/routes/list.py` with:

```python
@router.delete('/lists/{list_id}')
async def delete_list(
    list_id: str,
    action: Optional[str] = Query(None, description='处理任务方式: delete_tasks, move_tasks'),
    target_list_id: Optional[str] = Query(None, description='移动任务的目标清单ID，空值=收集箱'),
    current_user_id: str = Depends(get_current_user)
):
    """删除清单，可选择处理其中的任务"""
    try:
        result = list_dao.delete_list_with_handling(
            current_user_id, list_id, action, target_list_id
        )
        if not result.get('success'):
            detail = result.get('error', '清单不存在')
            raise HTTPException(status_code=400 if '目标' in detail or '不能' in detail else 404, detail=detail)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除清单失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除清单失败: {str(e)}')
```

Make sure `Optional` is already imported from `typing` on line 3 — it is.

- [ ] **Step 2: Commit**

```bash
git add backend/routes/list.py
git commit -m "feat: update delete list route to accept action and target_list_id params"
```

---

### Task 3: Backend — Update task-count endpoint to also support folder task counting

**Files:**
- Modify: `backend/routes/list.py:104-115` (get_list_task_count route)
- Modify: `backend/database/dao/list_dao.py` (add count_folder_tasks method)

- [ ] **Step 1: Add count_folder_tasks method to list_dao**

Add after `count_tasks_in_list` in `backend/database/dao/list_dao.py`:

```python
    def count_tasks_in_folder(self, user_id: str, folder_id: str) -> Dict:
        """统计文件夹下所有子清单的任务数量"""
        session = self._get_session()
        try:
            sublists = session.query(TaskListModel).filter(
                TaskListModel.parent_id == folder_id,
                TaskListModel.user_id == user_id
            ).all()
            sublist_ids = [s.id for s in sublists]
            total_tasks = session.query(TaskModel).filter(
                TaskModel.user_id == user_id,
                TaskModel.list_id.in_(sublist_ids),
                TaskModel.deleted_at == None
            ).count()
            return {
                'sublist_count': len(sublists),
                'task_count': total_tasks
            }
        finally:
            session.close()
```

- [ ] **Step 2: Update get_list_task_count route to handle folders**

Replace lines 104-115 in `backend/routes/list.py` with:

```python
@router.get('/lists/{list_id}/task-count')
async def get_list_task_count(
    list_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取清单中的任务数量"""
    task_list = list_dao.get_list_by_id(current_user_id, list_id)
    if not task_list:
        raise HTTPException(status_code=404, detail='清单不存在')

    if task_list['type'] == 'folder':
        result = list_dao.count_tasks_in_folder(current_user_id, list_id)
        return {'list_id': list_id, 'type': 'folder', 'sublist_count': result['sublist_count'], 'task_count': result['task_count']}
    else:
        count = list_dao.count_tasks_in_list(current_user_id, list_id)
        return {'list_id': list_id, 'type': 'list', 'task_count': count}
```

- [ ] **Step 3: Commit**

```bash
git add backend/database/dao/list_dao.py backend/routes/list.py
git commit -m "feat: add folder task counting support for delete dialogs"
```

---

### Task 4: Backend — Write tests for new delete-with-handling behavior

**Files:**
- Modify: `backend/tests/test_lists.py`

- [ ] **Step 1: Add test helper and tests for delete with task handling**

Append to `backend/tests/test_lists.py`:

```python
# -*- coding: utf-8 -*-
"""清单模块测试"""

import uuid


def _create_list(client, headers, **kwargs):
    payload = {"name": kwargs.get("name", "Test List")}
    payload.update(kwargs)
    resp = client.post("/api/lists", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_task(client, headers, **kwargs):
    payload = {"title": kwargs.get("title", "Test Task")}
    payload.update(kwargs)
    resp = client.post("/api/tasks", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_create_list(app_client, auth_headers):
    """创建清单"""
    data = _create_list(app_client, auth_headers, name="Work")
    assert data["name"] == "Work"


def test_get_lists(app_client, auth_headers):
    """获取清单列表"""
    _create_list(app_client, auth_headers, name="List A")
    _create_list(app_client, auth_headers, name="List B")
    resp = app_client.get("/api/lists", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2


def test_get_list_detail(app_client, auth_headers):
    """获取清单详情"""
    lst = _create_list(app_client, auth_headers, name="Detail List")
    resp = app_client.get(f"/api/lists/{lst['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Detail List"


def test_update_list(app_client, auth_headers):
    """更新清单"""
    lst = _create_list(app_client, auth_headers, name="Old Name")
    resp = app_client.put(
        f"/api/lists/{lst['id']}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_delete_list(app_client, auth_headers):
    """删除清单"""
    lst = _create_list(app_client, auth_headers, name="Delete Me")
    resp = app_client.delete(f"/api/lists/{lst['id']}", headers=auth_headers)
    assert resp.status_code == 200


def test_get_task_count(app_client, auth_headers):
    """获取清单中的任务数量"""
    lst = _create_list(app_client, auth_headers, name="Count List")
    resp = app_client.get(
        f"/api/lists/{lst['id']}/task-count", headers=auth_headers
    )
    assert resp.status_code == 200
    assert resp.json()["task_count"] == 0


def test_delete_list_with_delete_tasks(app_client, auth_headers):
    """删除清单并硬删除所有任务"""
    lst = _create_list(app_client, auth_headers, name="List With Tasks")
    _create_task(app_client, auth_headers, title="Task A", list_id=lst['id'])
    _create_task(app_client, auth_headers, title="Task B", list_id=lst['id'])

    resp = app_client.delete(
        f"/api/lists/{lst['id']}",
        params={"action": "delete_tasks"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result['deleted_tasks'] == 2

    # 验证清单已删除
    resp = app_client.get(f"/api/lists/{lst['id']}", headers=auth_headers)
    assert resp.status_code == 404


def test_delete_list_with_move_tasks(app_client, auth_headers):
    """删除清单并移动任务到收集箱"""
    lst = _create_list(app_client, auth_headers, name="List With Tasks")
    _create_task(app_client, auth_headers, title="Task A", list_id=lst['id'])

    resp = app_client.delete(
        f"/api/lists/{lst['id']}",
        params={"action": "move_tasks"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result['moved_tasks'] == 1

    # 验证清单已删除
    resp = app_client.get(f"/api/lists/{lst['id']}", headers=auth_headers)
    assert resp.status_code == 404

    # 验证任务已移到收集箱（list_id=None）
    resp = app_client.get("/api/tasks", headers=auth_headers)
    tasks = resp.json()['tasks']
    moved_task = [t for t in tasks if t['title'] == "Task A"]
    assert len(moved_task) == 1
    assert moved_task[0]['list_id'] is None


def test_delete_list_with_move_tasks_to_target(app_client, auth_headers):
    """删除清单并移动任务到指定目标清单"""
    source = _create_list(app_client, auth_headers, name="Source List")
    target = _create_list(app_client, auth_headers, name="Target List")
    _create_task(app_client, auth_headers, title="Task A", list_id=source['id'])

    resp = app_client.delete(
        f"/api/lists/{source['id']}",
        params={"action": "move_tasks", "target_list_id": target['id']},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result['moved_tasks'] == 1

    # 验证任务已移到目标清单
    resp = app_client.get("/api/tasks", params={"list_id": target['id']}, headers=auth_headers)
    tasks = resp.json()['tasks']
    assert any(t['title'] == "Task A" and t['list_id'] == target['id'] for t in tasks)


def test_delete_list_move_to_self_fails(app_client, auth_headers):
    """不能将任务移动到正在删除的清单"""
    lst = _create_list(app_client, auth_headers, name="Self List")
    _create_task(app_client, auth_headers, title="Task A", list_id=lst['id'])

    resp = app_client.delete(
        f"/api/lists/{lst['id']}",
        params={"action": "move_tasks", "target_list_id": lst['id']},
        headers=auth_headers,
    )
    assert resp.status_code == 400


def test_delete_folder_with_sublist_tasks(app_client, auth_headers):
    """删除文件夹并硬删除子清单中的所有任务"""
    folder = _create_list(app_client, auth_headers, name="Folder", type="folder")
    sublist = _create_list(app_client, auth_headers, name="Sublist", parent_id=folder['id'])
    _create_task(app_client, auth_headers, title="Sub Task", list_id=sublist['id'])

    resp = app_client.delete(
        f"/api/lists/{folder['id']}",
        params={"action": "delete_tasks"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    result = resp.json()
    assert result['deleted_tasks'] == 1

    # 验证文件夹和子清单都已删除
    resp = app_client.get(f"/api/lists/{folder['id']}", headers=auth_headers)
    assert resp.status_code == 404
    resp = app_client.get(f"/api/lists/{sublist['id']}", headers=auth_headers)
    assert resp.status_code == 404


def test_get_folder_task_count(app_client, auth_headers):
    """获取文件夹的任务统计"""
    folder = _create_list(app_client, auth_headers, name="Folder", type="folder")
    sublist = _create_list(app_client, auth_headers, name="Sublist", parent_id=folder['id'])
    _create_task(app_client, auth_headers, title="Sub Task", list_id=sublist['id'])

    resp = app_client.get(
        f"/api/lists/{folder['id']}/task-count", headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['type'] == 'folder'
    assert data['sublist_count'] == 1
    assert data['task_count'] == 1
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd /Users/yitouxiaomaolv/git/TickList/backend && python -m pytest tests/test_lists.py -v`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_lists.py
git commit -m "test: add tests for delete list with task handling"
```

---

### Task 5: Frontend — Update deleteList API to accept action and target_list_id

**Files:**
- Modify: `frontend/src/api/list.ts:20-22`

- [ ] **Step 1: Update deleteList function**

Replace lines 20-22 in `frontend/src/api/list.ts` with:

```typescript
// 删除清单（可选任务处理方式）
export const deleteList = async (
  listId: string,
  params?: { action?: string; target_list_id?: string }
): Promise<any> => {
  return api.delete(`/lists/${listId}`, { params });
};
```

- [ ] **Step 2: Add getListTaskCount function**

Add after `deleteList` in `frontend/src/api/list.ts`:

```typescript
// 获取清单任务数量（支持文件夹统计）
export const getListTaskCount = async (listId: string): Promise<{
  list_id: string;
  type: 'folder' | 'list';
  task_count: number;
  sublist_count?: number;
}> => {
  return api.get(`/lists/${listId}/task-count`);
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/list.ts
git commit -m "feat: update deleteList API to accept action and target_list_id params"
```

---

### Task 6: Frontend — Add DeleteListConfirmModal component

**Files:**
- Create: `frontend/src/components/DeleteListConfirmModal.tsx`

- [ ] **Step 1: Create DeleteListConfirmModal component**

Create `frontend/src/components/DeleteListConfirmModal.tsx`:

```tsx
import React, { useState, useEffect } from 'antd';
import { Modal, Radio, Select, Space, message } from 'antd';
import { TaskList } from '../types';
import { deleteList, getListTaskCount } from '../api/list';

interface DeleteListConfirmModalProps {
  visible: boolean;
  item: TaskList | null;
  lists: TaskList[];
  onCancel: () => void;
  onSuccess: () => void;
}

const DeleteListConfirmModal: React.FC<DeleteListConfirmModalProps> = ({
  visible,
  item,
  lists,
  onCancel,
  onSuccess,
}) => {
  const [action, setAction] = useState<'delete_tasks' | 'move_tasks'>('delete_tasks');
  const [targetListId, setTargetListId] = useState<string | undefined>(undefined);
  const [taskCount, setTaskCount] = useState<number>(0);
  const [sublistCount, setSublistCount] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const isFolder = item?.type === 'folder';

  // Load task count when modal opens
  useEffect(() => {
    if (visible && item) {
      getListTaskCount(item.id).then(data => {
        setTaskCount(data.task_count);
        if (data.type === 'folder') {
          setSublistCount(data.sublist_count || 0);
        }
      }).catch(() => {
        setTaskCount(0);
        setSublistCount(0);
      });
    }
    if (visible) {
      setAction('delete_tasks');
      setTargetListId(undefined);
    }
  }, [visible, item]);

  // Filter out the item being deleted and its sublists from target options
  const availableLists = lists.filter(l => {
    if (!item) return true;
    if (l.id === item.id) return false;
    if (isFolder && l.parent_id === item.id) return false;
    return l.type === 'list';
  });

  const handleOk = async () => {
    if (!item) return;
    setLoading(true);
    try {
      const params: { action?: string; target_list_id?: string } = {};
      if (taskCount > 0) {
        params.action = action;
        if (action === 'move_tasks' && targetListId) {
          params.target_list_id = targetListId;
        }
      }
      const result = await deleteList(item.id, params);
      if (taskCount > 0 && action === 'delete_tasks') {
        message.success(`已删除清单和 ${result.deleted_tasks} 个任务`);
      } else if (taskCount > 0 && action === 'move_tasks') {
        message.success(`已删除清单，${result.moved_tasks} 个任务已移动`);
      } else {
        message.success(isFolder ? '文件夹已删除' : '清单已删除');
      }
      onSuccess();
    } catch (e: any) {
      const detail = e.response?.data?.detail;
      if (detail) {
        message.error(detail);
      } else {
        message.error('删除失败');
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => isFolder ? `删除文件夹「${item?.name}」` : `删除清单「${item?.name}」`;

  // No tasks: simple confirm
  if (taskCount === 0) {
    return (
      <Modal
        title={getTitle()}
        open={visible}
        okText="删除"
        okType="danger"
        cancelText="取消"
        confirmLoading={loading}
        onOk={handleOk}
        onCancel={onCancel}
      >
        <p>确定删除{isFolder ? '文件夹' : '清单'}「{item?.name}」吗？</p>
      </Modal>
    );
  }

  // Has tasks: show action selection
  const getContentText = () => {
    if (isFolder && sublistCount > 0) {
      return `该文件夹下有 ${sublistCount} 个清单，共 ${taskCount} 个任务，请选择处理方式`;
    }
    return `该清单下有 ${taskCount} 个任务，请选择处理方式`;
  };

  return (
    <Modal
      title={getTitle()}
      open={visible}
      okText="确认"
      cancelText="取消"
      confirmLoading={loading}
      onOk={handleOk}
      onCancel={onCancel}
      width={460}
    >
      <p>{getContentText()}</p>
      <Radio.Group
        value={action}
        onChange={e => setAction(e.target.value)}
        style={{ marginTop: 16 }}
      >
        <Space direction="vertical">
          <Radio value="delete_tasks">清除所有任务</Radio>
          <Radio value="move_tasks">
            移动任务到其他清单
            {action === 'move_tasks' && (
              <Select
                value={targetListId}
                onChange={setTargetListId}
                style={{ width: 200, marginLeft: 8 }}
                placeholder="选择目标清单"
              >
                <Select.Option value={undefined}>收集箱</Select.Option>
                {availableLists.map(l => (
                  <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>
                ))}
              </Select>
            )}
          </Radio>
        </Space>
      </Radio.Group>
    </Modal>
  );
};

export default DeleteListConfirmModal;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DeleteListConfirmModal.tsx
git commit -m "feat: add DeleteListConfirmModal component"
```

---

### Task 7: Frontend — Update AppSider to use DeleteListConfirmModal

**Files:**
- Modify: `frontend/src/components/AppSider.tsx`

This is the most complex task. We need to:
1. Import DeleteListConfirmModal
2. Add state for the modal (visible, selectedItem)
3. Replace all 3 delete confirmation dialogs (folder lines 467-487, archived list lines 508-523, active list lines 541-557) with calls to open the new modal
4. Replace mobile delete dialog (lines 1052-1067) with calls to open the new modal

- [ ] **Step 1: Add import for DeleteListConfirmModal**

In `frontend/src/components/AppSider.tsx`, add to the component imports section:

```tsx
import DeleteListConfirmModal from './DeleteListConfirmModal';
```

- [ ] **Step 2: Add state for delete modal**

After the existing state declarations (around line 103), add:

```tsx
const [deleteModalVisible, setDeleteModalVisible] = useState(false);
const [deleteItem, setDeleteItem] = useState<TaskList | null>(null);
```

- [ ] **Step 3: Replace folder delete confirmation (lines 467-487)**

Replace the `onClick` handler in the folder delete menu item (lines 467-487) with:

```tsx
onClick: () => {
  setDeleteItem(folder);
  setDeleteModalVisible(true);
}
```

- [ ] **Step 4: Replace archived list delete confirmation (lines 508-523)**

Replace the `Modal.confirm` block (lines 508-523) with:

```tsx
onClick: () => {
  setDeleteItem(list);
  setDeleteModalVisible(true);
}
```

- [ ] **Step 5: Replace active list delete confirmation (lines 541-557)**

Replace the `Modal.confirm` block (lines 541-557) with:

```tsx
onClick: () => {
  setDeleteItem(list);
  setDeleteModalVisible(true);
}
```

- [ ] **Step 6: Replace mobile menu delete confirmation (lines 1052-1067)**

Replace the `Modal.confirm` block (lines 1052-1067) with:

```tsx
onClick: () => {
  setDeleteItem(item);
  setDeleteModalVisible(true);
}
```

- [ ] **Step 7: Add DeleteListConfirmModal component to the JSX**

Add before the closing tag of the AppSider component's return JSX (near the end of the file, alongside other modals):

```tsx
<DeleteListConfirmModal
  visible={deleteModalVisible}
  item={deleteItem}
  lists={lists}
  onCancel={() => setDeleteModalVisible(false)}
  onSuccess={() => {
    setDeleteModalVisible(false);
    setDeleteItem(null);
    loadLists();
  }}
/>
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/AppSider.tsx
git commit -m "feat: replace all list delete dialogs with DeleteListConfirmModal"
```

---

### Task 8: Verification — Run all tests and manual testing

**Files:** No files modified — verification only

- [ ] **Step 1: Run backend tests**

Run: `cd /Users/yitouxiaomaolv/git/TickList/backend && python -m pytest tests/test_lists.py -v`
Expected: All tests PASS

- [ ] **Step 2: Run full backend test suite**

Run: `cd /Users/yitouxiaomaolv/git/TickList/backend && python -m pytest tests/ -v`
Expected: All tests PASS (no regressions)

- [ ] **Step 3: Start frontend dev server**

Run: `cd /Users/yitouxiaomaolv/git/TickList/frontend && bun run dev`

- [ ] **Step 4: Manual test: Delete empty list**

Open the app, create a new list with no tasks, click "..." menu → delete. Verify simple confirmation appears with just "确定删除清单吗?" and "删除/取消" buttons.

- [ ] **Step 5: Manual test: Delete list with tasks**

Create a list, add tasks to it, click "..." menu → delete. Verify modal shows task count, radio group for "清除所有任务" / "移动任务到其他清单", and list selector when move is selected. Test both actions.

- [ ] **Step 6: Manual test: Delete folder with sublists and tasks**

Create a folder with sublists that have tasks, delete the folder. Verify modal shows folder stats (sublist count + task count), and both actions work correctly.

- [ ] **Step 7: Manual test: Mobile menu delete**

On mobile/responsive view, long-press a list/folder, select delete from context menu. Verify same modal behavior.