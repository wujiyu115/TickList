# AI Hybrid Pipeline 设计文档

**日期**：2026-04-27
**作者**：吴济宇 + AI 协作设计
**状态**：Draft（待 review）

---

## 1. 背景与目标

### 1.1 现状

`backend/services/ai/` 包当前提供 `chat_stream` 入口，对每条用户消息无差别地调用 LLM 的 tool calling 能力：
- 每轮请求都把全部 24 个工具的 schema 注入 system prompt
- 每轮请求都把用户全量数据快照（任务 50 条 + 笔记 20 条 + 计数器/倒数日/清单/标签）注入 system prompt
- 闲聊（"你好"/"你能做什么"）也走完整的 tool calling 链路

存在的问题：
1. **token 消耗高**：高频简单操作（"加任务 xx"）成本远高于必要
2. **延迟大**：所有请求都需要 LLM 一次完整推理
3. **provider 兼容性差**：DeepSeek 等便宜模型对 tool calling 支持参差不齐

### 1.2 目标

引入**三层 Pipeline 架构**，对不同复杂度的请求采用不同的处理路径：

| 层级 | 处理对象 | 成本 | 延迟 |
|---|---|---|---|
| Layer 1 (规则) | 高频明确指令（"加任务 xx"、"完成报告"） | 0 | < 50ms |
| Layer 2 (JSON Mode) | 中等复杂度自然语言（"明天提醒我开会"、"查今天的任务"） | 低（无 TOOLS schema） | ~1s |
| Layer 3 (tools_call) | 复杂请求 / 多步操作 / 兜底 | 高（完整 TOOLS） | 2~5s |

### 1.3 非目标

明确**不在本设计范围内**：
- 闲聊/查询的语义缓存
- 跨会话用户偏好学习
- 前端的快捷指令面板（如 `/add`）
- MCP 协议接入
- AI 用量统计/账单

---

## 2. 架构总览

### 2.1 Pipeline 链式架构

采用 **Handler 类继承 + 链式 next_handler** 模式：

```
用户消息 (message + user_id + conversation_id)
    │
    ▼
┌─────────────────────────────────────────────────────┐
│ Pipeline                                             │
│                                                      │
│  RuleHandler ──► JsonModeHandler ──► ToolsCallHandler│
│  (Layer 1)        (Layer 2)           (Layer 3)      │
│                                                      │
└─────────────────────────────────────────────────────┘
    │
    ▼
SSE 事件流（统一格式）
```

每个 Handler 三种返回模式：
1. **自己处理完**：yield 自己的 SSE 事件，return
2. **决定降级**：`yield from self.next_handler.handle(ctx)`
3. **处理失败**：构造 upstream_hint 后降级

### 2.2 核心数据结构

#### `ChatContext`（流转载体）

```python
@dataclass
class ChatContext:
    user_id: str
    message: str
    conversation_id: str
    # 上一层的产出（供下一层参考）
    upstream_hint: Optional[dict] = None
    # 链路追踪
    trace: list[str] = field(default_factory=list)
```

#### `ResolutionStatus`

```python
class ResolutionStatus(Enum):
    EXECUTABLE = "executable"               # 可直接执行
    NEED_DISAMBIGUATION = "need_disambiguation"  # 多匹配，需用户选择
    NEED_CONFIRMATION = "need_confirmation"      # 危险操作待确认（删除）
    PASS = "pass"                           # 本层处理不了，传下一层
```

#### `ResolutionResult`

```python
@dataclass
class ResolutionResult:
    status: ResolutionStatus
    intent: Optional[str] = None              # "create_task" 等
    params: dict = field(default_factory=dict)
    candidates: Optional[list[dict]] = None   # 多匹配候选项
    reply_text: Optional[str] = None
    source: str = "rule"                      # rule / json_mode / tools_call
```

#### `Handler` 基类

```python
class Handler(ABC):
    next_handler: Optional["Handler"]

    @abstractmethod
    async def handle(self, ctx: ChatContext) -> AsyncGenerator[SseEvent, None]:
        ...
```

### 2.3 Pipeline 组装

在 `chat_stream.py` 入口静态组装（不做动态发现/插件机制）：

```python
pipeline = RuleHandler(
    next_handler=JsonModeHandler(
        next_handler=ToolsCallHandler(next_handler=None)
    )
)
async for event in pipeline.handle(ctx):
    yield event
```

---

## 3. Layer 1：RuleHandler（规则层）

### 3.1 职责

用纯规则识别明确意图，零 LLM 成本、零延迟。

