# 计数器加/减任意数量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 助手的计数器加/减支持任意数量（如「游泳加三」「游泳+3」「游泳减3次」），指定数量时精确加减、不指定时仍按 `step` 步长。

**Architecture:** 新增中文数字解析工具 `num_parser.py`；改造 `counter_rules.py` 的正则以捕获动词/数字/单位并把 `amount` 放进 intent params；执行层 `tools_executor.py` 读取 `amount`（缺省回退 `step`）；给大模型工具 `tools_schema.py` 的 `update_counter` 增加 `amount` 参数。计数器名字沿用现有 `match_entities` 模糊匹配，不改。

**Tech Stack:** Python 3.12, pytest（`asyncio_mode=auto`），SQLAlchemy。测试从 `backend/` 目录运行：`.venv/bin/python -m pytest`。

---

## File Structure

- **Create** `backend/services/ai/pipeline/rules/shared/num_parser.py` — 中文/阿拉伯数字 → int（1–99），单一职责，可复用。
- **Modify** `backend/services/ai/pipeline/rules/counter_rules.py` — 正则捕获 amount；`_build_inc_dec_result` 增加 `amount` 参数。
- **Modify** `backend/services/ai/tools_executor.py:222-237` — `update_counter` 的 increment/decrement 读取 `amount`，缺省回退 `step`。
- **Modify** `backend/services/ai/tools_schema.py:191-202` — `update_counter` 增加 `amount` 属性。
- **Modify (tests)** `backend/tests/test_ai_pipeline_rules.py` — 现有 `test_plus_one_pattern` / `test_minus_one_pattern` 断言需加上 `amount`；新增各写法测试。
- **Create (tests)** `backend/tests/test_counter_amount.py` — `parse_amount` 单测 + `tools_executor` 的 amount 生效/回退测试。

**测试运行前提：** 所有 `pytest` 命令都从 `backend/` 目录执行（`cd backend`），因为 `tests/conftest.py` 把 backend 目录加入 `sys.path`。

---

## Task 1: 中文数字解析工具 `parse_amount`

**Files:**
- Create: `backend/services/ai/pipeline/rules/shared/num_parser.py`
- Test: `backend/tests/test_counter_amount.py`

- [ ] **Step 1: Write the failing test**

创建 `backend/tests/test_counter_amount.py`：

```python
# -*- coding: utf-8 -*-
"""Unit tests for counter arbitrary-amount parsing and execution."""

import pytest

from services.ai.pipeline.rules.shared.num_parser import parse_amount


class TestParseAmount:
    def test_none_defaults_to_one(self):
        assert parse_amount(None) == 1

    def test_empty_string_defaults_to_one(self):
        assert parse_amount("") == 1
        assert parse_amount("   ") == 1

    def test_arabic_digits(self):
        assert parse_amount("3") == 3
        assert parse_amount("10") == 10
        assert parse_amount("25") == 25

    def test_chinese_units(self):
        assert parse_amount("一") == 1
        assert parse_amount("三") == 3
        assert parse_amount("九") == 9
        assert parse_amount("两") == 2

    def test_chinese_ten(self):
        assert parse_amount("十") == 10
        assert parse_amount("十一") == 11
        assert parse_amount("十九") == 19

    def test_chinese_tens(self):
        assert parse_amount("二十") == 20
        assert parse_amount("二十三") == 23
        assert parse_amount("九十九") == 99

    def test_invalid_falls_back_to_one(self):
        assert parse_amount("abc") == 1
        assert parse_amount("百") == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestParseAmount -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.ai.pipeline.rules.shared.num_parser'`

- [ ] **Step 3: Write minimal implementation**

创建 `backend/services/ai/pipeline/rules/shared/num_parser.py`：

