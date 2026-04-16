# -*- coding: utf-8 -*-
"""冒烟测试 — 验证测试基础设施可用"""


def test_health_endpoint(app_client):
    """健康检查端点应返回 200"""
    response = app_client.get("/api/health")
    assert response.status_code == 200


def test_db_session_works(db_session):
    """db_session fixture 可以正常查询"""
    from database.models import UserModel

    count = db_session.query(UserModel).count()
    assert count == 0  # 空数据库


def test_user_creation(db_session, test_user):
    """test_user fixture 能正确创建用户"""
    from database.models import UserModel

    user = db_session.query(UserModel).filter_by(id=test_user.id).first()
    assert user is not None
    assert user.username == "testuser"
    assert user.role_group == "user"


def test_admin_user_creation(db_session, admin_user):
    """admin_user fixture 能正确创建管理员"""
    from database.models import UserModel

    user = db_session.query(UserModel).filter_by(id=admin_user.id).first()
    assert user is not None
    assert user.username == "adminuser"
    assert user.role_group == "admin"


def test_auth_headers_format(auth_headers):
    """auth_headers 应包含 Bearer token"""
    assert "Authorization" in auth_headers
    assert auth_headers["Authorization"].startswith("Bearer ")


def test_admin_headers_format(admin_headers):
    """admin_headers 应包含 Bearer token"""
    assert "Authorization" in admin_headers
    assert admin_headers["Authorization"].startswith("Bearer ")


def test_session_isolation(db_session):
    """验证测试之间的数据隔离 — 上一个测试创建的用户不应出现"""
    from database.models import UserModel

    count = db_session.query(UserModel).count()
    assert count == 0
