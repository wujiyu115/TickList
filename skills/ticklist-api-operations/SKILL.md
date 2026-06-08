---
name: ticklist-api-operations
description: Use when needing to create, read, update, or delete lists and tasks in TickList via API calls, or when user asks to manage their todo items, task lists, or organizational structures programmatically
---

# TickList API 操作

## 概述

通过 TickList 的 REST API 管理清单和任务。所有操作需要 JWT Bearer Token 认证。

## 基础地址

```
https://ticklist.caddy.bestnewbee.com:5002
```

**健康检查：** `GET /api/health`

## 认证

所有 API 调用需要在 `Authorization` 请求头中携带 Bearer Token。

### 前置配置

用户需在 shell 环境变量中配置凭证（如 `~/.zshrc`）：

```bash
export TICKLIST_USERNAME="你的用户名"
export TICKLIST_PASSWORD="你的密码"
```

这样 AI 只能看到变量名，无法读取实际密码。

### 登录获取 Token

```bash
curl -X POST https://ticklist.caddy.bestnewbee.com:5002/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"$TICKLIST_USERNAME\", \"password\": \"$TICKLIST_PASSWORD\"}"
```

**返回：** `{"user": {...}, "token": "ACCESS_TOKEN", "refresh_token": "REFRESH_TOKEN"}`

使用返回的 `token` 值作为后续所有请求的 Bearer Token。

> **注意：** 永远不要让用户在对话中直接输入密码，始终通过环境变量读取。

## 接口速查表

| 操作 | 方法 | 端点 |
|------|------|------|
| 创建清单 | POST | `/api/lists` |
| 获取所有清单 | GET | `/api/lists` |
| 获取清单详情 | GET | `/api/lists/{list_id}` |
| 更新清单 | PUT | `/api/lists/{list_id}` |
| 删除清单 | DELETE | `/api/lists/{list_id}` |
| 创建任务 | POST | `/api/tasks` |
| 获取所有任务 | GET | `/api/tasks` |
| 获取任务详情 | GET | `/api/tasks/{task_id}` |
| 更新任务 | PUT | `/api/tasks/{task_id}` |
| 删除任务 | DELETE | `/api/tasks/{task_id}` |
| 搜索任务 | GET | `/api/tasks/search?keyword=XXX` |

## 清单操作

### 创建清单

```bash
curl -X POST https://ticklist.caddy.bestnewbee.com:5002/api/lists \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "工作任务",
    "type": "list",
    "color": "#1677ff",
    "order": 0
  }'
```

**字段说明：**
- `name`（必填）：清单名称
- `type`：`"list"`（清单）或 `"folder"`（文件夹），默认 `"list"`
- `parent_id`：父文件夹 ID（用于嵌套清单）
- `color`：十六进制颜色值，默认 `"#1677ff"`
- `font_color`：字体颜色，可为 null
- `order`：排序序号，默认 0

### 获取所有清单

```bash
curl https://ticklist.caddy.bestnewbee.com:5002/api/lists \
  -H "Authorization: Bearer TOKEN"
```

**查询参数：** `type`（类型筛选）、`is_archived`（是否归档）、`skip`（跳过数量）、`limit`（返回数量）

### 更新清单

```bash
curl -X PUT https://ticklist.caddy.bestnewbee.com:5002/api/lists/{list_id} \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "新名称", "color": "#ff4d4f"}'
```

**可更新字段：** `name`、`parent_id`、`color`、`font_color`、`order`、`is_archived`、`is_pinned`

### 删除清单

```bash
curl -X DELETE "https://ticklist.caddy.bestnewbee.com:5002/api/lists/{list_id}?action=delete_tasks" \
  -H "Authorization: Bearer TOKEN"
```

**查询参数：**
- `action`：`"delete_tasks"`（删除清单内任务）或 `"move_tasks"`（移动任务到其他清单）
- `target_list_id`：当 action 为 `"move_tasks"` 时，指定目标清单 ID

## 任务操作

### 创建任务

```bash
curl -X POST https://ticklist.caddy.bestnewbee.com:5002/api/tasks \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "完成周报",
    "description": "本周工作总结",
    "list_id": "LIST_ID",
    "priority": 1,
    "due_date": "2026-06-01T18:00:00+08:00",
    "tags": ["工作"]
  }'
```

**字段说明：**
- `title`（必填）：任务标题
- `description`：描述文本
- `content`：检查事项 JSON 字符串，格式为 `[{"text":"事项名","checked":false}, ...]`，每个对象包含 `text`（事项文本）和 `checked`（是否完成，布尔值），`completedAt` 由后端自动补充无需传入
- `status`：`"pending"`（待完成）| `"completed"`（已完成），默认 `"pending"`
- `priority`：0（无）、1（低）、2（中）、3（高）
- `list_id`：所属清单 ID
- `parent_task_id`：父任务 ID（用于创建子任务）
- `start_time`：开始时间，ISO 8601 格式
- `due_date`：截止时间，ISO 8601 格式
- `reminder_time`：提醒时间，ISO 8601 格式
- `is_pinned`：是否置顶，布尔值
- `tags`：标签数组
- `order`：排序序号
- `push_due_notify`：是否推送到期提醒，布尔值

### 获取任务列表

```bash
curl "https://ticklist.caddy.bestnewbee.com:5002/api/tasks?list_id=LIST_ID&status=pending" \
  -H "Authorization: Bearer TOKEN"
```

**查询参数：** `status`（状态）、`exclude_status`（排除状态）、`list_id`（清单ID）、`tags`（标签，逗号分隔）、`is_pinned`（是否置顶）、`priority`（优先级，逗号分隔）、`keyword`（关键词）、`start_date`（开始日期）、`end_date`（结束日期）、`skip`（跳过数量）、`limit`（返回数量）

### 更新任务

```bash
curl -X PUT https://ticklist.caddy.bestnewbee.com:5002/api/tasks/{task_id} \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

**可更新字段：** `title`、`description`、`content`、`status`、`priority`、`list_id`、`start_time`、`due_date`、`reminder_time`、`is_pinned`、`tags`、`order`、`push_due_notify`

### 删除任务

```bash
curl -X DELETE https://ticklist.caddy.bestnewbee.com:5002/api/tasks/{task_id} \
  -H "Authorization: Bearer TOKEN"
```

### 搜索任务

```bash
curl "https://ticklist.caddy.bestnewbee.com:5002/api/tasks/search?keyword=周报" \
  -H "Authorization: Bearer TOKEN"
```

## 使用流程

1. **获取凭证**：向用户询问账号密码或 Token（永远不要硬编码）
2. **登录**：调用 `/api/auth/login` 获取 Token
3. **验证连通性**：调用 `/api/health` 确认服务可用
4. **执行操作**：使用 Bearer Token 执行增删改查
5. **反馈结果**：将操作结果以可读格式展示给用户

## 常见错误

- **缺少认证头**：除 `/api/health` 和 `/api/auth/*` 外，所有端点都需要 Bearer Token
- **日期格式错误**：必须使用 ISO 8601 格式并带时区（如 `2026-06-01T18:00:00+08:00`）
- **删除清单未指定 action**：必须指定 `action=delete_tasks` 或 `action=move_tasks` 来处理清单中的任务
- **创建子任务**：需要传 `parent_task_id`，排序序号会自动计算
