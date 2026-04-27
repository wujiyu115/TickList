# -*- coding: utf-8 -*-

import os
import yaml
from typing import Dict, Any, Optional
from utils.logger import logger

class ConfigLoader:
    """配置加载器"""
    
    def __init__(self, config_file: str = None):
        if config_file is None:
            # 默认配置文件路径
            config_file = os.getenv("CONFIG_FILE") or os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "config.yaml"
            )
        
        self.config_file = config_file
        self._config = None
        self._load_config()
    
    def _load_config(self):
        """加载配置文件"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                self._config = yaml.safe_load(f)
        except FileNotFoundError:
            print(f"Warning: Config file {self.config_file} not found, using default values")
            self._config = {}
        except yaml.YAMLError as e:
            print(f"Error parsing config file {self.config_file}: {e}")
            self._config = {}
    
    def get(self, key: str, default: Any = None, env_override: str = None) -> Any:
        """
        获取配置值，支持环境变量覆盖
        
        Args:
            key: 配置键，支持点号分隔的嵌套键，如 'mongodb.host'
            default: 默认值
            env_override: 环境变量名，如果提供则优先使用环境变量的值
        
        Returns:
            配置值
        """
        # 优先检查环境变量
        if env_override:
            env_value = os.getenv(env_override)
            if env_value is not None:
                # 尝试转换类型
                return self._convert_type(env_value, default)
        
        # 从配置文件获取值
        keys = key.split('.')
        value = self._config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        # logger.debug(
        #     f"Get config: key:{key} default:{default} env_override:{env_override} value:{value}"
        # )

        return value
    
    def _convert_type(self, value: str, reference_value: Any) -> Any:
        """根据参考值的类型转换字符串值"""
        if reference_value is None:
            return value
        
        if isinstance(reference_value, bool):
            return value.lower() in ('true', '1', 'yes', 'on')
        elif isinstance(reference_value, int):
            try:
                return int(value)
            except ValueError:
                return reference_value
        elif isinstance(reference_value, float):
            try:
                return float(value)
            except ValueError:
                return reference_value
        else:
            return value
    
    def get_environment(self) -> str:
        """获取当前环境"""
        return os.getenv("WORKFLOW_WEB_ENVIRONMENT", "production")
    
    def get_jwt_config(self) -> Dict[str, Any]:
        """获取JWT配置"""
        return {
            'secret_key': self.get('jwt.secret_key', 'jwt-secret-string', 'JWT_SECRET_KEY'),
            'algorithm': self.get('jwt.algorithm', 'HS256'),
            'access_token_expire_hours': self.get('jwt.access_token_expire_hours', 24)
        }
    
    def get_database_url(self) -> str:
        """获取数据库连接URL（SQLAlchemy格式）
        
        优先级：
        1. 环境变量 DB_CONNECT_STRING
        2. 配置文件 database.connect_string
        3. 默认值 sqlite:///ticklist.db
        """
        # 优先环境变量
        env_url = os.environ.get('DB_CONNECT_STRING')
        if env_url:
            return env_url
        # 从配置文件读取
        return self.get('database.connect_string', 'sqlite:///ticklist.db')
    
    def get_admin_username(self) -> str:
        """获取指定的管理员用户名"""
        return self.get('auth.admin_username', '', 'ADMIN_USERNAME')
    
    def is_register_enabled(self) -> bool:
        """是否开启注册功能"""
        value = self.get('auth.register_enabled', True, 'REGISTER_ENABLED')
        # 处理环境变量返回的字符串情况
        if isinstance(value, str):
            return value.lower() in ('true', '1', 'yes', 'on')
        return bool(value)
    
    def get_kun_config(self) -> Dict[str, Any]:
        """获取Kun SDK配置"""
        return {
            'schema': self.get('kun.schema', 'http', 'KUN_SCHEMA'),
            'host': self.get('kun.host', 'kun.ejoy.com', 'KUN_HOST'),
            'access_key_id': self.get('kun.access_key_id', '', 'KUN_ACCESS_KEY_ID'),
            'access_key_secret': self.get('kun.access_key_secret', '', 'KUN_ACCESS_KEY_SECRET'),
        }

    def get_backend_config(self) -> Dict[str, Any]:
        """获取Backend配置"""
        return {}

    def get_ai_config(self) -> Dict[str, Any]:
        """获取AI配置"""
        return {
            'provider': self.get('ai.provider', 'claude', 'AI_PROVIDER'),
            'api_key': self.get('ai.api_key', '', 'AI_API_KEY'),
            'model': self.get('ai.model', 'claude-sonnet-4-5-20250514', 'AI_MODEL'),
            'max_tokens': self.get('ai.max_tokens', 4096),
        }

    def get_logging_config(self) -> Dict[str, Any]:
        """获取日志配置"""
        return {
            'level': self.get('logging.level', 'DEBUG', 'LOG_LEVEL'),
            'console_level': self.get('logging.console_level', 'INFO', 'LOG_CONSOLE_LEVEL'),
            'file_level': self.get('logging.file_level', 'DEBUG', 'LOG_FILE_LEVEL'),
            'error_level': self.get('logging.error_level', 'ERROR', 'LOG_ERROR_LEVEL'),
            'log_dir': self.get('logging.log_dir', 'logs', 'LOG_DIR'),
        }

    def get_webauthn_rp_id(self) -> str:
        """获取 WebAuthn Relying Party ID"""
        return self.get('webauthn.rp_id', 'localhost', 'WEBAUTHN_RP_ID')

    def get_webauthn_rp_name(self) -> str:
        """获取 WebAuthn Relying Party 名称"""
        return self.get('webauthn.rp_name', 'TickList', 'WEBAUTHN_RP_NAME')

    def get_webauthn_origin(self) -> str:
        """获取 WebAuthn Origin"""
        return self.get('webauthn.origin', 'http://localhost:3000', 'WEBAUTHN_ORIGIN')

    def get_sharedb_config(self) -> Dict[str, Any]:
        return {
            "cn": {
                "server_season": "mongodb://47.107.64.84:34",
                "ba_data": "mongodb://47.107.64.84:34",
                "ba_ids": "mongodb://47.107.64.84:34",
                "default": "mongodb://47.107.64.84:43"
            },
            "oversea":{
                "server_season": "mongodb://47.242.70.8:30003",
                "ba_data": "mongodb://47.242.70.8:30003",
                "ba_ids": "mongodb://47.242.70.8:30003",
                "default": "mongodb://47.107.64.84:43"
            },
            "eu":{
                "server_season": "mongodb://47.242.70.8:30003",
                "ba_data": "mongodb://47.242.70.8:30003",
                "ba_ids": "mongodb://47.242.70.8:30003",
                "default": "mongodb://47.107.64.84:43"
            }
        }

# 全局配置实例
config = ConfigLoader()