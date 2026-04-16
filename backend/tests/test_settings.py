# -*- coding: utf-8 -*-
"""设置模块测试"""


def test_get_settings(app_client, auth_headers):
    """获取当前用户的设置"""
    resp = app_client.get("/api/settings", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # 应包含默认设置字段
    assert "theme" in data or "user_id" in data


def test_update_settings(app_client, auth_headers):
    """更新设置"""
    resp = app_client.put(
        "/api/settings",
        json={"theme": "dark", "language": "en-US"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["theme"] == "dark"
    assert data["language"] == "en-US"


def test_update_partial_settings(app_client, auth_headers):
    """部分更新设置"""
    resp = app_client.put(
        "/api/settings",
        json={"pomodoro_duration": 30},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["pomodoro_duration"] == 30
