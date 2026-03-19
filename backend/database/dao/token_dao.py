# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError
from database.connection import get_collection
from database.table_names import TOKENS
import uuid
from datetime import datetime, timedelta
from utils.logger import logger

class TokenDAO:
    """JWT Token数据访问对象"""
    
    def __init__(self):
        self.collection: Collection = get_collection(TOKENS)
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """确保索引存在"""
        try:
            # 创建token唯一索引
            self.collection.create_index("token", unique=True)
            # 创建jti索引，用于JWT验证
            self.collection.create_index("jti", unique=True)
            # 创建用户ID索引
            self.collection.create_index("user_id")
            # 创建过期时间索引，用于自动清理过期token
            self.collection.create_index("expires_at", expireAfterSeconds=0)
            # 创建创建时间索引
            self.collection.create_index("created_at")
        except Exception as e:
            logger.warning(f"Failed to create token indexes: {e}")
    
    def create_token(self, user_id: str, token: str, jti: str = None, expires_hours: int = 24) -> Dict:
        """创建并存储JWT token"""
        try:
            now = datetime.utcnow()
            expires_at = now + timedelta(hours=expires_hours)
            
            # 如果没有提供jti，生成一个
            if not jti:
                jti = f'jti-{str(uuid.uuid4())[:8]}'
            
            token_doc = {
                'id': f'token-{str(uuid.uuid4())[:8]}',
                'token': token,
                'jti': jti,
                'user_id': user_id,
                'created_at': now,
                'expires_at': expires_at,
                'is_active': True
            }
            
            result = self.collection.insert_one(token_doc)
            
            if result.inserted_id:
                logger.info(f"JWT token created successfully for user: {user_id}")
                token_doc.pop('_id', None)
                return token_doc
            else:
                raise Exception("Failed to insert JWT token")
                
        except DuplicateKeyError:
            logger.warning(f"JWT token already exists: {token[:20]}...")
            raise ValueError(f"JWT token already exists")
        except Exception as e:
            logger.error(f"Failed to create JWT token for user {user_id}: {e}")
            raise
    
    def find_by_token(self, token: str) -> Optional[Dict]:
        """根据token查找记录"""
        try:
            token_doc = self.collection.find_one({
                'token': token,
                'is_active': True,
                'expires_at': {'$gt': datetime.utcnow()}
            })
            if token_doc:
                token_doc.pop('_id', None)
            return token_doc
        except Exception as e:
            logger.error(f"Failed to find token: {e}")
            return None
    
    def find_by_jti(self, jti: str) -> Optional[Dict]:
        """根据JWT ID查找记录"""
        try:
            token_doc = self.collection.find_one({
                'jti': jti,
                'is_active': True,
                'expires_at': {'$gt': datetime.utcnow()}
            })
            if token_doc:
                token_doc.pop('_id', None)
            return token_doc
        except Exception as e:
            logger.error(f"Failed to find token by jti: {e}")
            return None
    
    def find_by_user_id(self, user_id: str, active_only: bool = True) -> List[Dict]:
        """根据用户ID查找所有token"""
        try:
            query = {'user_id': user_id}
            if active_only:
                query.update({
                    'is_active': True,
                    'expires_at': {'$gt': datetime.utcnow()}
                })
            
            cursor = self.collection.find(query).sort('created_at', -1)
            tokens = []
            for token_doc in cursor:
                token_doc.pop('_id', None)
                tokens.append(token_doc)
            return tokens
        except Exception as e:
            logger.error(f"Failed to find tokens by user_id {user_id}: {e}")
            return []
    
    def validate_token(self, token: str) -> Optional[Dict]:
        """验证token是否有效"""
        try:
            token_doc = self.find_by_token(token)
            if token_doc:
                expires_at = token_doc['expires_at']
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                
                if expires_at > datetime.utcnow():
                    return token_doc
                else:
                    self.deactivate_token(token)
                    logger.info(f"Token expired and deactivated: {token[:20]}...")
            return None
        except Exception as e:
            logger.error(f"Failed to validate token: {e}")
            return None
    
    def validate_token_by_jti(self, jti: str) -> Optional[Dict]:
        """根据JWT ID验证token是否有效"""
        try:
            token_doc = self.find_by_jti(jti)
            if token_doc:
                expires_at = token_doc['expires_at']
                if isinstance(expires_at, str):
                    expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                
                if expires_at > datetime.utcnow():
                    return token_doc
                else:
                    self.deactivate_token_by_jti(jti)
                    logger.info(f"Token expired and deactivated by jti: {jti}")
            return None
        except Exception as e:
            logger.error(f"Failed to validate token by jti: {e}")
            return None
    
    def deactivate_token(self, token: str) -> bool:
        """停用token（登出时调用）"""
        try:
            result = self.collection.update_one(
                {'token': token},
                {'$set': {'is_active': False, 'deactivated_at': datetime.utcnow()}}
            )
            
            success = result.modified_count > 0
            if success:
                logger.info(f"Token deactivated successfully: {token[:20]}...")
            else:
                logger.warning(f"No token deactivated: {token[:20]}...")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to deactivate token: {e}")
            return False
    
    def deactivate_token_by_jti(self, jti: str) -> bool:
        """根据JWT ID停用token"""
        try:
            result = self.collection.update_one(
                {'jti': jti},
                {'$set': {'is_active': False, 'deactivated_at': datetime.utcnow()}}
            )
            
            success = result.modified_count > 0
            if success:
                logger.info(f"Token deactivated successfully by jti: {jti}")
            else:
                logger.warning(f"No token deactivated by jti: {jti}")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to deactivate token by jti: {e}")
            return False
    
    def deactivate_user_tokens(self, user_id: str) -> int:
        """停用用户的所有活跃token"""
        try:
            result = self.collection.update_many(
                {
                    'user_id': user_id,
                    'is_active': True
                },
                {'$set': {'is_active': False, 'deactivated_at': datetime.utcnow()}}
            )
            
            count = result.modified_count
            if count > 0:
                logger.info(f"Deactivated {count} tokens for user: {user_id}")
            
            return count
            
        except Exception as e:
            logger.error(f"Failed to deactivate user tokens {user_id}: {e}")
            return 0
    
    def cleanup_expired_tokens(self) -> int:
        """清理过期的token"""
        try:
            result = self.collection.delete_many({
                'expires_at': {'$lt': datetime.utcnow()}
            })
            
            count = result.deleted_count
            if count > 0:
                logger.info(f"Cleaned up {count} expired tokens")
            
            return count
            
        except Exception as e:
            logger.error(f"Failed to cleanup expired tokens: {e}")
            return 0

# 全局实例
token_dao = TokenDAO()
