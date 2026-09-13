# -*- coding: utf-8 -*-
"""专注模块测试"""

import threading
import uuid
from datetime import datetime, timedelta

import pytest
import sqlalchemy
from sqlalchemy import create_engine, func, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool


def _headers_for_user(user_id):
    from middleware.jwt_middleware import create_access_token

    token = create_access_token({"sub": user_id})
    return {"Authorization": f"Bearer {token}"}


def test_get_overview(app_client, auth_headers):
    """获取专注概览"""
    resp = app_client.get("/api/focus/overview", headers=auth_headers)
    assert resp.status_code == 200


def test_focus_capabilities_requires_auth_and_advertises_idempotency(
    app_client, auth_headers
):
    """能力探测需要认证，并声明服务端支持客户端会话幂等键"""
    unauthenticated = app_client.get("/api/focus/capabilities")
    assert unauthenticated.status_code == 401

    response = app_client.get(
        "/api/focus/capabilities", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json() == {"client_session_id": True}


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
    assert resp.json()["client_session_id"] is None


@pytest.mark.parametrize("different_task", [False, True])
def test_legacy_same_type_and_timestamp_always_create_new_sessions(
    app_client, auth_headers, different_task
):
    """无 key 的旧请求不按时间合并，同任务和跨任务均保留独立记录。"""
    first_task = _create_task(app_client, auth_headers, "First legacy task")
    second_task = (
        _create_task(app_client, auth_headers, "Second legacy task")
        if different_task else first_task
    )
    payload = _make_focus_payload(first_task, duration=60)
    first = app_client.post("/api/focus/sessions", json=payload, headers=auth_headers)
    second = app_client.post(
        "/api/focus/sessions",
        json={**payload, "task_id": second_task},
        headers=auth_headers,
    )
    assert first.status_code == second.status_code == 200
    assert first.json()["id"] != second.json()["id"]
    assert first.json()["task_id"] == first_task
    assert second.json()["task_id"] == second_task
    assert first.json()["client_session_id"] is None
    assert second.json()["client_session_id"] is None
    first_row = app_client.get(f"/api/tasks/{first_task}", headers=auth_headers).json()
    assert (first_row["pomodoro_count"], first_row["focus_duration"]) == (
        (1, 60) if different_task else (2, 120)
    )
    if different_task:
        second_row = app_client.get(
            f"/api/tasks/{second_task}", headers=auth_headers
        ).json()
        assert (second_row["pomodoro_count"], second_row["focus_duration"]) == (1, 60)


def test_distinct_explicit_keys_with_same_timestamp_remain_independent(
    app_client, auth_headers
):
    """显式不同 key 不按相同 type/timestamp 合并，也不合并相邻旧请求。"""
    task_id = _create_task(app_client, auth_headers)
    payload = _make_focus_payload(task_id, duration=60)
    responses = [
        app_client.post(
            "/api/focus/sessions",
            json={**payload, **key_fields},
            headers=auth_headers,
        )
        for key_fields in (
            {"client_session_id": str(uuid.uuid4())},
            {},
            {"client_session_id": str(uuid.uuid4())},
            {},
        )
    ]
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()["id"] for response in responses}) == 4
    task = app_client.get(f"/api/tasks/{task_id}", headers=auth_headers).json()
    assert (task["pomodoro_count"], task["focus_duration"]) == (4, 240)


