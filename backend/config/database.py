# -*- coding: utf-8 -*-

from typing import Dict, Any
from .config_loader import config

class DatabaseConfig:
    """数据库配置管理"""
    
    def __init__(self):
        self.environment = config.get_environment()
        self.mongodb_config = config.get_mongodb_config()
    
    def get_mongodb_uri(self) -> str:
        """获取MongoDB连接URI"""
        config_data = self.mongodb_config
        
        # 构建认证部分
        auth_part = ""
        if config_data['username'] and config_data['password']:
            auth_part = f"{config_data['username']}:{config_data['password']}@"
        
        # 构建主机部分
        host_part = f"{config_data['host']}:{config_data['port']}"
        
        # 构建参数部分
        params = []
        if config_data['auth_source']:
            params.append(f"authSource={config_data['auth_source']}")
        if config_data['replica_set']:
            params.append(f"replicaSet={config_data['replica_set']}")
        if config_data['ssl']:
            params.append("ssl=true")
            params.append(f"ssl_cert_reqs={config_data['ssl_cert_reqs']}")
        
        params.append(f"connectTimeoutMS={config_data['connect_timeout']}")
        params.append(f"serverSelectionTimeoutMS={config_data['server_selection_timeout']}")
        params.append(f"maxPoolSize={config_data['max_pool_size']}")
        params.append(f"minPoolSize={config_data['min_pool_size']}")
        
        param_string = "&".join(params) if params else ""
        
        # 构建完整URI
        uri = f"mongodb://{auth_part}{host_part}/{config_data['database']}"
        if param_string:
            uri += f"?{param_string}"
        
        return uri
    
    def get_database_name(self) -> str:
        """获取数据库名称"""
        return self.mongodb_config['database']

class ShareDbConfig:
    def __init__(self):
        self.environment = config.get_environment()
        self.mongodb_config = config.get_sharedb_config()
    
    def get_mongodb_uri(self, region, dataType) -> str:
        """获取MongoDB连接URI"""
        config_data = self.mongodb_config
        config_by_region = config_data[region]
        if config_by_region.get(dataType):
            return config_by_region[dataType]
        return config_by_region["default"]
    
# 全局配置实例
db_config = DatabaseConfig()
# 测试环境kun使用sharedb
share_db_config = ShareDbConfig()