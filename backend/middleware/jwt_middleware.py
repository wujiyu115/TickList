# -*- coding: utf-8 -*-

import os
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from database.dao.token_dao import token_dao
from utils.auth_utils import find_user_by_id
from config.config_loader import config

# JWT配置
jwt_config = config.get_jwt_config()
SECRET_KEY = jwt_config['secret_key']
ALGORITHM = jwt_config['algorithm']
ACCESS_TOKEN_EXPIRE_HOURS = jwt_config['access_token_expire_hours']

# 密码加密
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# HTTP Bearer认证
security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire})
    
    # 添加JTI（JWT ID）用于token撤销
    import uuid
    jti = str(uuid.uuid4())
    to_encode.update({"jti": jti})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    """验证令牌"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None

async def verify_agent_system_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """验证agent系统级JWT token"""
    try:
        payload = verify_token(credentials.credentials)
        if payload is None:
            raise HTTPException(
                status_code=401,
                detail="Invalid JWT token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # 检查是否为agent系统级token
        if payload.get("type") != "system" or payload.get("sub") != "system_agent":
            raise HTTPException(
                status_code=403,
                detail="Invalid agent system token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        return payload
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Agent token verification error: {e}")
        raise HTTPException(
            status_code=401,
            detail="Token verification failed",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """获取当前用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = verify_token(credentials.credentials)
        if payload is None:
            raise credentials_exception
        
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        
        # 获取JTI（如果存在）
        jti: str = payload.get("jti")
        if jti:
            # 检查token是否被撤销
            token_doc = token_dao.validate_token_by_jti(jti)
            if token_doc is None:
                raise credentials_exception
        else:
            # 兼容旧版本没有JTI的token
            token_doc = token_dao.validate_token(credentials.credentials)
            if token_doc is None:
                raise credentials_exception
        
        return user_id
        
    except JWTError:
        raise credentials_exception

async def get_current_user_info(current_user_id: str = Depends(get_current_user)):
    """获取当前用户完整信息"""
    user = find_user_by_id(current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    return user

async def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    """获取可选的当前用户（用于可选认证的端点）"""
    if credentials is None:
        return None
    
    try:
        payload = verify_token(credentials.credentials)
        if payload is None:
            return None
        
        user_id: str = payload.get("sub")
        if user_id is None:
            return None
        
        # 获取JTI（如果存在）
        jti: str = payload.get("jti")
        if jti:
            # 检查token是否被撤销
            token_doc = token_dao.validate_token_by_jti(jti)
            if token_doc is None:
                return None
        else:
            # 兼容旧版本没有JTI的token
            token_doc = token_dao.validate_token(credentials.credentials)
            if token_doc is None:
                return None
        
        return user_id
        
    except Exception as e:
        print(f"Error in get_optional_user: {e}")
        return None

def require_admin(current_user: dict = Depends(get_current_user_info)):
    """要求管理员权限"""
    if current_user.get('role_group') != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限"
        )
    return current_user

def require_role_group(allowed_groups: list):
    """要求特定用户组权限"""
    def check_role_group(current_user: dict = Depends(get_current_user_info)):
        user_role_group = current_user.get('role_group', 'user')
        if user_role_group not in allowed_groups:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下用户组权限之一: {', '.join(allowed_groups)}"
            )
        return current_user
    return check_role_group


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """获取密码哈希"""
    return pwd_context.hash(password)

def check_if_token_revoked(jwt_header, jwt_payload):
    """检查token是否被撤销"""
    try:
        jti = jwt_payload['jti']  # JWT ID
        # 从数据库中验证token - 注意：这里应该使用jti而不是完整token
        token_doc = token_dao.validate_token_by_jti(jti)
        # 如果token_doc为None，说明token无效或已撤销
        return token_doc is None
    except Exception as e:
        print(f"Token validation error: {e}")
        return True  # 出错时认为token无效

def expired_token_callback(jwt_header, jwt_payload):
    """Token过期回调"""
    from flask import jsonify
    return jsonify({'message': '登录已过期，请重新登录'}), 401

def invalid_token_callback(error):
    """无效Token回调"""
    from flask import jsonify
    return jsonify({'message': '无效的登录令牌'}), 401

def missing_token_callback(error):
    """缺少Token回调"""
    from flask import jsonify
    return jsonify({'message': '请先登录'}), 401

def revoked_token_callback(jwt_header, jwt_payload):
    """Token被撤销回调"""
    from flask import jsonify
    return jsonify({'message': '登录令牌已失效，请重新登录'}), 401