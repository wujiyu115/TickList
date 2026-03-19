# -*- coding: utf-8 -*-

import bcrypt
from database.dao.user_dao import user_dao

def verify_password(password, hashed):
    """验证密码"""
    return user_dao.verify_password(password, hashed)

def hash_password(password):
    """加密密码"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def find_user_by_username(username):
    """根据用户名查找用户"""
    return user_dao.find_by_username(username)

def find_user_by_id(user_id):
    """根据用户ID查找用户"""
    return user_dao.find_by_id(user_id)

def find_or_create_user_by_account(account, name, email=''):
    """根据账号查找或创建用户"""
    return user_dao.find_or_create_by_account(account, name, email)