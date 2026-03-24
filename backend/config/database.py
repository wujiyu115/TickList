# -*- coding: utf-8 -*-

from .config_loader import config


class DatabaseConfig:
    """数据库配置管理"""
    
    def __init__(self):
        self.environment = config.get_environment()
    
    def get_database_url(self) -> str:
        """获取数据库连接URL"""
        return config.get_database_url()
    
    def get_database_type(self) -> str:
        """获取数据库类型"""
        return config.get('database.type', 'sqlite', 'DATABASE_TYPE')


# 全局配置实例
db_config = DatabaseConfig()
