# 计数器加/减任意数量 — 设计文档

日期：2026-07-08

## 背景

AI 助手目前支持计数器加/减，但快速正则通道（`counter_rules.py`）只识别字面的 `+1` / `-1`（如 `游泳+1`、`+1 游泳`）。像「游泳加三」「游泳+3」「游泳减3次」这类带数量、或用中文动词/数字的说法无法走快速通道，只能退回大模型，慢且不稳定。同时执行层与大模型工具都固定按计数器 `step` 步长加减，无法指定任意数量。

## 目标

1. 快速正则通道支持「任意数量」的多种写法（阿拉伯/中文数字、中文动词、全角符号、量词单位）。
2. 指定数量 N 时语义为**精确加/减 N**（忽略 `step`）；不指定数量时保持按 `step` 的旧行为（向后兼容）。
3. 大模型工具 `update_counter` 也支持 `amount` 参数，两条路径行为一致。
4. 计数器名字仍是动态的，沿用现有 `match_entities` 模糊匹配（精确 → 子串 → difflib ≥ 0.6）与消歧，不改动。

## 非目标

- 不改 `counter_dao`（`increment_counter`/`decrement_counter` 已接受任意数量，减法已有 `max(0, ...)` 下限保护）。
- 不支持超过两位数（>99）的中文数字（如「一百二十三」），阿拉伯数字不受此限。
- 不支持前缀中文动词写法（「加三游泳」这类不自然表达）；中文动词仅支持名字在前的后缀写法。

## 详细设计

### 1. 中文数字解析 —— 新增 `shared/num_parser.py`

提供 `parse_amount(s: Optional[str]) -> int`，支持 1–99：

- `None` / 空串 → `1`（即「游泳加」= +1）
- 纯阿拉伯数字（`str.isdigit()`）→ `int(s)`
- 中文数字：
  - 个位 `一二三四五六七八九` → 1–9，`两` → 2
  - `十` → 10；`十X` → 10+X（十一=11）；`X十` → X*10（二十=20）；`X十Y` → X*10+Y（二十三=23）
- 无法解析时回退 `1`（保守，避免误伤）

放在 `shared/` 便于其他规则复用。

### 2. 正则改造 —— `counter_rules.py`

定义可复用片段：

```python
_NUM = r"(?:[0-9]+|[一二三四五六七八九十两]+)"
_UNIT = r"(?:次|下|个)?"
```

**递增**（`+` / 全角 `＋` / 中文 `加`）：
- 后缀形（名字在前）：`<name>(+|＋|加)<num?><unit?>`
- 前缀形（符号在前，兼容旧行为）：`(+|＋)<num?> <name>`

**递减**（`-` / 全角 `－` / 中文 `减`）：同上结构，动词换成减法符号/词。

支持的写法示例：

| 写法 | 解析结果 |
|---|---|
| `游泳+3`、`游泳 +3`、`游泳＋３` | +3 |
| `游泳加3`、`游泳加三`、`游泳加三下`、`游泳加3次` | +3 |
| `游泳+`、`游泳加`、`游泳加一` | +1（兼容） |
| `+3 游泳`、`+1 游泳` | +3 / +1（兼容） |
| 对应 `-` / `减` 写法 | 递减 |

**误触发防护**：正则命中后仍调用 `match_entities` 找计数器；找不到返回 `ResolutionStatus.PASS` 落回大模型。量词单位集合限定为 `次/下/个`，且中文动词后必须紧跟数字或量词或结尾，因此「任务加急」「游泳加油」（`急`/`油` 非数字非量词）不会匹配。

### 3. 数量传递 —— `counter_rules.py`

`_build_inc_dec_result(ctx, action, keyword, amount)` 增加 `amount` 参数：

- 唯一命中：`params={"counter_id": c["id"], "action": action, "amount": amount}`，回复文案 `f"{title} {verb}{amount}"`（如 `游泳 +3`）。
- 消歧：`params={"action": action, "amount": amount}`，候选照旧。

`IncrementCounterRule` / `DecrementCounterRule` 从正则捕获组取 num，`parse_amount` 转成整数后传入。

### 4. 执行层 —— `tools_executor.py`（`update_counter`）

```python
amount = tool_input.get("amount")
if action == "increment":
    existing = counter_dao.get_counter_by_id(user_id, counter_id)
    delta = amount if amount is not None else existing["step"]
    result = counter_dao.increment_counter(user_id, counter_id, delta)
elif action == "decrement":
    existing = counter_dao.get_counter_by_id(user_id, counter_id)
    delta = amount if amount is not None else existing["step"]
    result = counter_dao.decrement_counter(user_id, counter_id, delta)
```

`reset` / `rename` 分支不变。

### 5. 大模型工具 —— `tools_schema.py`（`update_counter`）

新增属性：

```json
"amount": {
  "type": "integer",
  "description": "递增/递减的数量，不填则按计数器步长(step)"
}
```

使「把游泳加三次」这类自然语言也能带数量。

## 数据流

```
"游泳加三"
  → 正则:关键词="游泳", num="三", action=increment
  → parse_amount("三")=3
  → match_entities("游泳", 用户计数器)   # 模糊匹配
     ├ 唯一命中 → update_counter(counter_id, increment, amount=3) → +3
     ├ 多个命中 → NEED_DISAMBIGUATION（携带 amount=3）
     └ 0 命中   → PASS → 交给大模型（update_counter 工具，可带 amount）
```

## 测试计划（TDD）

1. `parse_amount` 单测：阿拉伯、个位中文、`十`/`十一`/`二十`/`二十三`、`两`、空→1、非法→1。
2. `counter_rules` 解析测（含 mock 计数器列表）：
   - 各写法正确抽取 keyword + amount + action
   - `游泳+1` 等旧写法仍工作
   - 全角 `＋３`、量词 `次/下`
   - 误触发用例（「任务加急」「游泳加油」）返回 PASS
   - 多命中 → NEED_DISAMBIGUATION 且 params 带 amount
3. `tools_executor` 测：`update_counter` 带 amount → DAO 收到精确 delta；不带 amount → 回退 step。

## 影响文件

- 新增：`backend/services/ai/pipeline/rules/shared/num_parser.py`
- 修改：`backend/services/ai/pipeline/rules/counter_rules.py`
- 修改：`backend/services/ai/tools_executor.py`
- 修改：`backend/services/ai/tools_schema.py`
- 新增测试若干
