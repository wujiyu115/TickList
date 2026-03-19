# -*- coding: utf-8 -*-

import time
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from utils.logger import logger


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件，记录请求完成时间和相关信息"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 记录请求开始时间
        start_time = time.time()
        
        # 获取请求信息
        method = request.method
        url = str(request.url.path)
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # 记录请求开始
        # logger.info(f"Request started: {method} {url} from {client_ip}")
        
        try:
            # 处理请求
            response = await call_next(request)
            
            # 计算请求处理时间
            process_time = time.time() - start_time
            
            # 记录请求完成
            logger.info(
                f"Request completed: {method} {url} - "
                f"Status: {response.status_code} - "
                f"Duration: {process_time:.4f}s - "
            )
            
            # 添加响应头显示处理时间
            response.headers["X-Process-Time"] = str(process_time)
            
            return response
            
        except Exception as e:
            # 计算错误处理时间
            process_time = time.time() - start_time
            
            # 记录请求错误
            logger.error(
                f"Request failed: {method} {url} - "
                f"Error: {str(e)} - "
                f"Duration: {process_time:.4f}s - "
                f"Client: {client_ip} - "
                f"User-Agent: {user_agent}"
            )
            
            # 重新抛出异常
            raise e