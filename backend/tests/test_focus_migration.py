# -*- coding: utf-8 -*-
"""Focus schema migration regressions, independent of API/DAO tests.

SQLite cases use disposable file databases and NullPool, never StaticPool or
production data. The two-worker DDL barriers force stale schema observations
without sleeps. MySQL catalog cases below are synthetic unit tests, NOT MySQL
integration tests; no live MySQL migration guarantee is claimed here.
"""

import sqlite3
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event, Lock
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
import sqlalchemy
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.pool import NullPool

from database.connection import DatabaseConnection


TABLE = "focus_sessions"
KEY = "uq_focus_sessions_user_client_session"
COLUMN_DDL = "ALTER TABLE focus_sessions ADD COLUMN client_session_id VARCHAR(128)"
KEY_DDL = (
    f"CREATE UNIQUE INDEX {KEY} "
    "ON focus_sessions (user_id, client_session_id)"
)
HISTORY_COLUMNS = (
    "id, user_id, task_id, type, duration, started_at, ended_at, created_at"
)


@pytest.fixture
def file_engines(tmp_path):
    engines = []

    def make(name="focus.db"):
        engine = create_engine(
            f"sqlite:///{tmp_path / name}",
            connect_args={"check_same_thread": False, "timeout": 10},
            poolclass=NullPool,
        )
        engines.append(engine)
        return engine

    yield make
    for engine in engines:
        engine.dispose()


def _manager(engine):
    # Bypass the global singleton without changing its engine/SessionLocal.
    manager = object.__new__(DatabaseConnection)
    manager.engine = engine
    return manager


def _legacy(engine, client_definition=None, constraint=None):
    extra = ""
    if client_definition is not None:
        extra += f", client_session_id {client_definition}"
    if constraint is not None:
        extra += f", {constraint}"
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE focus_sessions ("
            "id VARCHAR(36) PRIMARY KEY, user_id VARCHAR(36) NOT NULL, "
            "task_id VARCHAR(36), type VARCHAR(20) NOT NULL, duration INTEGER, "
            "started_at VARCHAR(50), ended_at VARCHAR(50), created_at VARCHAR(50)"
            f"{extra})"
        ))
        conn.execute(text(
            f"INSERT INTO focus_sessions ({HISTORY_COLUMNS}) VALUES "
            "('old-a', 'user-a', 'task-a', 'pomodoro', 120, 'start', 'end', 'created'), "
            "('old-b', 'user-a', NULL, 'stopwatch', 90, 'start', 'end', 'created')"
        ))


def _history(engine):
    with engine.connect() as conn:
        return conn.execute(text(
            f"SELECT {HISTORY_COLUMNS} FROM focus_sessions ORDER BY id"
        )).all()


def _schema(engine):
    with engine.connect() as conn:
        return conn.exec_driver_sql(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE tbl_name = 'focus_sessions' ORDER BY type, name"
        ).all()


def _assert_schema(engine):
    columns = {col["name"]: col for col in inspect(engine).get_columns(TABLE)}
    assert columns["client_session_id"]["nullable"] is True
    assert isinstance(columns["client_session_id"]["type"], sqlalchemy.String)
    assert columns["client_session_id"]["type"].length == 128
    # Independent catalog assertions, not just the production predicate.
    with engine.connect() as conn:
        keys = []
        for index in conn.exec_driver_sql('PRAGMA index_list("focus_sessions")').mappings():
            name = conn.dialect.identifier_preparer.quote_identifier(index["name"])
            parts = conn.exec_driver_sql(f"PRAGMA index_xinfo({name})").mappings().all()
            key_parts = [part for part in parts if part["key"] == 1]
            if (
                index["unique"] == 1 and index["partial"] == 0
                and len(key_parts) == 2
                and {part["name"] for part in key_parts} == {"user_id", "client_session_id"}
                and all(part["cid"] >= 0 and part["coll"] == "BINARY" for part in key_parts)
            ):
                keys.append(index["name"])
        assert len(keys) == 1
    return keys[0]


def _assert_key_semantics(engine):
    statement = text(
        "INSERT INTO focus_sessions (id, user_id, type, client_session_id) "
        "VALUES (:id, :user, 'pomodoro', :key)"
    )
    with engine.begin() as conn:
        conn.execute(statement, [
            {"id": "key-a", "user": "user-a", "key": "retry-key"},
            {"id": "key-b", "user": "user-b", "key": "retry-key"},
            {"id": "null-a", "user": "user-a", "key": None},
            {"id": "null-b", "user": "user-a", "key": None},
        ])
    with pytest.raises(IntegrityError):
        with engine.begin() as conn:
            conn.execute(statement, {"id": "retry", "user": "user-a", "key": "retry-key"})


