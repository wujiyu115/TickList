# TickList - 任务管理系统

基于 FastAPI + React + TypeScript 的全功能任务管理系统，支持多级嵌套任务、番茄专注、日历视图、看板视图、数据统计等功能。

## 功能特性

### 任务管理
- ✅ 任务 CRUD 操作
- ✅ 多级嵌套任务（支持无限层级父子关系）
- ✅ 任务状态管理（待处理、已完成）
- ✅ 优先级标记（高/中/低/无）
- ✅ 任务置顶
- ✅ 截止日期和提醒时间
- ✅ 标签管理（创建、编辑、颜色标记）
- ✅ 任务搜索（标题和描述模糊匹配）
- ✅ 任务复制
- ✅ 右键菜单快捷操作（日期设置、优先级、删除等）
- ✅ 批量操作

### 视图模式
- ✅ 列表视图（默认）
- ✅ 看板视图
- ✅ 已完成任务视图（按日期分组、分页加载）
- ✅ 日历视图（按月展示、按日查看）

### 筛选与过滤
- ✅ 快速筛选（今天、最近7天、收集箱）
- ✅ 自定义过滤器（按清单、标签、日期、优先级、关键词组合筛选）
- ✅ 清单管理（文件夹/清单层级）
- ✅ 任务视图默认展示今日任务

### 番茄专注
- ✅ 倒计时 / 正计时模式
- ✅ 关联任务
- ✅ 暂停 / 继续 / 结束控制
- ✅ 最短有效时长配置
- ✅ 专注记录（含关联任务标题）
- ✅ 跨页面状态保持

### 垃圾箱
- ✅ 软删除（递归删除子任务）
- ✅ 恢复 / 永久删除
- ✅ 清空垃圾箱

### 倒数日
- ✅ 创建 / 编辑 / 删除倒数日事件

### 统计分析
- ✅ 任务统计概览
- ✅ 每日统计
- ✅ 趋势图表
- ✅ 时间范围分析

### 数据管理
- ✅ JSON 导出 / 导入
- ✅ 滴答清单 CSV 导入（自动构建文件夹/清单层级、标签去重、优先级映射）

### 系统设置
- ✅ 主题配色（8种方案）
- ✅ 默认任务视图设置
- ✅ 专注最短时长设置

### 其他
- ✅ 用户注册与登录（JWT 认证）
- ✅ 侧边栏面板折叠（持久化）
- ✅ 响应式布局
- ✅ 到期提醒推送

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
  -v $(pwd)/data:/app/data \
  --name ticklist \
  ticklist:latest
```

> 通过 `-v $(pwd)/data:/app/data` 将数据库文件挂载到宿主机，防止容器删除后数据丢失。对应 `config.yaml` 中需配置 `connect_string: "sqlite:///data/ticklist.db"`。

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

## 管理员配置

### 自动管理员

第一个注册的用户会自动成为管理员，无需额外配置。

### 通过环境变量指定管理员

通过 `ADMIN_USERNAME` 环境变量指定管理员用户名，该用户注册时会自动获得管理员权限：

```bash
# 环境变量方式
export ADMIN_USERNAME=your_admin_name

# 或在 config.yaml 中配置
auth:
  admin_username: "your_admin_name"
```

Docker 运行时指定管理员：

```bash
docker run -d \
  -p 5000:5000 \
  -e ADMIN_USERNAME=your_admin_name \
  -v $(pwd)/backend/config.yaml:/app/config.yaml \
  -v $(pwd)/data:/app/data \
  --name ticklist \
  ticklist:latest
```

### 管理后台修改

已有管理员后，可在管理后台的用户管理页面直接修改其他用户的角色。

### 优先级规则

管理员角色判定按以下优先级：
1. 第一个注册的用户 → 自动成为管理员
2. 用户名匹配 `ADMIN_USERNAME` → 自动成为管理员
3. 其他情况 → 普通用户

## 注意事项

1. 本项目使用本地用户名密码认证
2. 默认使用 SQLite 数据库，无需额外安装，数据库文件自动创建
3. 数据库连接通过 `database.connect_string` 配置，支持 SQLite 和 MySQL
4. 可通过环境变量 `DB_CONNECT_STRING` 覆盖配置文件中的数据库设置（优先级更高）
5. 生产环境需要修改 `config.yaml` 中的 `jwt.secret_key`
6. 前后端集成部署时，后端会自动服务前端静态文件

---

## 开发者指南

### 技术栈

**后端**：FastAPI + SQLAlchemy（SQLite/MySQL） + JWT + bcrypt

**前端**：React 18 + TypeScript + Ant Design 5 + Webpack 5 + Axios

### 项目结构

```
ticklist/
├── backend/                 # 后端代码
│   ├── config/             # 配置模块
│   ├── database/           # 数据库层
│   │   ├── dao/            # 数据访问对象（task/list/tag/filter/focus/countdown 等）
│   │   ├── connection.py   # 数据库连接（含自动迁移）
│   │   └── models.py       # SQLAlchemy 模型
│   ├── middleware/          # 中间件（JWT、日志）
│   ├── routes/             # API 路由（auth/task/calendar/focus/countdown/data 等）
│   ├── services/           # 后台服务（到期提醒调度）
│   ├── utils/              # 工具函数
│   ├── app.py              # 应用入口
│   ├── config.yaml         # 配置文件
│   ├── run_dev.py          # 开发环境启动
│   └── run_prod.py         # 生产环境启动
│
├── frontend/                # 前端代码
│   └── src/
│       ├── api/            # API 调用（auth/task/calendar/focus/countdown/data 等）
│       ├── components/     # 组件（TaskList/KanbanView/CalendarView/PomodoroTimer 等）
│       ├── contexts/       # 全局状态（TaskContext/FocusContext）
│       ├── hooks/          # 自定义 Hook（useTimer）
│       ├── layouts/        # 布局
│       └── pages/          # 页面（Task/Calendar/Pomodoro/Countdown/Statistics/Settings）
│
├── Dockerfile              # Docker 构建（多阶段、跨架构优化）
└── start_dev.sh            # 一键开发启动脚本
```

### API 文档

后端启动后，访问以下地址查看完整 API 文档：
- Swagger UI: `http://localhost:5000/docs`
- ReDoc: `http://localhost:5000/redoc`

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
- `deleted_at` - 垃圾箱过滤
- `(user_id, order)` - 任务排序
- `(user_id, is_pinned)` - 置顶任务
- `(user_id, deleted_at)` - 用户任务软删除过滤

## 许可证

MIT
