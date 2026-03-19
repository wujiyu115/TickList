# -*- coding: utf-8 -*-

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from typing import Optional
import logging
from config.database import db_config, share_db_config

from utils.logger import logger

class MongoDBConnection:
    """MongoDB连接管理器"""
    
    _instance: Optional['MongoDBConnection'] = None
    _client: Optional[MongoClient] = None
    _database: Optional[Database] = None
    
    def __new__(cls) -> 'MongoDBConnection':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._client is None:
            self._connect()
    
    def _connect(self):
        """建立数据库连接"""
        try:
            uri = db_config.get_mongodb_uri()
            database_name = db_config.get_database_name()
            
            logger.info(f"Connecting to MongoDB: {database_name}")
            
            self._client = MongoClient(uri)
            self._database = self._client[database_name]
            
            # 测试连接
            self._client.admin.command('ping')
            logger.info("MongoDB connection established successfully")
            
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    
    def get_database(self) -> Database:
        """获取数据库实例"""
        if self._database is None:
            self._connect()
        return self._database
    
    def get_collection(self, collection_name: str) -> Collection:
        """获取集合实例"""
        database = self.get_database()
        return database[collection_name]
    
    def close(self):
        """关闭数据库连接"""
        if self._client:
            self._client.close()
            self._client = None
            self._database = None
            logger.info("MongoDB connection closed")
    
    def is_connected(self) -> bool:
        """检查连接状态"""
        try:
            if self._client:
                self._client.admin.command('ping')
                return True
        except Exception:
            pass
        return False

class ShareDbConnection():
    """ShareDb连接管理器"""
    
    _instance: Optional['ShareDbConnection'] = None
    _client: Optional[MongoClient] = None
    _database: Optional[Database] = None
    
    def __new__(cls) -> 'ShareDbConnection':
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def get_connect(self, region, dataType):
        """建立数据库连接"""
        try:
            uri = share_db_config.get_mongodb_uri(region, dataType)
            
            client = MongoClient(uri)
        
            # 测试连接
            client.admin.command('ping')
            logger.info("ShareDb connection established successfully")
            return client
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise
    
# 全局连接实例
mongo_connection = MongoDBConnection()
# 测试环境kun使用sharedb
share_db_connection = ShareDbConnection()

def get_database() -> Database:
    """获取数据库实例的便捷函数"""
    return mongo_connection.get_database()

def get_collection(collection_name: str) -> Collection:
    """获取集合实例的便捷函数"""
    return mongo_connection.get_collection(collection_name)

def get_share_db_connect(region: str, dataType: str) -> MongoClient:
    """获取共享数据库实例的便捷函数"""
    return share_db_connection.get_connect(region, dataType)