def test_legacy_migration_repeated_across_connections_preserves_history(file_engines):
    engine = file_engines()
    _legacy(engine)
    before = _history(engine)
    for _ in range(3):
        _manager(file_engines()).migrate_tables()
        assert _history(engine) == before
        assert _assert_schema(engine) == KEY
    with engine.connect() as conn:
        assert conn.execute(text(
            "SELECT client_session_id FROM focus_sessions ORDER BY id"
        )).scalars().all() == [None, None]
    _assert_key_semantics(engine)


@pytest.mark.parametrize("constraint", [False, True], ids=["index", "table-constraint"])
@pytest.mark.parametrize("columns", [
    "user_id, client_session_id", "client_session_id, user_id",
], ids=["forward", "reverse"])
def test_equivalent_different_name_is_reused_without_ddl(file_engines, constraint, columns):
    engine = file_engines()
    _legacy(
        engine,
        "VARCHAR(128)",
        f"CONSTRAINT existing_focus_key UNIQUE ({columns})" if constraint else None,
    )
    if not constraint:
        with engine.begin() as conn:
            conn.execute(text(f"CREATE UNIQUE INDEX existing_focus_key ON {TABLE} ({columns})"))
    before, schema_before = _history(engine), _schema(engine)
    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", capture)
    for _ in range(3):
        _manager(engine).migrate_tables()
    assert not any(sql.upper().startswith(("ALTER ", "CREATE ", "DROP ")) for sql in statements)
    assert _schema(engine) == schema_before
    assert _history(engine) == before
    assert _assert_schema(engine) != KEY
    _assert_key_semantics(engine)


@pytest.mark.parametrize("index_sql", [
    f"CREATE INDEX {KEY} ON {TABLE} (user_id, client_session_id)",
    f"CREATE UNIQUE INDEX {KEY} ON {TABLE} (user_id, id)",
    f"CREATE UNIQUE INDEX {KEY} ON {TABLE} (user_id, client_session_id, id)",
    f"CREATE UNIQUE INDEX {KEY} ON {TABLE} (user_id, client_session_id) WHERE duration > 0",
    f"CREATE UNIQUE INDEX {KEY} ON {TABLE} (user_id, lower(client_session_id))",
    f"CREATE UNIQUE INDEX {KEY} ON {TABLE} (user_id, client_session_id COLLATE NOCASE)",
], ids=["non-unique", "wrong-columns", "extra-column", "partial", "expression", "collation"])
@pytest.mark.parametrize("other_correct_key", [False, True])
def test_conflicting_named_index_fails_closed_and_is_not_replaced(
    file_engines, index_sql, other_correct_key,
):
    engine = file_engines()
    _legacy(engine, "VARCHAR(128)")
    with engine.begin() as conn:
        conn.execute(text(index_sql))
        if other_correct_key:
            conn.execute(text(
                f"CREATE UNIQUE INDEX correct_other_name ON {TABLE} (user_id, client_session_id)"
            ))
    before, schema_before = _history(engine), _schema(engine)
    for _ in range(2):
        with pytest.raises(RuntimeError, match="Conflicting focus index"):
            _manager(engine).migrate_tables()
        assert _schema(engine) == schema_before
        assert _history(engine) == before


def test_conflicting_named_table_constraint_fails_closed(file_engines):
    engine = file_engines()
    # SQLite hides a named table constraint behind an autoindex name; its
    # incompatible definition must still abort rather than create another key.
    _legacy(engine, "VARCHAR(128)", f"CONSTRAINT {KEY} UNIQUE (id, client_session_id)")
    before = _schema(engine)
    # Inspect reflected constraint names too: an autoindex name must not hide a
    # conflicting explicitly named constraint.
    with pytest.raises(RuntimeError, match="Conflicting focus index"):
        _manager(engine).migrate_tables()
    assert _schema(engine) == before


@pytest.mark.parametrize("definition", [
    "INTEGER", "VARCHAR(16)", "VARCHAR(128) NOT NULL DEFAULT ''",
    "VARCHAR(128) DEFAULT 'shared-key'",
    "VARCHAR(128) GENERATED ALWAYS AS (id) VIRTUAL",
], ids=["wrong-type", "too-short", "not-null", "key-default", "generated"])
def test_incompatible_existing_column_is_not_rewritten(file_engines, definition):
    engine = file_engines()
    _legacy(engine, definition)
    before, schema_before = _history(engine), _schema(engine)
    with pytest.raises(RuntimeError, match="Invalid required focus_sessions.client_session_id"):
        _manager(engine).migrate_tables()
    assert _schema(engine) == schema_before
    assert _history(engine) == before


