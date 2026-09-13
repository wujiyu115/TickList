# -*- coding: utf-8 -*-

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase
from typing import Optional
from config.config_loader import ConfigLoader
from utils.logger import logger


class Base(DeclarativeBase):
    """SQLAlchemy 声明式基类"""
    pass


class DatabaseConnection:
    """SQLAlchemy 数据库连接管理器（单例模式）"""
    
    _instance: Optional['DatabaseConnection'] = None
    
    def __new__(cls) -> 'DatabaseConnection':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        config_loader = ConfigLoader()
        database_url = config_loader.get_database_url()
        
        logger.info(f"Connecting to database: {database_url.split('@')[-1] if '@' in database_url else database_url}")
        
        # 根据连接字符串判断数据库类型
        if database_url.startswith('sqlite'):
            # SQLite 特殊配置：支持多线程
            self.engine = create_engine(
                database_url,
                echo=False,
                connect_args={"check_same_thread": False}
            )
        else:
            # MySQL 配置：连接池
            self.engine = create_engine(
                database_url,
                echo=False,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20
            )
        
        self.SessionLocal = sessionmaker(
            bind=self.engine,
            autocommit=False,
            autoflush=False
        )
        
        self._initialized = True
        logger.info("Database connection initialized successfully")
    
    def get_session(self) -> Session:
        """获取数据库会话"""
        return self.SessionLocal()
    
    def create_tables(self):
        """创建所有表"""
        # 需要先导入所有模型，确保它们被注册到 Base.metadata
        from database import models  # noqa: F401
        Base.metadata.create_all(self.engine)
        logger.info("Database tables created successfully")
    
    def migrate_tables(self):
        """检查并添加缺失的列（兼容已有数据库）"""
        from sqlalchemy import inspect, text
        
        inspector = inspect(self.engine)
        
        # 定义需要检查的列 { table_name: [(column_name, column_definition)] }
        migrations = {
            'tasks': [
                ('push_due_notify', 'BOOLEAN DEFAULT 0'),
                ('push_notified_date', 'VARCHAR(32)'),
                ('pomodoro_count', 'INTEGER DEFAULT 0'),
                ('focus_duration', 'INTEGER DEFAULT 0'),
                ('deleted_at', 'VARCHAR(50)'),
                ('content', 'TEXT DEFAULT ""'),
            ],
            'countdowns': [
                ('push_due_notify', 'BOOLEAN DEFAULT 0'),
                ('push_notified_date', 'VARCHAR(32)'),
            ],
            'user_settings': [
                ('push_enabled', 'BOOLEAN DEFAULT 0'),
                ('push_channels', 'TEXT DEFAULT "[]"'),
                ('push_interval', 'INTEGER DEFAULT 30'),
                ('push_batch_size', 'INTEGER DEFAULT 5'),
                ('focus_min_duration', 'INTEGER DEFAULT 5'),
            ],
            'users': [
                ('is_frozen', 'BOOLEAN DEFAULT 0'),
            ],
            'task_lists': [
                ('font_color', 'VARCHAR(50)'),
                ('is_pinned', 'BOOLEAN DEFAULT 0'),
            ],
            'tokens': [
                ('family_id', 'VARCHAR(36)'),
                ('name', 'VARCHAR(200)'),
                ('last_used_at', 'VARCHAR(50)'),
            ],
        }
        
        with self.engine.connect() as conn:
            for table_name, columns in migrations.items():
                if table_name not in inspector.get_table_names():
                    continue  # 表不存在，create_tables 会创建
                
                existing_columns = {col['name'] for col in inspector.get_columns(table_name)}
                
                for col_name, col_def in columns:
                    if col_name not in existing_columns:
                        try:
                            conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}'))
                            conn.commit()
                            logger.info(f"Added column {col_name} to {table_name}")
                        except Exception as e:
                            logger.warning(f"Failed to add column {col_name} to {table_name}: {e}")

            self._migrate_focus_schema(conn)

    @staticmethod
    def _focus_column_ready(conn):
        """Fresh reflection only: the legacy path needs a nullable, full-size key."""
        from sqlalchemy import inspect, String

        if conn.dialect.name not in ('sqlite', 'mysql'):
            raise RuntimeError('Focus migration supports only SQLite and MySQL')
        inspector = inspect(conn)
        if not inspector.has_table('focus_sessions'):
            raise RuntimeError('Required focus_sessions table is missing')
        columns = {
            column['name']: column
            for column in inspector.get_columns('focus_sessions')
        }
        user = columns.get('user_id')
        if (
            user is None
            or not isinstance(user['type'], String)
            or user.get('nullable') is not False
            or user.get('computed') is not None
        ):
            raise RuntimeError('Invalid required focus_sessions.user_id column')
        client = columns.get('client_session_id')
        if client is None:
            return False
        # No automatic rewrite/backfill of incompatible existing columns. A
        # non-NULL default would also turn historical unkeyed requests into keys.
        column_type = client['type']
        default = client.get('default')
        if (
            not isinstance(column_type, String)
            or (column_type.length is not None and column_type.length < 128)
            or client.get('nullable') is not True
            or client.get('computed') is not None
            or (default is not None and str(default).strip().upper() != 'NULL')
        ):
            raise RuntimeError('Invalid required focus_sessions.client_session_id column')
        return True

    @staticmethod
    def _focus_unique_key_ready(conn):
        """Inspect definitions, not names; never drop an unrecognised object.

        SQLite reflection can omit expression indexes, so use its index catalog
        (including table UNIQUE autoindexes). MySQL SHOW INDEX exposes prefix
        lengths and functional key parts that a name-only constraint loses.
        Neither catalog result is cached across DDL or rollback.
        """
        expected_name = 'uq_focus_sessions_user_client_session'
        expected_columns = {'user_id', 'client_session_id'}
        keys = []
        sqlite_auto_keys = []
        if conn.dialect.name == 'sqlite':
            indexes = conn.exec_driver_sql(
                'PRAGMA index_list("focus_sessions")'
            ).mappings().all()
            for index in indexes:
                # Names come from the catalog, not from application constants.
                quoted_name = conn.dialect.identifier_preparer.quote_identifier(
                    index['name']
                )
                parts = conn.exec_driver_sql(
                    f'PRAGMA index_xinfo({quoted_name})'
                ).mappings().all()
                key_parts = [part for part in parts if part['key'] == 1]
                valid = (
                    index['unique'] == 1
                    and index['partial'] == 0
                    and len(key_parts) == 2
                    and {part['name'] for part in key_parts} == expected_columns
                    and all(
                        part['cid'] >= 0 and part['coll'].upper() == 'BINARY'
                        for part in key_parts
                    )
                )
                keys.append((index['name'], valid))
                if index['origin'] == 'u':
                    sqlite_auto_keys.append((
                        [part['name'] for part in key_parts], valid
                    ))
            # Named table constraints get sqlite_autoindex_* physical names.
            # Reflection supplies their logical names; require matching catalog
            # evidence rather than treating reflection alone as proof of a key.
            from sqlalchemy import inspect

            for constraint in inspect(conn).get_unique_constraints('focus_sessions'):
                name = constraint.get('name')
                if name is None:
                    continue
                columns = constraint.get('column_names') or []
                matches = [
                    valid for key_columns, valid in sqlite_auto_keys
                    if key_columns == columns
                ]
                keys.append((name, (
                    len(columns) == 2
                    and set(columns) == expected_columns
                    and bool(matches)
                    and all(matches)
                )))
        elif conn.dialect.name == 'mysql':
            indexes = {}
            for part in conn.exec_driver_sql(
                'SHOW INDEX FROM focus_sessions'
            ).mappings():
                indexes.setdefault(part['Key_name'], []).append(part)
            for name, parts in indexes.items():
                valid = (
                    len(parts) == 2
                    and {part['Column_name'] for part in parts} == expected_columns
                    and {part['Seq_in_index'] for part in parts} == {1, 2}
                    and all(
                        part['Non_unique'] == 0
                        and part['Sub_part'] is None
                        and part.get('Expression') is None
                        and part['Index_type'].upper() in ('BTREE', 'HASH')
                        for part in parts
                    )
                )
                keys.append((name, valid))
        else:
            raise RuntimeError('Focus migration supports only SQLite and MySQL')

        for name, valid in keys:
            if name.casefold() == expected_name.casefold() and not valid:
                raise RuntimeError(
                    f'Conflicting focus index {name}: expected a full unique key '
                    'on (user_id, client_session_id); refusing to replace it'
                )
        # Column order and object name do not change this uniqueness guarantee.
        return any(valid for _, valid in keys)

    @classmethod
    def _focus_schema_ready(cls, conn):
        column_ready = cls._focus_column_ready(conn)
        key_ready = cls._focus_unique_key_ready(conn)
        return column_ready and key_ready

    @staticmethod
    def _run_focus_ddl(conn, statement, postcondition):
        from sqlalchemy import text

        try:
            conn.execute(text(statement))
            conn.commit()
        except Exception:
            # Another worker may have committed exactly this DDL. Never infer
            # success from an error code/message: leave the failed transaction,
            # then re-inspect the actual database using a new inspector.
            conn.rollback()
            if not postcondition(conn):
                logger.error(f'Required focus migration failed: {statement}')
                raise
        if not postcondition(conn):
            raise RuntimeError(f'Focus migration postcondition failed: {statement}')

    def _migrate_focus_schema(self, conn):
        # Startup calls create_tables first. Missing/incompatible required
        # schema must abort startup, not advertise idempotency without a key.
        column_ready = self._focus_column_ready(conn)
        key_ready = self._focus_unique_key_ready(conn)
        if not column_ready:
            self._run_focus_ddl(
                conn,
                'ALTER TABLE focus_sessions ADD COLUMN client_session_id VARCHAR(128)',
                self._focus_column_ready,
            )
        if not key_ready:
            # The initial key snapshot may now be stale after concurrent DDL.
            if not self._focus_unique_key_ready(conn):
                self._run_focus_ddl(
                    conn,
                    'CREATE UNIQUE INDEX uq_focus_sessions_user_client_session '
                    'ON focus_sessions (user_id, client_session_id)',
                    self._focus_schema_ready,
                )
        if not self._focus_schema_ready(conn):
            raise RuntimeError('Required focus schema postcondition failed')
    
    def drop_tables(self):
        """删除所有表（谨慎使用）"""
        Base.metadata.drop_all(self.engine)
        logger.info("Database tables dropped")
    
    def close(self):
        """关闭数据库连接"""
        if hasattr(self, 'engine') and self.engine:
            self.engine.dispose()
            logger.info("Database connection closed")


# 全局连接实例
db_connection = DatabaseConnection()


def get_session() -> Session:
    """获取数据库会话的便捷函数"""
    return db_connection.get_session()


def get_db():
    """FastAPI 依赖注入用的会话生成器"""
    session = db_connection.get_session()
    try:
        yield session
    finally:
        session.close()
