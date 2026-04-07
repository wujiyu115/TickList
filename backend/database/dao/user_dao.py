# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from sqlalchemy.exc import IntegrityError
from database.connection import db_connection
from database.models import UserModel
import bcrypt
from datetime import datetime
from utils.logger import logger


class UserDAO:
    """用户数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: UserModel) -> Optional[Dict]:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        return {
            'id': model.id,
            'username': model.username,
            'password': model.password,
            'email': model.email,
            'name': model.name,
            'role_group': model.role_group,
            'is_frozen': model.is_frozen,
            'created_at': model.created_at
        }
    
    def create_user(self, username: str, password: str = '', email: str = '', 
                   role_group: str = 'user', name: str = '') -> Dict:
        """创建用户"""
        session = self._get_session()
        try:
            user_id = username
            
            # 加密密码（如果提供）
            hashed_password = ''
            if password:
                hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            
            user_model = UserModel(
                id=user_id,
                username=username,
                password=hashed_password,
                email=email,
                role_group=role_group,
                name=name or username,
                created_at=datetime.now().isoformat()
            )
            
            session.add(user_model)
            session.commit()
            
            logger.info(f"User created successfully: {username}")
            return self._model_to_dict(user_model)
                
        except IntegrityError:
            session.rollback()
            logger.warning(f"User already exists: {username}")
            raise ValueError(f"User with username '{username}' already exists")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create user {username}: {e}")
            raise
        finally:
            session.close()
    
    def find_by_id(self, user_id: str) -> Optional[Dict]:
        """根据ID查找用户"""
        session = self._get_session()
        try:
            user = session.query(UserModel).filter(UserModel.id == user_id).first()
            return self._model_to_dict(user)
        except Exception as e:
            logger.error(f"Failed to find user by id {user_id}: {e}")
            return None
        finally:
            session.close()
    
    def find_by_username(self, username: str) -> Optional[Dict]:
        """根据用户名查找用户"""
        session = self._get_session()
        try:
            user = session.query(UserModel).filter(UserModel.username == username).first()
            return self._model_to_dict(user)
        except Exception as e:
            logger.error(f"Failed to find user by username {username}: {e}")
            return None
        finally:
            session.close()
    
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
        session = self._get_session()
        try:
            # 移除不允许更新的字段
            forbidden_fields = ['id', 'created_at']
            for field in forbidden_fields:
                update_data.pop(field, None)
            
            if not update_data:
                return True
            
            result = session.query(UserModel).filter(UserModel.id == user_id).update(update_data)
            session.commit()
            
            success = result > 0
            if success:
                logger.info(f"User updated successfully: {user_id}")
            else:
                logger.warning(f"No user updated for id: {user_id}")
            
            return success
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to update user {user_id}: {e}")
            return False
        finally:
            session.close()
    
    def delete_user(self, user_id: str) -> bool:
        """删除用户"""
        session = self._get_session()
        try:
            result = session.query(UserModel).filter(UserModel.id == user_id).delete()
            session.commit()
            
            success = result > 0
            
            if success:
                logger.info(f"User deleted successfully: {user_id}")
            else:
                logger.warning(f"No user deleted for id: {user_id}")
            
            return success
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to delete user {user_id}: {e}")
            return False
        finally:
            session.close()
    
    def list_users(self, skip: int = 0, limit: int = 100) -> List[Dict]:
        """获取用户列表"""
        session = self._get_session()
        try:
            users = session.query(UserModel).offset(skip).limit(limit).all()
            return [self._model_to_dict(u) for u in users]
        except Exception as e:
            logger.error(f"Failed to list users: {e}")
            return []
        finally:
            session.close()
    
    def find_by_role_group(self, role_group: str) -> List[Dict]:
        """根据用户组查找用户"""
        session = self._get_session()
        try:
            users = session.query(UserModel).filter(UserModel.role_group == role_group).all()
            return [self._model_to_dict(u) for u in users]
        except Exception as e:
            logger.error(f"Failed to find users by role_group {role_group}: {e}")
            return []
        finally:
            session.close()
    
    def verify_password(self, password: str, hashed_password: str) -> bool:
        """验证密码"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception as e:
            logger.error(f"Failed to verify password: {e}")
            return False


# 全局DAO实例
user_dao = UserDAO()