@pytest.mark.parametrize("with_column", [False, True], ids=["column-and-index", "index-only"])
def test_two_real_connections_recover_concurrent_required_ddl(
    file_engines, monkeypatch, with_column,
):
    engines = [file_engines(), file_engines()]
    _legacy(engines[0], "VARCHAR(128)" if with_column else None)
    before = _history(engines[0])
    phases = [KEY_DDL] if with_column else [COLUMN_DDL, KEY_DDL]
    barriers = {sql: Barrier(2, timeout=15) for sql in phases}
    committed = {sql: Event() for sql in phases}
    real_ddl = DatabaseConnection._run_focus_ddl
    connections, failures, rollbacks = {}, [], []
    guard = Lock()

    def ddl_with_barrier(conn, statement, postcondition):
        worker = engines.index(conn.engine)
        with guard:
            connections[worker] = conn.connection.driver_connection
        # Both workers have already observed this required object missing.
        barriers[statement].wait()
        if worker == 1:
            assert committed[statement].wait(15), "winner failed to commit required DDL"
        try:
            # The loser issues genuine duplicate DDL through its own DBAPI
            # connection, then must rollback and re-reflect to recover.
            return real_ddl(conn, statement, postcondition)
        finally:
            if worker == 0:
                committed[statement].set()

    def capture_failure(context):
        with guard:
            failures.append((context.connection.engine, context.statement, context.original_exception))

    def capture_rollback(conn):
        with guard:
            rollbacks.append(conn.engine)

    monkeypatch.setattr(DatabaseConnection, "_run_focus_ddl", staticmethod(ddl_with_barrier))
    for engine in engines:
        event.listen(engine, "handle_error", capture_failure)
        event.listen(engine, "rollback", capture_rollback)
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(_manager(engine).migrate_tables) for engine in engines]
        for future in futures:
            future.result(timeout=60)
    assert connections[0] is not connections[1]
    assert [(engine, sql) for engine, sql, _ in failures] == [
        (engines[1], sql) for sql in phases
    ]
    assert all(isinstance(error, sqlite3.OperationalError) for _, _, error in failures)
    assert rollbacks.count(engines[1]) >= len(phases)
    assert _history(engines[0]) == before
    assert _assert_schema(engines[0]) == KEY
    # A third independent connection must see the committed postconditions.
    _manager(file_engines()).migrate_tables()
    _assert_key_semantics(engines[0])


@pytest.mark.parametrize("statement", [COLUMN_DDL, KEY_DDL], ids=["column", "index"])
@pytest.mark.parametrize("reason", ["permission denied", "database is locked"])
@pytest.mark.asyncio
async def test_ddl_failure_rolls_back_preserves_history_and_blocks_startup(
    file_engines, monkeypatch, statement, reason,
):
    import app as app_module

    engine = file_engines()
    _legacy(engine, "VARCHAR(128)" if statement == KEY_DDL else None)
    before, schema_before = _history(engine), _schema(engine)
    rollback_seen = Event()
    real_inspect = sqlalchemy.inspect
    reinspected = []
    failed = Event()

    def fail_ddl(conn, cursor, sql, parameters, context, executemany):
        if sql == statement:
            failed.set()
            raise OperationalError(sql, parameters, RuntimeError(reason))

    def observe_inspect(bind, *args, **kwargs):
        if failed.is_set():
            assert rollback_seen.is_set(), "reflection must follow rollback"
            reinspected.append(bind)
        return real_inspect(bind, *args, **kwargs)

    event.listen(engine, "before_cursor_execute", fail_ddl)
    event.listen(engine, "rollback", lambda conn: rollback_seen.set())
    monkeypatch.setattr(sqlalchemy, "inspect", observe_inspect)
    # Keep the actual startup ordering, but isolate unrelated table creation
    # and avoid touching the global test singleton or starting background jobs.
    monkeypatch.setattr(app_module, "db_connection", SimpleNamespace(
        create_tables=lambda: None, migrate_tables=_manager(engine).migrate_tables,
    ))
    start = Mock()
    monkeypatch.setattr(app_module.scheduler_service, "start", start)
    with pytest.raises(OperationalError, match=reason):
        await app_module.startup_event()
    start.assert_not_called()
    assert rollback_seen.is_set()
    assert reinspected
    assert _schema(engine) == schema_before
    assert _history(engine) == before


