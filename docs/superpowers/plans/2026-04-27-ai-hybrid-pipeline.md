# AI Hybrid Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 `services/ai/` 包之上引入三层 Pipeline 架构（规则前置 → JSON Mode → tools_call 兜底），降低 token 成本与延迟，同时保持现有 `/api/ai/chat` 端点契约和 tools_call 链路完全不变。

**Architecture:** Handler 类继承 + 链式 `next_handler`，三个 Handler 静态组装。新代码全部放在 `services/ai/pipeline/` 子包内。Layer 1/2 产出统一的 `ResolutionResult`，由 `executor.py` 转换为 SSE 事件并统一拦截删除操作做二次确认。Layer 3 包装现有 `_chat_stream_claude` / `_chat_stream_openai`，零业务改动。通过 `config.yaml` 总开关灰度，默认关闭。

**Tech Stack:** Python 3.10+ / FastAPI / SSE / Anthropic SDK / OpenAI SDK / dateparser / pytest / pytest-asyncio

**Spec:** `docs/superpowers/specs/2026-04-27-ai-hybrid-pipeline-design.md`

---

## File Structure

### 新增文件（13 个）

```
backend/services/ai/pipeline/
├── __init__.py                    # 包入口，re-export pipeline_chat_stream
├── base.py                        # Handler / ChatContext / ResolutionResult / sse_event helper
├── rule_handler.py                # RuleHandler 调度器
├── json_mode_handler.py           # JsonModeHandler（Layer 2）
├── tools_call_handler.py          # ToolsCallHandler（Layer 3）
├── executor.py                    # execute_resolution + _describe_delete_target
├── pipeline.py                    # 静态组装 + pipeline_chat_stream 入口
└── rules/
    ├── __init__.py                # 规则注册表 ALL_RULES
    ├── task_rules.py              # 任务 CRUD 规则
    ├── note_rules.py              # 笔记 CRUD 规则
    ├── countdown_rules.py         # 倒数日 CRUD 规则
    ├── counter_rules.py           # 计数器 CRUD 规则
    └── shared/
        ├── __init__.py
        ├── date_parser.py         # dateparser 库封装
        ├── entity_matcher.py      # 模糊匹配（精确/多/零）
        └── verb_lexicon.py        # 动词词库
```

### 修改文件（6 个）

- `backend/services/ai/chat_stream.py` — 增加灰度开关分发
- `backend/services/ai/tools_executor.py` — 增加 `skip_confirmation` 参数
- `backend/services/ai/claude_stream.py` — 签名增加 `system_prompt_suffix`
- `backend/services/ai/openai_stream.py` — 签名增加 `system_prompt_suffix`
- `backend/routes/ai.py` — 新增 `/disambiguate` 和 `/confirm` 端点
- `backend/requirements.txt` — 新增 `dateparser`
- `backend/config.yaml.example` — 新增 pipeline 配置示例
- `backend/schemas/ai.py` — 新增 `AiDisambiguateRequest` / `AiConfirmRequest`

### 测试文件（2 个）

- `backend/tests/test_ai_pipeline_rules.py` — 规则层 + 共享工具的纯单测
- `backend/tests/test_ai_pipeline_e2e.py` — Pipeline 调度链路 + 端点的集成测试（mock LLM）

---

## Conventions Applied To Every Task

- 文件首行 `# -*- coding: utf-8 -*-`
- 每个新模块都有 `"""docstring"""` 解释职责（参考现有 `services/ai/*.py` 风格）
- 不在文件开头集中 import；按需在模块顶部 import 标准库 + 项目内库
- 测试运行命令统一在仓库根目录执行：`cd backend && python -m pytest tests/<file>.py -v`
- 每个任务最后一步 commit；commit message 用 `feat(ai-pipeline): ...` / `test(ai-pipeline): ...` / `refactor(ai-pipeline): ...` / `chore(ai-pipeline): ...`

---

## Task 0: 准备依赖与配置占位

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/config.yaml.example`

- [ ] **Step 1: 在 requirements.txt 增加 dateparser 与 pytest-asyncio**

读取 `backend/requirements.txt` 当前内容，在最后追加（按现有顺序追加即可，无需排序）：

```text
dateparser>=1.2.0
pytest-asyncio>=0.23
```

> 说明：`pytest-asyncio` 在当前环境已安装（`pytest.ini` 已配置 `asyncio_mode = auto`），此步是把它固化到依赖清单，避免新环境跑测试 silent skip。

- [ ] **Step 2: 在 config.yaml.example 的 ai 段下增加 pipeline 配置占位**

找到 `ai:` 段（如果不存在，整段补全），在该段末尾追加：

```yaml
  # AI Pipeline 灰度配置（详见 docs/superpowers/specs/2026-04-27-ai-hybrid-pipeline-design.md）
  pipeline:
    enabled: false              # 总开关：false=走 legacy tools_call；true=启用三层 pipeline
    enable_rule_layer: true     # 跳过 = 不串入 pipeline
    enable_json_mode_layer: true
```

- [ ] **Step 3: 安装新依赖（验证）**

Run: `cd backend && pip install -r requirements.txt`
Expected: dateparser 安装成功，无依赖冲突

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt backend/config.yaml.example
git commit -m "chore(ai-pipeline): add dateparser dependency and pipeline config placeholders"
```

---

## Task 1: pipeline 包基类（base.py）

**Files:**
- Create: `backend/services/ai/pipeline/__init__.py`
- Create: `backend/services/ai/pipeline/base.py`
- Test: `backend/tests/test_ai_pipeline_rules.py`

- [ ] **Step 1: Write the failing test**

创建 `backend/tests/test_ai_pipeline_rules.py`：

```python
# -*- coding: utf-8 -*-
"""Unit tests for services.ai.pipeline rule layer and shared utilities."""

import pytest
from services.ai.pipeline.base import (
    ChatContext,
    ResolutionResult,
    ResolutionStatus,
    sse_event,
)


class TestChatContext:
    def test_default_fields(self):
        ctx = ChatContext(user_id="u1", message="hi", conversation_id="c1")
        assert ctx.upstream_hint is None
        assert ctx.trace == []

    def test_trace_is_independent_per_instance(self):
        a = ChatContext(user_id="u1", message="m", conversation_id="c1")
        b = ChatContext(user_id="u2", message="m", conversation_id="c2")
        a.trace.append("rule:x")
        assert b.trace == []


class TestResolutionResult:
    def test_default_status_only(self):
        r = ResolutionResult(status=ResolutionStatus.PASS)
        assert r.intent is None
        assert r.params == {}
        assert r.candidates is None
        assert r.source == "rule"


class TestSseEvent:
    def test_text_event_format(self):
        s = sse_event("text", {"content": "hi"})
        assert s.startswith("data: ")
        assert s.endswith("\n\n")
        assert '"type": "text"' in s
        assert '"content": "hi"' in s

    def test_payload_can_be_string_for_text(self):
        # sse_event 接受 str（视为 content），也接受 dict
        s = sse_event("text", "hello")
        assert '"content": "hello"' in s
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'services.ai.pipeline'`

- [ ] **Step 3: Create pipeline package init**

`backend/services/ai/pipeline/__init__.py`：

```python
# -*- coding: utf-8 -*-
"""AI processing pipeline.

Three-layer architecture: RuleHandler -> JsonModeHandler -> ToolsCallHandler.
The public surface is intentionally narrow: only ``pipeline_chat_stream``
is intended for use by ``services.ai.chat_stream``.
"""

# Note: pipeline_chat_stream is added in a later task. Keep this file minimal
# until then to avoid import cycles during incremental implementation.

__all__: list[str] = []
```

- [ ] **Step 4: Implement base.py**

`backend/services/ai/pipeline/base.py`：

```python
# -*- coding: utf-8 -*-
"""Pipeline core abstractions: Handler, ChatContext, ResolutionResult.

Every concrete handler subclasses :class:`Handler` and decides whether to
handle a request itself (yield SSE events) or delegate to ``self.next_handler``.
``ResolutionResult`` is the canonical representation produced by the rule
layer and the JSON-mode layer; the executor turns it into SSE events.
"""

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, AsyncGenerator, Optional, Union


class ResolutionStatus(str, Enum):
    EXECUTABLE = "executable"
    NEED_DISAMBIGUATION = "need_disambiguation"
    NEED_CONFIRMATION = "need_confirmation"
    PASS = "pass"


@dataclass
class ResolutionResult:
    status: ResolutionStatus
    intent: Optional[str] = None
    params: dict = field(default_factory=dict)
    candidates: Optional[list[dict]] = None
    reply_text: Optional[str] = None
    source: str = "rule"


@dataclass
class ChatContext:
    user_id: str
    message: str
    conversation_id: str
    upstream_hint: Optional[dict] = None
    trace: list[str] = field(default_factory=list)


class Handler(ABC):
    """Abstract base for pipeline handlers."""

    def __init__(self, next_handler: Optional["Handler"] = None) -> None:
        self.next_handler = next_handler

    @abstractmethod
    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        """Yield SSE-formatted strings (already terminated with ``\\n\\n``)."""
        if False:  # pragma: no cover - keeps type checker happy for abstract async gen
            yield ""


SseEventPayload = Union[str, dict]


def sse_event(event_type: str, payload: SseEventPayload) -> str:
    """Format a single SSE event line.

    ``payload`` can be a dict (merged with ``{"type": event_type}``) or a
    string (treated as ``content`` for text-like events).
    """
    if isinstance(payload, str):
        body: dict[str, Any] = {"type": event_type, "content": payload}
    else:
        body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, ensure_ascii=False, default=str)}\n\n"


__all__ = [
    "ChatContext",
    "Handler",
    "ResolutionResult",
    "ResolutionStatus",
    "sse_event",
]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/services/ai/pipeline/__init__.py backend/services/ai/pipeline/base.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add base abstractions (Handler, ChatContext, ResolutionResult, sse_event)"
```

---

## Task 2: shared/date_parser.py

**Files:**
- Create: `backend/services/ai/pipeline/rules/__init__.py`
- Create: `backend/services/ai/pipeline/rules/shared/__init__.py`
- Create: `backend/services/ai/pipeline/rules/shared/date_parser.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append to test file)**

把以下内容追加到 `backend/tests/test_ai_pipeline_rules.py` 末尾：

```python
from datetime import datetime, date

from services.ai.pipeline.rules.shared.date_parser import extract_date


