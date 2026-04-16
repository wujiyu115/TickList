# -*- coding: utf-8 -*-
"""倒数日模块测试"""


def _create_countdown(client, headers, **kwargs):
    payload = {
        "title": kwargs.get("title", "Test Countdown"),
        "target_date": kwargs.get("target_date", "2026-12-31T00:00:00"),
    }
    payload.update(kwargs)
    resp = client.post("/api/countdowns", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_create_countdown(app_client, auth_headers):
    """创建倒数日"""
    data = _create_countdown(app_client, auth_headers, title="New Year")
    assert data["title"] == "New Year"


def test_get_countdowns(app_client, auth_headers):
    """获取倒数日列表"""
    _create_countdown(app_client, auth_headers, title="CD1")
    _create_countdown(app_client, auth_headers, title="CD2")
    resp = app_client.get("/api/countdowns", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2


def test_get_countdown_detail(app_client, auth_headers):
    """获取倒数日详情"""
    cd = _create_countdown(app_client, auth_headers, title="Detail CD")
    resp = app_client.get(f"/api/countdowns/{cd['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail CD"


def test_update_countdown(app_client, auth_headers):
    """更新倒数日"""
    cd = _create_countdown(app_client, auth_headers, title="Old CD")
    resp = app_client.put(
        f"/api/countdowns/{cd['id']}",
        json={"title": "Updated CD"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated CD"


def test_delete_countdown(app_client, auth_headers):
    """删除倒数日"""
    cd = _create_countdown(app_client, auth_headers, title="Delete CD")
    resp = app_client.delete(f"/api/countdowns/{cd['id']}", headers=auth_headers)
    assert resp.status_code == 200
