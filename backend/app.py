#!/usr/bin/env python
# -*- coding: utf-8 -*-

import os
import sys
from datetime import timedelta
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from utils.logger import logger
from database.connection import db_connection

# 加载环境变量
load_dotenv()

# 添加项目根目录到 Python 路径
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# 导入路由
from routes.auth import router as auth_router
from routes.task import router as task_router
from routes.statistics import router as statistics_router
from routes.calendar import router as calendar_router
from routes.countdown import router as countdown_router
from routes.counter import router as counter_router
from routes.list import router as list_router
from routes.tag import router as tag_router
from routes.data import router as data_router
from routes.filter import router as filter_router
from routes.settings import router as settings_router
from routes.focus import router as focus_router
from routes.webauthn import router as webauthn_router
from routes.note import router as note_router
from routes.ai import router as ai_router
from routes.admin import admin_router

# 导入中间件
from middleware.logging_middleware import RequestLoggingMiddleware

# 导入调度服务
from services.scheduler_service import scheduler_service

# 导入配置
from config.config_loader import config

def create_app():
    """应用工厂函数"""
    
    # 根据环境配置决定是否开放文档接口
    environment = config.get_environment()
    docs_url = "/docs" if environment == "development" else None
    redoc_url = "/redoc" if environment == "development" else None
    
    # 创建FastAPI应用
    app = FastAPI(
        title="TickList Backend",
        description="TickList Todo Management API",
        version="1.0.0",
        docs_url=docs_url,
        redoc_url=redoc_url
    )
    
    # 配置静态文件目录
    static_folder = os.getenv("FRONTEND") or os.path.join(current_dir, '../frontend/dist')
    
    # 添加请求日志中间件
    app.add_middleware(RequestLoggingMiddleware)
    
    # 启用 CORS
    if environment == "development":
        allowed_origins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5000",
            "http://127.0.0.1:5000"
        ]
    else:
        allowed_origins = list(config.get('cors.allowed_origins', []) or [])

    # Capacitor iOS / Android app 的 origin（无论環境都放行，供移动端打包后访问）
    native_origins = [
        "capacitor://localhost",   # iOS WebView
        "http://localhost",         # Android WebView
        "https://localhost",        # Capacitor androidScheme=https
        "ionic://localhost",        # 历史兼容
    ]
    for origin in native_origins:
        if origin not in allowed_origins:
            allowed_origins.append(origin)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info(f"app corsmiddleware: allowed_origins:{allowed_origins}")

    # 注册路由
    app.include_router(auth_router)
    app.include_router(task_router)
    app.include_router(statistics_router)
    app.include_router(calendar_router)
    app.include_router(countdown_router)
    app.include_router(counter_router)
    app.include_router(list_router)
    app.include_router(tag_router)
    app.include_router(data_router)
    app.include_router(filter_router)
    app.include_router(settings_router)
    app.include_router(focus_router)
    app.include_router(webauthn_router)
    app.include_router(note_router)
    app.include_router(ai_router)
    app.include_router(admin_router)
    
    # 挂载静态文件
    if os.path.exists(static_folder):
        app.mount("/static", StaticFiles(directory=static_folder), name="static")
        
        # 处理SPA路由回退
        @app.get("/{full_path:path}")
        async def serve_spa(request: Request, full_path: str):
            if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
                return {"message": "Not Found"}, 404
            
            if ".." in full_path or full_path.startswith("/") or "\\" in full_path:
                return {"message": "Access Denied"}, 403
            
            file_path = os.path.join(static_folder, full_path)
            
            try:
                real_file_path = os.path.realpath(file_path)
                real_static_folder = os.path.realpath(static_folder)
                
                if not real_file_path.startswith(real_static_folder):
                    return {"message": "Access Denied"}, 403
            except (OSError, ValueError):
                return {"message": "Invalid Path"}, 400
            
            if os.path.isfile(file_path):
                allowed_extensions = {'.js', '.css', '.html', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'}
                file_ext = os.path.splitext(full_path)[1].lower()
                
                if file_ext not in allowed_extensions:
                    return {"message": "File Type Not Allowed"}, 403
                
                return FileResponse(file_path)
            
            index_path = os.path.join(static_folder, "index.html")
            if os.path.exists(index_path):
                try:
                    real_index_path = os.path.realpath(index_path)
                    real_static_folder = os.path.realpath(static_folder)
                    
                    if not real_index_path.startswith(real_static_folder):
                        return {"message": "Access Denied"}, 403
                except (OSError, ValueError):
                    return {"message": "Invalid Path"}, 400
                    
                return FileResponse(index_path, media_type="text/html")
            else:
                return {"message": "Frontend not found"}, 404
    else:
        @app.get("/{full_path:path}")
        async def serve_fallback(request: Request, full_path: str):
            if full_path.startswith("api/") or full_path.startswith("docs") or full_path.startswith("redoc"):
                return {"message": "Not Found"}, 404
            return {"message": "Frontend not built"}, 404
    
    return app

# 创建全局应用实例
app = create_app()

# 启动事件 - 启动调度器
@app.on_event("startup")
async def startup_event():
    # 创建所有表并迁移缺失的列（从模块级移入 startup，避免 import 时产生副作用）
    db_connection.create_tables()
    db_connection.migrate_tables()

    scheduler_service.start()
    
    # 同步 ADMIN_USERNAME 配置：如果指定的管理员用户已存在但不是 admin，自动升级
    admin_username = config.get_admin_username()
    if admin_username:
        from database.dao.user_dao import user_dao
        user = user_dao.find_by_username(admin_username)
        if user and user.get('role_group') != 'admin':
            user_dao.update_user(user['id'], {'role_group': 'admin'})
            logger.info(f"Promoted user '{admin_username}' to admin (ADMIN_USERNAME config)")
    
    logger.info("Application startup complete")

# 关闭事件 - 关闭调度器
@app.on_event("shutdown")
async def shutdown_event():
    scheduler_service.shutdown()
    logger.info("Application shutdown complete")

# 健康检查端点
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "message": "TickList API is running"}
