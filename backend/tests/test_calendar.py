# -*- coding: utf-8 -*-
"""日历模块测试"""

from datetime import datetime, timedelta


def test_get_calendar_tasks(app_client, auth_headers):
    """按日期范围查询日历任务"""
    # 创建有截止日期的任务
    due = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%S")
    app_client.post(
        "/api/tasks",
        json={"title": "Calendar Task", "due_date": due},
        headers=auth_headers,
    )

    start = datetime.now().strftime("%Y-%m-%d")
    end = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
    resp = app_client.get(
        "/api/calendar/tasks",
        params={"start_date": start, "end_date": end},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "tasks" in body


def test_calendar_empty_range(app_client, auth_headers):
    """空范围返回空列表"""
    resp = app_client.get(
        "/api/calendar/tasks",
        params={"start_date": "2020-01-01", "end_date": "2020-01-02"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] == 0


def test_calendar_with_due_dates(app_client, auth_headers):
    """有截止日期的任务应出现在日历中"""
    due = "2026-06-15T10:00:00"
    app_client.post(
        "/api/tasks",
        json={"title": "Due Task", "due_date": due},
        headers=auth_headers,
    )
    resp = app_client.get(
        "/api/calendar/tasks",
        params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1
