# -*- coding: utf-8 -*-
"""计数器模块测试"""

def _create_counter(client, headers, **kwargs):
    payload = {
        "title": kwargs.get("title", "Test Counter"),
        "initial_value": kwargs.get("initial_value", 0),
        "step": kwargs.get("step", 1),
    }
    payload.update(kwargs)
    resp = client.post("/api/counters", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()

def test_create_counter(app_client, auth_headers):
    """创建计数器"""
    data = _create_counter(app_client, auth_headers, title="Reading")
    assert data["title"] == "Reading"
    assert data["current_value"] == 0
    assert data["step"] == 1

def test_create_counter_with_initial_value(app_client, auth_headers):
    """创建带初始值的计数器"""
    data = _create_counter(app_client, auth_headers, title="Score", initial_value=10, step=5, target_value=100)
    assert data["current_value"] == 10
    assert data["initial_value"] == 10
    assert data["step"] == 5
    assert data["target_value"] == 100

def test_get_counters(app_client, auth_headers):
    """获取计数器列表"""
    _create_counter(app_client, auth_headers, title="C1")
    _create_counter(app_client, auth_headers, title="C2")
    resp = app_client.get("/api/counters", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2

def test_get_counter_detail(app_client, auth_headers):
    """获取计数器详情"""
    counter = _create_counter(app_client, auth_headers, title="Detail")
    resp = app_client.get(f"/api/counters/{counter['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail"

def test_update_counter(app_client, auth_headers):
    """更新计数器"""
    counter = _create_counter(app_client, auth_headers, title="Old")
    resp = app_client.put(
        f"/api/counters/{counter['id']}",
        json={"title": "Updated"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated"

def test_delete_counter(app_client, auth_headers):
    """删除计数器"""
    counter = _create_counter(app_client, auth_headers, title="Delete")
    resp = app_client.delete(f"/api/counters/{counter['id']}", headers=auth_headers)
    assert resp.status_code == 200

def test_increment_counter(app_client, auth_headers):
    """增加计数"""
    counter = _create_counter(app_client, auth_headers, title="Inc", step=2)
    resp = app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_value"] == 2
    assert body["reached_target"] is False

def test_decrement_counter(app_client, auth_headers):
    """减少计数"""
    counter = _create_counter(app_client, auth_headers, title="Dec", initial_value=10)
    resp = app_client.post(f"/api/counters/{counter['id']}/decrement", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["current_value"] == 9

def test_decrement_counter_at_zero(app_client, auth_headers):
    """当前值为0时无法减少"""
    counter = _create_counter(app_client, auth_headers, title="Zero")
    resp = app_client.post(f"/api/counters/{counter['id']}/decrement", headers=auth_headers)
    assert resp.status_code == 400

def test_increment_reaches_target(app_client, auth_headers):
    """增加计数达到目标值"""
    counter = _create_counter(app_client, auth_headers, title="Target", initial_value=9, step=1, target_value=10)
    resp = app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["current_value"] == 10
    assert body["reached_target"] is True

def test_complete_and_reopen_counter(app_client, auth_headers):
    """标记完成和重新打开"""
    counter = _create_counter(app_client, auth_headers, title="Complete")
    # 标记完成
    resp = app_client.put(f"/api/counters/{counter['id']}/complete", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is True
    # 已完成时无法增加
    resp = app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    assert resp.status_code == 400
    # 重新打开
    resp = app_client.put(f"/api/counters/{counter['id']}/reopen", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["is_completed"] is False

def test_counter_histories(app_client, auth_headers):
    """操作历史记录"""
    counter = _create_counter(app_client, auth_headers, title="History", initial_value=5)
    # 增加两次
    app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    # 减少一次
    app_client.post(f"/api/counters/{counter['id']}/decrement", headers=auth_headers)
    # 获取历史
    resp = app_client.get(f"/api/counters/{counter['id']}/histories", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 3
    assert len(body["histories"]) == 3
    # 最新的在前面
    assert body["histories"][0]["action"] == "decrement"
    assert body["histories"][1]["action"] == "increment"

def test_counter_no_target(app_client, auth_headers):
    """无目标值的计数器"""
    counter = _create_counter(app_client, auth_headers, title="NoTarget")
    assert counter["target_value"] is None
    resp = app_client.post(f"/api/counters/{counter['id']}/increment", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["reached_target"] is False
