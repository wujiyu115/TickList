# -*- coding: utf-8 -*-
"""统计模块测试"""

from datetime import datetime, timedelta


def test_overview(app_client, auth_headers):
    """获取统计概览"""
    resp = app_client.get("/api/statistics/overview", headers=auth_headers)
    assert resp.status_code == 200


def test_daily(app_client, auth_headers):
    """获取每日统计"""
    today = datetime.now().strftime("%Y-%m-%d")
    resp = app_client.get(
        "/api/statistics/daily",
        params={"date_str": today},
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_trend(app_client, auth_headers):
    """获取趋势数据"""
    resp = app_client.get(
        "/api/statistics/trend",
        params={"days": 7},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "trend" in body
    assert body["days"] == 7


def test_range(app_client, auth_headers):
    """获取时间范围统计"""
    start = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    end = datetime.now().strftime("%Y-%m-%d")
    resp = app_client.get(
        "/api/statistics/range",
        params={"start_date": start, "end_date": end},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "statistics" in body
