# -*- coding: utf-8 -*-

import json
import time
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from webauthn import (
    generate_registration_options,
    verify_registration_response,
    generate_authentication_options,
    verify_authentication_response,
    options_to_json,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    ResidentKeyRequirement,
    UserVerificationRequirement,
    PublicKeyCredentialDescriptor,
    AuthenticatorTransport,
)
from webauthn.helpers import bytes_to_base64url, base64url_to_bytes

from middleware.jwt_middleware import get_current_user, create_access_token, create_refresh_token
from config.config_loader import config
from database.dao.webauthn_dao import webauthn_dao
from database.dao.user_dao import user_dao
from database.dao.token_dao import token_dao
from utils.logger import logger

router = APIRouter(prefix='/api/auth/webauthn', tags=['webauthn'])

# Challenge 存储（内存，{challenge_b64: {user_id, timestamp}}）
_challenges = {}
CHALLENGE_TIMEOUT = 60  # 秒


def _cleanup_challenges():
    """清理过期 challenge"""
    now = time.time()
    expired = [k for k, v in _challenges.items() if now - v['timestamp'] > CHALLENGE_TIMEOUT]
    for k in expired:
        del _challenges[k]


# ─── 端点 1: 注册 options（需登录）───────────────────────────
@router.post('/register/options')
async def register_options(user_id: str = Depends(get_current_user)):
    """生成 WebAuthn 注册选项"""
    user = user_dao.find_by_id(user_id)
    if not user:
        logger.warning(f"WebAuthn register options requested for missing user: {user_id}")
        raise HTTPException(status_code=404, detail="用户不存在")

    # 获取用户已有凭证，排除重复注册
    existing_credentials = webauthn_dao.get_credentials_by_user(user_id)
    exclude_credentials = [
        PublicKeyCredentialDescriptor(id=base64url_to_bytes(c['credential_id']))
        for c in existing_credentials
    ]

    options = generate_registration_options(
        rp_id=config.get_webauthn_rp_id(),
        rp_name=config.get_webauthn_rp_name(),
        user_id=user_id.encode(),
        user_name=user['username'],
        user_display_name=user.get('name') or user['username'],
        exclude_credentials=exclude_credentials,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.PREFERRED,
            user_verification=UserVerificationRequirement.PREFERRED,
        ),
        timeout=60000,
    )

    # 存储 challenge
    _cleanup_challenges()
    challenge_b64 = bytes_to_base64url(options.challenge)
    _challenges[challenge_b64] = {'user_id': user_id, 'timestamp': time.time()}
    logger.info(
        "WebAuthn register options generated "
        f"user_id={user_id} username={user['username']} "
        f"exclude_credentials={len(existing_credentials)} "
        f"rp_id={config.get_webauthn_rp_id()} origin={config.get_webauthn_origin()}"
    )

    return json.loads(options_to_json(options))


# ─── 端点 2: 注册 verify（需登录）───────────────────────────
@router.post('/register/verify')
async def register_verify(body: dict, user_id: str = Depends(get_current_user)):
    """验证 WebAuthn 注册响应并保存凭证"""
    _cleanup_challenges()
    logger.info(
        "WebAuthn register verify requested "
        f"user_id={user_id} credential_id={body.get('id') or body.get('rawId')} "
        f"response_type={body.get('type')}"
    )
    matched_challenge = None
    for ch, data in _challenges.items():
        if data['user_id'] == user_id:
            matched_challenge = ch
            break

    if not matched_challenge:
        logger.warning(f"WebAuthn register verify failed due to expired challenge: user_id={user_id}")
        raise HTTPException(status_code=400, detail="Challenge 已过期，请重新注册")

    try:
        verification = verify_registration_response(
            credential=body,
            expected_challenge=base64url_to_bytes(matched_challenge),
            expected_origin=config.get_webauthn_origin(),
            expected_rp_id=config.get_webauthn_rp_id(),
        )
    except Exception as e:
        logger.error(
            "WebAuthn registration verification failed "
            f"user_id={user_id} rp_id={config.get_webauthn_rp_id()} "
            f"origin={config.get_webauthn_origin()} error={e}"
        )
        raise HTTPException(status_code=400, detail=f"验证失败: {str(e)}")
    finally:
        _challenges.pop(matched_challenge, None)

    # 保存凭证
    credential_data = {
        'credential_id': bytes_to_base64url(verification.credential_id),
        'public_key': bytes_to_base64url(verification.credential_public_key),
        'sign_count': verification.sign_count,
        'transports': json.dumps(body.get('response', {}).get('transports', []))
            if body.get('response', {}).get('transports') else None,
        'device_name': body.get('device_name', 'My Passkey'),
    }

    result = webauthn_dao.create_credential(user_id, credential_data)
    logger.info(
        "WebAuthn registration completed "
        f"user_id={user_id} credential_id={credential_data['credential_id']} "
        f"device_name={credential_data['device_name']}"
    )
    return {"message": "Passkey 注册成功", "credential": result}