```python
# -*- coding: utf-8 -*-
"""Parse an amount token (Arabic or Chinese numerals) into an int.

Supports 1-99. Empty / None / unparseable input falls back to 1 so that
bare verbs like "游泳加" mean +1 and noise never crashes the rule layer.
"""

from typing import Optional

_CN_DIGITS = {
    "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
    "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
}


def parse_amount(s: Optional[str]) -> int:
    if s is None:
        return 1
    s = s.strip()
    if not s:
        return 1
    if s.isdigit():
        return int(s)

    # Chinese numerals 1-99
    if "十" not in s:
        # single digit like 三 / 两
        if len(s) == 1 and s in _CN_DIGITS:
            return _CN_DIGITS[s] or 1
        return 1

    # contains 十: forms are 十 / 十X / X十 / X十Y
    tens_part, _, ones_part = s.partition("十")
    tens = _CN_DIGITS.get(tens_part, 1) if tens_part else 1
    ones = _CN_DIGITS.get(ones_part, 0) if ones_part else 0
    value = tens * 10 + ones
    return value if value > 0 else 1


__all__ = ["parse_amount"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestParseAmount -v`
Expected: PASS (8 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/shared/num_parser.py backend/tests/test_counter_amount.py
git commit -m "feat(ai): add parse_amount for Chinese/Arabic numerals"
```

---

## Task 2: 正则改造 + amount 传递 (`counter_rules.py`)

**Files:**
- Modify: `backend/services/ai/pipeline/rules/counter_rules.py`
- Test: `backend/tests/test_ai_pipeline_rules.py`

- [ ] **Step 1: Update existing tests + add new ones (failing)**

在 `backend/tests/test_ai_pipeline_rules.py` 中，把 `TestIncrementCounterRule` 与 `TestDecrementCounterRule` 两个类整体替换为下面内容（现有断言里 params 现在会带 `amount`，必须更新，否则会误报失败）：

```python
class TestIncrementCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_plus_one_pattern(self, mock_dao):
        # 形式 1："喝水 +1"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水 +1"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "update_counter"
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 1}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_plus_number_pattern(self, mock_dao):
        # "喝水+3"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水+3"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_chinese_verb_arabic_number(self, mock_dao):
        # "喝水加3"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水加3"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_chinese_verb_chinese_number(self, mock_dao):
        # "喝水加三"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水加三"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_chinese_verb_with_unit(self, mock_dao):
        # "喝水加三下" / "喝水加3次"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水加三下"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_fullwidth_plus(self, mock_dao):
        # 全角 "喝水＋３"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水＋３"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_bare_verb_means_one(self, mock_dao):
        # "喝水加" → +1
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水加"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 1}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_prefix_symbol_pattern(self, mock_dao):
        # "+3 喝水"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("+3 喝水"))
        assert result.params == {"counter_id": "c1", "action": "increment", "amount": 3}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_false_positive_returns_none_or_pass(self, mock_dao):
        # "任务加急" 不是数字/量词结尾，不应命中；即使命中也因无匹配计数器 PASS
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("任务加急"))
        assert result is None or result.status == ResolutionStatus.PASS

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_multi_match_disambiguation_carries_amount(self, mock_dao):
        mock_dao.get_user_counters.return_value = [
            {"id": "c1", "title": "喝水打卡"},
            {"id": "c2", "title": "喝水提醒"},
        ]
        result = IncrementCounterRule().try_match(_ctx("喝水加3"))
        assert result.status == ResolutionStatus.NEED_DISAMBIGUATION
        assert result.params == {"action": "increment", "amount": 3}
        assert len(result.candidates) == 2

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_zero_match_pass(self, mock_dao):
        mock_dao.get_user_counters.return_value = []
        result = IncrementCounterRule().try_match(_ctx("不存在 +1"))
        assert result.status == ResolutionStatus.PASS


class TestDecrementCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_minus_one_pattern(self, mock_dao):
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = DecrementCounterRule().try_match(_ctx("喝水 -1"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.params == {"counter_id": "c1", "action": "decrement", "amount": 1}

    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_minus_number_pattern(self, mock_dao):
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = DecrementCounterRule().try_match(_ctx("喝水减三"))
        assert result.params == {"counter_id": "c1", "action": "decrement", "amount": 3}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ai_pipeline_rules.py -v -k "Counter"`
Expected: FAIL — 新写法（`喝水+3` 等）不命中 / 断言 `amount` 不存在。

- [ ] **Step 3: Rewrite the regex + params in `counter_rules.py`**

替换 `backend/services/ai/pipeline/rules/counter_rules.py` 第 4-91 行（从 `import re` 后的 pattern 定义到 `DecrementCounterRule` 结束）。完整替换如下（保留文件顶部 docstring 与其余部分）：

先更新 import 区（文件顶部）——在 `from .shared.entity_matcher import match_entities` 后新增一行：

```python
from .shared.num_parser import parse_amount
```

然后把 `_INCREMENT_PATTERN` / `_DECREMENT_PATTERN` 两行（当前 18-20 行）替换为：

```python
# 数量 token：阿拉伯数字 或 中文数字（含全角数字）
_NUM = r"(?:[0-9０-９]+|[零一二三四五六七八九十两]+)"
# 可选量词单位
_UNIT = r"(?:次|下|个)?"
# 递增：
#   后缀形（名字在前）: <name>(+|＋|加)<num?><unit?>
#   前缀形（符号在前）: (+|＋)<num?> <name>
_INCREMENT_PATTERN = re.compile(
    rf"^\s*(?:(?P<name_a>.+?)\s*(?:\+|＋|加)\s*(?P<num_a>{_NUM})?\s*{_UNIT}"
    rf"|(?:\+|＋)\s*(?P<num_b>{_NUM})?\s+(?P<name_b>.+?))\s*$"
)
# 递减：同结构，动词换成 - / － / 减
_DECREMENT_PATTERN = re.compile(
    rf"^\s*(?:(?P<name_a>.+?)\s*(?:-|－|减)\s*(?P<num_a>{_NUM})?\s*{_UNIT}"
    rf"|(?:-|－)\s*(?P<num_b>{_NUM})?\s+(?P<name_b>.+?))\s*$"
)
```

把 `_build_inc_dec_result` 函数（当前 44-67 行）替换为带 `amount`：

```python
def _build_inc_dec_result(
    ctx: ChatContext, action: str, keyword: str, amount: int
) -> ResolutionResult:
    matches = _resolve_counter_target(ctx.user_id, keyword)
    if not matches:
        return ResolutionResult(status=ResolutionStatus.PASS)
    if len(matches) == 1:
        c = matches[0]
        sign = "+" if action == "increment" else "-"
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="update_counter",
            params={"counter_id": c["id"], "action": action, "amount": amount},
            reply_text=f"{c['title']} {sign}{amount}",
            source="rule",
        )
    return ResolutionResult(
        status=ResolutionStatus.NEED_DISAMBIGUATION,
        intent="update_counter",
        candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
        params={"action": action, "amount": amount},
        reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择：",
        source="rule",
    )
```

把 `IncrementCounterRule.try_match`（当前 72-79 行）替换为：

```python
    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _INCREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group("name_a") or m.group("name_b") or "").strip()
        if not keyword:
            return None
        amount = parse_amount(m.group("num_a") or m.group("num_b"))
        return _build_inc_dec_result(ctx, "increment", keyword, amount)
```

把 `DecrementCounterRule.try_match`（当前 84-91 行）替换为：

```python
    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DECREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group("name_a") or m.group("name_b") or "").strip()
        if not keyword:
            return None
        amount = parse_amount(m.group("num_a") or m.group("num_b"))
        return _build_inc_dec_result(ctx, "decrement", keyword, amount)
```

> 注意：`parse_amount` 会把全角数字 `３` 当作非 `isdigit()`... 实际上 Python `str.isdigit()` 对全角数字返回 True 且 `int("３")` 可解析，但为稳妥，Task 1 的 `parse_amount` 已用 `s.isdigit()` + `int(s)`，全角数字能正确解析。正则里 `_NUM` 已包含 `０-９` 以捕获全角。

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ai_pipeline_rules.py -v -k "Counter"`
Expected: PASS（原有 + 新增全部通过）

- [ ] **Step 5: Run full rule + registry suite to catch regressions (误触发/顺序)**

Run: `cd backend && .venv/bin/python -m pytest tests/test_ai_pipeline_rules.py -q`
Expected: PASS（尤其 `TestRuleHandlerDispatch` 未被新正则破坏）

- [ ] **Step 6: Commit**

```bash
git add backend/services/ai/pipeline/rules/counter_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai): recognize arbitrary counter amounts in fast rules"
```

---

## Task 3: 执行层读取 amount (`tools_executor.py`)

**Files:**
- Modify: `backend/services/ai/tools_executor.py:222-243`
- Test: `backend/tests/test_counter_amount.py`

- [ ] **Step 1: Write the failing test**

在 `backend/tests/test_counter_amount.py` 末尾追加：

```python
from unittest.mock import patch

from services.ai.tools_executor import _execute_tool


class TestUpdateCounterAmount:
    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_with_explicit_amount(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 3}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment", "amount": 3},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 3)

    @patch("services.ai.tools_executor.counter_dao")
    def test_increment_without_amount_falls_back_to_step(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.increment_counter.return_value = {"id": "c1", "current_value": 5}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "increment"},
        )
        mock_dao.increment_counter.assert_called_once_with("u1", "c1", 5)

    @patch("services.ai.tools_executor.counter_dao")
    def test_decrement_with_explicit_amount(self, mock_dao):
        mock_dao.get_counter_by_id.return_value = {"id": "c1", "step": 5}
        mock_dao.decrement_counter.return_value = {"id": "c1", "current_value": 0}
        _execute_tool(
            "u1", "update_counter",
            {"counter_id": "c1", "action": "decrement", "amount": 2},
        )
        mock_dao.decrement_counter.assert_called_once_with("u1", "c1", 2)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestUpdateCounterAmount -v`
