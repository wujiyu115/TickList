# 计数器功能设计文档

> **日期**: 2026-04-18
> **状态**: 已批准

## 目标

为 TickList 添加计数器功能，支持创建可增减的计数项，可选配置目标值，带完整的操作历史记录。UI 布局参考现有倒数日功能。

## 数据模型

### counters 表（计数器主表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键，UUID |
| user_id | String(36) | 用户 ID，索引 |
| title | String(200) | 计数器名称 |
| initial_value | Integer | 初始值（默认 0） |
| current_value | Integer | 当前值 |
| step | Integer | 递增/递减步长（默认 1） |
| target_value | Integer, nullable | 目标值（可为空） |
| is_completed | Boolean | 是否已完成 |
| is_pinned | Boolean | 是否置顶 |
| color | String(50) | 卡片颜色 |
| note | Text | 备注 |
| created_at | String(50) | 创建时间 |
| updated_at | String(50) | 更新时间 |

### counter_histories 表（操作历史表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | String(36) | 主键，UUID |
| counter_id | String(36) | 关联计数器 ID，索引 |
| user_id | String(36) | 用户 ID |
| action | String(20) | increment / decrement |
| change_value | Integer | 变化量（正数） |
| before_value | Integer | 操作前的值 |
| after_value | Integer | 操作后的值 |
| created_at | String(50) | 操作时间 |

## API 接口

### CRUD
- POST /api/counters — 创建计数器
- GET /api/counters — 获取列表（分页）
- GET /api/counters/{id} — 获取详情
- PUT /api/counters/{id} — 更新
- DELETE /api/counters/{id} — 删除（级联删除历史）

### 计数操作
- POST /api/counters/{id}/increment — 增加计数
- POST /api/counters/{id}/decrement — 减少计数（最低 0）
- PUT /api/counters/{id}/complete — 标记完成
- PUT /api/counters/{id}/reopen — 重新打开

### 历史记录
- GET /api/counters/{id}/histories — 获取历史（分页，时间倒序）

## 前端页面

### 列表页 /counter
- 参考倒数日卡片式网格布局
- 卡片显示：标题、当前值/目标值、进度条（有目标时）、快捷 +/- 按钮
- 支持置顶、编辑、删除
- 已完成状态特殊样式

### 详情页 /counter/:id
- 大字体当前值 + 进度条
- 增减按钮
- 信息区：初始值、步长、目标值、备注
- 操作历史列表（时间倒序，分页加载）

### 达标提示
- increment/decrement 返回 reached_target 标记
- 弹出 Modal 让用户选择锁定或继续

## 业务规则
- 当前值最低为 0，不允许负数
- 目标值可为空，空时无达标逻辑
- 目标方向自动判断：初始值 < 目标值 → 向上，反之向下
- is_completed=true 时禁用增减操作