# ─── 端点 3: 登录 options（无需登录）──────────────────────────
@router.post('/login/options')
async def login_options(body: dict = None):
    """生成 WebAuthn 认证选项"""
    username = (body or {}).get('username')
    allow_credentials = []
    user_id_for_challenge = '__anonymous__'

    if username:
        user = user_dao.find_by_username(username)
        if user:
            user_id_for_challenge = user['id']
            credentials = webauthn_dao.get_credentials_by_user(user['id'])
            allow_credentials = [
                PublicKeyCredentialDescriptor(
                    id=base64url_to_bytes(c['credential_id']),
                    transports=[AuthenticatorTransport(t) for t in json.loads(c['transports'])]
                        if c.get('transports') else None,
                )
                for c in credentials
            ]

    options = generate_authentication_options(
        rp_id=config.get_webauthn_rp_id(),
        allow_credentials=allow_credentials if allow_credentials else None,
        user_verification=UserVerificationRequirement.PREFERRED,
        timeout=60000,
    )

    _cleanup_challenges()
    challenge_b64 = bytes_to_base64url(options.challenge)
    _challenges[challenge_b64] = {'user_id': user_id_for_challenge, 'timestamp': time.time()}

    return json.loads(options_to_json(options))


# ─── 端点 4: 登录 verify（无需登录）──────────────────────────
@router.post('/login/verify')
async def login_verify(body: dict):
    """验证 WebAuthn 认证响应并签发 JWT"""
    raw_id_b64 = body.get('rawId') or body.get('id')
    if not raw_id_b64:
        raise HTTPException(status_code=400, detail="缺少凭证 ID")

    credential = webauthn_dao.get_credential_by_credential_id(raw_id_b64)
    if not credential:
        raise HTTPException(status_code=400, detail="未找到匹配的 Passkey")

    user = user_dao.find_by_id(credential['user_id'])
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")
    if user.get('is_frozen'):
        raise HTTPException(status_code=403, detail="账号已被冻结")

    # 查找匹配的 challenge
    _cleanup_challenges()
    matched_challenge = None
    for ch, data in _challenges.items():
        if data['user_id'] in (credential['user_id'], '__anonymous__'):
            matched_challenge = ch
            break

    if not matched_challenge:
        raise HTTPException(status_code=400, detail="Challenge 已过期")

    try:
        verification = verify_authentication_response(
            credential=body,
            expected_challenge=base64url_to_bytes(matched_challenge),
            expected_origin=config.get_webauthn_origin(),
            expected_rp_id=config.get_webauthn_rp_id(),
            credential_public_key=base64url_to_bytes(credential['public_key']),
            credential_current_sign_count=credential['sign_count'],
        )
    except Exception as e:
        logger.error(f"WebAuthn authentication verification failed: {e}")
        raise HTTPException(status_code=400, detail=f"验证失败: {str(e)}")
    finally:
        _challenges.pop(matched_challenge, None)

    # 更新签名计数
    webauthn_dao.update_sign_count(
        credential['id'],
        verification.new_sign_count,
        datetime.now().isoformat(),
    )

    # 生成 JWT Token（双 token 机制）
    try:
        import uuid as _uuid
        family_id = str(_uuid.uuid4())

        token_data = {"sub": user['id']}
        jwt_token = create_access_token(data=token_data)

        refresh_data = {"sub": user['id'], "family_id": family_id}
        refresh_token = create_refresh_token(data=refresh_data)

        from jose import jwt as jose_jwt
        jwt_cfg = config.get_jwt_config()
        access_decoded = jose_jwt.decode(jwt_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
        refresh_decoded = jose_jwt.decode(refresh_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])

        token_dao.create_token(
            user['id'], jwt_token, access_decoded.get('jti'),
            token_type='access', family_id=family_id,
            expires_hours=jwt_cfg['access_token_expire_hours']
        )
        token_dao.create_token(
            user['id'], refresh_token, refresh_decoded.get('jti'),
            token_type='refresh', family_id=family_id,
            expires_days=jwt_cfg['refresh_token_expire_days']
        )

        return {
            "success": True,
            "message": "登录成功",
            "token": jwt_token,
            "refresh_token": refresh_token,
            "user": {
                "id": user['id'],
                "username": user['username'],
                "email": user.get('email', ''),
                "role_group": user.get('role_group', 'user'),
            },
        }
    except Exception as e:
        logger.error(f"WebAuthn login token generation failed: {e}")
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")


# ─── 端点 5: 凭证列表（需登录）──────────────────────────────
@router.get('/credentials')
async def list_credentials(user_id: str = Depends(get_current_user)):
    """获取当前用户的所有 Passkey 凭证"""
    credentials = webauthn_dao.get_credentials_by_user(user_id)
    # 移除敏感字段
    for c in credentials:
        c.pop('public_key', None)
    return {"credentials": credentials}


# ─── 端点 6: 删除凭证（需登录）──────────────────────────────
@router.delete('/credentials/{credential_id}')
async def delete_credential(credential_id: str, user_id: str = Depends(get_current_user)):
    """删除指定的 Passkey 凭证"""
    # 验证凭证属于当前用户
    credentials = webauthn_dao.get_credentials_by_user(user_id)
    if not any(c['id'] == credential_id for c in credentials):
        raise HTTPException(status_code=403, detail="无权删除此凭证")

    success = webauthn_dao.delete_credential(credential_id)
    if not success:
        raise HTTPException(status_code=404, detail="凭证不存在")
    return {"message": "凭证已删除"}
