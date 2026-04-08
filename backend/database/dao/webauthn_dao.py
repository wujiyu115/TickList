# -*- coding: utf-8 -*-

from typing import List, Dict, Optional
import uuid
from datetime import datetime
from database.connection import db_connection
from database.models import WebAuthnCredentialModel
from utils.logger import logger


class WebAuthnDao:
    """WebAuthn Passkey 凭证数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: WebAuthnCredentialModel) -> Optional[Dict]:
        """将 ORM 模型转为 Dict"""
        if model is None:
            return None
        return {
            'id': model.id,
            'user_id': model.user_id,
            'credential_id': model.credential_id,
            'public_key': model.public_key,
            'sign_count': model.sign_count,
            'transports': model.transports,
            'device_name': model.device_name,
            'created_at': model.created_at,
            'last_used_at': model.last_used_at,
        }
    
    def create_credential(self, user_id: str, credential_data: dict) -> dict:
        """创建 WebAuthn 凭证"""
        session = self._get_session()
        try:
            credential = WebAuthnCredentialModel(
                id=str(uuid.uuid4()),
                user_id=user_id,
                credential_id=credential_data['credential_id'],
                public_key=credential_data['public_key'],
                sign_count=credential_data.get('sign_count', 0),
                transports=credential_data.get('transports'),
                device_name=credential_data.get('device_name'),
                created_at=datetime.now().isoformat(),
                last_used_at=None,
            )
            
            session.add(credential)
            session.commit()
            
            logger.info(f"WebAuthn credential created for user: {user_id}")
            return self._model_to_dict(credential)
        
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to create WebAuthn credential for user {user_id}: {e}")
            raise
        finally:
            session.close()
    
    def get_credentials_by_user(self, user_id: str) -> List[Dict]:
        """获取用户的所有 WebAuthn 凭证"""
        session = self._get_session()
        try:
            credentials = session.query(WebAuthnCredentialModel).filter(
                WebAuthnCredentialModel.user_id == user_id
            ).all()
            return [self._model_to_dict(c) for c in credentials]
        except Exception as e:
            logger.error(f"Failed to get WebAuthn credentials for user {user_id}: {e}")
            return []
        finally:
            session.close()
    
    def get_credential_by_credential_id(self, credential_id: str) -> Optional[Dict]:
        """按 WebAuthn credential_id (base64url) 查找凭证"""
        session = self._get_session()
        try:
            credential = session.query(WebAuthnCredentialModel).filter(
                WebAuthnCredentialModel.credential_id == credential_id
            ).first()
            return self._model_to_dict(credential)
        except Exception as e:
            logger.error(f"Failed to get WebAuthn credential by credential_id: {e}")
            return None
        finally:
            session.close()
    
    def update_sign_count(self, id: str, new_count: int, last_used_at: str):
        """更新凭证的签名计数和最后使用时间"""
        session = self._get_session()
        try:
            result = session.query(WebAuthnCredentialModel).filter(
                WebAuthnCredentialModel.id == id
            ).update({
                'sign_count': new_count,
                'last_used_at': last_used_at,
            })
            session.commit()
            
            if result > 0:
                logger.info(f"WebAuthn credential sign_count updated: {id}")
            else:
                logger.warning(f"No WebAuthn credential found for update: {id}")
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to update WebAuthn credential sign_count {id}: {e}")
            raise
        finally:
            session.close()
    
    def delete_credential(self, id: str) -> bool:
        """删除 WebAuthn 凭证"""
        session = self._get_session()
        try:
            result = session.query(WebAuthnCredentialModel).filter(
                WebAuthnCredentialModel.id == id
            ).delete()
            session.commit()
            
            success = result > 0
            if success:
                logger.info(f"WebAuthn credential deleted: {id}")
            else:
                logger.warning(f"No WebAuthn credential deleted for id: {id}")
            return success
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to delete WebAuthn credential {id}: {e}")
            return False
        finally:
            session.close()
    
    def rename_credential(self, id: str, device_name: str) -> bool:
        """重命名 WebAuthn 凭证设备名"""
        session = self._get_session()
        try:
            result = session.query(WebAuthnCredentialModel).filter(
                WebAuthnCredentialModel.id == id
            ).update({'device_name': device_name})
            session.commit()
            
            success = result > 0
            if success:
                logger.info(f"WebAuthn credential renamed: {id} -> {device_name}")
            else:
                logger.warning(f"No WebAuthn credential found for rename: {id}")
            return success
        except Exception as e:
            session.rollback()
            logger.error(f"Failed to rename WebAuthn credential {id}: {e}")
            return False
        finally:
            session.close()


# 全局DAO实例
webauthn_dao = WebAuthnDao()
