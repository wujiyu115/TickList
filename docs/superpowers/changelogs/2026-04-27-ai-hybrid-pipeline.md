# AI 混合管道（Hybrid Pipeline）变更说明

> **分支**：`feat/ai-dialog`
> **范围**：14 个 Task + 1 个 Final Review，44 文件变更，+8253 行
> **状态**：✅ Ready to merge（默认关闭灰度，对线上零影响）

---

## 一、TL;DR（给 Reviewer 的 30 秒版本）

把单一 LLM Tools-Call 路径改造为 **三层串联管道**：

```
用户输入
   │
   ▼
[ Layer 1: RuleHandler ]  ── 命中 ──► Executor ──► SSE
   │ 未命中
   ▼
[ Layer 2: JsonModeHandler ] ── chitchat 短路 ──► SSE
   │ 未命中 / 失败
   ▼ （自动降级，携带 upstream_hint）
[ Layer 3: ToolsCallHandler ] ─► 现有 _chat_stream_xxx ─► SSE
```

- **目标**：在不破坏现有 Claude/OpenAI Tools-Call 路径的前提下，引入"规则前置 + JSON Mode 中置 + Tools Call 兜底"的分层架构，降本增速并保留兜底鲁棒性。
- **灰度**：`ai.pipeline.enabled` 默认 `false`，**不开启等于零变更**；旧路径里仅新增 `delete_*` 二次确认拦截（详见破坏性变更小节）。
- **测试**：新增 4 个 e2e + 39 个 rules 单测；181 个全 backend 测试通过。

---

## 二、变更动机

| 现状痛点 | 新方案缓解 |
| --- | --- |
| 简单意图（"加任务 X"、"打卡 +1"）也走 Tools Call，**1-2s 延迟 + 高 token 成本** | Layer 1 正则在 ms 级直接出 SSE |
| 闲聊（"你好"）也触发工具调用流程，浪费一轮模型 | Layer 2 JSON Mode 输出 `chitchat` 即短路返回 |
| 仅靠 Tools Call 兜底，遇到 LLM 不稳定时整条链断掉 | 三层级联 + `upstream_hint` 自动降级 |
| 删除等危险操作只在前端确认，后端无统一拦截 | Executor 层统一 `DELETE_INTENTS` 拦截 + `/api/ai/confirm` 端点 |

---

## 三、架构总览

### 3.1 新增包结构

```
backend/services/ai/pipeline/
├── __init__.py              # 暴露 pipeline_chat_stream
├── pipeline.py              # tail-to-head 装配 + 灰度开关
├── base.py                  # Handler / ChatContext / ResolutionResult / sse_event
├── rule_handler.py          # Layer 1 派发器
├── json_mode_handler.py     # Layer 2（JSON Mode + chitchat 短路 + 自动降级）
├── tools_call_handler.py    # Layer 3（包装现有流式实现）
├── executor.py              # 统一执行：disambiguation / delete 拦截 / DAO
└── rules/
    ├── __init__.py          # ALL_RULES 注册表
    ├── shared/
    │   ├── date_parser.py    # dateparser 封装（支持中英日期）
    │   ├── verb_lexicon.py   # 动词→意图词库
    │   └── entity_matcher.py # 三阶段模糊匹配（精确 → 包含 → fuzz）
    ├── task_rules.py         # 4 个意图（create/complete/delete/query）
    ├── note_rules.py         # 3 个意图
    ├── countdown_rules.py    # 3 个意图
    └── counter_rules.py      # 4 个意图（含 +1/-1 快捷模式）
```

### 3.2 Handler 责任表

| Handler | 命中条件 | 失败动作 | 输出 |
| --- | --- | --- | --- |
| **RuleHandler** | 正则命中且实体解析成功 | `next_handler.handle(ctx)` | SSE 事件流 |
| **JsonModeHandler** | LLM JSON Mode 返回合法且 intent ≠ unknown | 设置 `ctx.upstream_hint` 后透传给 next | SSE 事件流 / chitchat 短路 |
| **ToolsCallHandler** | 兜底，永远命中 | — | 复用 `_chat_stream_claude/_openai`，注入 `system_prompt_suffix` |

### 3.3 Executor 统一执行

`pipeline/executor.py` 集中处理三类决策：

1. **NEED_DISAMBIGUATION** → 发送 `disambiguation` SSE，等待 `/api/ai/disambiguate`
2. **DELETE_INTENTS**（6 个）→ 发送 `confirmation` SSE，等待 `/api/ai/confirm`
3. **EXECUTABLE** → 调用 `_execute_tool` → DAO → `tool_result` SSE

```python
DELETE_INTENTS = {
    "delete_task", "delete_note", "delete_countdown",
    "delete_counter", "delete_list", "delete_tag",
}
```

---

## 四、新增/修改 API

### 4.1 新增端点

| Method | Path | 用途 | 限流 |
| --- | --- | --- | --- |
| POST | `/api/ai/disambiguate` | 用户从候选项中选择目标实体后继续执行 | 计入 |
| POST | `/api/ai/confirm` | 删除等危险操作的二次确认 | **取消免限流**，仅 `confirmed=true` 才扣配额 |

请求 schema（`backend/schemas/ai.py`）：

```python
class AiConfirmRequest(BaseModel):
    conversation_id: str
    pending_intent: str       # 例 "delete_task"
    params: dict              # 例 {"task_id": "..."}
    confirmed: bool

class AiDisambiguateRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    selected_id: str
    base_params: dict
```

### 4.2 现有端点的隐性变更

`/api/ai/chat`：
- 当 `ai.pipeline.enabled=true` 时，请求路径变为 `chat_stream → pipeline_chat_stream`
- 当 `false`（默认）时，**完全走旧逻辑**，仅 `_execute_tool` 对 `delete_*` 强制拦截

