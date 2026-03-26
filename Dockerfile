# ==========================================
# Stage 1: Frontend Build
# ==========================================
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# 复制前端依赖文件
COPY frontend/package.json frontend/package-lock.json ./

# 安装前端依赖
RUN npm ci

# 复制前端源代码
COPY frontend/ ./

# 构建前端
RUN npm run build

# ==========================================
# Stage 2: Production
# ==========================================
FROM python:3.11-slim AS production

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 复制后端依赖文件
COPY backend/requirements.txt ./

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY backend/ ./

# 从前端构建阶段复制静态文件
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# 设置前端静态文件路径环境变量
ENV FRONTEND=/app/frontend/dist

# 数据库连接字符串（可通过 docker run -e 覆盖）
# 示例:
#   SQLite: sqlite:///ticklist.db
#   MySQL: mysql+pymysql://user:password@host:3306/dbname?charset=utf8mb4
# ENV DB_CONNECT_STRING=sqlite:///ticklist.db

# 创建日志目录
RUN mkdir -p /app/logs

# 暴露端口
EXPOSE 5000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:5000/api/health')" || exit 1

# 启动命令
CMD ["python", "run_prod.py"]
