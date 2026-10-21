# -*- coding: utf-8 -*-
"""API 文档暴露防护回归测试

背景：生产环境曾泄露完整 OpenAPI schema（/openapi.json, 75KB, 76 个端点）。
根因：FastAPI 中即使设置 docs_url=None / redoc_url=None，
openapi_url 默认仍为 /openapi.json 并继续对外提供完整 schema。
"""

import os

from fastapi.testclient import TestClient


def _make_client_for_env(monkeypatch, env: str) -> TestClient:
    """在指定 WORKFLOW_WEB_ENVIRONMENT 环境下构建 app 客户端"""
    monkeypatch.setenv("WORKFLOW_WEB_ENVIRONMENT", env)
    from app import create_app
    app = create_app()
    return TestClient(app)


def test_openapi_json_disabled_in_production(monkeypatch):
    """生产环境：/openapi.json 不应存在（404），而不是返回完整 schema"""
    client = _make_client_for_env(monkeypatch, "production")
    resp = client.get("/openapi.json")
    assert resp.status_code == 404
    assert "paths" not in resp.text  # 绝不能出现 API schema


def test_openapi_json_disabled_in_testing(monkeypatch):
    """测试环境同样不应暴露 openapi schema"""
    client = _make_client_for_env(monkeypatch, "testing")
    resp = client.get("/openapi.json")
    assert resp.status_code == 404


def test_openapi_json_enabled_in_development(monkeypatch):
    """开发环境：文档接口保留，便于本地调试"""
    client = _make_client_for_env(monkeypatch, "development")
    resp = client.get("/openapi.json")
    assert resp.status_code == 200
    assert "paths" in resp.json()


def test_docs_disabled_in_production(monkeypatch):
    """/docs 与 /redoc 在生产环境应为真实 404（而非 SPA 兜底的 200）"""
    client = _make_client_for_env(monkeypatch, "production")
    for path in ("/docs", "/redoc"):
        resp = client.get(path)
        assert resp.status_code == 404, f"{path} 应返回 404，实际 {resp.status_code}"
        # 修复前：元组返回值被序列化为 [{"message":"Not Found"},404] 且 HTTP 状态为 200
        assert not resp.text.startswith("["), f"{path} 返回了错误的元组序列化结果"