### 3.2 覆盖范围

第一版覆盖 **任务/笔记/计数器/倒数日** 的全 CRUD：

| 实体 | 操作 | 规则示例 |
|---|---|---|
| Task | create | "加任务 周五交报告"、"添加任务：开会" |
| Task | complete | "完成 报告"、"搞定 PPT" |
| Task | delete | "删除任务 报告" |
| Task | update | "把 报告 改到下周五" |
| Task | query | "今天的任务"、"未完成的任务" |
| Note | create/delete/query | 同上模式 |
| Counter | create/increment/decrement/delete | "+1 喝水"、"喝水 +1" |
| Countdown | create/delete/query | "添加倒数日 高考 6月7号" |

### 3.3 目录结构

```
backend/services/ai/pipeline/
├── __init__.py
├── base.py                       # Handler / ChatContext / ResolutionResult
├── rule_handler.py               # RuleHandler 调度器
├── json_mode_handler.py
├── tools_call_handler.py
├── executor.py                   # 统一执行 ResolutionResult → SSE
└── rules/
    ├── __init__.py               # 规则注册表（list[Rule]）
    ├── task_rules.py
    ├── note_rules.py
    ├── countdown_rules.py
    ├── counter_rules.py
    └── shared/
        ├── date_parser.py        # dateparser 库封装
        ├── entity_matcher.py     # 模糊匹配（精确/多/零）
        └── verb_lexicon.py       # 动词词库
```

### 3.4 单条规则接口

```python
class Rule(Protocol):
    name: str
    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        """None=不匹配；Result=匹配（status 决定后续）"""
```

### 3.5 调度逻辑

```python
class RuleHandler(Handler):
    rules: list[Rule]

    async def handle(self, ctx):
        for rule in self.rules:
            result = rule.try_match(ctx)
            if result is None or result.status == ResolutionStatus.PASS:
                continue
            ctx.trace.append(f"rule:{rule.name}")
            async for ev in execute_resolution(result, ctx):
                yield ev
            return
        ctx.trace.append("rule:miss")
        ctx.upstream_hint = {"reason": "no_rule_match"}
        async for ev in self.next_handler.handle(ctx):
            yield ev
```

### 3.6 实体匹配策略

`entity_matcher.match_tasks(user_id, keyword)` 策略：
1. **title 完全等于 keyword** → 单一匹配
2. **title 完整包含 keyword** → 取所有命中
3. **difflib 相似度 ≥ 0.6** → 兜底
4. **0 命中** → 返回空（规则决定 PASS）
5. **1 命中** → EXECUTABLE
6. **≥ 2 命中** → NEED_DISAMBIGUATION

### 3.7 日期解析

引入 `dateparser` 库（写入 `requirements.txt`），封装 `date_parser.extract(text)`：
- 支持："今天/明天/后天/下周五/3天后/2026-05-01/5月1号"
- 返回 `(stripped_text, parsed_date_or_none)`

### 3.8 典型规则示例

```python
CREATE_TASK_PATTERN = re.compile(r"^(?:加|添加|创建|新建)(?:个|一个|条)?(?:任务)?[:：]?\s*(.+)$")

class CreateTaskRule:
    name = "create_task"
    def try_match(self, ctx):
        m = CREATE_TASK_PATTERN.match(ctx.message.strip())
        if not m: return None
        title_raw = m.group(1).strip()
        title, due_date = date_parser.extract(title_raw)
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params={"title": title, "due_date": due_date},
            reply_text=f"已添加任务：{title}",
        )
```

---

## 4. Layer 2：JsonModeHandler

### 4.1 职责

规则层未识别的自然语言 → 调主力 LLM 一次性输出意图+参数+回复，**不带 TOOLS schema**。

### 4.2 关键设计

- **不流式**：等 JSON 完整返回后一次性 yield
- **chitchat 短路**：识别为闲聊则直接用 LLM 输出的 reply 字段返回，不再降级到 Layer 3
- **超时 8 秒**：超时降级到 Layer 3
- **不让 LLM 输出 confidence**（自评不准）
- **失败自动降级**：JSON 解析失败、字段缺失、intent="unknown" 三种情况均降级到 Layer 3

### 4.3 Prompt 设计

包含：
1. JSON schema 定义（intent / params / needs_confirmation / reply）
2. **精简版** user snapshot（task 只取 id+title+status，比现有 system prompt 省 40~60% token）
3. 所有 intent 的参数 schema 列表
4. 几个 few-shot 示例（"你好" → chitchat、"加任务 xx" → create_task）
5. 强约束："不确定时返回 unknown"

