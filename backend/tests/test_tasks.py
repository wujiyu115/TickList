# -*- coding: utf-8 -*-
"""任务管理模块测试"""


def _create_task(client, headers, **kwargs):
    """辅助：创建一个任务并返回响应 JSON"""
    payload = {"title": kwargs.get("title", "Test Task")}
    payload.update(kwargs)
    resp = client.post("/api/tasks", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------

def test_create_task(app_client, auth_headers):
    """创建任务"""
    data = _create_task(app_client, auth_headers, title="My Task")
    assert data["title"] == "My Task"
    assert data["status"] == "pending"
    assert data["content"] == ""


def test_get_tasks(app_client, auth_headers):
    """获取任务列表"""
    _create_task(app_client, auth_headers, title="Task A")
    _create_task(app_client, auth_headers, title="Task B")
    resp = app_client.get("/api/tasks", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "tasks" in body
    assert body["total"] >= 2


def test_get_task_detail(app_client, auth_headers):
    """获取任务详情"""
    task = _create_task(app_client, auth_headers, title="Detail Task")
    resp = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail Task"


def test_update_task(app_client, auth_headers):
    """更新任务（标题、状态、优先级）"""
    task = _create_task(app_client, auth_headers, title="Old Title")
    resp = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"title": "New Title", "status": "in_progress", "priority": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["title"] == "New Title"
    assert updated["status"] == "in_progress"
    assert updated["priority"] == 1


def test_delete_task(app_client, auth_headers):
    """软删除任务"""
    task = _create_task(app_client, auth_headers, title="To Delete")
    resp = app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp.status_code == 200

    # 删除后获取应 404 或不在列表中
    resp2 = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp2.status_code == 404


# ------------------------------------------------------------------
# 子任务
# ------------------------------------------------------------------

def test_create_subtask(app_client, auth_headers):
    """创建子任务"""
    parent = _create_task(app_client, auth_headers, title="Parent")
    child = _create_task(
        app_client, auth_headers, title="Child", parent_task_id=parent["id"]
    )
    assert child["title"] == "Child"
    assert child["content"] == ""


def test_get_children(app_client, auth_headers):
    """获取子任务列表"""
    parent = _create_task(app_client, auth_headers, title="Parent2")
    _create_task(app_client, auth_headers, title="Child A", parent_task_id=parent["id"])
    _create_task(app_client, auth_headers, title="Child B", parent_task_id=parent["id"])
    resp = app_client.get(f"/api/tasks/{parent['id']}/children", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2


# ------------------------------------------------------------------
# 移动 / 复制
# ------------------------------------------------------------------

def test_move_task(app_client, auth_headers):
    """移动任务"""
    task = _create_task(app_client, auth_headers, title="Movable")
    resp = app_client.post(
        f"/api/tasks/{task['id']}/move",
        json={"new_parent_id": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_duplicate_task(app_client, auth_headers):
    """复制任务"""
    task = _create_task(app_client, auth_headers, title="Original")
    resp = app_client.post(
        f"/api/tasks/{task['id']}/duplicate", headers=auth_headers
    )
    assert resp.status_code == 200
    dup = resp.json()
    assert dup["id"] != task["id"]
    assert dup["content"] == ""


# ------------------------------------------------------------------
# 垃圾箱
# ------------------------------------------------------------------

def test_update_task_content(app_client, auth_headers):
    """更新任务 content 字段（检查事项）"""
    task = _create_task(app_client, auth_headers, title="Content Task")
    assert task["content"] == ""

    # 第一次更新 content
    content_v1 = '[{"text": "检查项1", "checked": false}, {"text": "检查项2", "checked": true}]'
    resp = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"content": content_v1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["content"] == content_v1

    # 获取详情验证
    resp2 = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["content"] == content_v1

    # 第二次更新 content（模拟勾选状态变化）
    content_v2 = '[{"text": "检查项1", "checked": true}, {"text": "检查项2", "checked": true}]'
    resp3 = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"content": content_v2},
        headers=auth_headers,
    )
    assert resp3.status_code == 200
    assert resp3.json()["content"] == content_v2


# ------------------------------------------------------------------
# 垃圾箱
# ------------------------------------------------------------------

def test_get_trash(app_client, auth_headers):
    """获取垃圾箱"""
    task = _create_task(app_client, auth_headers, title="Trash Me")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.get("/api/tasks/trash", headers=auth_headers)
    assert resp.status_code == 200


def test_restore_task(app_client, auth_headers):
    """恢复任务"""
    task = _create_task(app_client, auth_headers, title="Restore Me")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.post(
        f"/api/tasks/{task['id']}/restore", headers=auth_headers
    )
    assert resp.status_code == 200


def test_permanent_delete(app_client, auth_headers):
    """永久删除"""
    task = _create_task(app_client, auth_headers, title="Perm Delete")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.delete(
        f"/api/tasks/{task['id']}/permanent", headers=auth_headers
    )
    assert resp.status_code == 200


def test_empty_trash(app_client, auth_headers):
    """清空垃圾箱"""
    task = _create_task(app_client, auth_headers, title="Empty Trash")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.delete("/api/tasks/trash/empty", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ------------------------------------------------------------------
# 批量 / 过滤 / 搜索
# ------------------------------------------------------------------

def test_batch_update(app_client, auth_headers):
    """批量更新状态"""
    t1 = _create_task(app_client, auth_headers, title="Batch 1")
    t2 = _create_task(app_client, auth_headers, title="Batch 2")
    resp = app_client.post(
        "/api/tasks/batch-update",
        json={"task_ids": [t1["id"], t2["id"]], "status": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated_count"] == 2


def test_filter_tasks_by_status(app_client, auth_headers):
    """按状态过滤"""
    _create_task(app_client, auth_headers, title="Pending Task")
    t2 = _create_task(app_client, auth_headers, title="Done Task")
    app_client.put(
        f"/api/tasks/{t2['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )
    resp = app_client.get(
        "/api/tasks", params={"status": "completed"}, headers=auth_headers
    )
    assert resp.status_code == 200
    tasks = resp.json()["tasks"]
    assert all(t["status"] == "completed" for t in tasks)


def test_search_tasks(app_client, auth_headers):
    """搜索任务"""
    _create_task(app_client, auth_headers, title="UniqueSearchTerm123")
    resp = app_client.get(
        "/api/tasks/search",
        params={"keyword": "UniqueSearchTerm123"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