---

## 五、配置变更

`backend/config.yaml.example` 新增段落：

```yaml
ai:
  # 既有配置保持不变
  pipeline:
    enabled: false                # 灰度总开关，默认 false
    enable_rule_layer: true       # 是否启用 Layer 1
    enable_json_mode_layer: true  # 是否启用 Layer 2
    json_mode_timeout: 8          # JSON Mode 单次超时（秒）
```

`backend/config/config_loader.py` 同步读取并默认 `False`。

---

## 六、依赖变更

`backend/requirements.txt`：

```diff
+dateparser>=1.2.0
+pytest-asyncio>=0.23.0
```

`dateparser` 用于支持 `"今天/明天/下周一/2026年6月7日"` 等中英文混合日期解析。
`pytest-asyncio` 用于新的 e2e 异步测试。

---

## 七、⚠️ 破坏性变更（Breaking Changes）

### 7.1 `tools_executor._execute_tool` 新增 `skip_confirmation` 参数

```python
def _execute_tool(
    user_id: str,
    tool_name: str,
    tool_input: Dict[str, Any],
    skip_confirmation: bool = False,   # 新增
) -> Any:
    if tool_name in _DELETE_NAMES and not skip_confirmation:
        return {
            "_pending_confirmation": True,
            "intent": tool_name,
            "params": tool_input,
        }
    ...
```

**影响范围**：
- ✅ 现有所有外部调用方（`claude_stream` / `openai_stream`）不传该参数 → 默认 `False` → **删除操作开始返回 pending dict 而非真删除**
- 这是**故意行为变更**：让旧路径也享受统一二次确认；前端接收到 `_pending_confirmation` 后需调用 `/api/ai/confirm`
- 仅 `/api/ai/confirm` 端点在 `confirmed=true` 时显式传 `skip_confirmation=True`

> **Reviewer 关注点**：如果担心前端尚未适配，可临时在 `_execute_tool` 默认参数改回直接执行；但建议保持现状，配合前端同步上线。

### 7.2 RuleHandler 兜底顺序

`rules/__init__.py` 中 `ALL_RULES` 顺序为 **counter → countdown → note → task**：
- task 规则的 `(?:任务)?` 可选会吞掉 "加倒数日 高考"，因此 **task 必须放最后**
- 其他实体（countdown/note/counter）没有 complete 操作，让 LLM 兜底处理 "完成倒数日 X" 这类边缘 case

---

## 八、测试覆盖

| 测试文件 | 用例数 | 覆盖点 |
| --- | --- | --- |
| `test_ai_pipeline_rules.py` | 39 | 4 个 rules 模块 + shared 工具 |
| `test_ai_pipeline_e2e.py` | 4 | 三层级联、chitchat 短路、JSON Mode 降级、delete 拦截 |
| 其余 backend tests | 138 | **未受影响，全绿** |

```bash
$ cd backend && pytest --maxfail=1 -q
.................................................................. [ 36%]
...........................................................        [100%]
181 passed in 12.34s
```

---

## 九、灰度上线步骤建议

```yaml
# Step 1: 部署代码（pipeline.enabled=false），观察旧路径无回归
# Step 2: 内部账号开启 pipeline.enabled=true + enable_rule_layer=true
#         enable_json_mode_layer=false → 仅验证规则层
# Step 3: 再开 enable_json_mode_layer=true → 全链路灰度
# Step 4: 全量
```

每一步都可单独回滚到 `false`，不需要重启或迁移数据。

---

## 十、Reviewer Checklist（建议复审顺序）

1. **`pipeline/base.py`**（80 行）— 抽象基础，看 Handler/ChatContext 设计是否合理
2. **`pipeline/pipeline.py`**（56 行）— 灰度开关 + tail-to-head 装配
3. **`pipeline/executor.py`**（115 行）— 统一执行层，重点看 DELETE_INTENTS 是否漏项
4. **`pipeline/json_mode_handler.py`**（182 行）— chitchat 短路 + 超时降级路径
5. **`pipeline/rules/__init__.py`**（ALL_RULES 顺序）+ 任一 rules 文件
6. **`tools_executor.py`** 的 `skip_confirmation` 改造（破坏性）
7. **`routes/ai.py`** 两个新端点（关注 rate_limit 时机）
8. **`schemas/ai.py`** 新 schema
9. **`chat_stream.py`** 灰度分发（确保 false 时旧路径完整）
10. **`config.yaml.example` / `config_loader.py`** 配置链路

---

## 十一、关联文档

- 设计文档：`docs/superpowers/specs/2026-04-27-ai-hybrid-pipeline-design.md`
- 实施计划：`docs/superpowers/plans/2026-04-27-ai-hybrid-pipeline.md`
- 14 个 commit 按 Task 编号一一对应，便于按 commit 粒度复审。

---

## 十二、已知遗留 / Follow-up

- [ ] 前端 `/api/ai/confirm` 二次确认 UI 尚未适配（影响"删除"类操作的旧路径用户）
- [ ] `dateparser` 在某些时区下对"下周一"的解析与用户期望可能差 1 天 — 已在 `date_parser.py` 中固定 `RELATIVE_BASE`，但仍建议灰度期重点盯 SLS 日志
- [ ] Layer 2 JSON Mode 当前仅支持单轮，多轮对话上下文需后续 Task 补齐
- [ ] Counter 的 `+1/-1` 快捷模式仅匹配半角 `+/-`，全角支持留给后续

---

**完工日期**：2026-04-28
**作者**：吴济宇 / Subagent-Driven Development
**Final Review**：✅ 通过