Expected: FAIL — `increment_counter` 被调用时用的是 `step`(5) 而非 amount(3)。

- [ ] **Step 3: Modify `tools_executor.py`**

把 `backend/services/ai/tools_executor.py` 的 increment/decrement 分支（当前 230-237 行）替换为：

```python
            if action == "increment":
                existing = counter_dao.get_counter_by_id(user_id, counter_id)
                amount = tool_input.get("amount")
                delta = amount if amount is not None else existing["step"]
                result = counter_dao.increment_counter(user_id, counter_id, delta)
                return result
            elif action == "decrement":
                existing = counter_dao.get_counter_by_id(user_id, counter_id)
                amount = tool_input.get("amount")
                delta = amount if amount is not None else existing["step"]
                result = counter_dao.decrement_counter(user_id, counter_id, delta)
                return result
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestUpdateCounterAmount -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/tools_executor.py backend/tests/test_counter_amount.py
git commit -m "feat(ai): apply explicit amount in update_counter executor"
```

---

## Task 4: 大模型工具 schema 增加 amount (`tools_schema.py`)

**Files:**
- Modify: `backend/services/ai/tools_schema.py:191-202`
- Test: `backend/tests/test_counter_amount.py`

- [ ] **Step 1: Write the failing test**

在 `backend/tests/test_counter_amount.py` 末尾追加：

```python
class TestUpdateCounterSchema:
    def test_update_counter_has_amount_property(self):
        from services.ai.tools_schema import TOOLS
        tool = next(t for t in TOOLS if t["name"] == "update_counter")
        props = tool["input_schema"]["properties"]
        assert "amount" in props
        assert props["amount"]["type"] == "integer"
```

> 已确认：`tools_schema.py` 第 9 行导出模块级列表 `TOOLS`（`__all__ = ["TOOLS"]`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestUpdateCounterSchema -v`
Expected: FAIL — `amount` 不在 properties 里（或 KeyError 需修正导出名）。

- [ ] **Step 3: Modify `tools_schema.py`**

把 `update_counter` 工具定义（当前 191-203 行）替换为：

```python
    {
        "name": "update_counter",
        "description": "更新计数器(递增/递减/重置/改名)",
        "input_schema": {
            "type": "object",
            "properties": {
                "counter_id": {"type": "string"},
                "action": {"type": "string", "enum": ["increment", "decrement", "reset"]},
                "amount": {"type": "integer", "description": "递增/递减的数量，不填则按计数器步长(step)"},
                "title": {"type": "string"},
            },
            "required": ["counter_id"],
        },
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/test_counter_amount.py::TestUpdateCounterSchema -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/tools_schema.py backend/tests/test_counter_amount.py
git commit -m "feat(ai): add amount param to update_counter tool schema"
```

---

## Task 5: 全量回归 + 提交收尾

**Files:** 无新增

- [ ] **Step 1: Run the full AI + counter test suites**

Run:
```bash
cd backend && .venv/bin/python -m pytest tests/test_ai_pipeline_rules.py tests/test_ai_pipeline_e2e.py tests/test_counter.py tests/test_counter_amount.py -q
```
Expected: 全部 PASS，无回归。

- [ ] **Step 2: Run the whole backend suite (smoke)**

Run: `cd backend && .venv/bin/python -m pytest -q`
Expected: 全部 PASS（若有与本改动无关的既有失败，记录但不阻塞）。

- [ ] **Step 3: Manual sanity note (可选)**

在真实环境用 AI 面板试：`游泳加三`、`游泳+3`、`游泳减3次`、`游泳加`（应 +1）、`任务加急`（不应触发计数器）。

---

## Self-Review 记录

- **Spec 覆盖**：中文数字解析→Task1；正则多写法+amount 传递+误触发防护→Task2；执行层精确 amount/回退 step→Task3；LLM schema amount→Task4；模糊匹配复用→无需改（Task2 沿用 `_resolve_counter_target`/`match_entities`）。全部覆盖。
- **类型一致**：`parse_amount(Optional[str])->int`（Task1 定义，Task2 使用）；`_build_inc_dec_result(ctx, action, keyword, amount)` 新签名（Task2 内自洽）；`tool_input.get("amount")` 缺省回退 `step`（Task3）。一致。
- **占位符**：无 TODO/TBD，所有代码步骤含完整代码。
- **风险**：无未决项。`tools_schema.py` 导出名已确认为 `TOOLS`。
