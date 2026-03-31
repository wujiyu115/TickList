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
                ('push_notified_date', 'VARCHAR(10)'),
                ('pomodoro_count', 'INTEGER DEFAULT 0'),
                ('focus_duration', 'INTEGER DEFAULT 0'),
            ],
            'countdowns': [
                ('push_due_notify', 'BOOLEAN DEFAULT 0'),
                ('push_notified_date', 'VARCHAR(10)'),
            ],
            'user_settings': [
                ('push_enabled', 'BOOLEAN DEFAULT 0'),
                ('push_channels', 'TEXT DEFAULT "[]"'),
                ('push_interval', 'INTEGER DEFAULT 30'),
                ('push_batch_size', 'INTEGER DEFAULT 5'),
                ('focus_min_duration', 'INTEGER DEFAULT 5'),
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
