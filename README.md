# TickList - 任务管理系统

基于 FastAPI + SQLAlchemy + React + TypeScript + Ant Design 的任务管理系统，支持多级嵌套任务、任务统计等功能。

## 技术栈

### 后端
- FastAPI - 现代化的 Python Web 框架
- SQLAlchemy - ORM 框架（支持 SQLite/MySQL）
- SQLite - 默认数据库（零配置，开箱即用）
- MySQL - 可选生产数据库
- JWT - 用户认证
- bcrypt - 密码加密

### 前端
- React 18 - UI 框架
- TypeScript - 类型安全
- Ant Design 5 - UI 组件库
- Webpack 5 - 打包工具
- Axios - HTTP 客户端

## 功能特性

- ✅ 用户注册与登录（本地用户名密码）
- ✅ 任务 CRUD 操作
- ✅ 多级嵌套任务（支持无限层级）
- ✅ 任务状态管理（待处理、进行中、已完成、已取消）
- ✅ 优先级标记（红黄蓝灰旗）
- ✅ 任务置顶
- ✅ 截止日期和提醒时间
- ✅ 标签管理
- ✅ 任务搜索
- ✅ 任务复制
- ✅ 右键菜单操作
- ✅ 任务统计和图表
- ✅ 响应式布局

## 项目结构

```
ticklist/
├── backend/                 # 后端代码
│   ├── routes/             # API 路由
│   │   ├── auth.py        # 认证路由
│   │   ├── task.py        # 任务路由
│   │   └── statistics.py  # 统计路由
│   ├── database/           # 数据库层
│   │   ├── dao/           # 数据访问对象
│   │   │   ├── task_dao.py
│   │   │   ├── statistics_dao.py
│   │   │   ├── user_dao.py
│   │   │   └── token_dao.py
│   │   └── connection.py  # 数据库连接
│   ├── middleware/         # 中间件
│   │   ├── jwt_middleware.py
│   │   └── logging_middleware.py
│   ├── utils/             # 工具函数
│   │   ├── logger.py
│   │   └── auth_utils.py
│   ├── config/            # 配置
│   │   ├── config_loader.py
│   │   └── database.py
│   ├── models.py          # 数据模型
│   ├── app.py             # 应用入口
│   ├── config.yaml        # 配置文件
│   ├── requirements.txt   # Python 依赖
│   ├── run_dev.py         # 开发环境启动
│   └── run_prod.py        # 生产环境启动
│
└── frontend/               # 前端代码
    ├── src/
    │   ├── api/           # API 调用
    │   │   ├── index.ts
    │   │   ├── auth.ts
    │   │   ├── task.ts
    │   │   └── statistics.ts
    │   ├── components/    # 组件
    │   │   ├── AppHeader.tsx
    │   │   ├── AppSider.tsx
    │   │   ├── TaskList.tsx
    │   │   ├── TaskItem.tsx
    │   │   ├── TaskEditor.tsx
    │   │   ├── TaskContextMenu.tsx
    │   │   └── TaskCreateModal.tsx
    │   ├── pages/         # 页面
    │   │   ├── LoginPage.tsx
    │   │   ├── TaskPage.tsx
    │   │   └── StatisticsPage.tsx
    │   ├── layouts/       # 布局
    │   │   └── MainLayout.tsx
    │   ├── contexts/      # Context
    │   │   └── TaskContext.tsx
    │   ├── types/         # TypeScript 类型
    │   │   └── index.ts
    │   ├── App.tsx        # 应用入口
    │   └── index.tsx      # 渲染入口
    ├── package.json       # 前端依赖
    ├── webpack.config.js  # Webpack 配置
    └── tsconfig.json      # TypeScript 配置
```

## 安装和运行

### 前置要求

- Python 3.8+
- Node.js 14+
- Docker（可选，用于容器化部署）

> **数据库说明**：默认使用 SQLite，无需额外安装和配置。如需使用 MySQL，请确保 MySQL 5.7+ 服务可用。

### Docker 部署（推荐）

#### 1. 配置文件

复制配置示例文件并根据实际环境修改：

```bash
cp backend/config.yaml.example backend/config.yaml
```

编辑 `backend/config.yaml`：

```yaml
environment: production

jwt:
  secret_key: "your-secure-secret-key"    # 生产环境务必修改为强密钥
  algorithm: "HS256"
  access_token_expire_hours: 24           # Token 有效期（小时）

database:
  connect_string: "sqlite:///ticklist.db"
  # 连接字符串示例:
  # SQLite: sqlite:///ticklist.db
  # MySQL: mysql+pymysql://username:password@host:3306/ticklist?charset=utf8mb4

cors:
  allowed_origins:
    - "http://localhost:5000"
    - "http://127.0.0.1:5000"

logging:
  level: INFO
  console_level: INFO
  file_level: INFO
  error_level: ERROR
  log_dir: "logs"
```

> **数据库配置说明**：
> - **SQLite（默认）**：`sqlite:///ticklist.db`，数据存储在指定文件中，适合开发和小型部署
> - **MySQL**：使用 `mysql+pymysql://用户名:密码@主机:端口/数据库名?charset=utf8mb4` 格式
> - **环境变量优先**：可通过 `DB_CONNECT_STRING` 环境变量覆盖配置文件的设置
> - Docker 中使用 MySQL 时，主机可设为 `host.docker.internal`（Docker Desktop）或宿主机 IP
> - `jwt.secret_key` 生产环境务必修改为安全的随机字符串

