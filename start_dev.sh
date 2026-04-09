#!/bin/bash

# TickList 任务管理系统启动脚本

echo "=================================="
echo "TickList 任务管理系统"
echo "=================================="

# 检查是否安装了 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查是否安装了 Python
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 Python3，请先安装 Python3"
    exit 1
fi

echo "正在构建前端应用..."

# 构建前端应用
cd frontend

echo "正在安装前端依赖..."
bun install

echo "正在构建前端开发版本（带 source map）..."
bun run build:dev

if [ $? -ne 0 ]; then
    echo "前端构建失败，请检查错误信息"
    exit 1
fi

echo "前端构建完成！"
echo "正在启动前端监听模式..."

# 在后台启动前端监听构建
bun run build:dev -- --watch &
FRONTEND_PID=$!

echo "前端监听模式已启动，文件变化时将自动重新构建"

cd ../backend

# 复制config.yaml.example到config.yaml（如果config.yaml不存在）
if [ ! -f "config.yaml" ] && [ -f "config.yaml.example" ]; then
    echo "正在复制 config.yaml.example 到 config.yaml..."
    cp config.yaml.example config.yaml
    echo "配置文件复制完成！"
fi

echo "正在启动后端服务..."

# 启动后端服务
if [ ! -d ".venv" ]; then
    echo "创建 Python 虚拟环境..."
    uv venv
fi

source .venv/bin/activate
uv pip install -r requirements.txt

echo "后端服务启动中..."
python run_dev.py &
BACKEND_PID=$!

echo "=================================="
echo "服务启动完成!"
echo "应用地址: http://localhost:5000"
echo "API 文档: http://localhost:5000/docs"
echo "=================================="
echo "前后端现在运行在同一端口 (5000)"
echo "前端已启用监听模式，文件变化时自动重新构建"
echo "按 Ctrl+C 停止服务"

# 等待用户中断
trap "echo '正在停止服务...'; kill $FRONTEND_PID $BACKEND_PID; exit" INT
wait