def test_legacy_focus_request_without_client_session_id_still_creates_each_time(
    app_client, auth_headers
):
    """旧客户端省略幂等键时保留每次创建新记录的行为"""
    payload = {"type": "pomodoro", "duration": 60}
    first = app_client.post(
        "/api/focus/sessions", json=payload, headers=auth_headers
    )
    second = app_client.post(
        "/api/focus/sessions", json=payload, headers=auth_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["client_session_id"] is None
    assert second.json()["client_session_id"] is None
    assert second.json()["id"] != first.json()["id"]


def test_create_session_is_idempotent_and_updates_task_once(
    app_client, auth_headers
):
    """同一用户重试同一客户端会话时只创建一条记录并统计一次"""
    task_resp = app_client.post(
        "/api/tasks", json={"title": "Focus task"}, headers=auth_headers
    )
    assert task_resp.status_code == 200
    task_id = task_resp.json()["id"]

    now = datetime.now()
    payload = {
        "task_id": task_id,
        "client_session_id": str(uuid.uuid4()),
        "type": "pomodoro",
        "duration": 1500,
        "started_at": (now - timedelta(minutes=25)).isoformat(),
        "ended_at": now.isoformat(),
    }
    first = app_client.post(
        "/api/focus/sessions", json=payload, headers=auth_headers
    )
    second = app_client.post(
        "/api/focus/sessions", json=payload, headers=auth_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()

    task = app_client.get(f"/api/tasks/{task_id}", headers=auth_headers).json()
    assert task["pomodoro_count"] == 1
    assert task["focus_duration"] == 1500

    overview = app_client.get(
        "/api/focus/overview", headers=auth_headers
    ).json()
    assert overview["total_pomodoro_count"] == 1
    assert overview["total_focus_duration"] == 1500


def test_same_client_session_id_uses_first_payload(
    app_client, auth_headers
):
    """同键不同 payload 仍返回第一次创建的记录（first write wins）"""
    client_session_id = str(uuid.uuid4())
    first_payload = {
        "client_session_id": client_session_id,
        "type": "pomodoro",
        "duration": 120,
    }
    second_payload = {
        "client_session_id": client_session_id,
        "type": "stopwatch",
        "duration": 999,
    }

    first = app_client.post(
        "/api/focus/sessions", json=first_payload, headers=auth_headers
    )
    second = app_client.post(
        "/api/focus/sessions", json=second_payload, headers=auth_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json() == first.json()
    assert second.json()["type"] == "pomodoro"
    assert second.json()["duration"] == 120


def test_client_session_id_is_isolated_between_users(
    app_client, auth_headers
):
    """相同客户端会话 ID 在不同用户下分别创建记录"""
    other_headers = _headers_for_user(str(uuid.uuid4()))
    client_session_id = str(uuid.uuid4())
    payload = {
        "client_session_id": client_session_id,
        "type": "pomodoro",
        "duration": 300,
    }

    first = app_client.post(
        "/api/focus/sessions", json=payload, headers=auth_headers
    )
    second = app_client.post(
        "/api/focus/sessions", json=payload, headers=other_headers
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["id"] != first.json()["id"]
    assert second.json()["client_session_id"] == client_session_id

    first_sessions = app_client.get(
        "/api/focus/sessions", headers=auth_headers
    ).json()
    second_sessions = app_client.get(
        "/api/focus/sessions", headers=other_headers
    ).json()
    assert first_sessions["total"] == 1
    assert second_sessions["total"] == 1


@pytest.mark.parametrize("keyed", [False, True])
def test_focus_session_rejects_task_owned_by_another_user(
    app_client, auth_headers, keyed
):
    """不能把其他用户的任务关联到自己的专注记录"""
    task_resp = app_client.post(
        "/api/tasks", json={"title": "Private task"}, headers=auth_headers
    )
    assert task_resp.status_code == 200
    other_headers = _headers_for_user(str(uuid.uuid4()))
    payload = _make_focus_payload(
        task_resp.json()["id"], str(uuid.uuid4()) if keyed else None, duration=300
    )

    resp = app_client.post(
        "/api/focus/sessions",
        json=payload,
        headers=other_headers,
    )

    assert resp.status_code == 404
    assert app_client.get(
        "/api/focus/sessions", headers=other_headers
    ).json()["total"] == 0
    task = app_client.get(
        f"/api/tasks/{task_resp.json()['id']}", headers=auth_headers
    ).json()
    assert (task["pomodoro_count"], task["focus_duration"]) == (0, 0)


@pytest.mark.parametrize("keyed", [False, True])
@pytest.mark.parametrize("deleted_task", [False, True])
def test_missing_task_is_detached_only_for_legacy_requests(
    app_client, auth_headers, keyed, deleted_task
):
    """旧请求保留失效任务记录；显式 key 引用已删/未知任务均拒绝。"""
    task_id = str(uuid.uuid4())
    if deleted_task:
        task_id = _create_task(app_client, auth_headers)
        assert app_client.delete(
            f"/api/tasks/{task_id}", headers=auth_headers
        ).status_code == 200
        assert app_client.delete(
            f"/api/tasks/{task_id}/permanent", headers=auth_headers
        ).status_code == 200
    response = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(
            task_id, str(uuid.uuid4()) if keyed else None, duration=60
        ),
        headers=auth_headers,
    )
    assert response.status_code == (404 if keyed else 200)
    sessions = app_client.get("/api/focus/sessions", headers=auth_headers).json()
    assert sessions["total"] == (0 if keyed else 1)
    overview = app_client.get("/api/focus/overview", headers=auth_headers).json()
    assert overview["total_focus_duration"] == (0 if keyed else 60)
    if not keyed:
        assert response.json()["task_id"] is None
        assert response.json()["duration"] == 60
        assert sessions["sessions"][0]["task_id"] is None
        assert sessions["sessions"][0]["task_title"] is None


@pytest.mark.parametrize("foreign_task", [False, True])
def test_existing_key_retry_precedes_task_validation(
    app_client, auth_headers, foreign_task
):
    """已有 key 的重试仍先返回原记录，不写入重试载荷的失效/外人任务。"""
    client_session_id = str(uuid.uuid4())
    first = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(None, client_session_id, duration=60),
        headers=auth_headers,
    )
    assert first.status_code == 200
    other_headers = _headers_for_user(str(uuid.uuid4()))
    task_id = (
        _create_task(app_client, other_headers, "Private retry target")
        if foreign_task else str(uuid.uuid4())
    )
    retry = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(task_id, client_session_id, duration=999),
        headers=auth_headers,
    )
    assert retry.status_code == 200
    assert retry.json() == first.json()
    assert app_client.get(
        "/api/focus/sessions", headers=auth_headers
    ).json()["total"] == 1
    if foreign_task:
        task = app_client.get(f"/api/tasks/{task_id}", headers=other_headers).json()
        assert (task["pomodoro_count"], task["focus_duration"]) == (0, 0)


def test_session_list_does_not_leak_foreign_task_titles(
    app_client, auth_headers, db_session, test_user
):
    """历史非法跨人引用不得经 list 外连接泄露标题，也不丢弃该用户记录。"""
    from database.models import FocusSessionModel

    other_headers = _headers_for_user(str(uuid.uuid4()))
    foreign_task = _create_task(app_client, other_headers, "Private foreign title")
    own_task = _create_task(app_client, auth_headers, "Visible own title")
    linked = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(own_task, duration=60),
        headers=auth_headers,
    )
    assert linked.status_code == 200
    historical_id = str(uuid.uuid4())
    db_session.add(FocusSessionModel(
        id=historical_id,
        user_id=test_user.id,
        task_id=foreign_task,
        type="pomodoro",
        duration=60,
        started_at=datetime.now().isoformat(),
    ))
    db_session.commit()
    response = app_client.get("/api/focus/sessions", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["total"] == 2
    by_id = {item["id"]: item for item in response.json()["sessions"]}
    assert by_id[historical_id]["task_title"] is None
    assert by_id[linked.json()["id"]]["task_title"] == "Visible own title"
    assert "Private foreign title" not in response.text
    assert app_client.get(
        "/api/focus/sessions", headers=other_headers
    ).json()["total"] == 0


@pytest.mark.parametrize("keyed", [False, True])
@pytest.mark.parametrize("change", ["delete", "transfer"])
@pytest.mark.parametrize("phase", ["lookup", "update"])
def test_task_changes_before_atomic_update_are_handled_safely(
    app_client, concurrent_env, monkeypatch, keyed, change, phase
):
    """确定性插入外部提交：读取后/UPDATE 前消失可兼容，换 owner 必须拒绝。"""
    from database.models import TaskModel
    from sqlalchemy.orm import Query

    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers)
    original_first = Query.first
    original_update = Query.update
    injected = []

    def mutate_task():
        injected.append(change)
        with concurrent_env.begin() as connection:
            if change == "delete":
                connection.execute(
                    sqlalchemy.delete(TaskModel).where(TaskModel.id == task_id)
                )
            else:
                connection.execute(
                    sqlalchemy.update(TaskModel).where(TaskModel.id == task_id)
                    .values(user_id=_OTHER_USER)
                )

    def is_task_query(query):
        return any(
            description.get("entity") is TaskModel
            for description in query.column_descriptions
        )

    def first_then_change(query):
        result = original_first(query)
        if phase == "lookup" and not injected and is_task_query(query):
            mutate_task()
        return result

    def change_then_update(query, *args, **kwargs):
        if phase == "update" and not injected and is_task_query(query):
            mutate_task()
        return original_update(query, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(Query, "first", first_then_change)
        patch.setattr(Query, "update", change_then_update)
        response = app_client.post(
            "/api/focus/sessions",
            json=_make_focus_payload(
                task_id, str(uuid.uuid4()) if keyed else None, duration=60
            ),
            headers=headers,
        )
    assert injected == [change]
    accepted = not keyed and change == "delete"
    assert response.status_code == (200 if accepted else 404)
    sessions = app_client.get("/api/focus/sessions", headers=headers).json()
    assert sessions["total"] == (1 if accepted else 0)
    if accepted:
        assert response.json()["task_id"] is None
        assert response.json()["duration"] == 60
        assert sessions["sessions"][0]["task_id"] is None
        assert sessions["sessions"][0]["task_title"] is None
    task = _load_task(concurrent_env, task_id)
    if change == "delete":
        assert task is None
    else:
        assert task.user_id == _OTHER_USER
        assert (task.pomodoro_count, task.focus_duration) == (0, 0)
        assert app_client.get(
            "/api/focus/sessions", headers=_headers_for_user(_OTHER_USER)
        ).json()["total"] == 0


@pytest.mark.parametrize("keyed", [False, True])
@pytest.mark.parametrize("change", ["delete", "transfer"])
def test_atomic_update_locks_task_until_session_commit(
    app_client, concurrent_env, monkeypatch, keyed, change
):
    """UPDATE 成功至会话提交期间，独立连接不能删除任务或更改 owner。"""
    from database.connection import db_connection
    from database.dao.focus_dao import focus_dao
    from database.models import TaskModel
    from sqlalchemy.exc import OperationalError

    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers)
    dao_session = db_connection.get_session()
    original_commit = dao_session.commit
    competing_engine = create_engine(
        concurrent_env.url,
        connect_args={"check_same_thread": False, "timeout": 0},
        poolclass=NullPool,
    )
    attempts = []

    def commit_with_competing_write():
        attempts.append(change)
        with competing_engine.begin() as connection:
            statement = (
                sqlalchemy.delete(TaskModel).where(TaskModel.id == task_id)
                if change == "delete" else
                sqlalchemy.update(TaskModel).where(TaskModel.id == task_id)
                .values(user_id=_OTHER_USER)
            )
            with pytest.raises(OperationalError, match="database is locked"):
                connection.execute(statement)
        return original_commit()

    try:
        with monkeypatch.context() as patch:
            patch.setattr(focus_dao, "_get_session", lambda: dao_session)
            patch.setattr(dao_session, "commit", commit_with_competing_write)
            response = app_client.post(
                "/api/focus/sessions",
                json=_make_focus_payload(
                    task_id, str(uuid.uuid4()) if keyed else None, duration=60
                ),
                headers=headers,
            )
    finally:
        dao_session.close()
        competing_engine.dispose()
    assert attempts == [change]
    assert response.status_code == 200
    assert response.json()["task_id"] == task_id
    task = _load_task(concurrent_env, task_id)
    assert task.user_id == _CONCURRENT_USER
    assert (task.pomodoro_count, task.focus_duration) == (1, 60)
    sessions = app_client.get("/api/focus/sessions", headers=headers).json()
    assert sessions["total"] == 1
    assert sessions["sessions"][0]["task_id"] == task_id