### 4.4 LLM 调用

- 复用 `config.get_ai_config()` 的 provider 配置
- OpenAI 兼容路径：`response_format={"type": "json_object"}`
- Claude 路径：用 prompt 强约束 + "只输出 JSON"
- 输出 token 上限 1024
- 整体超时 8 秒（asyncio.wait_for）

### 4.5 Handler 实现要点

```python
class JsonModeHandler(Handler):
    async def handle(self, ctx):
        try:
            raw = await asyncio.wait_for(self._call_llm_json_mode(ctx), timeout=8)
            result = self._parse_and_validate(raw, ctx)
        except (json.JSONDecodeError, ValidationError, asyncio.TimeoutError) as e:
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed"}
            async for ev in self.next_handler.handle(ctx): yield ev
            return

        if result.intent == "unknown":
            ctx.upstream_hint = {"reason": "json_mode_unknown"}
            async for ev in self.next_handler.handle(ctx): yield ev
            return

        if result.intent == "chitchat":
            yield sse_event("text", result.reply_text)
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return

        ctx.trace.append(f"json:{result.intent}")
        async for ev in execute_resolution(result, ctx): yield ev
```

---

## 5. Layer 3：ToolsCallHandler（兜底）

### 5.1 职责

包装现有 `_chat_stream_claude` / `_chat_stream_openai`，**零业务改动**复用。

### 5.2 实现

```python
class ToolsCallHandler(Handler):
    async def handle(self, ctx):
        ctx.trace.append("tools_call")
        hint_suffix = ""
        if ctx.upstream_hint:
            reason = ctx.upstream_hint.get("reason")
            if reason:
                hint_suffix = f"\n\n⚠️ 注：上游处理（{reason}）未能识别，请仔细分析用户意图。"

        from config.config_loader import config
        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")

        if provider == "openai":
            async for ev in _chat_stream_openai(
                ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
                system_prompt_suffix=hint_suffix,
            ):
                yield ev
        else:
            async for ev in _chat_stream_claude(
                ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
                system_prompt_suffix=hint_suffix,
            ):
                yield ev
```

### 5.3 对现有代码的改动

**最小化**：
- `_chat_stream_claude` / `_chat_stream_openai` 签名增加可选参数 `system_prompt_suffix: str = ""`
- 在构建 system prompt 时拼接（默认空字符串，不影响原行为）

---

## 6. Executor（统一执行 ResolutionResult）

### 6.1 职责

把 `ResolutionResult` 转换为 SSE 事件流，**统一处理删除二次确认**。

### 6.2 核心常量

```python
DELETE_INTENTS = {
    "delete_task", "delete_note", "delete_countdown",
    "delete_counter", "delete_list", "delete_tag",
}
```

> 说明：本期 Layer 1 规则不覆盖 list / tag 的删除，故 `delete_list` / `delete_tag`
> 仅可能从 Layer 3 (tools_call) 产出。`DELETE_INTENTS` 全集列在这里是为了让删除拦截
> 对所有删除类操作生效（包括将来在规则层补齐时和 tools_call 直接产出的场景）。

### 6.3 执行逻辑

```python
async def execute_resolution(result: ResolutionResult, ctx: ChatContext):
    # 1. 多匹配歧义
    if result.status == ResolutionStatus.NEED_DISAMBIGUATION:
        yield sse_event("disambiguation", {
            "pending_intent": result.intent,
            "candidates": result.candidates,
            "reply": result.reply_text,
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        return

    # 2. 删除强制二次确认
    if result.intent in DELETE_INTENTS and result.status != ResolutionStatus.NEED_CONFIRMATION:
        target_desc = _describe_delete_target(ctx.user_id, result.intent, result.params)
        yield sse_event("confirmation", {
            "pending_intent": result.intent,
            "params": result.params,
            "target_description": target_desc,
            "reply": f"确认删除「{target_desc}」？",
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        return

    # 3. 直接执行
    if result.status == ResolutionStatus.EXECUTABLE:
        try:
            tool_result = _execute_tool(ctx.user_id, result.intent, result.params)
            yield sse_event("tool_result", {
                "tool": result.intent, "result": tool_result, "source": result.source,
            })
            if result.reply_text:
                yield sse_event("text", result.reply_text)
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
        except Exception as e:
            logger.error(f"executor failed: {result.intent} {e}")
            yield sse_event("error", {"content": f"执行失败：{str(e)}"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
```

### 6.4 `_describe_delete_target`

后端查 DB 拿目标实体的 title（不让前端自己拼）：

