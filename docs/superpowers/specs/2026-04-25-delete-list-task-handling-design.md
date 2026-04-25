# Delete List with Task Handling Design

## Overview

When deleting a list or folder, provide options for handling the tasks within: either hard-delete all tasks or move them to a target list. When no tasks exist, show a simple confirmation.

## Backend API Changes

### Modified Endpoint

`DELETE /lists/{list_id}` now accepts optional query parameters:

| Parameter | Values | Description |
|-----------|--------|-------------|
| `action` | `delete_tasks`, `move_tasks` | How to handle tasks in this list. Omit when no tasks exist. |
| `target_list_id` | string or null | Target list for move. Null/empty = inbox (collect box). |

### Behavior Matrix

| Action | List type | What happens |
|--------|-----------|--------------|
| No action, 0 tasks | list | Delete list only |
| `delete_tasks` | list | Hard delete all tasks (including child task trees), then delete list |
| `move_tasks` | list | Move all tasks to target_list_id (null=inbox), then delete list |
| No action, 0 tasks, 0 sublists | folder | Delete folder only |
| No action, sublists exist | folder | Delete sublists and folder (sublists' tasks handled by action param) |
| `delete_tasks` | folder | Hard delete all tasks in all sublists, delete sublists, delete folder |
| `move_tasks` | folder | Move all tasks from all sublists to target, delete sublists, delete folder |

### Task Hard Delete Logic

- Find all tasks where `list_id` matches the list being deleted
- For each task, recursively hard delete all children (via `task_children` table)
- Delete the task records from database (not soft delete)
- Delete the list

### Task Move Logic

- Find all tasks where `list_id` matches the list being deleted
- Update `list_id` to target_list_id (null for inbox)
- For subtasks (child_ids), they inherit parent's list_id change
- Delete the list

### Folder Delete Logic

- For folders: find all sublists (`parent_id` = folder.id)
- Apply the same action (delete_tasks or move_tasks) to tasks in each sublist
- Delete all sublists
- Delete the folder

All operations must run in a single database transaction.

## Frontend Dialog Design

### When tasks exist (>0)

Dialog title: `删除清单「{name}」` or `删除文件夹「{name}」`

Content shows task count:
- List: `该清单下有 {N} 个任务，请选择处理方式`
- Folder: `该文件夹下有 {M} 个清单，共 {N} 个任务，请选择处理方式`

Two-step interaction:
1. **Select action**: Radio group with two options:
   - `清除所有任务` (hard delete)
   - `移动任务到其他清单` (move)
2. **If "move" selected**: Expand a dropdown to choose target list
   - Default: `收集箱` (inbox, list_id=null)
   - Other options: all available lists from sidebar
3. **Confirm button**: Executes the chosen action

Buttons: `确认` (primary) + `取消`

### When no tasks exist (=0)

Simple `Modal.confirm`:
- Title: `删除清单「{name}」` or `删除文件夹「{name}」`
- Content: `确定删除{type}「{name}」吗？`
- Buttons: `删除` (danger) + `取消`

## Files to Modify

### Backend
- `backend/routes/list.py`: Update `delete_list` route to accept action/target_list_id params
- `backend/database/dao/list_dao.py`: Add methods for hard-deleting tasks and moving tasks, update `delete_list` to handle sublists and task actions

### Frontend
- `frontend/src/api/list.ts`: Update `deleteList` to accept action and target_list_id params
- `frontend/src/components/AppSider.tsx`: Replace all 3 delete confirmation dialogs with new unified logic, add task count check, add action selector UI

## Edge Cases

- Moving tasks to a list that is also being deleted: backend should validate target_list_id exists and is not the same as the list being deleted
- Folder with nested sublists: all tasks in all sublists are counted and handled
- Tasks with child_ids spanning multiple lists: when moving, children stay with parent (list_id updated to match parent)
- Empty target_list_id treated as inbox (list_id=null)