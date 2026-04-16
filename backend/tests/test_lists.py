# -*- coding: utf-8 -*-
"""清单模块测试"""


def _create_list(client, headers, **kwargs):
    payload = {"name": kwargs.get("name", "Test List")}
    payload.update(kwargs)
    resp = client.post("/api/lists", json=payload, headers=headers)
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
