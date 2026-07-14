# TickList - 任务管理系统

基于 FastAPI + React + TypeScript 的全功能任务管理系统，支持多级嵌套任务、番茄专注、AI 助手、日历视图、看板视图、笔记、计数器、多端同步等功能。

## 界面预览

采用「空间玻璃」视觉风格，支持亮色 / 暗色主题，桌面端与移动端自适应。

### 任务主界面

| 桌面端（亮色） | 桌面端（暗色） |
| :---: | :---: |
| ![任务-桌面-亮色](img/task-desktop-light.png) | ![任务-桌面-暗色](img/task-desktop-dark.png) |

| 移动端（亮色） | 移动端（暗色） |
| :---: | :---: |
| <img src="img/task-mobile-light.png" width="260" /> | <img src="img/task-mobile-dark.png" width="260" /> |

### 各功能界面（桌面 / 移动 × 亮色 / 暗色）

| 界面 | 桌面亮色 | 桌面暗色 | 移动亮色 | 移动暗色 |
| :---: | :---: | :---: | :---: | :---: |
| 日历视图 | ![日历-桌面亮](img/calendar-desktop-light.png) | ![日历-桌面暗](img/calendar-desktop-dark.png) | <img src="img/calendar-mobile-light.png" width="180" /> | <img src="img/calendar-mobile-dark.png" width="180" /> |
| 番茄专注 | ![番茄-桌面亮](img/pomodoro-desktop-light.png) | ![番茄-桌面暗](img/pomodoro-desktop-dark.png) | <img src="img/pomodoro-mobile-light.png" width="180" /> | <img src="img/pomodoro-mobile-dark.png" width="180" /> |
| 计数器 | ![计数器-桌面亮](img/counter-desktop-light.png) | ![计数器-桌面暗](img/counter-desktop-dark.png) | <img src="img/counter-mobile-light.png" width="180" /> | <img src="img/counter-mobile-dark.png" width="180" /> |
| 倒数日 | ![倒数日-桌面亮](img/countdown-desktop-light.png) | ![倒数日-桌面暗](img/countdown-desktop-dark.png) | <img src="img/countdown-mobile-light.png" width="180" /> | <img src="img/countdown-mobile-dark.png" width="180" /> |
| 笔记 | ![笔记-桌面亮](img/note-desktop-light.png) | ![笔记-桌面暗](img/note-desktop-dark.png) | <img src="img/note-mobile-light.png" width="180" /> | <img src="img/note-mobile-dark.png" width="180" /> |
| 设置 | ![设置-桌面亮](img/settings-desktop-light.png) | ![设置-桌面暗](img/settings-desktop-dark.png) | <img src="img/settings-mobile-light.png" width="180" /> | <img src="img/settings-mobile-dark.png" width="180" /> |

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
- ✅ 总结视图（任务/清单/标签 多维度概览）

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

### 笔记
- ✅ Tiptap WYSIWYG 编辑器（类 Typora 单栏实时渲染）
- ✅ 源码 Markdown 模式切换
- ✅ 选中文本浮动工具栏（粗体/斜体/下划线/删除线/代码/链接）
- ✅ 空行浮动菜单（标题/列表/引用/代码块/表格/分隔线）
- ✅ 表格操作工具栏（插入/删除 行列）
- ✅ 表格公式支持（SUM/AVG/COUNT/MAX/MIN）
- ✅ 代码块语法高亮（lowlight）
- ✅ 多层嵌套文件夹管理
- ✅ 笔记置顶 / 颜色标记
- ✅ 自动保存（1秒防抖）
- ✅ 笔记移动到文件夹
- ✅ 文件夹级联删除
- ✅ 三栏布局（侧边栏图标 + 文件夹树 + 编辑器）

### 计数器
- ✅ 创建 / 编辑 / 删除计数器
- ✅ 自定义初始值、步长、目标值（可选）
- ✅ 快捷增减计数（卡片 + 详情页）
- ✅ 目标值进度条（自动判断方向）
- ✅ 达标提示（锁定完成或继续计数）
- ✅ 操作历史记录（按时间倒序）
- ✅ 置顶 / 颜色标记 / 备注

### 统计分析
- ✅ 任务统计概览
- ✅ 每日统计
- ✅ 趋势图表
- ✅ 时间范围分析

### 数据管理
- ✅ JSON 导出 / 导入
- ✅ 滴答清单 CSV 导入（自动构建文件夹/清单层级、标签去重、优先级映射）

### 系统设置
- ✅ 主题配色（40 种方案：20 亮色 + 20 暗色）
- ✅ 默认任务视图设置
- ✅ 专注最短时长设置

### 账户与安全
- ✅ 用户注册与登录（JWT 认证 + Refresh Token 自动续期）
- ✅ WebAuthn Passkeys 免密登录（指纹、面容、安全密钥）
- ✅ 个人访问令牌（PAT）管理（创建、命名、撤销、最后使用时间追踪）
- ✅ 修改密码（独立页面，入口在用户下拉菜单）
- ✅ 管理员用户管理（查看用户列表、冻结/解冻、角色管理、重置密码、创建用户）
- ✅ 注册开关控制（`REGISTER_ENABLED` 环境变量）

