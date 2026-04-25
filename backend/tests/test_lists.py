# -*- coding: utf-8 -*-
"""清单模块测试"""


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