# -*- coding: utf-8 -*-
"""过滤器模块测试"""


def _create_filter(client, headers, **kwargs):
    payload = {
        "name": kwargs.get("name", "Test Filter"),
        "conditions": kwargs.get("conditions", {"status": "pending"}),
    }
    payload.update(kwargs)
    resp = client.post("/api/filters", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_create_filter(app_client, auth_headers):
    """创建过滤器"""
    data = _create_filter(app_client, auth_headers, name="My Filter")
    assert data["name"] == "My Filter"


def test_get_filters(app_client, auth_headers):
    """获取过滤器列表"""
    _create_filter(app_client, auth_headers, name="F1")
    _create_filter(app_client, auth_headers, name="F2")
    resp = app_client.get("/api/filters", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2


def test_update_filter(app_client, auth_headers):
    """更新过滤器"""
    f = _create_filter(app_client, auth_headers, name="Old Filter")
    resp = app_client.put(
        f"/api/filters/{f['id']}",
        json={"name": "Updated Filter", "conditions": {"status": "completed"}},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Filter"


def test_delete_filter(app_client, auth_headers):
    """删除过滤器"""
    f = _create_filter(app_client, auth_headers, name="Delete Filter")
    resp = app_client.delete(f"/api/filters/{f['id']}", headers=auth_headers)
    assert resp.status_code == 200
