# AI Dialog Design

## Overview

独立 `/ai` 页面，用户用自然语言对话操作项目中所有实体：任务、倒数日、笔记、计数器、清单、标签的增删改查。后端代理 LLM API，用 function calling/tool use 实现精确操作。

## Architecture

```
前端 /ai 页面 → POST /api/ai/chat → 后端 AI Service
                                      ↓
                                   LLM API (Claude/OpenAI)
                                      ↓ tool call request
                                   后端执行 tool → CRUD 操作
                                      ↓ tool result
                                   LLM 生成回复 → 前端展示
```

### Flow

1. 用户发消息（如"帮我创建一个明天截止的任务：写周报"）
2. 后端加载用户数据上下文（tasks, notes, counters, countdowns 等），组装 system prompt
3. 后端调 LLM API，带 tools 定义
4. LLM 返回 tool_call（如 `create_task`）
5. 后端执行 tool 对应的 CRUD 操作
6. 将结果返回给 LLM，LLM 生成自然语言回复
7. 前端展示回复，刷新数据

## Backend

### New files

- `backend/routes/ai.py` — API 路由
- `backend/services/ai_service.py` — AI 核心逻辑（LLM 调用、tool 执行）
- `backend/models/ai.py` — Pydantic request/response models

### API endpoint

```
POST /api/ai/chat
Body: { message: string, conversation_id?: string }
Response: Stream (SSE) or JSON { reply: string, actions: [{tool, params, result}] }
```

### LLM Provider

后端 config 加 `ai.provider`（claude/openai）和 `ai.api_key`。初期用 Claude API（Anthropic SDK），后续可切换。

### System Prompt

自动加载用户数据，精简版：

```
你是 TickList 的智能助手。用户当前数据：
- 任务：[{id, title, status, priority, due_date, tags}]（最近50条）
- 笔记：[{id, title, folder_id, tags}]（最近20条）
- 计数器：[{id, name, value}]
- 倒数日：[{id, title, target_date}]
- 清单：[{id, name}]
- 标签：[{id, name}]

可用操作见 tools 定义。用自然语言回复用户。
```

### Tools 定义

每个实体 4 个操作（CRUD），共约 24 个 tools：

**任务**
- `list_tasks` — 查询任务列表（支持 status/priority/list_id/tags 筛选）
- `create_task` — 创建任务（title, priority, list_id, due_date, start_time, tags）
- `update_task` — 更新任务（status, title, priority, due_date, tags 等）
- `delete_task` — 删除任务

**笔记**
- `list_notes` — 查询笔记列表（支持 folder_id/tags 筛选）
- `create_note` — 创建笔记（title, folder_id, tags）
- `update_note` — 更新笔记（title, content, folder_id, tags）
- `delete_note` — 删除笔记

**倒数日**
- `list_countdowns` — 查询倒数日列表
- `create_countdown` — 创建倒数日（title, target_date）
- `update_countdown` — 更新倒数日
- `delete_countdown` — 删除倒数日

**计数器**
- `list_counters` — 查询计数器列表
- `create_counter` — 创建计数器（name, initial_value）
- `update_counter` — 更新计数器（increment, decrement, reset）
- `delete_counter` — 删除计数器

**清单/标签**
- `list_lists` / `list_tags` — 查询
- `create_list` / `create_tag` — 创建
- `update_list` / `update_tag` — 更新
- `delete_list` / `delete_tag` — 删除

### Tool 执行

每个 tool 映射到现有 DAO 方法调用。如 `create_task` → `task_dao.create_task()`。不需要新建 DAO，复用现有逻辑。

### Multi-turn conversation

- `conversation_id` 标识对话，后端存最近 20 条消息历史
- 存储方式：内存 dict 或 Redis（初期内存足够）
- 历史消息随 tool_call 和 tool_result 一同发给 LLM

## Frontend

### New files

- `frontend/src/pages/AiPage.tsx` — AI 对话页面
- `frontend/src/pages/AiPage.less` — 样式
- `frontend/src/api/ai.ts` — API 调用
- `frontend/src/types/index.ts` — 加 AiChatMessage 类型

### Page layout

- 顶部：页面标题 "AI 助手"
- 中间：对话消息列表（用户消息 + AI 回复）
- 底部：输入框 + 发送按钮
- 每条 AI 回复中，如有 tool 操作，显示操作结果卡片（如 "创建了任务：写周报 ✓"）

### Sidebar

- AppSider 加 `/ai` 路由入口，图标用 `RobotOutlined` 或 `MessageOutlined`

### Streaming

初期用 JSON 响应（简单）。后续可升级为 SSE streaming（更流畅）。

## Security & Constraints

- AI 只能操作当前用户的数据（user_id 从 JWT 获取）
- 不暴露敏感字段（如 other users' data）
- 删除操作需 AI 在回复中确认意图后再执行，或加 `confirm_before_delete` tool 标记
- LLM API key 存环境变量，不暴露到前端
- Rate limiting：每用户每分钟最多 20 条消息

## Success Criteria

- 用户说"帮我创建一个任务" → AI 正确创建并回复确认
- 用户说"查看本周要完成的任务" → AI 正确筛选并列出
- 用户说"把计数器步数加1" → AI 正确操作计数器
- 用户说"删除倒数日生日" → AI 提醒确认后删除
- 多轮对话能记住上下文

## Scope Limitations

- 初期不支持：子任务操作、清单内文件夹嵌套、笔记内容编辑（太长）
- 初期不支持：AI 主动推送/提醒
- 初期不支持：图片/语音输入