class TestDateParser:
    def test_no_date_returns_original_text(self):
        text, parsed = extract_date("买牛奶")
        assert text == "买牛奶"
        assert parsed is None

    def test_today_keyword(self, monkeypatch):
        # Freeze "today" so the assertion is stable
        fixed_now = datetime(2026, 4, 27, 10, 0, 0)
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: fixed_now,
        )
        text, parsed = extract_date("今天 写日报")
        assert "今天" not in text
        assert "写日报" in text
        assert parsed is not None
        assert parsed.date() == date(2026, 4, 27)

    def test_tomorrow_keyword(self, monkeypatch):
        fixed_now = datetime(2026, 4, 27, 10, 0, 0)
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: fixed_now,
        )
        text, parsed = extract_date("明天交周报")
        assert "明天" not in text
        assert parsed.date() == date(2026, 4, 28)

    def test_iso_date(self):
        text, parsed = extract_date("2026-05-01 劳动节活动")
        assert "2026-05-01" not in text
        assert parsed.date() == date(2026, 5, 1)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestDateParser -v`
Expected: FAIL with `ModuleNotFoundError`

- [ ] **Step 3: Create rules package init files**

`backend/services/ai/pipeline/rules/__init__.py`：

```python
# -*- coding: utf-8 -*-
"""Rule layer (Layer 1) of the AI pipeline.

Each domain module (task_rules / note_rules / ...) exposes ``RULES`` which
is a list of :class:`Rule` instances. ``ALL_RULES`` aggregates them in the
priority order used by :class:`RuleHandler`.
"""

# ALL_RULES is populated in a later task once the per-domain rule modules exist.
ALL_RULES: list = []

__all__ = ["ALL_RULES"]
```

`backend/services/ai/pipeline/rules/shared/__init__.py`：

```python
# -*- coding: utf-8 -*-
"""Shared helpers reused across rule modules: date parsing, entity matching,
and the verb lexicon.
"""
```

- [ ] **Step 4: Implement date_parser.py**

`backend/services/ai/pipeline/rules/shared/date_parser.py`：

```python
# -*- coding: utf-8 -*-
"""Lightweight date extraction wrapper around the ``dateparser`` library.

Strategy: scan the input for the longest substring that ``dateparser`` can
interpret (Chinese keywords first, then ISO-like patterns, then a final
whole-string attempt). Returns ``(stripped_text, parsed_datetime)``.
"""

import re
from datetime import datetime
from typing import Optional, Tuple

import dateparser

# Order matters: longer / more specific keywords first to avoid partial matches.
_KEYWORD_PATTERNS: list[str] = [
    r"\d{4}-\d{1,2}-\d{1,2}",          # 2026-05-01
    r"\d{1,2}月\d{1,2}[日号]",          # 5月1日 / 5月1号
    r"下下?(?:周|星期)[一二三四五六日天]",  # 下周五 / 下下周一
    r"这?周[一二三四五六日天]",           # 周五 / 这周三
    r"\d+\s*天后",                      # 3天后
    r"今天|明天|后天|昨天|前天",
]

_DATEPARSER_SETTINGS = {
    "PREFER_DATES_FROM": "future",
    "RELATIVE_BASE": None,  # filled in at call time
    "RETURN_AS_TIMEZONE_AWARE": False,
    "TIMEZONE": "Asia/Shanghai",
}


def _now() -> datetime:
    """Indirection for tests to monkeypatch the current moment."""
    return datetime.now()


def extract_date(text: str) -> Tuple[str, Optional[datetime]]:
    """Try to find a date expression inside ``text``.

    Returns a tuple of ``(stripped_text, parsed_datetime_or_None)``.
    The stripped_text has the matched expression removed and surrounding
    whitespace collapsed.
    """
    settings = dict(_DATEPARSER_SETTINGS)
    settings["RELATIVE_BASE"] = _now()

    for pattern in _KEYWORD_PATTERNS:
        match = re.search(pattern, text)
        if not match:
            continue
        candidate = match.group(0)
        parsed = dateparser.parse(candidate, languages=["zh"], settings=settings)
        if parsed is None:
            continue
        stripped = (text[: match.start()] + text[match.end():]).strip()
        stripped = re.sub(r"\s+", " ", stripped)
        return stripped, parsed

    return text, None


__all__ = ["extract_date"]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestDateParser -v`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add backend/services/ai/pipeline/rules/__init__.py backend/services/ai/pipeline/rules/shared/__init__.py backend/services/ai/pipeline/rules/shared/date_parser.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add date_parser using dateparser library"
```

---

## Task 3: shared/verb_lexicon.py

**Files:**
- Create: `backend/services/ai/pipeline/rules/shared/verb_lexicon.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from services.ai.pipeline.rules.shared.verb_lexicon import (
    CREATE_VERBS,
    DELETE_VERBS,
    COMPLETE_VERBS,
    UPDATE_VERBS,
    QUERY_VERBS,
    verbs_pattern,
)


class TestVerbLexicon:
    def test_create_verbs_have_common_words(self):
        assert "添加" in CREATE_VERBS
        assert "新建" in CREATE_VERBS

    def test_pattern_compiles_to_alternation(self):
        pat = verbs_pattern(CREATE_VERBS)
        assert pat.match("添加")
        assert pat.match("新建")
        assert not pat.match("查询")

    def test_no_overlap_between_complete_and_delete(self):
        assert COMPLETE_VERBS.isdisjoint(DELETE_VERBS)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestVerbLexicon -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement verb_lexicon.py**

`backend/services/ai/pipeline/rules/shared/verb_lexicon.py`：

```python
# -*- coding: utf-8 -*-
"""Verb lexicons for action-intent matching.

Sets are kept disjoint where semantically appropriate (e.g. "完成" never
appears in DELETE_VERBS) so a single regex match maps unambiguously to one
intent class.
"""

import re
from typing import Iterable, Pattern

CREATE_VERBS: set[str] = {"加", "添加", "新建", "创建", "新增"}
DELETE_VERBS: set[str] = {"删", "删除", "去掉", "移除"}
COMPLETE_VERBS: set[str] = {"完成", "搞定", "做完", "勾掉", "打钩"}
UPDATE_VERBS: set[str] = {"改", "修改", "更新", "调整"}
QUERY_VERBS: set[str] = {"查", "查询", "看", "列出", "显示"}


def verbs_pattern(verbs: Iterable[str]) -> Pattern[str]:
    """Compile a regex that matches any verb in ``verbs`` exactly.

    Verbs are sorted by descending length so longer prefixes ("添加") are
    preferred over shorter ones ("加") under regex alternation.
    """
    sorted_verbs = sorted(verbs, key=len, reverse=True)
    alternation = "|".join(re.escape(v) for v in sorted_verbs)
    return re.compile(f"^(?:{alternation})$")


__all__ = [
    "CREATE_VERBS",
    "DELETE_VERBS",
    "COMPLETE_VERBS",
    "UPDATE_VERBS",
    "QUERY_VERBS",
    "verbs_pattern",
]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestVerbLexicon -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/shared/verb_lexicon.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add verb_lexicon for action-intent matching"
```

---

## Task 4: shared/entity_matcher.py

**Files:**
- Create: `backend/services/ai/pipeline/rules/shared/entity_matcher.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from unittest.mock import patch

from services.ai.pipeline.rules.shared.entity_matcher import match_entities


class TestEntityMatcher:
    def _items(self):
        return [
            {"id": "1", "title": "周五前交报告"},
            {"id": "2", "title": "改报告 PPT"},
            {"id": "3", "title": "开会"},
        ]

    def test_zero_match(self):
        result = match_entities("不存在的东西", self._items())
        assert result == []

    def test_exact_single_match(self):
        result = match_entities("开会", self._items())
        assert len(result) == 1
        assert result[0]["id"] == "3"

    def test_substring_multi_match(self):
        result = match_entities("报告", self._items())
        assert len(result) == 2
        ids = {r["id"] for r in result}
        assert ids == {"1", "2"}

    def test_fuzzy_fallback(self):
        # 相似度 ≥ 0.6 兜底（"开汇" ≈ "开会"）
        result = match_entities("开汇", self._items())
        assert any(r["id"] == "3" for r in result)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestEntityMatcher -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement entity_matcher.py**

`backend/services/ai/pipeline/rules/shared/entity_matcher.py`：

```python
# -*- coding: utf-8 -*-
"""Fuzzy entity matching used by rule layer when resolving "完成 报告" etc.

Three-stage strategy:
1. Exact title equality.
2. Title contains keyword as substring (returns all hits).
3. difflib similarity >= 0.6 fallback (returns hits sorted by score).
"""

from difflib import SequenceMatcher
from typing import Iterable

_FUZZY_THRESHOLD = 0.6


def match_entities(keyword: str, items: Iterable[dict]) -> list[dict]:
    """Return matched items. Each item is a dict that MUST contain ``title``.

    Empty ``keyword`` always returns ``[]``.
    """
    keyword = keyword.strip()
    if not keyword:
        return []

    items_list = list(items)

    # Stage 1: exact equality
    exact = [it for it in items_list if it.get("title") == keyword]
    if exact:
        return exact

    # Stage 2: substring containment
    substring = [it for it in items_list if keyword in (it.get("title") or "")]
    if substring:
        return substring

    # Stage 3: fuzzy
    scored: list[tuple[float, dict]] = []
    for it in items_list:
        title = it.get("title") or ""
        ratio = SequenceMatcher(None, keyword, title).ratio()
        if ratio >= _FUZZY_THRESHOLD:
            scored.append((ratio, it))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [it for _, it in scored]


__all__ = ["match_entities"]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py::TestEntityMatcher -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/shared/entity_matcher.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add entity_matcher with three-stage fuzzy strategy"
```

---

## Task 5: rules/task_rules.py（任务 CRUD）

