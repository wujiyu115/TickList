# -*- coding: utf-8 -*-

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import bcrypt

from middleware.jwt_middleware import require_admin
from database.dao.user_dao import user_dao
from database.dao.token_dao import token_dao
from utils.logger import logger

router = APIRouter(prefix='/users', tags=['admin-users'])


class CreateUserRequest(BaseModel):
    username: str
    password: str
    email: str = ''
    role_group: str = 'user'


class UpdateUserRequest(BaseModel):
    role_group: Optional[str] = None
    email: Optional[str] = None


class FreezeUserRequest(BaseModel):
    pass  # toggle，无需额外参数


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.get('')
async def list_users(current_user: dict = Depends(require_admin)):
    """获取所有用户列表"""
    users = user_dao.list_users()
    # 过滤掉 password 字段
    for u in users:
        u.pop('password', None)
    return users


@router.post('')
async def create_user(data: CreateUserRequest, current_user: dict = Depends(require_admin)):
    """创建用户"""
    # 验证用户名长度
    if len(data.username) < 3 or len(data.username) > 20:
        raise HTTPException(status_code=400, detail='用户名长度必须在3-20个字符之间')

    # 验证密码长度
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail='密码长度至少6个字符')

    # 检查用户名是否已存在
    existing = user_dao.find_by_username(data.username)
    if existing:
        raise HTTPException(status_code=400, detail='用户名已存在')

    try:
        user = user_dao.create_user(
            username=data.username,
            password=data.password,
            email=data.email,
            role_group=data.role_group,
            name=data.username
        )
        user.pop('password', None)
        return {'success': True, 'user': user}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Admin create user failed: {e}")
        raise HTTPException(status_code=500, detail='创建用户失败')


@router.put('/{user_id}')
async def update_user(user_id: str, data: UpdateUserRequest, current_user: dict = Depends(require_admin)):
    """更新用户信息"""
    # 不能修改自己的角色
    if user_id == current_user['id'] and data.role_group is not None:
        raise HTTPException(status_code=400, detail='不能修改自己的角色')

    user = user_dao.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')

    update_data = {}
    if data.role_group is not None:
        update_data['role_group'] = data.role_group
    if data.email is not None:
        update_data['email'] = data.email

    if not update_data:
        raise HTTPException(status_code=400, detail='没有需要更新的字段')

    success = user_dao.update_user(user_id, update_data)
    if not success:
        raise HTTPException(status_code=500, detail='更新失败')

    return {'success': True, 'message': '用户信息已更新'}


@router.post('/{user_id}/freeze')
async def freeze_user(user_id: str, current_user: dict = Depends(require_admin)):
    """冻结/解冻用户（toggle）"""
    # 不能冻结自己
    if user_id == current_user['id']:
        raise HTTPException(status_code=400, detail='不能冻结自己的账号')

    user = user_dao.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')

    new_frozen = not user.get('is_frozen', False)
    success = user_dao.update_user(user_id, {'is_frozen': new_frozen})
    if not success:
        raise HTTPException(status_code=500, detail='操作失败')

    # 冻结后注销该用户所有 token
    if new_frozen:
        token_dao.deactivate_user_tokens(user_id)

    status_text = '已冻结' if new_frozen else '已解冻'
    return {'success': True, 'message': f'用户{status_text}', 'is_frozen': new_frozen}


@router.post('/{user_id}/reset-password')
async def reset_password(user_id: str, data: ResetPasswordRequest, current_user: dict = Depends(require_admin)):
    """重置用户密码"""
    user = user_dao.find_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail='用户不存在')

    # 校验新密码长度
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail='密码长度至少6个字符')

    # bcrypt 加密新密码
    hashed_password = bcrypt.hashpw(data.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    success = user_dao.update_user(user_id, {'password': hashed_password})
    if not success:
        raise HTTPException(status_code=500, detail='重置密码失败')

    # 注销该用户所有 token
    token_dao.deactivate_user_tokens(user_id)

    return {'success': True, 'message': '密码已重置'}
