# -*- coding: utf-8 -*-
"""
pytest 全局 fixtures — 测试基础设施

提供:
  - test_engine      : session 级别的 SQLite 内存数据库引擎
  - db_session       : function 级别的数据库 session（自动回滚）
  - app_client       : 已注入测试 DB 且绕过 token_dao 的 FastAPI TestClient
  - test_user        : 预创建的普通用户
  - auth_headers     : 普通用户 JWT 认证头
  - admin_user       : 预创建的管理员用户
  - admin_headers    : 管理员 JWT 认证头
"""

import os
import sys
import uuid
import pytest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ---------------------------------------------------------------------------
# 确保 backend 目录在 sys.path 中，与 app.py 的导入方式保持一致
# ---------------------------------------------------------------------------
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# 在导入项目模块之前，先设置环境变量，避免模块级副作用出问题
os.environ.setdefault("WORKFLOW_WEB_ENVIRONMENT", "testing")
# ⚠️ 关键：强制 DatabaseConnection 单例初始化时使用内存数据库，
#    确保测试永远不会触碰 ticklist.db 生产数据
os.environ["DB_CONNECT_STRING"] = "sqlite:///:memory:"

from database.connection import Base, get_db, db_connection  # noqa: E402
from database.models import UserModel  # noqa: E402


# ==========================================================================
# Engine & Session
# ==========================================================================

@pytest.fixture(scope="session")
def test_engine():
    """创建 SQLite 内存数据库引擎（整个测试会话共用）"""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    # 导入所有 ORM 模型以注册到 Base.metadata
    from database import models as _models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def _patch_db_connection(test_engine):
    """让所有 DAO 使用测试引擎，而非生产数据库"""
    orig_engine = db_connection.engine
    orig_session_local = db_connection.SessionLocal

    db_connection.engine = test_engine
    db_connection.SessionLocal = sessionmaker(
        bind=test_engine, autocommit=False, autoflush=False
    )

    yield

    # 清理本次测试产生的数据（仅作用于内存数据库）
    cleanup = db_connection.SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            try:
                cleanup.execute(table.delete())
            except Exception:
                cleanup.rollback()  # 表可能不存在，跳过
        cleanup.commit()
    finally:
        cleanup.close()

    db_connection.engine = orig_engine
    db_connection.SessionLocal = orig_session_local


@pytest.fixture
def db_session(test_engine):
    """每个测试独立的数据库 session"""
    session = sessionmaker(bind=test_engine)()
    yield session
    session.close()


# ==========================================================================
# FastAPI TestClient
# ==========================================================================

@pytest.fixture
def app_client(db_session):
    """
    FastAPI 测试客户端

    - 覆盖 get_db → 使用测试 db_session
    - 覆盖 get_current_user → 只解析 JWT，跳过 token_dao 校验
    - 覆盖 get_current_user_info → 从测试 DB 读取用户信息
    """
    from app import app
    from middleware.jwt_middleware import (
        get_current_user,
        get_current_user_info,
        verify_token,
    )
    from fastapi import Depends, HTTPException, status
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

    security = HTTPBearer(auto_error=False)

    # --- 覆盖 get_db ---
    def override_get_db():
        # 使用 db_connection 的 session 以保持与 DAO 一致
        s = db_connection.get_session()
        try:
            yield s
        finally:
            s.close()

    # --- 覆盖 get_current_user（跳过 token_dao 验证）---
    async def override_get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
    ):
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Not authenticated",
                headers={"WWW-Authenticate": "Bearer"},
            )

        raw_token = credentials.credentials

        # PAT branch
        if raw_token.startswith("tkl_"):
            import hashlib
            from database.dao.token_dao import token_dao
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            pat = token_dao.find_pat_by_hash(token_hash)
            if pat is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid PAT",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            token_dao.update_pat_last_used(pat['id'])
            return pat['user_id']

        # JWT branch (existing)
        payload = verify_token(raw_token)
        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
            )
        return user_id

    # --- 覆盖 get_current_user_info（从测试 DB 读取）---
    async def override_get_current_user_info(
        current_user_id: str = Depends(override_get_current_user),
    ):
        s = db_connection.get_session()
        try:
            user = (
                s.query(UserModel)
                .filter(UserModel.id == current_user_id)
                .first()
            )
        finally:
            s.close()
        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")
        return {
            "id": user.id,
            "username": user.username,
            "role_group": user.role_group,
            "is_frozen": user.is_frozen,
        }

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    app.dependency_overrides[get_current_user_info] = override_get_current_user_info

    from fastapi.testclient import TestClient

    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


# ==========================================================================
# 用户 fixtures
# ==========================================================================

@pytest.fixture
def test_user(db_session):
    """预创建普通测试用户"""
    from middleware.jwt_middleware import get_password_hash

    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        username="testuser",
        password=get_password_hash("testpass123"),
        role_group="user",
        is_frozen=False,
        created_at=datetime.now().isoformat(),
    )
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_user(db_session):
    """预创建管理员用户"""
    from middleware.jwt_middleware import get_password_hash

    user_id = str(uuid.uuid4())
    user = UserModel(
        id=user_id,
        username="adminuser",
        password=get_password_hash("adminpass123"),
        role_group="admin",
        is_frozen=False,
        created_at=datetime.now().isoformat(),
    )
    db_session.add(user)
    db_session.commit()
    return user


# ==========================================================================
# 认证头 fixtures
# ==========================================================================

@pytest.fixture
def auth_headers(test_user):
    """普通用户 JWT 认证请求头"""
    from middleware.jwt_middleware import create_access_token

    token = create_access_token({"sub": test_user.id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers(admin_user):
    """管理员 JWT 认证请求头"""
    from middleware.jwt_middleware import create_access_token

    token = create_access_token({"sub": admin_user.id})
    return {"Authorization": f"Bearer {token}"}
