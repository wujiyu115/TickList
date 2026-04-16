# -*- coding: utf-8 -*-
"""认证模块测试"""


def test_register(app_client):
    """注册新用户"""
    response = app_client.post(
        "/api/auth/register",
        json={"username": "newuser", "password": "pass123456"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_register_short_username(app_client):
    """用户名过短应返回 400"""
    response = app_client.post(
        "/api/auth/register",
        json={"username": "ab", "password": "pass123456"},
    )
    assert response.status_code == 400


def test_register_short_password(app_client):
    """密码过短应返回 400"""
    response = app_client.post(
        "/api/auth/register",
        json={"username": "validuser", "password": "123"},
    )
    assert response.status_code == 400


def test_login(app_client, test_user):
    """登录已有用户"""
    response = app_client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "testpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "token" in data
    assert data["success"] is True


def test_login_wrong_password(app_client, test_user):
    """错误密码应返回 401"""
    response = app_client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "wrongpassword"},
    )
    assert response.status_code == 401


def test_get_me(app_client, auth_headers):
    """获取当前用户信息"""
    response = app_client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "username" in data


def test_change_password(app_client, auth_headers):
    """修改密码"""
    response = app_client.post(
        "/api/auth/change-password",
        json={"old_password": "testpass123", "new_password": "newpass123456"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


def test_logout(app_client, auth_headers):
    """登出"""
    response = app_client.post("/api/auth/logout", headers=auth_headers)
    assert response.status_code == 200


def test_get_tokens(app_client, auth_headers):
    """获取 token 列表"""
    response = app_client.get("/api/auth/tokens", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_unauthorized_access(app_client):
    """未认证访问应返回 401"""
    response = app_client.get("/api/auth/me")
    assert response.status_code in (401, 403)


def test_get_auth_config(app_client):
    """获取认证配置"""
    response = app_client.get("/api/auth/config")
    assert response.status_code == 200
    data = response.json()
    assert "register_enabled" in data
