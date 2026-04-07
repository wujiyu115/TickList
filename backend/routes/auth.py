# -*- coding: utf-8 -*-

from datetime import timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import bcrypt

from middleware.jwt_middleware import get_current_user, create_access_token
from utils.auth_utils import find_user_by_id, find_user_by_username, verify_password
from utils.logger import logger
from config.config_loader import config

from database.dao.token_dao import token_dao
from database.dao.user_dao import user_dao

router = APIRouter()

# Pydantic模型
class LoginResponse(BaseModel):
    user: dict = None
    token: str = None
    success: bool = True
    message: str = None
    error_code: int = None

class LogoutResponse(BaseModel):
    message: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str = ''

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class TokenInfo(BaseModel):
    id: str
    created_at: str
    expires_at: str
    token_preview: str

# 公开端点：获取认证配置
@router.get('/api/auth/config')
async def get_auth_config():
    """获取认证相关配置（无需登录）"""
    return {'register_enabled': config.is_register_enabled()}

# 本地用户注册
@router.post('/api/auth/register')
async def register(data: RegisterRequest):
    """用户注册"""
    # 检查注册开关
    if not config.is_register_enabled():
        raise HTTPException(status_code=403, detail='注册功能已关闭')
    
    # 1. 验证用户名长度（3-20字符）
    if len(data.username) < 3 or len(data.username) > 20:
        raise HTTPException(status_code=400, detail='用户名长度必须在3-20个字符之间')
    
    # 2. 验证密码长度（至少6字符）
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail='密码长度至少6个字符')
    
    # 3. 检查用户名是否已存在
    existing_user = find_user_by_username(data.username)
    if existing_user:
        raise HTTPException(status_code=400, detail='用户名已存在')
    
    try:
        # 4. 确定用户角色
        # 第一个用户 或 匹配 ADMIN_USERNAME → 管理员
        existing_users = user_dao.list_users(skip=0, limit=1)
        is_first_user = len(existing_users) == 0
        matches_admin_username = config.get_admin_username() and data.username == config.get_admin_username()
        
        if is_first_user or matches_admin_username:
            role_group = 'admin'
            if is_first_user:
                logger.info(f"First user '{data.username}' will be set as admin")
            if matches_admin_username:
                logger.info(f"User '{data.username}' matches ADMIN_USERNAME, set as admin")
        else:
            role_group = 'user'
        
        # 5. 创建用户（user_dao.create_user 内部会加密密码）
        user = user_dao.create_user(
            username=data.username,
            password=data.password,
            email=data.email,
            role_group=role_group,
            name=data.username
        )
        
        # 6. 返回成功信息（不自动登录，让用户手动登录）
        return {
            'success': True,
            'message': '注册成功，请登录'
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Register failed: {e}")
        raise HTTPException(status_code=500, detail='注册失败，请稍后重试')

# 本地账号登录
@router.post('/api/auth/login')
async def login_local(data: LoginRequest):
    """本地账号登录"""
    # 1. 根据用户名查找用户
    user = find_user_by_username(data.username)
    if not user:
        raise HTTPException(status_code=401, detail='用户名或密码错误')
    
    # 2. 验证密码
    if not user.get('password'):
        raise HTTPException(status_code=401, detail='该账号不支持密码登录')
    
    if not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail='用户名或密码错误')
    
    # 检查账号是否被冻结
    if user.get('is_frozen'):
        raise HTTPException(status_code=403, detail='账号已被冻结，请联系管理员')
    
    try:
        # 3. 生成 JWT token
        access_token_expires = timedelta(hours=24)
        token_data = {"sub": user['id']}
        jwt_token = create_access_token(
            data=token_data, expires_delta=access_token_expires
        )
        
        # 4. 从JWT中提取JTI
        from jose import jwt
        jwt_config = config.get_jwt_config()
        decoded = jwt.decode(jwt_token, jwt_config['secret_key'], algorithms=[jwt_config['algorithm']])
        jti = decoded.get('jti')
        
        # 5. 存储 token 到 token_dao
        token_dao.create_token(user['id'], jwt_token, jti)
        
        # 6. 返回登录信息
        return LoginResponse(
            success=True,
            message='登录成功',
            token=jwt_token,
            user={
                'id': user['id'],
                'username': user['username'],
                'email': user.get('email', ''),
                'role_group': user.get('role_group', 'user')
            }
        )
        
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail='登录失败，请稍后重试')

@router.get('/api/auth/me')
async def get_current_user_info(current_user_id: str = Depends(get_current_user)):
    """获取当前用户信息"""
    user = find_user_by_id(current_user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    
    return user

@router.post('/api/auth/logout')
async def logout(current_user_id: str = Depends(get_current_user)):
    """登出当前设备"""
    try:
        # 这里需要获取当前token的JTI来撤销特定token
        # 由于FastAPI的限制，我们暂时撤销用户的所有token
        count = token_dao.deactivate_user_tokens(current_user_id)
        
        return LogoutResponse(message='登出成功')
        
    except Exception as e:
        raise HTTPException(status_code=500, detail='登出失败')

@router.post('/api/auth/logout-all')
async def logout_all(current_user_id: str = Depends(get_current_user)):
    """登出所有设备"""
    try:
        count = token_dao.deactivate_user_tokens(current_user_id)
        
        return {
            'message': f'已登出所有设备',
            'deactivated_tokens': count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail='登出失败')

@router.get('/api/auth/tokens')
async def get_user_tokens(current_user_id: str = Depends(get_current_user)):
    """获取用户的所有活跃token"""
    try:
        tokens = token_dao.find_by_user_id(current_user_id, active_only=True)
        
        # 隐藏完整的token信息，只返回部分信息
        safe_tokens = []
        for token in tokens:
            safe_tokens.append(TokenInfo(
                id=token['id'],
                created_at=token['created_at'],
                expires_at=token['expires_at'],
                token_preview=token['token'][:20] + '...'
            ))
        
        return safe_tokens
        
    except Exception as e:
        raise HTTPException(status_code=500, detail='获取token列表失败')

@router.post('/api/auth/change-password')
async def change_password(data: ChangePasswordRequest, current_user_id: str = Depends(get_current_user)):
    """修改密码"""
    # 1. 查找用户
    user = user_dao.find_by_id(current_user_id)
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')
    
    # 2. 验证旧密码
    if not user.get('password') or not bcrypt.checkpw(
        data.old_password.encode('utf-8'), user['password'].encode('utf-8')
    ):
        raise HTTPException(status_code=400, detail='旧密码错误')
    
    # 3. 校验新密码长度
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail='新密码长度至少6个字符')
    
    # 4. 加密新密码并更新
    hashed_password = bcrypt.hashpw(data.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user_dao.update_user(current_user_id, {'password': hashed_password})
    
    # 5. 注销该用户所有 token
    token_dao.deactivate_user_tokens(current_user_id)
    
    # 6. 返回成功消息
    return {'success': True, 'message': '密码修改成功，请重新登录'}