@pytest.mark.parametrize("statement", [COLUMN_DDL, KEY_DDL], ids=["column", "index"])
def test_silent_noop_ddl_cannot_report_success(file_engines, monkeypatch, statement):
    engine = file_engines()
    _legacy(engine, "VARCHAR(128)" if statement == KEY_DDL else None)
    before, schema_before = _history(engine), _schema(engine)
    real_text = sqlalchemy.text

    def noop_ddl(sql, *args, **kwargs):
        return real_text("SELECT 1" if sql == statement else sql, *args, **kwargs)

    monkeypatch.setattr(sqlalchemy, "text", noop_ddl)
    with pytest.raises(RuntimeError, match="postcondition failed"):
        _manager(engine).migrate_tables()
    assert _schema(engine) == schema_before
    assert _history(engine) == before


@pytest.mark.parametrize("reverse", [False, True])
def test_existing_duplicate_keys_are_never_deleted_or_rekeyed(file_engines, reverse):
    engine = file_engines()
    _legacy(engine, "VARCHAR(128)")
    ids = ["old-a", "old-b"]
    if reverse:
        ids.reverse()
    with engine.begin() as conn:
        for row_id in ids:
            conn.execute(text(
                "UPDATE focus_sessions SET client_session_id = 'duplicate' WHERE id = :id"
            ), {"id": row_id})
    before, schema_before = _history(engine), _schema(engine)
    for _ in range(2):
        with pytest.raises(IntegrityError):
            _manager(engine).migrate_tables()
        assert _history(engine) == before
        assert _schema(engine) == schema_before
        with engine.connect() as conn:
            assert conn.execute(text(
                "SELECT client_session_id FROM focus_sessions ORDER BY id"
            )).scalars().all() == ["duplicate", "duplicate"]


def test_final_success_path_rechecks_schema_after_ddl(file_engines, monkeypatch):
    engine = file_engines()
    _legacy(engine, "VARCHAR(128)")
    before = _history(engine)
    real_ddl = DatabaseConnection._run_focus_ddl

    def remove_after_ddl(conn, statement, postcondition):
        real_ddl(conn, statement, postcondition)
        if statement == KEY_DDL:
            conn.execute(text(f"DROP INDEX {KEY}"))
            conn.commit()

    monkeypatch.setattr(DatabaseConnection, "_run_focus_ddl", staticmethod(remove_after_ddl))
    with pytest.raises(RuntimeError, match="Required focus schema postcondition failed"):
        _manager(engine).migrate_tables()
    assert _history(engine) == before


def _mysql_catalog(parts):
    # Synthetic SHOW INDEX records only; this is not a live MySQL connection.
    rows = SimpleNamespace(mappings=lambda: iter(parts))
    return SimpleNamespace(
        dialect=SimpleNamespace(name="mysql"),
        exec_driver_sql=lambda statement: rows,
    )


def _mysql_parts(name=KEY):
    return [
        {"Key_name": name, "Seq_in_index": position, "Column_name": column,
         "Non_unique": 0, "Sub_part": None, "Expression": None, "Index_type": "BTREE"}
        for position, column in enumerate(["user_id", "client_session_id"], 1)
    ]


@pytest.mark.parametrize("name", [KEY, "different_name"])
def test_mysql_catalog_unit_full_key_recognized_without_server(name):
    assert DatabaseConnection._focus_unique_key_ready(_mysql_catalog(_mysql_parts(name)))


@pytest.mark.parametrize("change", [
    {"Non_unique": 1}, {"Sub_part": 32}, {"Column_name": "id"},
    {"Column_name": None, "Expression": "lower(client_session_id)"},
], ids=["non-unique", "prefix", "wrong-column", "expression"])
def test_mysql_catalog_unit_conflict_rejected_without_server(change):
    parts = _mysql_parts()
    parts[1].update(change)
    with pytest.raises(RuntimeError, match="Conflicting focus index"):
        DatabaseConnection._focus_unique_key_ready(_mysql_catalog(parts))


def test_mysql_catalog_unit_other_name_prefix_is_not_an_equivalent_key():
    parts = _mysql_parts("prefix_only")
    parts[1]["Sub_part"] = 32
    assert DatabaseConnection._focus_unique_key_ready(_mysql_catalog(parts)) is False