**Files:**
- Create: `backend/services/ai/pipeline/rules/task_rules.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from unittest.mock import patch, MagicMock

from services.ai.pipeline.base import ChatContext, ResolutionStatus
from services.ai.pipeline.rules.task_rules import (
    CreateTaskRule,
    CompleteTaskRule,
    DeleteTaskRule,
    QueryTasksRule,
)


def _ctx(message: str) -> ChatContext:
    return ChatContext(user_id="u1", message=message, conversation_id="c1")


class TestCreateTaskRule:
    def test_match_basic(self):
        result = CreateTaskRule().try_match(_ctx("加任务 写日报"))
        assert result is not None
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "create_task"
        assert result.params["title"] == "写日报"

    def test_no_match_for_unrelated(self):
        assert CreateTaskRule().try_match(_ctx("今天天气怎样")) is None

    def test_extracts_date(self, monkeypatch):
        from datetime import datetime
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: datetime(2026, 4, 27, 10, 0, 0),
        )
        result = CreateTaskRule().try_match(_ctx("加任务 明天 写周报"))
        assert result.params["title"] == "写周报"
        assert result.params.get("due_date") is not None


class TestCompleteTaskRule:
    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_single_match_executable(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [
            {"id": "t1", "title": "写日报"},
        ]
        result = CompleteTaskRule().try_match(_ctx("完成 写日报"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.params == {"task_id": "t1", "status": "completed"}

    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_multi_match_disambiguation(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [
            {"id": "t1", "title": "周五前交报告"},
            {"id": "t2", "title": "改报告 PPT"},
        ]
        result = CompleteTaskRule().try_match(_ctx("完成 报告"))
        assert result.status == ResolutionStatus.NEED_DISAMBIGUATION
        assert len(result.candidates) == 2

    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_zero_match_returns_pass(self, mock_dao):
        mock_dao.get_user_tasks.return_value = []
        result = CompleteTaskRule().try_match(_ctx("完成 不存在"))
        assert result.status == ResolutionStatus.PASS


class TestDeleteTaskRule:
    @patch("services.ai.pipeline.rules.task_rules.task_dao")
    def test_single_match_returns_executable_for_executor_to_intercept(self, mock_dao):
        mock_dao.get_user_tasks.return_value = [{"id": "t1", "title": "写日报"}]
        result = DeleteTaskRule().try_match(_ctx("删除任务 写日报"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_task"
        assert result.params == {"task_id": "t1"}


class TestQueryTasksRule:
    def test_today_keyword(self):
        result = QueryTasksRule().try_match(_ctx("今天的任务"))
        assert result is not None
        assert result.intent == "list_tasks"
        assert result.params.get("filter") == "today" or "start_date" in result.params

    def test_unfinished_keyword(self):
        result = QueryTasksRule().try_match(_ctx("未完成的任务"))
        assert result.intent == "list_tasks"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "TestCreateTaskRule or TestCompleteTaskRule or TestDeleteTaskRule or TestQueryTasksRule" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement task_rules.py**

`backend/services/ai/pipeline/rules/task_rules.py`：

```python
# -*- coding: utf-8 -*-
"""Rule definitions for task CRUD via natural-language commands.

All rules implement the same shape:
    - ``name``: stable identifier used in trace logs.
    - ``try_match(ctx) -> Optional[ResolutionResult]`` returning ``None`` if
      the rule does not apply.

Multi-match scenarios produce ``NEED_DISAMBIGUATION``; zero-match scenarios
return ``status=PASS`` so the dispatcher can try the next rule (or fall
through to the next handler).
"""

import re
from datetime import datetime, timedelta
from typing import Optional

from database.dao.task_dao import task_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.date_parser import extract_date

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条)?(?:任务)?[:：]?\s*(.+)$"
)
_COMPLETE_PATTERN = re.compile(
    r"^(?:完成|搞定|做完|勾掉|打钩)(?:任务)?[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条)?(?:任务)?[:：]?\s*(.+)$"
)
_QUERY_TODAY_PATTERN = re.compile(r"^(?:今天|今日)的?任务$")
_QUERY_UNFINISHED_PATTERN = re.compile(r"^(?:未完成|没做完|待办)的?任务$")
_QUERY_OVERDUE_PATTERN = re.compile(r"^(?:过期|逾期)(?:的)?任务$")


class CreateTaskRule:
    name = "create_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title_raw = m.group(1).strip()
        if not title_raw:
            return None
        title, due_date = extract_date(title_raw)
        params: dict = {"title": title}
        if due_date is not None:
            params["due_date"] = due_date.isoformat()
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params=params,
            reply_text=f"已添加任务：{title}",
            source="rule",
        )


def _resolve_task_target(user_id: str, keyword: str) -> list[dict]:
    """Lookup user's open tasks and apply entity_matcher."""
    from .shared.entity_matcher import match_entities
    tasks = task_dao.get_user_tasks(user_id, skip=0, limit=200)
    return match_entities(keyword, tasks)


class CompleteTaskRule:
    name = "complete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _COMPLETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="update_task",
                params={"task_id": t["id"], "status": "completed"},
                reply_text=f"已完成：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="update_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            params={"status": "completed"},
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要完成的：",
            source="rule",
        )


class DeleteTaskRule:
    name = "delete_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_task_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            t = matches[0]
            # Status stays EXECUTABLE; executor will intercept and turn into
            # NEED_CONFIRMATION because intent is in DELETE_INTENTS.
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_task",
                params={"task_id": t["id"]},
                reply_text=f"准备删除：{t['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_task",
            candidates=[{"id": t["id"], "title": t["title"]} for t in matches],
            reply_text=f"找到 {len(matches)} 个匹配的任务，请选择要删除的：",
            source="rule",
        )


class QueryTasksRule:
    name = "query_tasks"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        msg = ctx.message.strip()

        if _QUERY_TODAY_PATTERN.match(msg):
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={
                    "filter": "today",
                    "start_date": today.isoformat(),
                    "end_date": today.isoformat(),
                },
                reply_text="今天的任务如下：",
                source="rule",
            )

        if _QUERY_UNFINISHED_PATTERN.match(msg):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={"filter": "unfinished", "exclude_status": "completed"},
                reply_text="未完成的任务：",
                source="rule",
            )

        if _QUERY_OVERDUE_PATTERN.match(msg):
            today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            yesterday = today - timedelta(days=1)
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_tasks",
                params={
                    "filter": "overdue",
                    "end_date": yesterday.isoformat(),
                    "exclude_status": "completed",
                },
                reply_text="过期的任务：",
                source="rule",
            )

        return None


RULES = [
    CreateTaskRule(),
    CompleteTaskRule(),
    DeleteTaskRule(),
    QueryTasksRule(),
]


__all__ = [
    "CreateTaskRule",
    "CompleteTaskRule",
    "DeleteTaskRule",
    "QueryTasksRule",
    "RULES",
]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "TestCreateTaskRule or TestCompleteTaskRule or TestDeleteTaskRule or TestQueryTasksRule" -v`
Expected: All passed (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/task_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add task CRUD rules (create/complete/delete/query)"
```

---

## Task 6: rules/note_rules.py（笔记 CRUD）

**Files:**
- Create: `backend/services/ai/pipeline/rules/note_rules.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from services.ai.pipeline.rules.note_rules import (
    CreateNoteRule,
    DeleteNoteRule,
    QueryNotesRule,
)


class TestCreateNoteRule:
    def test_match_basic(self):
        result = CreateNoteRule().try_match(_ctx("新建笔记 读书心得"))
        assert result is not None
        assert result.intent == "create_note"
        assert result.params["title"] == "读书心得"

    def test_no_match_for_task(self):
        assert CreateNoteRule().try_match(_ctx("加任务 写日报")) is None


class TestDeleteNoteRule:
    @patch("services.ai.pipeline.rules.note_rules.note_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_notes.return_value = [{"id": "n1", "title": "读书心得"}]
        result = DeleteNoteRule().try_match(_ctx("删除笔记 读书心得"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_note"
        assert result.params == {"note_id": "n1"}

    @patch("services.ai.pipeline.rules.note_rules.note_dao")
    def test_zero_match_pass(self, mock_dao):
        mock_dao.get_user_notes.return_value = []
        result = DeleteNoteRule().try_match(_ctx("删除笔记 不存在"))
        assert result.status == ResolutionStatus.PASS


class TestQueryNotesRule:
    def test_list_all(self):
        result = QueryNotesRule().try_match(_ctx("列出所有笔记"))
        assert result.intent == "list_notes"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "TestCreateNoteRule or TestDeleteNoteRule or TestQueryNotesRule" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement note_rules.py**

`backend/services/ai/pipeline/rules/note_rules.py`：

```python
# -*- coding: utf-8 -*-
"""Rule definitions for note CRUD."""

import re
from typing import Optional

from database.dao.note_dao import note_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条|篇)?(?:笔记)[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条|篇)?(?:笔记)[:：]?\s*(.+)$"
)
_QUERY_PATTERN = re.compile(r"^(?:列出|查看|显示|查)(?:所有|全部)?(?:的)?笔记$")


def _resolve_note_target(user_id: str, keyword: str) -> list[dict]:
    notes = note_dao.get_user_notes(user_id, skip=0, limit=200)
    return match_entities(keyword, notes)


class CreateNoteRule:
    name = "create_note"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title = m.group(1).strip()
        if not title:
            return None
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_note",
            params={"title": title},
            reply_text=f"已新建笔记：{title}",
            source="rule",
        )


class DeleteNoteRule:
    name = "delete_note"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_note_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            n = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_note",
                params={"note_id": n["id"]},
                reply_text=f"准备删除笔记：{n['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_note",
            candidates=[{"id": n["id"], "title": n["title"]} for n in matches],
            reply_text=f"找到 {len(matches)} 个匹配的笔记，请选择要删除的：",
            source="rule",
        )


class QueryNotesRule:
    name = "query_notes"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        if _QUERY_PATTERN.match(ctx.message.strip()):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_notes",
                params={},
                reply_text="笔记列表：",
                source="rule",
            )
        return None


RULES = [CreateNoteRule(), DeleteNoteRule(), QueryNotesRule()]


__all__ = ["CreateNoteRule", "DeleteNoteRule", "QueryNotesRule", "RULES"]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "TestCreateNoteRule or TestDeleteNoteRule or TestQueryNotesRule" -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/note_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add note CRUD rules"
```

---

## Task 7: rules/countdown_rules.py（倒数日 CRUD）

**Files:**
- Create: `backend/services/ai/pipeline/rules/countdown_rules.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from services.ai.pipeline.rules.countdown_rules import (
    CreateCountdownRule,
    DeleteCountdownRule,
    QueryCountdownsRule,
)


class TestCreateCountdownRule:
    def test_match_with_date(self, monkeypatch):
        from datetime import datetime
        monkeypatch.setattr(
            "services.ai.pipeline.rules.shared.date_parser._now",
            lambda: datetime(2026, 4, 27, 10, 0, 0),
        )
        result = CreateCountdownRule().try_match(_ctx("添加倒数日 高考 2026-06-07"))
        assert result is not None
        assert result.intent == "create_countdown"
        assert result.params["title"] == "高考"
        assert "target_date" in result.params

    def test_no_date_returns_pass(self):
        # 倒数日必须有日期，没有则放行让 LLM 兜底（询问日期）
        result = CreateCountdownRule().try_match(_ctx("添加倒数日 没日期"))
        assert result is None or result.status == ResolutionStatus.PASS


