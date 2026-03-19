# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError
from database.connection import get_collection
from database.table_names import USERS
from models import User
import bcrypt
from utils.logger import logger

class UserDAO:
    """用户数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(USERS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 创建用户名唯一索引
            self.collection.create_index("username", unique=True)
            # 创建ID索引
            self.collection.create_index("id", unique=True)
            # 创建用户组索引
            self.collection.create_index("role_group")
        except Exception as e:
            logger.warning(f"Failed to create indexes: {e}")
    
    def create_user(self, username: str, password: str = '', email: str = '', 
                   role_group: str = 'user', name: str = '') -> Dict:
        """创建用户"""
        try:
            user_id = username
            
            # 加密密码（如果提供）
            hashed_password = ''
            if password:
                hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            user_doc = {
                'id': user_id,
                'username': username,
                'password': hashed_password,
                'email': email,
                'role_group': role_group,
                'name': name or username,
                'created_at': User(user_id, username, hashed_password, email, role_group).created_at.isoformat()
            }
            
            result = self.collection.insert_one(user_doc)
            
            if result.inserted_id:
                logger.info(f"User created successfully: {username}")
                return self.find_by_username(username)
            else:
                raise Exception("Failed to insert user")
                
        except DuplicateKeyError:
            logger.warning(f"User already exists: {username}")
            raise ValueError(f"User with username '{username}' already exists")
        except Exception as e:
            logger.error(f"Failed to create user {username}: {e}")
            raise
    
    def find_by_id(self, user_id: str) -> Optional[Dict]:
        """根据ID查找用户"""
        try:
            user_doc = self.collection.find_one({'id': user_id})
            if user_doc:
                user_doc.pop('_id', None)
            return user_doc
        except Exception as e:
            logger.error(f"Failed to find user by id {user_id}: {e}")
            return None
    
    def find_by_username(self, username: str) -> Optional[Dict]:
        """根据用户名查找用户"""
        try:
            user_doc = self.collection.find_one({'username': username})
            if user_doc:
                user_doc.pop('_id', None)
            return user_doc
        except Exception as e:
            logger.error(f"Failed to find user by username {username}: {e}")
            return None
    
    def find_or_create_by_account(self, account: str, name: str, email: str = '') -> Dict:
        """根据账号查找或创建用户"""
        user = self.find_by_username(account)
        if not user:
            # 默认创建普通用户，可以通过配置文件设置管理员
            role_group = 'user'
            
            user = self.create_user(
                username=account,
                password='',  # One登录不需要密码
                email=email,
                role_group=role_group,
                name=name
            )
        return user
    
    def update_user(self, user_id: str, update_data: Dict) -> bool:
        """更新用户信息"""
        try:
            # 移除不允许更新的字段
            forbidden_fields = ['id', '_id', 'created_at']
            for field in forbidden_fields:
                update_data.pop(field, None)
            
            if not update_data:
                return True
            
            result = self.collection.update_one(
                {'id': user_id},
                {'$set': update_data}
            )
            
            success = result.modified_count > 0
            if success:
                logger.info(f"User updated successfully: {user_id}")
            else:
                logger.warning(f"No user updated for id: {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to update user {user_id}: {e}")
            return False
    
    def delete_user(self, user_id: str) -> bool:
        """删除用户"""
        try:
            result = self.collection.delete_one({'id': user_id})
            success = result.deleted_count > 0
            
            if success:
                logger.info(f"User deleted successfully: {user_id}")
            else:
                logger.warning(f"No user deleted for id: {user_id}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to delete user {user_id}: {e}")
            return False
    
    def list_users(self, skip: int = 0, limit: int = 100) -> List[Dict]:
        """获取用户列表"""
        try:
            cursor = self.collection.find({}).skip(skip).limit(limit)
            users = []
            for user_doc in cursor:
                user_doc.pop('_id', None)
                users.append(user_doc)
            return users
        except Exception as e:
            logger.error(f"Failed to list users: {e}")
            return []
    
    def find_by_role_group(self, role_group: str) -> List[Dict]:
        """根据用户组查找用户"""
        try:
            cursor = self.collection.find({'role_group': role_group})
            users = []
            for user_doc in cursor:
                user_doc.pop('_id', None)
                users.append(user_doc)
            return users
        except Exception as e:
            logger.error(f"Failed to find users by role_group {role_group}: {e}")
            return []
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """验证密码"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception as e:
            logger.error(f"Failed to verify password: {e}")
            return False

# 全局DAO实例
user_dao = UserDAO()
