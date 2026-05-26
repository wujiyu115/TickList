# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
from sqlalchemy.exc import IntegrityError
from database.connection import db_connection
from database.models import TokenModel
import uuid
from datetime import datetime, timedelta
from utils.logger import logger


class TokenDAO:
    """JWT Token数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: TokenModel) -> Optional[Dict]:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        # 解析 expires_at 字符串为 datetime 对象
        expires_at = model.expires_at
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.fromisoformat(expires_at)
            except:
                pass
        
        # 解析 created_at 字符串为 datetime 对象
        created_at = model.created_at
        if isinstance(created_at, str):
            try:
                created_at = datetime.fromisoformat(created_at)
            except:
                pass
        
        return {
            'id': model.id,
            'token': model.token,
            'jti': model.id,
            'user_id': model.user_id,
            'token_type': model.token_type,
            'family_id': model.family_id,
            'created_at': created_at,
            'expires_at': expires_at,
            'is_active': not model.revoked
        }
    
    def create_token(self, user_id: str, token: str, jti: str = None,
                     token_type: str = 'access', family_id: str = None,
                     expires_hours: int = None, expires_days: int = None) -> Dict:
        """创建并存储JWT token"""
        session = self._get_session()
        try:
            now = datetime.utcnow()
            if expires_days:
                expires_at = now + timedelta(days=expires_days)
            elif expires_hours:
                expires_at = now + timedelta(hours=expires_hours)
            else:
                expires_at = now + timedelta(hours=24)

            if not jti:
                jti = f'jti-{str(uuid.uuid4())[:8]}'

            token_id = jti

            token_model = TokenModel(
                id=token_id,
                token=token,
                user_id=user_id,
                token_type=token_type,
                family_id=family_id,
                created_at=now.isoformat(),
                expires_at=expires_at.isoformat(),
                revoked=False
            )

            session.add(token_model)
            session.commit()

            logger.info(f"JWT token ({token_type}) created for user: {user_id}")
            return self._model_to_dict(token_model)

        except IntegrityError:
            session.rollback()
            logger.warning(f"JWT token already exists: {token[:20]}...")
            raise ValueError(f"JWT token already exists")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create JWT token for user {user_id}: {e}")
            raise
        finally:
            session.close()
    
    def find_by_token(self, token: str) -> Optional[Dict]:
        """根据token查找记录"""
        session = self._get_session()
        try:
            now = datetime.utcnow().isoformat()
            token_model = session.query(TokenModel).filter(
                TokenModel.token == token,
                TokenModel.revoked == False,
                TokenModel.expires_at > now
            ).first()
            return self._model_to_dict(token_model)
        except Exception as e:
            logger.error(f"Failed to find token: {e}")
            return None
        finally:
            session.close()
    
    def find_by_jti(self, jti: str) -> Optional[Dict]:
        """根据JWT ID查找记录"""
        session = self._get_session()
        try:
            now = datetime.utcnow().isoformat()
            # jti 就是 id
            token_model = session.query(TokenModel).filter(
                TokenModel.id == jti,
                TokenModel.revoked == False,
                TokenModel.expires_at > now
            ).first()
            return self._model_to_dict(token_model)
        except Exception as e:
            logger.error(f"Failed to find token by jti: {e}")
            return None
        finally:
            session.close()

    def find_token_by_jti_raw(self, jti: str) -> Optional[Dict]:
        """根据JTI查找token记录（不检查过期和revoked，用于refresh复用检测）"""
        session = self._get_session()
        try:
            token_model = session.query(TokenModel).filter(
                TokenModel.id == jti
            ).first()
            if not token_model:
                return None
            result = self._model_to_dict(token_model)
            result['revoked'] = token_model.revoked
            result['family_id'] = token_model.family_id
            result['token_type'] = token_model.token_type
            return result
        except Exception as e:
            logger.error(f"Failed to find token by jti raw: {e}")
            return None
        finally:
            session.close()
    
    def find_by_user_id(self, user_id: str, active_only: bool = True) -> List[Dict]:
        """根据用户ID查找所有token"""
        session = self._get_session()
        try:
            query = session.query(TokenModel).filter(TokenModel.user_id == user_id)
            
            if active_only:
                now = datetime.utcnow().isoformat()
                query = query.filter(
                    TokenModel.revoked == False,
                    TokenModel.expires_at > now
                )
            
            tokens = query.order_by(TokenModel.created_at.desc()).all()
            return [self._model_to_dict(t) for t in tokens]
        except Exception as e:
            logger.error(f"Failed to find tokens by user_id {user_id}: {e}")
            return []
        finally:
            session.close()
    
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
        session = self._get_session()
        try:
            result = session.query(TokenModel).filter(
                TokenModel.token == token
            ).update({'revoked': True})
            session.commit()
            
            success = result > 0
            if success:
                logger.info(f"Token deactivated successfully: {token[:20]}...")
            else:
                logger.warning(f"No token deactivated: {token[:20]}...")
            
            return success
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to deactivate token: {e}")
            return False
        finally:
            session.close()
    
    def deactivate_token_by_jti(self, jti: str) -> bool:
        """根据JWT ID停用token"""
        session = self._get_session()
        try:
            # jti 就是 id
            result = session.query(TokenModel).filter(
                TokenModel.id == jti
            ).update({'revoked': True})
            session.commit()
            
            success = result > 0
            if success:
                logger.info(f"Token deactivated successfully by jti: {jti}")
            else:
                logger.warning(f"No token deactivated by jti: {jti}")
            
            return success
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to deactivate token by jti: {e}")
            return False
        finally:
            session.close()
    
    def deactivate_user_tokens(self, user_id: str) -> int:
        """停用用户的所有活跃token"""
        session = self._get_session()
        try:
            result = session.query(TokenModel).filter(
                TokenModel.user_id == user_id,
                TokenModel.revoked == False
            ).update({'revoked': True})
            session.commit()

            if result > 0:
                logger.info(f"Deactivated {result} tokens for user: {user_id}")

            return result

        except Exception as e:
            session.rollback()
            logger.error(f"Failed to deactivate user tokens {user_id}: {e}")
            return 0
        finally:
            session.close()

    def deactivate_tokens_by_family(self, family_id: str) -> int:
        """吊销整个 token 家族（复用检测时使用）"""
        if not family_id:
            return 0
        session = self._get_session()
        try:
            result = session.query(TokenModel).filter(
                TokenModel.family_id == family_id,
                TokenModel.revoked == False
            ).update({'revoked': True})
            session.commit()

            if result > 0:
                logger.warning(f"Revoked {result} tokens in family: {family_id}")

            return result

        except Exception as e:
            session.rollback()
            logger.error(f"Failed to deactivate token family {family_id}: {e}")
            return 0
        finally:
            session.close()
    
    def cleanup_expired_tokens(self) -> int:
        """清理过期的token"""
        session = self._get_session()
        try:
            now = datetime.utcnow().isoformat()
            result = session.query(TokenModel).filter(
                TokenModel.expires_at < now
            ).delete()
            session.commit()
            
            if result > 0:
                logger.info(f"Cleaned up {result} expired tokens")
            
            return result
            
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to cleanup expired tokens: {e}")
            return 0
        finally:
            session.close()


# 全局实例
token_dao = TokenDAO()