class TestDeleteCountdownRule:
    @patch("services.ai.pipeline.rules.countdown_rules.countdown_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_countdowns.return_value = [{"id": "cd1", "title": "高考"}]
        result = DeleteCountdownRule().try_match(_ctx("删除倒数日 高考"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "delete_countdown"


class TestQueryCountdownsRule:
    def test_list_all(self):
        result = QueryCountdownsRule().try_match(_ctx("查看倒数日"))
        assert result.intent == "list_countdowns"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Countdown" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement countdown_rules.py**

`backend/services/ai/pipeline/rules/countdown_rules.py`：

```python
# -*- coding: utf-8 -*-
"""Rule definitions for countdown CRUD."""

import re
from typing import Optional

from database.dao.countdown_dao import countdown_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.date_parser import extract_date
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个|条)?倒数日[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个|条)?倒数日[:：]?\s*(.+)$"
)
_QUERY_PATTERN = re.compile(r"^(?:查看|查询|列出|显示|查)(?:所有|全部)?(?:的)?倒数日$")


def _resolve_countdown_target(user_id: str, keyword: str) -> list[dict]:
    items = countdown_dao.get_user_countdowns(user_id, limit=200)
    return match_entities(keyword, items)


class CreateCountdownRule:
    name = "create_countdown"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        body = m.group(1).strip()
        if not body:
            return None
        title, target_date = extract_date(body)
        if target_date is None:
            # 倒数日必须有目标日期，让 LLM 兜底询问
            return ResolutionResult(status=ResolutionStatus.PASS)
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_countdown",
            params={"title": title, "target_date": target_date.isoformat()},
            reply_text=f"已添加倒数日：{title}",
            source="rule",
        )


class DeleteCountdownRule:
    name = "delete_countdown"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_countdown_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            cd = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_countdown",
                params={"countdown_id": cd["id"]},
                reply_text=f"准备删除倒数日：{cd['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_countdown",
            candidates=[{"id": cd["id"], "title": cd["title"]} for cd in matches],
            reply_text=f"找到 {len(matches)} 个匹配的倒数日，请选择要删除的：",
            source="rule",
        )


class QueryCountdownsRule:
    name = "query_countdowns"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        if _QUERY_PATTERN.match(ctx.message.strip()):
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="list_countdowns",
                params={},
                reply_text="倒数日列表：",
                source="rule",
            )
        return None


RULES = [CreateCountdownRule(), DeleteCountdownRule(), QueryCountdownsRule()]


__all__ = ["CreateCountdownRule", "DeleteCountdownRule", "QueryCountdownsRule", "RULES"]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Countdown" -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/countdown_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add countdown CRUD rules"
```

---

## Task 8: rules/counter_rules.py（计数器 CRUD）

**Files:**
- Create: `backend/services/ai/pipeline/rules/counter_rules.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from services.ai.pipeline.rules.counter_rules import (
    CreateCounterRule,
    IncrementCounterRule,
    DecrementCounterRule,
    DeleteCounterRule,
)


class TestCreateCounterRule:
    def test_match(self):
        result = CreateCounterRule().try_match(_ctx("新建计数器 喝水"))
        assert result is not None
        assert result.intent == "create_counter"
        assert result.params["name"] == "喝水"


class TestIncrementCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_plus_one_pattern(self, mock_dao):
        # 形式 1："喝水 +1"
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = IncrementCounterRule().try_match(_ctx("喝水 +1"))
        assert result.status == ResolutionStatus.EXECUTABLE
        assert result.intent == "update_counter"
        assert result.params == {"counter_id": "c1", "action": "increment"}

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
        assert result.params == {"counter_id": "c1", "action": "decrement"}


class TestDeleteCounterRule:
    @patch("services.ai.pipeline.rules.counter_rules.counter_dao")
    def test_single_match(self, mock_dao):
        mock_dao.get_user_counters.return_value = [{"id": "c1", "title": "喝水"}]
        result = DeleteCounterRule().try_match(_ctx("删除计数器 喝水"))
        assert result.intent == "delete_counter"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Counter" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement counter_rules.py**

`backend/services/ai/pipeline/rules/counter_rules.py`：

```python
# -*- coding: utf-8 -*-
"""Rule definitions for counter CRUD and quick +1/-1 operations."""

import re
from typing import Optional

from database.dao.counter_dao import counter_dao

from ..base import ChatContext, ResolutionResult, ResolutionStatus
from .shared.entity_matcher import match_entities

_CREATE_PATTERN = re.compile(
    r"^(?:加|添加|新建|创建|新增)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
_DELETE_PATTERN = re.compile(
    r"^(?:删|删除|去掉|移除)(?:个|一个)?计数器[:：]?\s*(.+)$"
)
# 匹配 "喝水 +1" / "喝水+1" / "+1 喝水"
_INCREMENT_PATTERN = re.compile(r"^\s*(?:(.+?)\s*\+1|\+1\s+(.+?))\s*$")
_DECREMENT_PATTERN = re.compile(r"^\s*(?:(.+?)\s*-1|-1\s+(.+?))\s*$")


def _resolve_counter_target(user_id: str, keyword: str) -> list[dict]:
    items = counter_dao.get_user_counters(user_id, limit=200)
    return match_entities(keyword, items)


class CreateCounterRule:
    name = "create_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        name = m.group(1).strip()
        if not name:
            return None
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_counter",
            params={"name": name},
            reply_text=f"已新建计数器：{name}",
            source="rule",
        )


def _build_inc_dec_result(
    ctx: ChatContext, action: str, keyword: str
) -> ResolutionResult:
    matches = _resolve_counter_target(ctx.user_id, keyword)
    if not matches:
        return ResolutionResult(status=ResolutionStatus.PASS)
    if len(matches) == 1:
        c = matches[0]
        verb = "+1" if action == "increment" else "-1"
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="update_counter",
            params={"counter_id": c["id"], "action": action},
            reply_text=f"{c['title']} {verb}",
            source="rule",
        )
    return ResolutionResult(
        status=ResolutionStatus.NEED_DISAMBIGUATION,
        intent="update_counter",
        candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
        params={"action": action},
        reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择：",
        source="rule",
    )


class IncrementCounterRule:
    name = "increment_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _INCREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group(1) or m.group(2) or "").strip()
        if not keyword:
            return None
        return _build_inc_dec_result(ctx, "increment", keyword)


class DecrementCounterRule:
    name = "decrement_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DECREMENT_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = (m.group(1) or m.group(2) or "").strip()
        if not keyword:
            return None
        return _build_inc_dec_result(ctx, "decrement", keyword)


class DeleteCounterRule:
    name = "delete_counter"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _DELETE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        keyword = m.group(1).strip()
        if not keyword:
            return None
        matches = _resolve_counter_target(ctx.user_id, keyword)
        if not matches:
            return ResolutionResult(status=ResolutionStatus.PASS)
        if len(matches) == 1:
            c = matches[0]
            return ResolutionResult(
                status=ResolutionStatus.EXECUTABLE,
                intent="delete_counter",
                params={"counter_id": c["id"]},
                reply_text=f"准备删除计数器：{c['title']}",
                source="rule",
            )
        return ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="delete_counter",
            candidates=[{"id": c["id"], "title": c["title"]} for c in matches],
            reply_text=f"找到 {len(matches)} 个匹配的计数器，请选择要删除的：",
            source="rule",
        )


RULES = [
    CreateCounterRule(),
    IncrementCounterRule(),
    DecrementCounterRule(),
    DeleteCounterRule(),
]


__all__ = [
    "CreateCounterRule",
    "IncrementCounterRule",
    "DecrementCounterRule",
    "DeleteCounterRule",
    "RULES",
]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Counter" -v`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/rules/counter_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add counter CRUD rules with +1/-1 quick patterns"
```

---

## Task 9: 规则注册表 + RuleHandler 调度器

**Files:**
- Modify: `backend/services/ai/pipeline/rules/__init__.py`
- Create: `backend/services/ai/pipeline/rule_handler.py`
- Test: `backend/tests/test_ai_pipeline_rules.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
import pytest
from unittest.mock import AsyncMock, patch

from services.ai.pipeline.rule_handler import RuleHandler
from services.ai.pipeline.rules import ALL_RULES


class TestRulesRegistry:
    def test_all_rules_aggregates_four_domains(self):
        names = {r.name for r in ALL_RULES}
        # 至少各覆盖 1 条
        assert "create_task" in names
        assert "create_note" in names
        assert "create_countdown" in names
        assert "create_counter" in names


class _StubNext:
    """Async-iterable stub used as next_handler."""

    def __init__(self):
        self.called_with: list = []

    async def handle(self, ctx):
        self.called_with.append(ctx)
        yield 'data: {"type": "stub"}\n\n'


@pytest.mark.asyncio
class TestRuleHandlerDispatch:
    async def test_match_short_circuits_next_handler(self):
        nxt = _StubNext()
        handler = RuleHandler(next_handler=nxt)
        ctx = ChatContext(user_id="u1", message="加任务 写日报", conversation_id="c1")
        events = [ev async for ev in handler.handle(ctx)]
        # 命中 create_task；不应调用 next_handler
        assert nxt.called_with == []
        assert any('"create_task"' in ev or "create_task" in ev for ev in events)
        assert any("rule:create_task" in t for t in ctx.trace)

    async def test_no_rule_match_falls_through(self):
        nxt = _StubNext()
        handler = RuleHandler(next_handler=nxt)
        ctx = ChatContext(user_id="u1", message="今天的天气如何", conversation_id="c1")
        events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.called_with) == 1
        assert ctx.upstream_hint == {"reason": "no_rule_match"}
        assert "rule:miss" in ctx.trace
        assert any('"stub"' in ev for ev in events)
```

注：`pytest-asyncio` 插件需启用。在 `backend/pytest.ini` 中确认存在 `asyncio_mode = auto`，若没有则在 Step 3 加上。

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Registry or Dispatch" -v`
Expected: FAIL with ImportError 或 ALL_RULES 为空

- [ ] **Step 3: Update rules/__init__.py**

替换 `backend/services/ai/pipeline/rules/__init__.py` 全部内容：

```python
# -*- coding: utf-8 -*-
"""Rule layer (Layer 1) of the AI pipeline.

``ALL_RULES`` is the ordered list consumed by :class:`RuleHandler`. Order
matters: more specific patterns (e.g. counter "+1" shortcuts) come before
more permissive ones to avoid accidental shadowing.
"""

from .countdown_rules import RULES as _COUNTDOWN_RULES
from .counter_rules import RULES as _COUNTER_RULES
from .note_rules import RULES as _NOTE_RULES
from .task_rules import RULES as _TASK_RULES

# Order: high-frequency / very specific first.
ALL_RULES = [
    *_COUNTER_RULES,    # +1/-1 短模式优先
    *_TASK_RULES,
    *_NOTE_RULES,
    *_COUNTDOWN_RULES,
]

__all__ = ["ALL_RULES"]
```

- [ ] **Step 4: Implement rule_handler.py**

`backend/services/ai/pipeline/rule_handler.py`：

