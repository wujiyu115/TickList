# -*- coding: utf-8 -*-
"""专注模块测试"""

from datetime import datetime, timedelta


def test_get_overview(app_client, auth_headers):
    """获取专注概览"""
    resp = app_client.get("/api/focus/overview", headers=auth_headers)
    assert resp.status_code == 200


def test_create_session(app_client, auth_headers):
    """创建专注记录"""
    now = datetime.now()
    resp = app_client.post(
        "/api/focus/sessions",
        json={
            "type": "pomodoro",
            "duration": 1500,
            "started_at": (now - timedelta(minutes=25)).isoformat(),
            "ended_at": now.isoformat(),
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_get_sessions(app_client, auth_headers):
    """获取专注记录列表"""
    # 先创建一条
    now = datetime.now()
    app_client.post(
        "/api/focus/sessions",
        json={
            "type": "pomodoro",
            "duration": 1500,
            "started_at": (now - timedelta(minutes=25)).isoformat(),
            "ended_at": now.isoformat(),
        },
        headers=auth_headers,
    )
    resp = app_client.get("/api/focus/sessions", headers=auth_headers)
    assert resp.status_code == 200


def test_delete_session(app_client, auth_headers):
    """删除专注记录"""
    now = datetime.now()
    create_resp = app_client.post(
        "/api/focus/sessions",
        json={
            "type": "pomodoro",
            "duration": 1500,
            "started_at": (now - timedelta(minutes=25)).isoformat(),
            "ended_at": now.isoformat(),
        },
        headers=auth_headers,
    )
    assert create_resp.status_code == 200
    session_data = create_resp.json()
    session_id = session_data.get("id")
    assert session_id is not None

    resp = app_client.delete(
        f"/api/focus/sessions/{session_id}", headers=auth_headers
    )
    assert resp.status_code == 200