@pytest.mark.parametrize("invalid_key", [
    "", "session-a", "session-A", "a" * 129,
    "ABCDEFAB-1234-5678-9ABC-ABCDEFABCDEF",
    "abcdefab123456789abcabcdefabcdef",
    "abcdefab-1234-5678-9abc-abcdefabcdef ",
    "abcdefab-1234-5678-9abc-abcdefabcdef\n",
    "ábcdefab-1234-5678-9abc-abcdefabcdef",
])
def test_noncanonical_client_session_id_is_rejected(app_client, auth_headers, invalid_key):
    """仅规范小写 UUID 可用于幂等，避免依赖数据库排序规则。"""
    resp = app_client.post(
        "/api/focus/sessions",
        json={"client_session_id": invalid_key, "duration": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 422
    overview = app_client.get("/api/focus/overview", headers=auth_headers).json()
    assert overview["total_focus_duration"] == 0


def test_null_client_session_id_preserves_legacy_creation(app_client, auth_headers):
    payload = {"client_session_id": None, "duration": 60, "started_at": "2026-01-01T12:00:00"}
    responses = [
        app_client.post("/api/focus/sessions", json=payload, headers=auth_headers)
        for _ in range(2)
    ]
    assert all(response.status_code == 200 for response in responses)
    assert len({response.json()["id"] for response in responses}) == 2
    assert all(response.json()["client_session_id"] is None for response in responses)


def test_migrate_legacy_focus_sessions_adds_idempotency_schema(tmp_path):
    """历史 focus_sessions 表可迁移且迁移可重复执行"""
    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with legacy_engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE focus_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                task_id VARCHAR(36),
                type VARCHAR(20) NOT NULL,
                duration INTEGER,
                started_at VARCHAR(50),
                ended_at VARCHAR(50),
                created_at VARCHAR(50)
            )
            """
        ))

    from database.connection import db_connection

    original_engine = db_connection.engine
    db_connection.engine = legacy_engine
    try:
        db_connection.migrate_tables()
        db_connection.migrate_tables()
    finally:
        db_connection.engine = original_engine

    inspector = inspect(legacy_engine)
    columns = {column["name"] for column in inspector.get_columns("focus_sessions")}
    assert "client_session_id" in columns
    unique_indexes = {
        index["name"]
        for index in inspector.get_indexes("focus_sessions")
        if index.get("unique")
    }
    unique_constraints = {
        constraint["name"]
        for constraint in inspector.get_unique_constraints("focus_sessions")
    }
    assert (
        "uq_focus_sessions_user_client_session" in unique_indexes
        or "uq_focus_sessions_user_client_session" in unique_constraints
    )

    with legacy_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO focus_sessions "
                "(id, user_id, type, client_session_id) "
                "VALUES (:id, :user_id, :type, :client_session_id)"
            ),
            {
                "id": str(uuid.uuid4()),
                "user_id": "user-1",
                "type": "pomodoro",
                "client_session_id": "client-1",
            },
        )

    with pytest.raises(IntegrityError):
        with legacy_engine.begin() as connection:
            connection.execute(
                text(
                    "INSERT INTO focus_sessions "
                    "(id, user_id, type, client_session_id) "
                    "VALUES (:id, :user_id, :type, :client_session_id)"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "user_id": "user-1",
                    "type": "pomodoro",
                    "client_session_id": "client-1",
                },
            )

    legacy_engine.dispose()


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


# ==========================================================================
# 进程内并发集成测试
#
# conftest 的会话级引擎是内存库 + StaticPool（单一共享连接），无法模拟
# 真实的多连接锁竞争。以下测试把 db_connection 临时切到独立的临时文件库
# （NullPool：每个线程各自持有连接），用多个线程同时通过 TestClient 打
# POST /api/focus/sessions，覆盖：同幂等键双并发、同载荷再次提交、不同
# 键并发累加统计、同记录并发 DELETE 的删除权唯一性，以及显式 key 请求
# 在任务永久删除后的 404。
#
# 注意：TestClient 是 ASGI 进程内调用，不是 socket HTTP。这里验证的是
# "服务端在同一键/同一载荷被重复提交时幂等"，只能*近似*桌面端"POST 已
# 提交但响应丢失后重试"与"进程重启后重试"的服务端半边；真实的网络响应
# 丢失、桌面队列持久化和重启后的重新提交链路不在本文件覆盖范围内。
# 全部使用临时测试库与测试令牌，不触碰真实账户或生产数据库。
# ==========================================================================

_CONCURRENT_USER = "concurrency-user-a"
_OTHER_USER = "concurrency-user-b"


@pytest.fixture
def concurrent_env(app_client, tmp_path):
    """
    在独立临时文件库上重建 db_connection，使 DAO 获得真实的锁竞争语义。

    依赖 app_client：先让 conftest 的依赖覆盖（认证/get_db）生效，本夹具
    只替换 engine 与 SessionLocal；teardown 顺序保证 autouse 清理夹具恢复
    原内存引擎后仍能正常清空数据。
    """
    from database.connection import Base, db_connection

    file_engine = create_engine(
        f"sqlite:///{tmp_path / 'concurrent.db'}",
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
    )
    Base.metadata.create_all(bind=file_engine)

    orig_engine = db_connection.engine
    orig_session_local = db_connection.SessionLocal
    db_connection.engine = file_engine
    db_connection.SessionLocal = sessionmaker(
        bind=file_engine, autocommit=False, autoflush=False
    )

    yield file_engine

    db_connection.engine = orig_engine
    db_connection.SessionLocal = orig_session_local
    file_engine.dispose()


def _post_focus_in_parallel(requests):
    """
    每个线程各自构造 TestClient（ASGI 进程内调用，非 socket HTTP），
    在 barrier 后同时发起 POST。

    requests: [(payload, headers), ...]，返回按请求顺序排列的 responses。
    """
    from fastapi.testclient import TestClient
    from app import app

    n = len(requests)
    responses = [None] * n
    errors = []
    barrier = threading.Barrier(n, timeout=60)

    def worker(index):
        payload, headers = requests[index]
        try:
            client = TestClient(app)
            barrier.wait()
            responses[index] = client.post(
                "/api/focus/sessions", json=payload, headers=headers
            )
        except Exception as exc:  # pragma: no cover - 只在失败时出现
            errors.append(f"thread-{index}: {exc!r}")

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)
    assert not errors, f"并发请求线程出错: {errors}"
    return responses


def _make_focus_payload(task_id, client_session_id=None, duration=1500, **overrides):
    now = datetime.now()
    payload = {
        "type": "pomodoro",
        "duration": duration,
        "started_at": (now - timedelta(minutes=25)).isoformat(),
        "ended_at": now.isoformat(),
    }
    if task_id is not None:
        payload["task_id"] = task_id
    if client_session_id is not None:
        payload["client_session_id"] = client_session_id
    payload.update(overrides)
    return payload


def _create_task(client, headers, title="Concurrent focus task"):
    resp = client.post("/api/tasks", json={"title": title}, headers=headers)
    assert resp.status_code == 200
    return resp.json()["id"]


def _count_sessions(concurrent_env, user_id, client_session_id):
    from database.models import FocusSessionModel

    with sessionmaker(bind=concurrent_env)() as session:
        return (
            session.query(func.count(FocusSessionModel.id))
            .filter(
                FocusSessionModel.user_id == user_id,
                FocusSessionModel.client_session_id == client_session_id,
            )
            .scalar()
        )


def _load_task(concurrent_env, task_id):
    from database.models import TaskModel

    with sessionmaker(bind=concurrent_env)() as session:
        return session.query(TaskModel).filter(TaskModel.id == task_id).first()


def _delete_focus_in_parallel(session_ids, headers, barrier_timeout=60):
    """
    多个线程各自构造 TestClient（ASGI 进程内调用），barrier 后同时
    DELETE 给定记录。返回按输入顺序排列的 responses。
    """
    from fastapi.testclient import TestClient
    from app import app

    n = len(session_ids)
    responses = [None] * n
    errors = []
    barrier = threading.Barrier(n, timeout=barrier_timeout)

    def worker(index):
        try:
            client = TestClient(app)
            barrier.wait()
            responses[index] = client.delete(
                f"/api/focus/sessions/{session_ids[index]}", headers=headers
            )
        except Exception as exc:  # pragma: no cover - 只在失败时出现
            errors.append(f"thread-{index}: {exc!r}")

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=120)
    assert not errors, f"并发删除线程出错: {errors}"
    return responses


def test_concurrent_same_key_creates_one_session_and_counts_once(
    app_client, concurrent_env
):
    """
    同幂等键 4 路进程内并发 + 同载荷再次提交（first-write-wins）。

    4 个线程同时 POST 同一 client_session_id；随后用新的 TestClient
    以同一载荷再次提交，近似"重试"在服务端可见的那一半。注意这只验证
    API 层幂等，不是 socket 层的"POST 已提交但响应丢失"，也不是桌面
    进程持久化队列后重启重发的链路。全程只允许一条记录，任务与
    overview 统计只增加一次。
    """
    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers)
    client_session_id = str(uuid.uuid4())
    payload = _make_focus_payload(task_id, client_session_id)

    responses = _post_focus_in_parallel([(payload, headers)] * 4)
    assert [r.status_code for r in responses] == [200] * 4
    ids = {r.json()["id"] for r in responses}
    assert len(ids) == 1, f"同键并发应返回同一条记录，实际: {ids}"
    assert all(
        r.json()["client_session_id"] == client_session_id for r in responses
    )

    # 同载荷再次提交：新的 TestClient 实例、同一幂等键（仅覆盖服务端
    # 可见的重复提交；真实丢包/重启见模块头注释）。
    retry_resp = app_client.post(
        "/api/focus/sessions", json=payload, headers=headers
    )
    assert retry_resp.status_code == 200
    assert retry_resp.json()["id"] == ids.pop()

    assert _count_sessions(concurrent_env, _CONCURRENT_USER, client_session_id) == 1

    task = _load_task(concurrent_env, task_id)
    assert task.pomodoro_count == 1
    assert task.focus_duration == 1500

    overview = app_client.get("/api/focus/overview", headers=headers).json()
    assert overview["total_pomodoro_count"] == 1
    assert overview["total_focus_duration"] == 1500


def test_concurrent_same_key_is_isolated_between_users(
    app_client, concurrent_env
):
    """
    相同 client_session_id 的两个用户同时 POST：各得一条记录，互不串台。
    唯一键是 (user_id, client_session_id) 复合键，同用户内去重、跨用户隔离。
    """
    headers_a = _headers_for_user(_CONCURRENT_USER)
    headers_b = _headers_for_user(_OTHER_USER)
    task_a = _create_task(app_client, headers_a, title="Task A")
    task_b = _create_task(app_client, headers_b, title="Task B")
    shared_key = str(uuid.uuid4())
    payload_a = _make_focus_payload(task_a, shared_key, duration=600)
    payload_b = _make_focus_payload(task_b, shared_key, duration=900)

    responses = _post_focus_in_parallel(
        [(payload_a, headers_a)] * 2 + [(payload_b, headers_b)] * 2
    )
    assert all(r.status_code == 200 for r in responses)
    assert _count_sessions(concurrent_env, _CONCURRENT_USER, shared_key) == 1
    assert _count_sessions(concurrent_env, _OTHER_USER, shared_key) == 1

    task_a_row = _load_task(concurrent_env, task_a)
    assert (task_a_row.pomodoro_count, task_a_row.focus_duration) == (1, 600)
    task_b_row = _load_task(concurrent_env, task_b)
    assert (task_b_row.pomodoro_count, task_b_row.focus_duration) == (1, 900)


def test_concurrent_distinct_keys_same_task_keep_all_counts(
    app_client, concurrent_env
):
    """
    回归：不同幂等键、同一任务的多线程并发提交不得丢失计数。

    旧实现用 ORM 读旧值再加再回写（task.focus_duration = old + duration），
    并发时会丢失更新；现在使用 SQL 原子增量
    （SET focus_duration = coalesce(focus_duration, 0) + :d），
    每轮 barrier 同步的 4 并发必须全部生效。
    """
    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers, title="Shared counters task")

    rounds = 3
    per_round = 4
    duration = 100
    for round_index in range(rounds):
        responses = _post_focus_in_parallel(
            [
                (
                    _make_focus_payload(
                        task_id, str(uuid.uuid4()), duration=duration
                    ),
                    headers,
                )
                for _ in range(per_round)
            ]
        )
        assert [r.status_code for r in responses] == [200] * per_round
        ids = {r.json()["id"] for r in responses}
        assert len(ids) == per_round, f"第 {round_index} 轮出现重复/丢失记录: {ids}"

    total = rounds * per_round
    task = _load_task(concurrent_env, task_id)
    assert task.pomodoro_count == total
    assert task.focus_duration == total * duration

    overview = app_client.get("/api/focus/overview", headers=headers).json()
    assert overview["total_pomodoro_count"] == total
    assert overview["total_focus_duration"] == total * duration


def test_sequential_deletes_after_concurrent_create_zero_counters(
    app_client, concurrent_env
):
    """并发创建 3 条、随后顺序逐条删除：原子减法令任务计数归零。

    诚实说明：删除是顺序发生的，本测试只回归"删除走 SQL 原子减法、
    与并发创建相加后精确归零"；同一记录的并发 DELETE 见
    test_concurrent_same_session_delete_deducts_once。
    """
    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers, title="Delete rollback task")

    responses = _post_focus_in_parallel(
        [
            (
                _make_focus_payload(task_id, str(uuid.uuid4()), duration=60),
                headers,
            )
            for _ in range(3)
        ]
    )
    assert [r.status_code for r in responses] == [200] * 3
    for resp in responses:
        assert app_client.delete(
            f"/api/focus/sessions/{resp.json()['id']}", headers=headers
        ).status_code == 200

    task = _load_task(concurrent_env, task_id)
    assert task.pomodoro_count == 0
    assert task.focus_duration == 0


def test_concurrent_same_session_delete_deducts_once(
    app_client, concurrent_env
):
    """
    回归（删除权唯一性）：同一记录的 4 路并发 DELETE 只允许一个成功。

    旧实现先 query 预读再回滚统计、最后 ORM delete() 且不检查影响
    行数：两个都预读到记录的并发请求会各自扣一遍同一条记录的统计，
    等于把另一条仍存活记录的计数也吃掉。这里同一任务上创建 A(100s)
    与 B(600s) 两条记录，对 A 并发 DELETE 四次后先验证中间态：只有
    一次扣减发生，B 的统计仍完整保留（pomodoro_count==1、
    focus_duration==600）；再删除 B 后计数精确归零，说明扣减既不少
    也不重。重复删除者得到 404。
    """
    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers, title="Dedup delete task")

    resp_a = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(task_id, str(uuid.uuid4()), duration=100),
        headers=headers,
    )
    resp_b = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(task_id, str(uuid.uuid4()), duration=600),
        headers=headers,
    )
    assert resp_a.status_code == 200 and resp_b.status_code == 200
    session_a = resp_a.json()["id"]
    session_b = resp_b.json()["id"]

    responses = _delete_focus_in_parallel([session_a] * 4, headers)
    statuses = sorted(r.status_code for r in responses)
    assert statuses == [200, 404, 404, 404], (
        f"同记录并发 DELETE 必须恰有一个 200，实际: {statuses}"
    )

    # 中间态：A 只被扣了一次，B 的 600 秒/1 个番茄仍在统计里。
    task = _load_task(concurrent_env, task_id)
    assert task.pomodoro_count == 1
    assert task.focus_duration == 600

    assert app_client.delete(
        f"/api/focus/sessions/{session_b}", headers=headers
    ).status_code == 200
    task = _load_task(concurrent_env, task_id)
    assert task.pomodoro_count == 0
    assert task.focus_duration == 0

    # 记录本体确实被物理删除，重复删除者不会误留半删状态。
    overview = app_client.get("/api/focus/overview", headers=headers).json()
    assert overview["total_pomodoro_count"] == 0
    assert overview["total_focus_duration"] == 0


def test_keyed_permanently_deleted_task_returns_404_soft_deleted_accepted(
    app_client, concurrent_env
):
    """
    删除语义：软删除（进垃圾箱）任务仍可关联专注记录并累计统计（保留既有
    行为）；显式 key 请求在任务永久删除后返回 404，不静默改为独立记录。
    """
    headers = _headers_for_user(_CONCURRENT_USER)
    task_id = _create_task(app_client, headers, title="Trash then purge task")

    # 软删除：任务进入垃圾箱，专注记录仍可创建并统计。
    assert app_client.delete(
        f"/api/tasks/{task_id}", headers=headers
    ).status_code == 200
    soft_resp = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(task_id, str(uuid.uuid4())),
        headers=headers,
    )
    assert soft_resp.status_code == 200
    soft_task = _load_task(concurrent_env, task_id)
    assert soft_task.deleted_at is not None
    assert (soft_task.pomodoro_count, soft_task.focus_duration) == (1, 1500)

    # 永久删除：行被物理删除，之后新 key 引用同任务提交必须 404。
    assert app_client.delete(
        f"/api/tasks/{task_id}/permanent", headers=headers
    ).status_code == 200
    gone_resp = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(task_id, str(uuid.uuid4())),
        headers=headers,
    )
    assert gone_resp.status_code == 404

    # 新 key 引用未知任务同样 404。
    unknown_resp = app_client.post(
        "/api/focus/sessions",
        json=_make_focus_payload(str(uuid.uuid4()), str(uuid.uuid4())),
        headers=headers,
    )
    assert unknown_resp.status_code == 404


def test_migrate_tables_failure_raises_and_blocks_startup(tmp_path, monkeypatch):
    """
    迁移失败必须阻止启动：唯一索引创建失败时 migrate_tables 向上抛异常，
    而 app.py 的 startup 事件不做吞异常处理，应用会启动失败，避免在缺少
    幂等约束的库上继续服务。
    """
    legacy_engine = create_engine(f"sqlite:///{tmp_path / 'migrate_fail.db'}")
    with legacy_engine.begin() as connection:
        connection.execute(text(
            """
            CREATE TABLE focus_sessions (
                id VARCHAR(36) PRIMARY KEY,
                user_id VARCHAR(36) NOT NULL,
                task_id VARCHAR(36),
                type VARCHAR(20) NOT NULL,
                duration INTEGER,
                started_at VARCHAR(50),
                ended_at VARCHAR(50),
                created_at VARCHAR(50)
            )
            """
        ))

    from database.connection import db_connection

    real_text = sqlalchemy.text

    def failing_text(statement, *args, **kwargs):
        if "uq_focus_sessions_user_client_session" in str(statement):
            raise RuntimeError("simulated unique index failure")
        return real_text(statement, *args, **kwargs)

    original_engine = db_connection.engine
    db_connection.engine = legacy_engine
    try:
        monkeypatch.setattr(sqlalchemy, "text", failing_text)
        with pytest.raises(RuntimeError, match="simulated unique index failure"):
            db_connection.migrate_tables()
    finally:
        db_connection.engine = original_engine
        monkeypatch.setattr(sqlalchemy, "text", real_text)
        legacy_engine.dispose()
