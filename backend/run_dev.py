#!/usr/bin/env python
# -*- coding: utf-8 -*-

import argparse
import os

import uvicorn
from utils.logger import logger


def _resolve_port() -> int:
    """端口解析优先级：命令行参数 > 环境变量 PORT > 默认 5000"""
    parser = argparse.ArgumentParser(description="TickList development server")
    parser.add_argument(
        "-p", "--port",
        type=int,
        default=None,
        help="服务监听端口，默认读取环境变量 PORT，未设置则使用 5000",
    )
    parser.add_argument(
        "--host",
        type=str,
        default=os.environ.get("HOST", "0.0.0.0"),
        help="服务监听地址，默认 0.0.0.0",
    )
    args, _ = parser.parse_known_args()

    if args.port is not None:
        return args.port, args.host
    env_port = os.environ.get("PORT")
    if env_port:
        try:
            return int(env_port), args.host
        except ValueError:
            logger.warning(f"环境变量 PORT={env_port} 无效，使用默认端口 5000")
    return 5000, args.host


if __name__ == "__main__":
    port, host = _resolve_port()
    logger.info(f"Starting TickList development server on {host}:{port} ...")
    uvicorn.run(
        "app:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