### AI 智能助手
- ✅ 自然语言操作任务/笔记/倒数日/计数器/清单/标签（创建、查询、更新、删除）
- ✅ 三层 Pipeline 架构（L1 规则层 → L2 JSON Mode → L3 Tools Call），逐层降级
- ✅ L1 正则规则层：零延迟命中常见指令（"帮我创建任务 xxx"、"查一下今天的任务"等）
- ✅ L2 JSON Mode 层：轻量 LLM 调用做意图分类 + 参数填充，3-5s 响应
- ✅ L3 Tools Call 层：完整 function calling 兜底，处理复杂/多步操作
- ✅ 多 LLM 提供商支持（Claude / OpenAI / DeepSeek 等兼容 API）
- ✅ SSE 流式响应，实时展示文本 + 操作结果
- ✅ 数据快照格式可配（JSON / TOON），TOON 格式节省 30-55% token
- ✅ 各层超时可配，支持环境变量覆盖
- ✅ 对话上下文保持（conversation_id）
- ✅ 操作结果卡片展示（任务列表展开、倒数日列表等）
- ✅ 多轮消歧义交互（候选列表选择）
- ✅ 删除操作二次确认
- ✅ 独立 AI 对话页面（移动端）+ 侧边面板（PC 端）

### 多端支持
- ✅ 全站移动端适配（响应式布局，小屏幕侧边栏 Drawer 弹出）
- ✅ iOS / Android 原生应用（Capacitor）
- ✅ iOS 安全区域适配（状态栏、底部指示条）
- ✅ 本地通知推送（到期提醒，native 用原生通知 / web 用浏览器提示）
- ✅ 首次启动服务器配置页（native 端动态设置 API 地址）
- ✅ 侧边栏面板折叠（持久化）
- ✅ 暗色模式（20 种暗色主题）

### CI/CD
- ✅ GitHub Actions 自动构建 Docker 镜像
- ✅ GitHub Actions 自动构建 iOS IPA（tag 触发）
- ✅ GitHub Actions 自动构建 Android APK（tag 触发）

## 安装和运行

### 前置要求