```python
# -*- coding: utf-8 -*-
"""Layer 1 dispatcher: iterates registered rules and routes to the first hit.

If no rule matches (or every matching rule returns ``PASS``), the request
is forwarded to ``self.next_handler`` with an ``upstream_hint`` describing
why the rule layer abstained.
"""

from typing import AsyncGenerator

from .base import ChatContext, Handler, ResolutionStatus
from .executor import execute_resolution
from .rules import ALL_RULES


class RuleHandler(Handler):
    def __init__(self, next_handler=None):
        super().__init__(next_handler=next_handler)
        self.rules = ALL_RULES

    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        for rule in self.rules:
            result = rule.try_match(ctx)
            if result is None:
                continue
            if result.status == ResolutionStatus.PASS:
                continue
            ctx.trace.append(f"rule:{rule.name}")
            async for ev in execute_resolution(result, ctx):
                yield ev
            return

        ctx.trace.append("rule:miss")
        ctx.upstream_hint = {"reason": "no_rule_match"}
        if self.next_handler is None:
            return
        async for ev in self.next_handler.handle(ctx):
            yield ev


__all__ = ["RuleHandler"]
```

> 注意：本任务依赖 Task 10 提供的 `executor.execute_resolution`。先把 executor 写一个最小桩函数让 import 不报错（Task 10 会替换为完整实现）。Step 5 给出桩。

- [ ] **Step 5: Add stub executor.py (will be replaced in Task 10)**

`backend/services/ai/pipeline/executor.py`（临时桩）：

```python
# -*- coding: utf-8 -*-
"""STUB - replaced in Task 10."""

from typing import AsyncGenerator

from .base import ChatContext, ResolutionResult, sse_event


async def execute_resolution(
    result: ResolutionResult, ctx: ChatContext
) -> AsyncGenerator[str, None]:
    yield sse_event("text", {"content": f"[stub] {result.intent}"})
    yield sse_event("done", {"conversation_id": ctx.conversation_id})


__all__ = ["execute_resolution"]
```

- [ ] **Step 6: 验证 pytest-asyncio 已生效**

`backend/pytest.ini` 现有内容已含 `asyncio_mode = auto`（无需修改）。`pytest-asyncio` 已在 Task 0 加入 `requirements.txt`。这一步只做验证：

Run: `cd backend && python -c "import pytest_asyncio; print(pytest_asyncio.__version__)"`
Expected: 打印版本号（如 `1.3.0`），无 ImportError

- [ ] **Step 7: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_rules.py -k "Registry or Dispatch" -v`
Expected: 3 passed

- [ ] **Step 8: Commit**

```bash
git add backend/services/ai/pipeline/rules/__init__.py backend/services/ai/pipeline/rule_handler.py backend/services/ai/pipeline/executor.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai-pipeline): add rule registry and RuleHandler dispatcher with stub executor"
```

---

## Task 10: executor.py（统一执行 + 删除拦截）

**Files:**
- Modify: `backend/services/ai/pipeline/executor.py` (replace stub)
- Test: `backend/tests/test_ai_pipeline_e2e.py` (create)

- [ ] **Step 1: Create the new test file with failing tests**

`backend/tests/test_ai_pipeline_e2e.py`：

```python
# -*- coding: utf-8 -*-
"""End-to-end tests for pipeline dispatch, executor, and HTTP endpoints."""

import json
import pytest
from unittest.mock import patch, MagicMock

from services.ai.pipeline.base import (
    ChatContext,
    ResolutionResult,
    ResolutionStatus,
)
from services.ai.pipeline.executor import execute_resolution


def _events_to_payloads(events: list[str]) -> list[dict]:
    out = []
    for ev in events:
        line = ev.strip()
        assert line.startswith("data: ")
        out.append(json.loads(line[len("data: "):]))
    return out