#### 2. 构建镜像

```bash
docker build -t ticklist:latest .
```

#### 3. 运行容器

**使用 SQLite（默认）：**

```bash
docker run -d \
  -p 5000:5000 \
  -v $(pwd)/backend/config.yaml:/app/config.yaml \
  --name ticklist \
  ticklist:latest
```

**使用 MySQL（通过环境变量）：**

```bash
docker run -d \
  -p 5000:5000 \
  -e DB_CONNECT_STRING="mysql+pymysql://user:password@mysql-host:3306/ticklist?charset=utf8mb4" \
  -v $(pwd)/backend/config.yaml:/app/config.yaml \
  --name ticklist \
  ticklist:latest
```

服务启动后访问 `http://localhost:5000`。

#### 4. 常用命令

```bash
# 查看日志
docker logs -f ticklist

# 停止容器
docker stop ticklist

# 重启容器
docker restart ticklist

# 删除容器
docker rm -f ticklist
```

### 本地开发启动

使用一键启动脚本同时启动前后端（开发环境）：

```bash
./start_dev.sh
```

该脚本会自动：
1. 安装前端依赖
2. 构建前端应用
3. 启动前端监听模式（文件变化自动重新构建）
4. 创建 Python 虚拟环境
5. 安装后端依赖
6. 启动后端服务

服务启动后：
- 应用地址: `http://localhost:5000`
- API 文档: `http://localhost:5000/docs`

按 `Ctrl+C` 停止所有服务。

### 手动启动

#### 后端安装

1. 进入后端目录：
```bash
cd backend
```

2. 安装 Python 依赖：
```bash
pip install -r requirements.txt
```

3. 配置：
复制并编辑配置文件（各字段说明见上方 Docker 部署章节）：
```bash
cp config.yaml.example config.yaml
```

4. 启动后端服务：

开发环境：
```bash
python run_dev.py
```

生产环境：
```bash
python run_prod.py
```

后端服务将在 `http://localhost:5000` 启动。

#### 前端安装

1. 进入前端目录：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

前端服务将在 `http://localhost:3000` 启动。

4. 构建生产版本：
```bash
npm run build
```

构建产物将输出到 `frontend/dist` 目录。

## API 文档

后端启动后，访问以下地址查看 API 文档：
- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`

## 主要 API 端点

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息
- `POST /api/auth/logout` - 退出登录
- `POST /api/auth/logout-all` - 登出所有设备
- `GET /api/auth/tokens` - 获取 token 列表

### 任务管理
- `GET /api/tasks` - 获取任务列表
- `POST /api/tasks` - 创建任务
- `GET /api/tasks/{task_id}` - 获取任务详情
- `PUT /api/tasks/{task_id}` - 更新任务
- `DELETE /api/tasks/{task_id}` - 删除任务
- `POST /api/tasks/{task_id}/move` - 移动任务
- `POST /api/tasks/{task_id}/duplicate` - 复制任务
- `POST /api/tasks/batch-update` - 批量更新任务
- `GET /api/tasks/{task_id}/children` - 获取子任务
- `GET /api/tasks/search` - 搜索任务

### 统计
- `GET /api/statistics/overview` - 获取统计概览
- `GET /api/statistics/daily` - 获取每日统计
- `GET /api/statistics/trend` - 获取趋势数据
- `GET /api/statistics/range` - 获取时间范围统计

## 数据模型

### Task（任务）
```python
{
  "id": "uuid",
  "title": "任务标题",
  "description": "任务描述",
  "status": "pending|in_progress|completed|cancelled",
  "priority": 0-4,  # 0=无, 1=红旗, 2=黄旗, 3=蓝旗, 4=灰旗
  "child_ids": ["子任务ID列表"],
  "user_id": "用户ID",
  "due_date": "截止日期",
  "reminder_time": "提醒时间",
  "is_pinned": true/false,
  "tags": ["标签1", "标签2"],
  "order": 0,
  "created_at": "创建时间",
  "updated_at": "更新时间",
  "completed_at": "完成时间"
}
```

## 开发说明

### 添加新功能

1. 后端：在 `backend/routes/` 添加新路由
2. 前端：在 `frontend/src/api/` 添加 API 调用
3. 创建对应的组件和页面

### 数据库索引

系统使用 SQLAlchemy ORM，会自动管理以下索引以优化查询性能：
- `user_id` - 用户数据查询
- `status` - 状态过滤
- `due_date` - 日期排序
- `list_id` - 清单关联查询
- `(user_id, order)` - 任务排序
- `(user_id, is_pinned)` - 置顶任务

## 注意事项

1. 本项目使用本地用户名密码认证
2. 默认使用 SQLite 数据库，无需额外安装，数据库文件自动创建
3. 数据库连接通过 `database.connect_string` 配置，支持 SQLite 和 MySQL
4. 可通过环境变量 `DB_CONNECT_STRING` 覆盖配置文件中的数据库设置（优先级更高）
5. 生产环境需要修改 `config.yaml` 中的 `jwt.secret_key`
6. 前后端集成部署时，后端会自动服务前端静态文件

## 许可证

MIT