```python
def _describe_delete_target(user_id: str, intent: str, params: dict) -> str:
    if intent == "delete_task":
        task = task_dao.get_task(user_id, params["task_id"])
        return task["title"] if task else "(已删除)"
    elif intent == "delete_note":
        note = note_dao.get_note(user_id, params["note_id"])
        return note["title"] if note else "(已删除)"
    # ... 其他实体
```

### 6.5 tools_executor 删除拦截

`tools_executor._execute_tool` 增加 `skip_confirmation` 参数：

```python
def _execute_tool(user_id, tool_name, tool_input, skip_confirmation: bool = False):
    if tool_name in DELETE_INTENTS and not skip_confirmation:
        return {
            "_pending_confirmation": True,
            "intent": tool_name,
            "params": tool_input,
            "target": _describe_delete_target(user_id, tool_name, tool_input),
        }
    # ... 原有执行逻辑
```

ToolsCallHandler 检测到 `_pending_confirmation` 时，转换为 `confirmation` SSE 事件，**不再继续 LLM 循环**。

---

## 7. 端点设计

### 7.1 现有端点

`POST /api/ai/chat` —— 入口不变。

### 7.2 新增端点

#### `POST /api/ai/disambiguate`

处理歧义选择。

```python
class AiDisambiguateRequest(BaseModel):
    conversation_id: str
    pending_intent: str           # "complete_task"
    selected_id: str              # 用户选的实体 id
    extra_params: dict = {}
```

行为：
- 不过 pipeline，直接构造 EXECUTABLE result 走 executor
- 流式 SSE 响应

#### `POST /api/ai/confirm`

处理删除确认。

```python
class AiConfirmRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    params: dict
    confirmed: bool
```

行为：
- `confirmed=False`：流式返回 "已取消"，**不消耗 rate_limit**
- `confirmed=True`：以 `skip_confirmation=True` 调 `_execute_tool` 真正执行
- 流式 SSE 响应

### 7.3 rate_limit 调整

`_check_rate_limit` 移到执行前（取消操作不消耗配额）：

```python
@router.post("/ai/confirm")
async def ai_confirm(req, current_user_id):
    if not req.confirmed:
        # 取消不消耗配额
        return StreamingResponse(_cancel_stream(), media_type="text/event-stream", ...)
    _check_rate_limit(current_user_id)
    return StreamingResponse(_exec_stream(), ...)
```

---

## 8. 前端契约

### 8.1 SSE 事件类型清单

| event type | 来源 | payload | 前端动作 |
|---|---|---|---|
| `text` | 任意层 | `content: string` | 追加到对话气泡 |
| `tool_use` | tools_call | `name, input` | 展示"AI 正在调用 xx" |
| `tool_result` | 任意层 | `tool, result, source` | 刷新对应模块 UI |
| `disambiguation` | 任意层 | `pending_intent, candidates[], reply` | **新增**：候选项卡片 |
| `confirmation` | 任意层 | `pending_intent, params, target_description, reply` | **新增**：确认 modal |
| `error` | 任意层 | `content` | 红色提示气泡 |
| `done` | 任意层 | `conversation_id` | 结束流，解锁输入框 |
| `reasoning` | tools_call | `content` | 折叠展示思考过程 |

### 8.2 前端新增组件（不在本 spec 详细范围）

- 候选项卡片组件 → 接 `disambiguation`，点击调 `/disambiguate`
- 删除确认 modal → 接 `confirmation`，确认/取消调 `/confirm`
- SSE dispatcher 增加两个 event 分支

---

## 9. 灰度与回滚

### 9.1 配置开关

`config.yaml` 新增：

```yaml
ai:
  pipeline:
    enabled: false                # 总开关
    enable_rule_layer: true       # 分层开关
    enable_json_mode_layer: true
```

分层开关语义：
- `enable_rule_layer: false` → 跳过 Layer 1，请求直接进入 Layer 2
- `enable_json_mode_layer: false` → 跳过 Layer 2，请求从 Layer 1 失败后直接降级到 Layer 3
- 两者均为 `false` → 等同于 `enabled: false`（行为退化为现有 tools_call 链路）

实现方式：在 `chat_stream.py` 静态组装 pipeline 时，按开关条件决定是否把对应 Handler 串入链中。
被跳过的 Handler 完全不参与请求处理（不是"进来后立即降级"），避免无用日志。

### 9.2 入口分发