@pytest.mark.asyncio
class TestExecutorDisambiguation:
    async def test_emits_disambiguation_event(self):
        ctx = ChatContext(user_id="u1", message="完成 报告", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.NEED_DISAMBIGUATION,
            intent="update_task",
            candidates=[{"id": "t1", "title": "A"}, {"id": "t2", "title": "B"}],
            reply_text="请选择",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert payloads[0]["type"] == "disambiguation"
        assert payloads[0]["pending_intent"] == "update_task"
        assert len(payloads[0]["candidates"]) == 2
        assert payloads[-1]["type"] == "done"


@pytest.mark.asyncio
class TestExecutorDeleteInterception:
    @patch("services.ai.pipeline.executor._describe_delete_target")
    async def test_delete_intent_forced_to_confirmation(self, mock_desc):
        mock_desc.return_value = "周五前交报告"
        ctx = ChatContext(user_id="u1", message="删除", conversation_id="c1")
        # 即便规则层返回的是 EXECUTABLE，executor 也必须拦截
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="delete_task",
            params={"task_id": "t1"},
            reply_text="准备删除",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert payloads[0]["type"] == "confirmation"
        assert payloads[0]["pending_intent"] == "delete_task"
        assert payloads[0]["target_description"] == "周五前交报告"
        assert payloads[-1]["type"] == "done"


@pytest.mark.asyncio
class TestExecutorExecutable:
    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_calls_execute_tool_and_emits_result(self, mock_exec):
        mock_exec.return_value = {"id": "t-new", "title": "写日报"}
        ctx = ChatContext(user_id="u1", message="加任务 写日报", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params={"title": "写日报"},
            reply_text="已添加任务：写日报",
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        types = [p["type"] for p in payloads]
        assert "tool_result" in types
        assert "text" in types
        assert types[-1] == "done"
        mock_exec.assert_called_once_with("u1", "create_task", {"title": "写日报"})

    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_dao_exception_emits_error(self, mock_exec):
        mock_exec.side_effect = RuntimeError("db down")
        ctx = ChatContext(user_id="u1", message="x", conversation_id="c1")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params={"title": "x"},
        )
        events = [ev async for ev in execute_resolution(result, ctx)]
        payloads = _events_to_payloads(events)
        assert any(p["type"] == "error" for p in payloads)
        assert payloads[-1]["type"] == "done"
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "Executor" -v`
Expected: FAIL — stub 没有 confirmation/disambiguation 逻辑，且 `_execute_tool` / `_describe_delete_target` 不存在

- [ ] **Step 3: Replace executor.py with full implementation**

替换 `backend/services/ai/pipeline/executor.py` 全部内容：

```python
# -*- coding: utf-8 -*-
"""Translates :class:`ResolutionResult` into SSE events.

Responsible for cross-cutting concerns:
- multi-match disambiguation (NEED_DISAMBIGUATION)
- delete confirmation interception (any DELETE_INTENTS becomes a
  ``confirmation`` event before reaching the DAO layer)
- DAO invocation via the existing ``tools_executor._execute_tool``
"""

from typing import AsyncGenerator

from database.dao.countdown_dao import countdown_dao
from database.dao.counter_dao import counter_dao
from database.dao.list_dao import list_dao
from database.dao.note_dao import note_dao
from database.dao.tag_dao import tag_dao
from database.dao.task_dao import task_dao
from utils.logger import logger

from ..tools_executor import _execute_tool
from .base import ChatContext, ResolutionResult, ResolutionStatus, sse_event

DELETE_INTENTS: set[str] = {
    "delete_task",
    "delete_note",
    "delete_countdown",
    "delete_counter",
    "delete_list",
    "delete_tag",
}


def _describe_delete_target(user_id: str, intent: str, params: dict) -> str:
    """Look up the human-readable name of the entity about to be deleted."""
    try:
        if intent == "delete_task":
            t = task_dao.get_task_by_id(params["task_id"], user_id)
            return t["title"] if t else "(未找到)"
        if intent == "delete_note":
            n = note_dao.get_note_by_id(user_id, params["note_id"])
            return n["title"] if n else "(未找到)"
        if intent == "delete_countdown":
            cd = countdown_dao.get_countdown_by_id(user_id, params["countdown_id"])
            return cd["title"] if cd else "(未找到)"
        if intent == "delete_counter":
            c = counter_dao.get_counter_by_id(user_id, params["counter_id"])
            return c["title"] if c else "(未找到)"
        if intent == "delete_list":
            lst = list_dao.get_list_by_id(user_id, params["list_id"])
            return lst["name"] if lst else "(未找到)"
        if intent == "delete_tag":
            tg = tag_dao.get_tag_by_id(user_id, params["tag_id"])
            return tg["name"] if tg else "(未找到)"
    except Exception as e:
        logger.warning(f"_describe_delete_target failed: {intent} {e}")
    return "(未知目标)"


async def execute_resolution(
    result: ResolutionResult, ctx: ChatContext
) -> AsyncGenerator[str, None]:
    """Convert a ResolutionResult into the canonical SSE event stream."""

    # 1) Multi-match: ask the user to pick one
    if result.status == ResolutionStatus.NEED_DISAMBIGUATION:
        yield sse_event("disambiguation", {
            "pending_intent": result.intent,
            "candidates": result.candidates or [],
            "extra_params": {k: v for k, v in result.params.items()
                             if k not in {"task_id", "note_id", "countdown_id", "counter_id"}},
            "reply": result.reply_text or "请选择：",
            "source": result.source,
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        ctx.trace.append("exec:disambiguation")
        return

    # 2) Delete intents: force confirmation regardless of incoming status
    if result.intent in DELETE_INTENTS and result.status != ResolutionStatus.NEED_CONFIRMATION:
        target_desc = _describe_delete_target(ctx.user_id, result.intent, result.params)
        yield sse_event("confirmation", {
            "pending_intent": result.intent,
            "params": result.params,
            "target_description": target_desc,
            "reply": f"确认删除「{target_desc}」？",
            "source": result.source,
        })
        yield sse_event("done", {"conversation_id": ctx.conversation_id})
        ctx.trace.append("exec:confirmation")
        return

    # 3) Executable: hit the DAO
    if result.status == ResolutionStatus.EXECUTABLE:
        try:
            tool_result = _execute_tool(ctx.user_id, result.intent, result.params)
            yield sse_event("tool_result", {
                "tool": result.intent,
                "result": tool_result,
                "source": result.source,
            })
            if result.reply_text:
                yield sse_event("text", {"content": result.reply_text})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            ctx.trace.append("exec:ok")
        except Exception as e:
            logger.error(f"executor failed: {result.intent} {e}")
            yield sse_event("error", {"content": f"执行失败：{e}"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            ctx.trace.append("exec:error")
        return

    # Unexpected status: treat as a no-op done event
    logger.warning(f"executor reached unexpected status: {result.status}")
    yield sse_event("done", {"conversation_id": ctx.conversation_id})


__all__ = ["execute_resolution", "DELETE_INTENTS", "_describe_delete_target"]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "Executor" -v && python -m pytest tests/test_ai_pipeline_rules.py -v`
Expected: 全部 passed（含 Task 9 的 dispatch 测试，stub 已被替换为真实实现）

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/executor.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai-pipeline): implement executor with disambiguation and delete interception"
```

---

## Task 11: JsonModeHandler（Layer 2）

**Files:**
- Create: `backend/services/ai/pipeline/json_mode_handler.py`
- Test: `backend/tests/test_ai_pipeline_e2e.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from unittest.mock import AsyncMock

from services.ai.pipeline.json_mode_handler import JsonModeHandler


@pytest.mark.asyncio
class TestJsonModeHandler:
    class _StubNext:
        def __init__(self):
            self.calls = []

        async def handle(self, ctx):
            self.calls.append(ctx)
            yield 'data: {"type":"stub_next"}\n\n'

    async def test_chitchat_short_circuits(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='{"intent":"chitchat","params":{},"needs_confirmation":false,"reply":"你好呀"}')):
            ctx = ChatContext(user_id="u1", message="你好", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert nxt.calls == []
        joined = "".join(events)
        assert "你好呀" in joined
        assert "json:chitchat" in ctx.trace

    async def test_unknown_falls_through(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='{"intent":"unknown","params":{},"needs_confirmation":false,"reply":""}')):
            ctx = ChatContext(user_id="u1", message="???", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.calls) == 1
        assert ctx.upstream_hint == {"reason": "json_mode_unknown"}

    async def test_invalid_json_falls_through(self):
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        with patch.object(handler, "_call_llm_json_mode",
                          new=AsyncMock(return_value='this is not json')):
            ctx = ChatContext(user_id="u1", message="复杂请求", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert len(nxt.calls) == 1
        assert ctx.upstream_hint and ctx.upstream_hint["reason"] == "json_mode_failed"
        assert any(t.startswith("json:fail") for t in ctx.trace)

    @patch("services.ai.pipeline.executor._execute_tool")
    async def test_executable_intent_dispatches_to_executor(self, mock_exec):
        mock_exec.return_value = {"id": "t1", "title": "x"}
        nxt = self._StubNext()
        handler = JsonModeHandler(next_handler=nxt)
        payload = '{"intent":"create_task","params":{"title":"x"},"needs_confirmation":false,"reply":"已添加 x"}'
        with patch.object(handler, "_call_llm_json_mode", new=AsyncMock(return_value=payload)):
            ctx = ChatContext(user_id="u1", message="帮我加个 x", conversation_id="c1")
            events = [ev async for ev in handler.handle(ctx)]
        assert nxt.calls == []
        joined = "".join(events)
        assert '"create_task"' in joined
        assert "json:create_task" in ctx.trace
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "JsonMode" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Implement json_mode_handler.py**

`backend/services/ai/pipeline/json_mode_handler.py`：

```python
# -*- coding: utf-8 -*-
"""Layer 2: ask the LLM for a structured intent JSON without TOOLS schema.

Cheaper than full tool calling because the prompt embeds only a compact
schema rather than the full TOOLS array. ``chitchat`` short-circuits
(no DAO call); ``unknown`` and parse failures fall through to Layer 3.
"""

import asyncio
import json
from typing import AsyncGenerator, Optional

from utils.logger import logger

from ..system_prompt import _build_system_prompt
from .base import ChatContext, Handler, ResolutionResult, ResolutionStatus, sse_event
from .executor import execute_resolution

_JSON_MODE_TIMEOUT_SECONDS = 8
_JSON_MODE_MAX_TOKENS = 1024

_VALID_INTENTS = {
    "create_task", "update_task", "delete_task", "list_tasks",
    "create_note", "update_note", "delete_note", "list_notes",
    "create_countdown", "update_countdown", "delete_countdown", "list_countdowns",
    "create_counter", "update_counter", "delete_counter", "list_counters",
    "create_list", "update_list", "delete_list", "list_lists",
    "create_tag", "update_tag", "delete_tag", "list_tags",
    "chitchat", "unknown",
}


def _build_json_mode_prompt(user_id: str) -> str:
    """Reuse the data snapshot builder but append JSON-mode instructions."""
    base = _build_system_prompt(user_id)
    json_instr = """
---
请严格输出以下结构的 JSON（只输出 JSON，不要任何额外解释）：
{
  "intent": "create_task | update_task | delete_task | list_tasks | create_note | ... | chitchat | unknown",
  "params": { ... 与 intent 对应的参数（同 tools 的 input schema） ... },
  "needs_confirmation": false,
  "reply": "给用户的自然语言回复"
}
- 闲聊（你好/感谢/介绍自己）→ intent="chitchat"，reply 写自然回复，params 空对象
- 无法识别 → intent="unknown"，reply 空字符串
- 删除类操作 → needs_confirmation=true
- 涉及到现有实体时，必须从上方数据快照中找到对应 id 填入 params
- 不要返回 schema 之外的字段
"""
    return base + json_instr


def _parse_json_payload(raw: str) -> dict:
    """Parse and validate the LLM JSON payload."""
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise ValueError("payload is not a dict")
    intent = payload.get("intent")
    if intent not in _VALID_INTENTS:
        raise ValueError(f"invalid intent: {intent!r}")
    if not isinstance(payload.get("params", {}), dict):
        raise ValueError("params must be a dict")
    return payload


class JsonModeHandler(Handler):
    async def _call_llm_json_mode(self, ctx: ChatContext) -> str:
        """Call the configured LLM in JSON mode and return the raw string."""
        from config.config_loader import config

        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")
        prompt = _build_json_mode_prompt(ctx.user_id)

        if provider == "openai":
            from openai import OpenAI
            client = OpenAI(
                api_key=ai_config.get("openai_api_key") or ai_config.get("api_key"),
                base_url=ai_config.get("openai_base_url") or None,
            )
            # Run the sync SDK in a thread to remain async-friendly.
            def _sync_call() -> str:
                resp = client.chat.completions.create(
                    model=ai_config.get("openai_model") or ai_config.get("model"),
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": ctx.message},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=_JSON_MODE_MAX_TOKENS,
                    temperature=0,
                )
                return resp.choices[0].message.content or ""
            return await asyncio.to_thread(_sync_call)

        # Claude path: no native json mode; rely on prompt + low temperature.
        import anthropic
        client = anthropic.Anthropic(api_key=ai_config["api_key"])
        def _sync_call_claude() -> str:
            resp = client.messages.create(
                model=ai_config["model"],
                max_tokens=_JSON_MODE_MAX_TOKENS,
                system=prompt + "\n严禁输出 JSON 之外的任何字符。",
                messages=[{"role": "user", "content": ctx.message}],
                temperature=0,
            )
            parts = [b.text for b in resp.content if getattr(b, "type", None) == "text"]
            return "".join(parts)
        return await asyncio.to_thread(_sync_call_claude)

    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        try:
            raw = await asyncio.wait_for(
                self._call_llm_json_mode(ctx), timeout=_JSON_MODE_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(f"json_mode timeout for user={ctx.user_id}")
            ctx.trace.append("json:fail:Timeout")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": "timeout"}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应超时，请重试"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return
        except Exception as e:
            logger.error(f"json_mode call failed: {e}")
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "detail": str(e)[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 调用失败"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        try:
            payload = _parse_json_payload(raw)
        except Exception as e:
            logger.warning(f"json_mode parse failed: {e} raw={raw[:200]!r}")
            ctx.trace.append(f"json:fail:{type(e).__name__}")
            ctx.upstream_hint = {"reason": "json_mode_failed", "raw": raw[:200]}
            if self.next_handler is None:
                yield sse_event("error", {"content": "AI 响应格式异常"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        intent = payload["intent"]
        reply_text = payload.get("reply", "") or ""

        if intent == "unknown":
            ctx.trace.append("json:unknown")
            ctx.upstream_hint = {"reason": "json_mode_unknown"}
            if self.next_handler is None:
                yield sse_event("text", {"content": "没听懂，请换种说法"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in self.next_handler.handle(ctx):
                yield ev
            return

        if intent == "chitchat":
            ctx.trace.append("json:chitchat")
            yield sse_event("text", {"content": reply_text or "（无回复）"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return

        ctx.trace.append(f"json:{intent}")
        result = ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent=intent,
            params=payload.get("params", {}) or {},
            reply_text=reply_text,
            source="json_mode",
        )
        async for ev in execute_resolution(result, ctx):
            yield ev


__all__ = ["JsonModeHandler"]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "JsonMode" -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/pipeline/json_mode_handler.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai-pipeline): implement JsonModeHandler with chitchat short-circuit and auto-fallback"
```

---

## Task 12: 现有 stream 增加 `system_prompt_suffix` + ToolsCallHandler

**Files:**
- Modify: `backend/services/ai/claude_stream.py`
- Modify: `backend/services/ai/openai_stream.py`
- Create: `backend/services/ai/pipeline/tools_call_handler.py`
- Test: `backend/tests/test_ai_pipeline_e2e.py` (extend)

- [ ] **Step 1: Write failing test (append)**

```python
from services.ai.pipeline.tools_call_handler import ToolsCallHandler


@pytest.mark.asyncio
class TestToolsCallHandler:
    @patch("services.ai.pipeline.tools_call_handler._chat_stream_claude")
    @patch("services.ai.pipeline.tools_call_handler.config")
    async def test_passes_upstream_hint_as_suffix(self, mock_config, mock_claude):
        mock_config.get_ai_config.return_value = {
            "provider": "claude", "api_key": "fake", "model": "m", "max_tokens": 100,
        }

        async def _fake_stream(user_id, message, conv, ai_config, system_prompt_suffix=""):
            # Echo back so the test can assert the suffix was forwarded
            yield f'data: {{"type":"text","content":"{system_prompt_suffix}"}}\n\n'

        mock_claude.side_effect = lambda *a, **kw: _fake_stream(*a, **kw)
        handler = ToolsCallHandler()
        ctx = ChatContext(user_id="u1", message="x", conversation_id="c1")
        ctx.upstream_hint = {"reason": "json_mode_failed"}
        events = [ev async for ev in handler.handle(ctx)]
        joined = "".join(events)
        assert "json_mode_failed" in joined
        assert "tools_call" in ctx.trace
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "ToolsCall" -v`
Expected: FAIL with ImportError

- [ ] **Step 3: Modify claude_stream.py to accept system_prompt_suffix**

读取 `backend/services/ai/claude_stream.py`，定位函数签名：

```python
async def _chat_stream_claude(
    user_id: str,
    message: str,
    conversation_id: Optional[str],
    ai_config: Dict,
) -> AsyncGenerator[str, None]:
```

替换为（增加可选参数）：

```python
async def _chat_stream_claude(
    user_id: str,
    message: str,
    conversation_id: Optional[str],
    ai_config: Dict,
    system_prompt_suffix: str = "",
) -> AsyncGenerator[str, None]:
```

并在函数体内构建 system_prompt 的位置（`system_prompt = _build_system_prompt(user_id)`）后面追加：

```python
    if system_prompt_suffix:
        system_prompt = f"{system_prompt}{system_prompt_suffix}"
```

- [ ] **Step 4: Modify openai_stream.py the same way**

对 `_chat_stream_openai` 做完全相同的签名扩展和拼接（在 `system_prompt = _build_system_prompt(user_id)` 之后追加同样的 if 判断）。

- [ ] **Step 5: Implement tools_call_handler.py**

`backend/services/ai/pipeline/tools_call_handler.py`：

```python
# -*- coding: utf-8 -*-
"""Layer 3 (terminal): wraps the existing provider-specific tool-calling
streams. Never delegates further; this is the bottom of the pipeline.
"""

from typing import AsyncGenerator

from config.config_loader import config

from ..claude_stream import _chat_stream_claude
from ..openai_stream import _chat_stream_openai
from .base import ChatContext, Handler, sse_event


class ToolsCallHandler(Handler):
    async def handle(self, ctx: ChatContext) -> AsyncGenerator[str, None]:
        ctx.trace.append("tools_call")

        ai_config = config.get_ai_config()
        provider = ai_config.get("provider", "claude")

        suffix = ""
        if ctx.upstream_hint:
            reason = ctx.upstream_hint.get("reason")
            if reason:
                suffix = f"\n\n⚠️ 注：上游处理（{reason}）未能识别，请仔细分析用户意图。"

        if provider == "openai":
            api_key = ai_config.get("openai_api_key") or ai_config.get("api_key")
            if not api_key:
                yield sse_event("error", {"content": "AI 功能未配置，请联系管理员设置 API Key。"})
                yield sse_event("done", {"conversation_id": ctx.conversation_id})
                return
            async for ev in _chat_stream_openai(
                ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
                system_prompt_suffix=suffix,
            ):
                yield ev
            return

        if not ai_config.get("api_key"):
            yield sse_event("error", {"content": "AI 功能未配置，请联系管理员设置 API Key。"})
            yield sse_event("done", {"conversation_id": ctx.conversation_id})
            return
        async for ev in _chat_stream_claude(
            ctx.user_id, ctx.message, ctx.conversation_id, ai_config,
            system_prompt_suffix=suffix,
        ):
            yield ev


__all__ = ["ToolsCallHandler"]
```

- [ ] **Step 6: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "ToolsCall" -v && python -m pytest tests/test_ai_pipeline_rules.py tests/test_ai_pipeline_e2e.py -v`
Expected: ToolsCall 测试 1 passed；其余历史测试无回归

- [ ] **Step 7: Commit**

```bash
git add backend/services/ai/claude_stream.py backend/services/ai/openai_stream.py backend/services/ai/pipeline/tools_call_handler.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai-pipeline): add ToolsCallHandler and system_prompt_suffix support in legacy streams"
```

---

## Task 13: pipeline.py 组装入口 + chat_stream 灰度开关 + tools_executor 改造

**Files:**
- Create: `backend/services/ai/pipeline/pipeline.py`
- Modify: `backend/services/ai/pipeline/__init__.py`
- Modify: `backend/services/ai/chat_stream.py`
- Modify: `backend/services/ai/tools_executor.py`
- Test: `backend/tests/test_ai_pipeline_e2e.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
@pytest.mark.asyncio
class TestPipelineAssembly:
    @patch("services.ai.pipeline.pipeline.config")
    async def test_full_chain_assembled_when_all_layers_enabled(self, mock_config):
        mock_config.get_ai_config.return_value = {
            "provider": "claude", "api_key": "fake", "model": "m", "max_tokens": 100,
            "pipeline": {"enabled": True, "enable_rule_layer": True,
                         "enable_json_mode_layer": True},
        }
        from services.ai.pipeline.pipeline import _build_pipeline
        head = _build_pipeline()
        # 链路应为 RuleHandler -> JsonModeHandler -> ToolsCallHandler
        from services.ai.pipeline.rule_handler import RuleHandler
        from services.ai.pipeline.json_mode_handler import JsonModeHandler
        from services.ai.pipeline.tools_call_handler import ToolsCallHandler
        assert isinstance(head, RuleHandler)
        assert isinstance(head.next_handler, JsonModeHandler)
        assert isinstance(head.next_handler.next_handler, ToolsCallHandler)
        assert head.next_handler.next_handler.next_handler is None

    @patch("services.ai.pipeline.pipeline.config")
    async def test_rule_layer_skipped(self, mock_config):
        mock_config.get_ai_config.return_value = {
            "provider": "claude", "api_key": "fake", "model": "m", "max_tokens": 100,
            "pipeline": {"enabled": True, "enable_rule_layer": False,
                         "enable_json_mode_layer": True},
        }
        from services.ai.pipeline.pipeline import _build_pipeline
        from services.ai.pipeline.json_mode_handler import JsonModeHandler
        head = _build_pipeline()
        assert isinstance(head, JsonModeHandler)


class TestToolsExecutorSkipConfirmation:
    """Verify the new skip_confirmation flag short-circuits delete confirmation."""

    @patch("services.ai.tools_executor.task_dao")
    def test_delete_returns_pending_when_not_skipping(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        mock_dao.get_task_by_id.return_value = {"id": "t1", "title": "x"}
        result = _execute_tool("u1", "delete_task", {"task_id": "t1"})
        assert isinstance(result, dict)
        assert result.get("_pending_confirmation") is True
        # 未真正删除
        mock_dao.delete_task.assert_not_called()

    @patch("services.ai.tools_executor.task_dao")
    def test_delete_executes_when_skipping(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        result = _execute_tool("u1", "delete_task", {"task_id": "t1"}, skip_confirmation=True)
        mock_dao.delete_task.assert_called_once_with("t1", "u1")
        assert result.get("success") is True
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "Assembly or SkipConfirmation" -v`
Expected: FAIL — pipeline 模块不存在；tools_executor 不接受 skip_confirmation

- [ ] **Step 3: Modify tools_executor.py to add skip_confirmation**

读取 `backend/services/ai/tools_executor.py`，把函数签名：

```python
def _execute_tool(user_id: str, tool_name: str, tool_input: Dict[str, Any]) -> Any:
```

替换为：

```python
def _execute_tool(
    user_id: str,
    tool_name: str,
    tool_input: Dict[str, Any],
    skip_confirmation: bool = False,
) -> Any:
```

然后在 `try:` 块的最开头（`# --- 任务 ---` 之前）插入拦截逻辑：

```python
    # --- 删除拦截（统一在此处理）---
    _DELETE_NAMES = {
        "delete_task", "delete_note", "delete_countdown",
        "delete_counter", "delete_list", "delete_tag",
    }
    if tool_name in _DELETE_NAMES and not skip_confirmation:
        # 由调用方（pipeline executor / tools_call_handler）决定如何呈现给用户
        return {
            "_pending_confirmation": True,
            "intent": tool_name,
            "params": tool_input,
        }
```

- [ ] **Step 4: Implement pipeline.py**

`backend/services/ai/pipeline/pipeline.py`：

```python
# -*- coding: utf-8 -*-
"""Pipeline assembly + public ``pipeline_chat_stream`` entry point.

Reads ``ai.pipeline.*`` config to decide which handlers participate in the
chain. Skipped layers are simply not instantiated so they incur zero
runtime cost (no per-request "skip" branch).
"""

from typing import AsyncGenerator, Optional

from config.config_loader import config

from .base import ChatContext, Handler


def _build_pipeline() -> Optional[Handler]:
    """Construct the handler chain based on current config. Returns the
    head handler, or ``None`` if pipeline is fully disabled."""
    ai_config = config.get_ai_config()
    pipe_cfg = ai_config.get("pipeline", {}) or {}
    if not pipe_cfg.get("enabled", False):
        return None

    use_rule = pipe_cfg.get("enable_rule_layer", True)
    use_json = pipe_cfg.get("enable_json_mode_layer", True)

    # Build from tail to head so each layer can wrap the next.
    from .tools_call_handler import ToolsCallHandler
    tail: Handler = ToolsCallHandler(next_handler=None)

    head: Handler = tail
    if use_json:
        from .json_mode_handler import JsonModeHandler
        head = JsonModeHandler(next_handler=head)
    if use_rule:
        from .rule_handler import RuleHandler
        head = RuleHandler(next_handler=head)

    return head


async def pipeline_chat_stream(
    user_id: str,
    message: str,
    conversation_id: str,
) -> AsyncGenerator[str, None]:
    """Run the full pipeline for one user message."""
    head = _build_pipeline()
    if head is None:
        # Should not happen if caller already checked the flag; safe-guard.
        return
    ctx = ChatContext(
        user_id=user_id, message=message, conversation_id=conversation_id,
    )
    async for ev in head.handle(ctx):
        yield ev


__all__ = ["pipeline_chat_stream", "_build_pipeline"]
```

- [ ] **Step 5: Update pipeline package __init__.py**

替换 `backend/services/ai/pipeline/__init__.py` 全部内容：

```python
# -*- coding: utf-8 -*-
"""AI processing pipeline (Layer 1 rules, Layer 2 JSON mode, Layer 3 tools call).

Public surface: only ``pipeline_chat_stream`` is intended for use by
``services.ai.chat_stream``. All handlers and helpers are implementation
details.
"""

from .pipeline import pipeline_chat_stream

__all__ = ["pipeline_chat_stream"]
```

- [ ] **Step 6: Modify chat_stream.py to gate on the pipeline flag**

读取 `backend/services/ai/chat_stream.py`，替换 `chat_stream` 函数体的开头部分：

把：

```python
    from config.config_loader import config

    ai_config = config.get_ai_config()
    provider = ai_config.get("provider", "claude")
```

替换为：

```python
    from config.config_loader import config

    ai_config = config.get_ai_config()

    # --- 灰度开关：启用三层 pipeline ---
    pipe_cfg = ai_config.get("pipeline", {}) or {}
    if pipe_cfg.get("enabled", False):
        from .pipeline import pipeline_chat_stream
        conv_id = conversation_id or str(uuid.uuid4())
        async for ev in pipeline_chat_stream(user_id, message, conv_id):
            yield ev
        return

    provider = ai_config.get("provider", "claude")
```

- [ ] **Step 7: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: 全部 passed（含组装链测试 + skip_confirmation 测试 + 历史测试）

- [ ] **Step 8: Commit**

```bash
git add backend/services/ai/pipeline/pipeline.py backend/services/ai/pipeline/__init__.py backend/services/ai/chat_stream.py backend/services/ai/tools_executor.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai-pipeline): wire pipeline_chat_stream entry, add gating in chat_stream and skip_confirmation in tools_executor"
```

---

## Task 14: 新增 `/disambiguate` 和 `/confirm` 端点

**Files:**
- Modify: `backend/schemas/ai.py`
- Modify: `backend/routes/ai.py`
- Test: `backend/tests/test_ai_pipeline_e2e.py` (extend)

- [ ] **Step 1: Write the failing test (append)**

```python
from fastapi.testclient import TestClient


@pytest.mark.asyncio
class TestEndpoints:
    def _client_with_user(self, user_id="u1"):
        from app import app
        from middleware.jwt_middleware import get_current_user
        app.dependency_overrides[get_current_user] = lambda: user_id
        return TestClient(app)

    def test_disambiguate_endpoint_streams_executable_result(self):
        client = self._client_with_user()
        with patch("routes.ai._execute_tool") as mock_exec:
            mock_exec.return_value = {"id": "t1", "status": "completed"}
            resp = client.post("/api/ai/disambiguate", json={
                "conversation_id": "c1",
                "pending_intent": "update_task",
                "selected_id": "t1",
                "extra_params": {"status": "completed"},
            })
            assert resp.status_code == 200
            body = resp.text
            assert "tool_result" in body or '"type": "tool_result"' in body
            assert '"type": "done"' in body
            mock_exec.assert_called_once()

    def test_confirm_cancel_does_not_consume_rate_limit(self):
        client = self._client_with_user("u_cancel")
        # 调取 21 次取消，正常 chat 限额 20/min；如果消耗配额第 21 次会 429
        for _ in range(21):
            resp = client.post("/api/ai/confirm", json={
                "conversation_id": "c1",
                "pending_intent": "delete_task",
                "params": {"task_id": "x"},
                "confirmed": False,
            })
            assert resp.status_code == 200, f"unexpected status {resp.status_code}"
        # 后续 chat 仍未受影响
        # （此处仅断言取消未消耗，不再验证 chat 实调）

    def test_confirm_executes_with_skip_confirmation(self):
        client = self._client_with_user()
        with patch("routes.ai._execute_tool") as mock_exec:
            mock_exec.return_value = {"success": True}
            resp = client.post("/api/ai/confirm", json={
                "conversation_id": "c1",
                "pending_intent": "delete_task",
                "params": {"task_id": "t1"},
                "confirmed": True,
            })
            assert resp.status_code == 200
            assert mock_exec.call_args.kwargs.get("skip_confirmation") is True
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "Endpoints" -v`
Expected: FAIL — 端点不存在 / Schema 类不存在

- [ ] **Step 3: Add request schemas**

读取 `backend/schemas/ai.py`，在文件末尾追加：

```python
class AiDisambiguateRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    selected_id: str
    extra_params: Dict[str, Any] = {}


class AiConfirmRequest(BaseModel):
    conversation_id: str
    pending_intent: str
    params: Dict[str, Any]
    confirmed: bool
```

- [ ] **Step 4: Implement endpoints in routes/ai.py**

读取 `backend/routes/ai.py`，在文件末尾追加（同时在头部 import 里添加新 schema 与 `_execute_tool`）：

把 import 段：

```python
from schemas.ai import AiChatRequest
```

替换为：

```python
import json

from schemas.ai import AiChatRequest, AiConfirmRequest, AiDisambiguateRequest
from services.ai.tools_executor import _execute_tool
```

在文件末尾追加：

```python
# Map intent -> the param key carrying the entity id (used by /disambiguate).
_INTENT_ID_FIELD: dict[str, str] = {
    "update_task": "task_id",
    "delete_task": "task_id",
    "update_note": "note_id",
    "delete_note": "note_id",
    "update_countdown": "countdown_id",
    "delete_countdown": "countdown_id",
    "update_counter": "counter_id",
    "delete_counter": "counter_id",
    "update_list": "list_id",
    "delete_list": "list_id",
    "update_tag": "tag_id",
    "delete_tag": "tag_id",
}


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False, default=str)}\n\n"


@router.post('/ai/disambiguate')
async def ai_disambiguate(
    request: AiDisambiguateRequest,
    current_user_id: str = Depends(get_current_user),
):
    """Resolve a previous disambiguation by executing the chosen entity."""
    _check_rate_limit(current_user_id)

    id_field = _INTENT_ID_FIELD.get(request.pending_intent)
    if not id_field:
        raise HTTPException(status_code=400, detail=f"不支持的 intent: {request.pending_intent}")

    params = {**request.extra_params, id_field: request.selected_id}

    async def _stream():
        try:
            result = _execute_tool(current_user_id, request.pending_intent, params)
            # 删除类需走 /confirm；这里不应再返回 _pending_confirmation
            yield _sse({"type": "tool_result", "tool": request.pending_intent,
                        "result": result, "source": "user_disambiguation"})
            yield _sse({"type": "text", "content": "已执行"})
        except Exception as e:
            yield _sse({"type": "error", "content": f"执行失败：{e}"})
        yield _sse({"type": "done", "conversation_id": request.conversation_id})

    return StreamingResponse(_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
    })


@router.post('/ai/confirm')
async def ai_confirm(
    request: AiConfirmRequest,
    current_user_id: str = Depends(get_current_user),
):
    """Resolve a confirmation prompt. Cancel does NOT consume rate limit."""
    if not request.confirmed:
        async def _cancel_stream():
            yield _sse({"type": "text", "content": "已取消"})
            yield _sse({"type": "done", "conversation_id": request.conversation_id})
        return StreamingResponse(_cancel_stream(), media_type="text/event-stream", headers={
            "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
        })

    # confirmed=True: actually execute, only now consume rate limit
    _check_rate_limit(current_user_id)

    async def _exec_stream():
        try:
            result = _execute_tool(
                current_user_id, request.pending_intent, request.params,
                skip_confirmation=True,
            )
            yield _sse({"type": "tool_result", "tool": request.pending_intent,
                        "result": result, "source": "user_confirmation"})
            yield _sse({"type": "text", "content": "已执行"})
        except Exception as e:
            yield _sse({"type": "error", "content": f"执行失败：{e}"})
        yield _sse({"type": "done", "conversation_id": request.conversation_id})

    return StreamingResponse(_exec_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no",
    })
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && python -m pytest tests/test_ai_pipeline_e2e.py -k "Endpoints" -v && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: Endpoints 测试 3 passed；全套测试无回归

- [ ] **Step 6: Commit**

```bash
git add backend/schemas/ai.py backend/routes/ai.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai-pipeline): add /api/ai/disambiguate and /api/ai/confirm endpoints"
```

---

## Self-Review

按 writing-plans SKILL 的检查清单：

### 1. Spec 覆盖（Spec 14 个 section 全部对照 Plan Task）

| Spec Section | Plan Task |
|---|---|
| §2 架构总览（Handler/ChatContext/ResolutionResult） | Task 1 |
| §3.7 日期解析（dateparser） | Task 2 |
| §3 Layer 1 规则层 + 调度 | Task 3~9 |
| §3.6 entity_matcher | Task 4 |
| §3.2 任务/笔记/计数器/倒数日 全 CRUD | Task 5~8 |
| §4 Layer 2 JsonModeHandler | Task 11 |
| §5 Layer 3 ToolsCallHandler + system_prompt_suffix | Task 12 |
| §6 Executor + 删除拦截 + _describe_delete_target | Task 10 |
| §6.5 tools_executor.skip_confirmation | Task 13 |
| §7 端点 /disambiguate /confirm | Task 14 |
| §7.3 rate_limit 调整（取消不消耗） | Task 14 |
| §8 前端契约 SSE 事件类型 | 由 Task 10/11/14 共同实现（事件名一致：disambiguation / confirmation / tool_result / text / error / done） |
| §9 灰度开关 | Task 0 + Task 13 |
| §10 可观测性（trace） | 已分散在 Task 9/10/11/12 中通过 ctx.trace.append 实现 |
| §11 测试策略 | 单元测试在 test_ai_pipeline_rules.py，集成测试在 test_ai_pipeline_e2e.py |
| §12 文件清单 | 与 Plan File Structure 段一致 |
| §13 验收标准 | 通过整套测试间接验证 |

✅ 全覆盖。

### 2. Placeholder 扫描

全文搜索关键词：`TBD`、`TODO`、`implement later`、`fill in`、`add appropriate`、`similar to Task` —— 均无。
所有"代码改动步骤"都给出了完整可执行代码。
✅ 通过。

### 3. 类型 / 方法名一致性

- `Handler` 构造函数签名（`next_handler=None`）：Task 1 定义，Task 9/11/12/13 使用一致 ✅
- `ResolutionResult` 字段名：`status, intent, params, candidates, reply_text, source`，全文一致 ✅
- `sse_event(event_type, payload)` 签名：Task 1 定义，Task 9/10/11/12 调用一致 ✅
- `execute_resolution(result, ctx)`：Task 9 stub 与 Task 10 正式实现签名一致 ✅
- `_execute_tool` 新签名增加 `skip_confirmation: bool = False`：Task 13 修改、Task 14 使用一致 ✅
- `_describe_delete_target(user_id, intent, params)` 用的 DAO 方法：
  - `task_dao.get_task_by_id(task_id, user_id)` ✅（与 tools_executor.py 现有签名一致）
  - `note_dao.get_note_by_id(user_id, note_id)` ✅（参数顺序为 user_id 在前）
  - `countdown_dao.get_countdown_by_id(user_id, countdown_id)` ✅
  - `counter_dao.get_counter_by_id(user_id, counter_id)` ✅
  - `list_dao.get_list_by_id(user_id, list_id)` ✅
  - `tag_dao.get_tag_by_id(user_id, tag_id)` ✅
- `task_dao.get_user_tasks(user_id, skip=0, limit=200)` 在 Task 5 调用 — 与 tools_executor.py 现有调用 `task_dao.get_user_tasks(user_id, skip=0, limit=limit, **params)` 一致 ✅

✅ 通过。

### 4. 已知风险与缓解

- **风险**：Claude 没有原生 JSON mode，依赖 prompt 强约束。
  - 缓解：Task 11 的失败降级路径已覆盖；JSON 解析失败自动降级 tools_call。
- **风险**：DeepSeek thinking 模型可能不支持 `response_format={"type":"json_object"}`。
  - 缓解：本期 JSON Mode 用主力 OpenAI 兼容 API 时已统一传 `temperature=0`，DeepSeek 报错走异常分支自动降级。
- **风险**：`pipeline-asyncio` 未启用导致 async 测试静默 skip。
  - 缓解：Task 9 Step 6 显式确认 `pytest.ini` 设置 `asyncio_mode = auto`。

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-ai-hybrid-pipeline.md`. Two execution options:**

**1. Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，任务间复审，迭代快、上下文干净

**2. Inline Execution** — 在当前会话里按 Task 顺序执行，带检查点

**Which approach?**




            status=ResolutionStatus.NE