- Python 3.8+
- [uv](https://docs.astral.sh/uv/)（Python 依赖管理）
- [Bun](https://bun.sh/)（前端包管理）
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

webauthn:
  rp_id: "your-domain.com"              # 部署域名
  rp_name: "TickList"                    # 应用显示名
  origin: "https://your-domain.com"      # 完整源地址（需 HTTPS）

auth:
  admin_username: "your_admin_name"      # 指定管理员用户名（可选）
  register_enabled: true                 # 是否允许注册（默认 true）
```

> **数据库配置说明**：
> - **SQLite（默认）**：`sqlite:///ticklist.db`，数据存储在指定文件中，适合开发和小型部署
> - **MySQL**：使用 `mysql+pymysql://用户名:密码@主机:端口/数据库名?charset=utf8mb4` 格式
> - **环境变量优先**：可通过 `DB_CONNECT_STRING` 环境变量覆盖配置文件的设置
> - Docker 中使用 MySQL 时，主机可设为 `host.docker.internal`（Docker Desktop）或宿主机 IP
> - `jwt.secret_key` 生产环境务必修改为安全的随机字符串
> - **WebAuthn 配置**：生产环境需要 HTTPS，`rp_id` 需与实际部署域名一致
> - 可通过环境变量覆盖 WebAuthn 配置：`WEBAUTHN_RP_ID`、`WEBAUTHN_RP_NAME`、`WEBAUTHN_ORIGIN`
> - 可通过 `REGISTER_ENABLED=false` 关闭用户注册

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
  -e WEBAUTHN_RP_ID="your-domain.com" \
  -e WEBAUTHN_RP_NAME="TickList" \
  -e WEBAUTHN_ORIGIN="https://your-domain.com" \
  --name ticklist \
  ticklist:latest
```

> 通过 `-v $(pwd)/data:/app/data` 将数据库文件挂载到宿主机，防止容器删除后数据丢失。对应 `config.yaml` 中需配置 `connect_string: "sqlite:///data/ticklist.db"`。
> WebAuthn 环境变量为可选项，仅在需要 Passkey 登录时配置。

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
uv pip install -r requirements.txt
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
bun install
```

3. 启动开发服务器：
```bash
bun run dev
```

前端服务将在 `http://localhost:3000` 启动。

4. 构建生产版本：
```bash
bun run build
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

1. 本项目支持用户名密码认证和 WebAuthn Passkeys 免密登录
2. 默认使用 SQLite 数据库，无需额外安装，数据库文件自动创建
3. 数据库连接通过 `database.connect_string` 配置，支持 SQLite 和 MySQL
4. 可通过环境变量 `DB_CONNECT_STRING` 覆盖配置文件中的数据库设置（优先级更高）
5. 生产环境需要修改 `config.yaml` 中的 `jwt.secret_key`
6. 前后端集成部署时，后端会自动服务前端静态文件
7. WebAuthn Passkeys 功能需要 HTTPS 环境（localhost 开发除外）
8. AI 功能需要配置 LLM API Key（支持 Claude / OpenAI / DeepSeek 等兼容 API）

---

## 开发者指南

### 技术栈

**后端**：FastAPI + SQLAlchemy（SQLite/MySQL） + JWT（Access + Refresh Token） + bcrypt + py_webauthn + AI Pipeline（Claude/OpenAI/DeepSeek）

**前端**：React 18 + TypeScript + Ant Design 5 + Rsbuild + Tiptap + Capacitor（iOS/Android） + Axios + @simplewebauthn/browser + SSE

**CI/CD**：GitHub Actions（Docker 镜像 + iOS IPA + Android APK 自动构建）

### 项目结构

```
ticklist/
├── backend/                 # 后端代码
│   ├── config/             # 配置模块
│   ├── database/           # 数据库层
│   │   ├── dao/            # 数据访问对象（task/list/tag/filter/focus/countdown/counter/note/pat 等）
│   │   ├── connection.py   # 数据库连接（含自动迁移）
│   │   └── models.py       # SQLAlchemy 模型
│   ├── middleware/          # 中间件（JWT、日志）
│   ├── routes/             # API 路由（auth/task/calendar/focus/countdown/counter/note/ai/pat/admin 等）
│   ├── services/           # 后台服务（到期提醒调度、AI Pipeline）
│   │   └── ai/             # AI 模块
│   │       ├── pipeline/   # 三层 Pipeline（RuleHandler → JsonModeHandler → ToolsCallHandler）
│   │       ├── formatters/ # 数据快照格式化器（JSON / TOON）
│   │       ├── system_prompt.py  # System prompt 构建
│   │       ├── tools_schema.py   # 工具定义（Anthropic 格式）
│   │       └── tools_executor.py # 工具执行器（DAO 调用）
│   ├── utils/              # 工具函数
│   ├── app.py              # 应用入口
│   ├── config.yaml         # 配置文件
│   ├── run_dev.py          # 开发环境启动
│   └── run_prod.py         # 生产环境启动
│
├── frontend/                # 前端代码
│   ├── ios/                # iOS 原生工程（Capacitor）
│   ├── android/            # Android 原生工程（Capacitor）
│   └── src/
│       ├── api/            # API 调用（auth/task/calendar/focus/countdown/counter/note/ai/pat 等）
│       ├── components/     # 组件（TaskList/KanbanView/CalendarView/PomodoroTimer/TiptapEditor/AiChatPanel 等）
│       ├── extensions/     # Tiptap 扩展（表格公式等）
│       ├── contexts/       # 全局状态（TaskContext/FocusContext）
│       ├── hooks/          # 自定义 Hook（useTimer）
│       ├── services/       # 通知服务（native 原生通知 / web message）
│       ├── utils/          # 平台判断、API 地址管理
│       ├── layouts/        # 布局
│       └── pages/          # 页面（Task/Calendar/Pomodoro/Countdown/Counter/Note/AI/Summary/Statistics/Settings）
│
├── .github/workflows/       # CI/CD（Docker 镜像 / iOS IPA / Android APK）
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

### 测试

项目拥有完整的自动化测试体系，后端使用 pytest、前端使用 Vitest，共 133 个测试用例，覆盖全部核心模块。

#### 运行测试

```bash
# 一键运行全部测试（前端 + 后端）
bash run_all_test.sh

# 单独运行后端测试
cd backend && python -m pytest tests/ -v

# 单独运行前端测试
cd frontend && bun run test:run

# 前端测试 UI 模式（交互式）
cd frontend && bun run test:ui
```

#### 后端测试

- **框架**：pytest + httpx TestClient + SQLite 内存数据库
- **测试文件**：`backend/tests/`
- **覆盖模块**：认证、任务管理、清单、标签、日历、统计、倒数日、计数器、专注、设置、过滤器、数据导入导出

#### 前端测试

- **框架**：Vitest + MSW (Mock Service Worker) + @testing-library/react
- **测试文件**：`frontend/src/**/__tests__/`
- **测试类型**：API 层测试 + 组件测试 + 页面测试
- **覆盖范围**：全部 12 个页面、核心组件（TaskItem、TaskList、TaskCreateModal）、4 个 API 模块

#### 编写新测试

- **后端**：使用 `conftest.py` 中的 fixtures（`app_client`、`auth_headers` 等），测试函数自动获取已认证的客户端实例
- **前端**：MSW handlers 自动拦截 API 请求，mock 数据工厂在 `src/tests/mocks/data.ts` 中统一管理

## 许可证

MIT