```python
async def chat_stream(user_id, message, conversation_id):
    ai_config = config.get_ai_config()
    if ai_config.get("pipeline", {}).get("enabled"):
        async for ev in _pipeline_chat_stream(...): yield ev
    else:
        async for ev in _legacy_chat_stream(...): yield ev  # 原逻辑
```

### 9.3 回滚

一行配置 `enabled: false` 即回到现有 tools_call 链路。

---

## 10. 可观测性

每条消息记录 trace 日志：

```
[ai] user=xxx conv=yyy trace=[rule:miss, json:create_task, exec:ok] cost_ms=120
[ai] user=xxx conv=yyy trace=[rule:complete_task, exec:ok] cost_ms=8
[ai] user=xxx conv=yyy trace=[rule:miss, json:fail, tools_call] cost_ms=2300
```

后续可基于 trace 统计：
- 规则命中率（目标 ≥ 50%）
- JSON Mode 命中率（目标 ≥ 30%）
- tools_call 兜底率（目标 ≤ 20%）

---

## 11. 测试策略

### 11.1 单元测试

`backend/tests/test_ai_pipeline.py`，覆盖：
- 每条 Rule 的 `try_match` 正反用例
- `entity_matcher` 的 0/1/N 匹配
- `date_parser` 的"明天/下周五/3天后/2026-05-01"
- `executor` 的删除强制 confirmation、执行成功/失败的事件序列
- Pipeline 链路：mock LLM 验证规则命中不调 LLM、JSON Mode 失败降级 tools_call

### 11.2 集成测试

mock provider，端到端验证 `/chat` → `/disambiguate` → `/confirm` 三个端点。

### 11.3 不依赖真 API key

CI 不跑真调用；本地手测用 `@pytest.mark.live` 标记跳过。

---

## 12. 文件清单

### 12.1 后端新增（13 个文件）

```
backend/services/ai/pipeline/
├── __init__.py
├── base.py                       (~80 行)
├── rule_handler.py               (~50 行)
├── json_mode_handler.py          (~150 行)
├── tools_call_handler.py         (~40 行)
├── executor.py                   (~120 行)
└── rules/
    ├── __init__.py               (~30 行：注册表)
    ├── task_rules.py             (~200 行)
    ├── note_rules.py             (~150 行)
    ├── countdown_rules.py        (~120 行)
    ├── counter_rules.py          (~150 行)
    └── shared/
        ├── __init__.py
        ├── date_parser.py        (~50 行)
        ├── entity_matcher.py     (~80 行)
        └── verb_lexicon.py       (~30 行)
```

### 12.2 后端修改（5 个文件）

- `backend/services/ai/chat_stream.py`：加灰度开关分发
- `backend/services/ai/tools_executor.py`：加 `skip_confirmation` 参数
- `backend/services/ai/claude_stream.py`：签名加 `system_prompt_suffix`
- `backend/services/ai/openai_stream.py`：签名加 `system_prompt_suffix`
- `backend/routes/ai.py`：增 `/disambiguate` 和 `/confirm` 端点
- `backend/requirements.txt`：加 `dateparser`
- `backend/config.yaml.example`：加 pipeline 配置示例

### 12.3 测试新增

- `backend/tests/test_ai_pipeline.py`

### 12.4 前端（轻量改动，本 spec 不展开）

- 新增候选项卡片组件
- 新增删除确认 modal
- SSE dispatcher 加 `disambiguation` / `confirmation` 处理

---

## 13. 验收标准

完成本设计后，应满足：

1. **功能正确性**
   - "加任务 xx" 不调用 LLM，10ms 内落库
   - "完成 报告" 多匹配时返回候选项，前端可选择执行
   - "删掉那个 PPT 笔记" 无论从哪一层路由都弹二次确认
   - JSON Mode 解析失败自动降级到 tools_call，用户无感知

2. **性能与成本**
   - 高频简单操作（规则命中）耗时 < 100ms
   - 闲聊场景 token 消耗下降 > 50%
   - 整体 LLM 调用次数下降 > 30%

3. **可观测**
   - 每条消息日志含完整 trace
   - 可统计三层命中率

4. **可回滚**
   - 配置 `enabled: false` 完全回到现有逻辑
   - 现有 routes/ai.py 的 `/api/ai/chat` 端点契约不变

---

## 14. 后续可演进方向（不在本期）

- 缓存层：识别相同 query 直接返回缓存（如"今天的任务"）
- 用户偏好层：记录用户常用规则模板
- MCP 协议接入：把规则 + tools 都暴露为 MCP server
- 前端快捷指令面板：`/add`、`/done` 类似 Slack/Linear 的命令
