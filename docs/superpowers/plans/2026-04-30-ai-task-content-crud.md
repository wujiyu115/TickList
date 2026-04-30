# AI Task Content CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable AI assistant to create and update task content (checklist JSON) across all 3 pipeline layers (L1, L2, L3).

**Architecture:** Add `content` parameter to existing `create_task`/`update_task` intents at each layer. Full JSON string format `[{text,checked}]`, consistent with frontend. Add content to data snapshot so LLM can reference existing checklist items.

**Tech Stack:** Python (FastAPI backend), pytest for tests

---

### Task 1: L3 — Add content to tools_schema.py

**Files:**
- Modify: `backend/services/ai/tools_schema.py:30-44` (create_task)
- Modify: `backend/services/ai/tools_schema.py:45-60` (update_task)

- [ ] **Step 1: Add content property to create_task schema**

In `tools_schema.py`, add `"content"` to the `create_task` `properties` dict (after `tags`, before the closing brace):

```python
    {
        "name": "create_task",
        "description": "创建任务",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "priority": {"type": "integer", "default": 0},
                "list_id": {"type": "string"},
                "due_date": {"type": "string", "description": "ISO日期"},
                "start_time": {"type": "string", "description": "ISO时间"},
                "tags": {"type": "string", "description": "逗号分隔"},
                "content": {"type": "string", "description": "检查事项JSON字符串，格式: [{text:string,checked:boolean}]"},
            },
            "required": ["title"],
        },
    },
```

- [ ] **Step 2: Add content property to update_task schema**

In `tools_schema.py`, add `"content"` to the `update_task` `properties` dict (after `tags`):

```python
    {
        "name": "update_task",
        "description": "更新任务，只传要改的字段",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "title": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                "priority": {"type": "integer"},
                "due_date": {"type": "string"},
                "tags": {"type": "string", "description": "逗号分隔,替换全部"},
                "content": {"type": "string", "description": "检查事项JSON字符串，格式: [{text:string,checked:boolean}]"},
            },
            "required": ["task_id"],
        },
    },
```

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: All tests PASS (schema change alone shouldn't break anything)

- [ ] **Step 4: Commit**

```bash
git add backend/services/ai/tools_schema.py
git commit -m "feat(ai): add content field to create_task/update_task tool schemas"
```

---

### Task 2: L3 — Add content to tools_executor.py

**Files:**
- Modify: `backend/services/ai/tools_executor.py:75-96` (create_task branch)
- Modify: `backend/services/ai/tools_executor.py:98-110` (update_task branch)

- [ ] **Step 1: Write failing test for create_task with content**

In `backend/tests/test_ai_pipeline_e2e.py`, add a new test class after `TestToolsExecutorSkipConfirmation`:

```python
class TestToolsExecutorContent:
    """Verify content field is passed through for task create/update."""

    @patch("services.ai.tools_executor.task_dao")
    def test_create_task_with_content(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        from models import Task
        mock_dao.create_task.return_value = {"id": "t1", "title": "test", "content": '[{"text":"a","checked":false}]'}
        result = _execute_tool("u1", "create_task", {
            "title": "test",
            "content": '[{"text":"a","checked":false}]',
        })
        # Verify the Task object passed to DAO has content
        call_args = mock_dao.create_task.call_args[0][0]
        assert call_args.content == '[{"text":"a","checked":false}]'

    @patch("services.ai.tools_executor.task_dao")
    def test_update_task_with_content(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        mock_dao.get_task_by_id.return_value = {"id": "t1", "title": "test", "content": '[{"text":"b","checked":true}]'}
        result = _execute_tool("u1", "update_task", {
            "task_id": "t1",
            "content": '[{"text":"b","checked":true}]',
        })
        # Verify update_data includes content
        call_args = mock_dao.update_task.call_args
        update_data = call_args[0][2]  # third positional arg: update_data
        assert update_data["content"] == '[{"text":"b","checked":true}]'

    @patch("services.ai.tools_executor.task_dao")
    def test_create_task_without_content_defaults_empty(self, mock_dao):
        from services.ai.tools_executor import _execute_tool
        mock_dao.create_task.return_value = {"id": "t1", "title": "test", "content": ''}
        result = _execute_tool("u1", "create_task", {"title": "test"})
        call_args = mock_dao.create_task.call_args[0][0]
        assert call_args.content == ''
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py::TestToolsExecutorContent -v`
Expected: FAIL — `create_task` branch doesn't read `content` from `tool_input`, `update_task` branch doesn't extract `content`.

- [ ] **Step 3: Add content to create_task executor**

In `tools_executor.py`, the `create_task` branch (lines 85-94) builds a `Task(...)` object. Add `content=tool_input.get("content", "")`:

```python
            task = Task(
                id=str(_uuid.uuid4()),
                title=tool_input["title"],
                priority=tool_input.get("priority", 0),
                list_id=tool_input.get("list_id"),
                due_date=due_date,
                start_time=start_time,
                content=tool_input.get("content", ""),
                tags=tags,
                user_id=user_id,
            )
```

- [ ] **Step 4: Add content to update_task executor**

In `tools_executor.py`, the `update_task` branch (lines 98-110) builds `update_data` dict. Add content extraction after the `tags` block:

```python
        elif tool_name == "update_task":
            update_data = {}
            if tool_input.get("title"): update_data["title"] = tool_input["title"]
            if tool_input.get("status"): update_data["status"] = tool_input["status"]
            if tool_input.get("priority"): update_data["priority"] = tool_input["priority"]
            if tool_input.get("due_date"):
                update_data["due_date"] = datetime.fromisoformat(tool_input["due_date"].replace("Z", "+00:00")).isoformat()
            if tool_input.get("tags"):
                update_data["tags"] = [t.strip() for t in tool_input["tags"].split(",")]
            if "content" in tool_input:
                update_data["content"] = tool_input["content"]
            if update_data.get("status") == "completed":
                update_data["completed_at"] = datetime.now().isoformat()
            task_dao.update_task(tool_input["task_id"], user_id, update_data)
            return task_dao.get_task_by_id(tool_input["task_id"], user_id)
```

Note: Use `"content" in tool_input` (not `.get("content")`) to allow setting content to empty string `""` (clearing all checklist items). The `if tool_input.get("content")` pattern would skip empty strings.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py::TestToolsExecutorContent -v`
Expected: PASS

- [ ] **Step 6: Run full test suite to verify no breakage**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add backend/services/ai/tools_executor.py backend/tests/test_ai_pipeline_e2e.py
git commit -m "feat(ai): read content from tool_input in create/update_task executor"
```

---

### Task 3: Snapshot — Add content to data snapshot and formatters

**Files:**
- Modify: `backend/services/ai/system_prompt.py:39-44` (tasks list comprehension)
- Modify: `backend/services/ai/formatters/toon_formatter.py:28` (tasks schema)
- Modify: `backend/services/ai/formatters/json_formatter.py` (no schema change needed, JSON formatter dumps entire dict)

- [ ] **Step 1: Add content to snapshot task dict in system_prompt.py**

In `_collect_snapshot()`, the tasks list comprehension currently excludes `content`. Add it:

```python
        "tasks": [
            {"id": t["id"], "title": t["title"], "status": t["status"],
             "priority": t["priority"], "due_date": t.get("due_date"),
             "list_id": t.get("list_id"), "tags": t.get("tags", []),
             "content": t.get("content", "")}
            for t in tasks
        ],
```

- [ ] **Step 2: Add content to toon_formatter.py TASK_SCHEMA**

In `_SCHEMAS`, add `"content"` to the tasks schema list (after `tags`):

```python
_SCHEMAS = {
    "tasks":      ["id", "title", "status", "priority", "due_date", "list_id", "tags", "content"],
    "notes":      ["id", "title", "folder_id", "tags"],
    "counters":   ["id", "name", "value"],
    "countdowns": ["id", "title", "target_date"],
    "lists":      ["id", "name", "type"],
    "tags":       ["id", "name"],
}
```

- [ ] **Step 3: Verify JSON formatter works unchanged**

The JSON formatter (`json_formatter.py`) dumps entire dicts from the snapshot — no schema filtering. Adding content to the snapshot dict is sufficient. No file change needed.

- [ ] **Step 4: Run existing pipeline tests**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: PASS (snapshot changes don't affect rule tests, and e2e tests mock DAO)

- [ ] **Step 5: Commit**

```bash
git add backend/services/ai/system_prompt.py backend/services/ai/formatters/toon_formatter.py
git commit -m "feat(ai): include task content in data snapshot and TOON schema"
```

---

### Task 4: L2 — Add content to JSON mode prompt

**Files:**
- Modify: `backend/services/ai/pipeline/json_mode_handler.py:50-55` (params reference lines in `_build_json_mode_prompt`)

- [ ] **Step 1: Add content to create_task and update_task params in JSON prompt**

In `_build_json_mode_prompt()`, the `params参考` section lists params for each intent. Modify lines 52-53:

```python
	- create_task: {title, priority?, due_date?, list_id?, tags?, content?}
	- update_task: {id, title?, status?, priority?, due_date?, content?}
```

Also add a note about content format in the `关键规则` section (after rule 8):

```python
	8. 非chitchat时reply留空
	9. content是检查事项JSON字符串，格式: [{text:"项目名",checked:false}]
```

The full `json_instr` string becomes:

```python
    json_instr = """
---
只输出JSON，不要解释。格式：
{"intent":"<意图>","params":{...},"needs_confirmation":false,"reply":""}

意图：create_task|update_task|delete_task|list_tasks|create_note|update_note|delete_note|list_notes|create_countdown|update_countdown|delete_countdown|list_countdowns|create_counter|update_counter|delete_counter|list_counters|create_list|update_list|delete_list|list_lists|create_tag|update_tag|delete_tag|list_tags|chitchat|unknown

params参考：
- list_tasks: {status?, priority?, list_id?, tag?, due_date_start?, due_date_end?}
- create_task: {title, priority?, due_date?, list_id?, tags?, content?}
- update_task: {id, title?, status?, priority?, due_date?, content?}
- delete_task: {id}
- 其他实体同理

关键规则：
1. 用户提到清单名（如"当周工作""生活"等）→ 从上方 lists 快照找到对应 id 填入 list_id
2. 用户提到标签名 → 从上方 tags 快照找到对应 id/name 填入 tag
3. 用户提到任务名 → 从上方 tasks 快照匹配 id
4. 状态映射：未完成/待办→status="pending"，已完成/做完→status="completed"，进行中→status="in_progress"
5. 闲聊→intent="chitchat"，reply填回复
6. 无法识别→intent="unknown"
7. 删除→needs_confirmation=true
8. 非chitchat时reply留空
9. content是检查事项JSON字符串，格式: [{text:"项目名",checked:false}]
"""
```

- [ ] **Step 2: Run pipeline tests**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_e2e.py tests/test_ai_pipeline_rules.py -v`
Expected: PASS (prompt text change doesn't break unit/e2e tests — those mock LLM calls)

- [ ] **Step 3: Commit**

```bash
git add backend/services/ai/pipeline/json_mode_handler.py
git commit -m "feat(ai): add content param to L2 JSON mode prompt"
```

---

### Task 5: L1 — Add content extraction to CreateTaskRule

**Files:**
- Modify: `backend/services/ai/pipeline/rules/task_rules.py:226-246` (CreateTaskRule)
- Test: `backend/tests/test_ai_pipeline_rules.py` (TestCreateTaskRule section)

- [ ] **Step 1: Write failing tests for content extraction**

Add new tests to `TestCreateTaskRule` class in `test_ai_pipeline_rules.py`:

```python
    def test_content_with_checklist_marker(self):
        result = CreateTaskRule().try_match(_ctx("添加任务 出差准备，检查项：带护照、订酒店、查天气"))
        assert result is not None
        assert result.params["title"] == "出差准备"
        assert "content" in result.params
        # content should be a JSON string of checklist items
        import json
        items = json.loads(result.params["content"])
        assert len(items) == 3
        assert items[0]["text"] == "带护照"
        assert items[0]["checked"] is False

    def test_content_with_dunhao_separator(self):
        result = CreateTaskRule().try_match(_ctx("新建任务 购物清单：牛奶、鸡蛋、面包"))
        assert result is not None
        assert result.params["title"] == "购物清单"
        import json
        items = json.loads(result.params["content"])
        assert len(items) == 3
        assert items[0]["text"] == "牛奶"

    def test_no_content_marker_no_content_param(self):
        result = CreateTaskRule().try_match(_ctx("加任务 写日报"))
        assert result is not None
        assert "content" not in result.params
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_rules.py::TestCreateTaskRule -v`
Expected: `test_content_with_checklist_marker` and `test_content_with_dunhao_separator` FAIL (no content extraction logic). `test_no_content_marker_no_content_param` should PASS (existing behavior).

- [ ] **Step 3: Implement content extraction in CreateTaskRule**

Add content extraction logic to `task_rules.py`. Add a helper function and modify `CreateTaskRule.try_match`:

```python
import json as _json

# Content/checklist marker patterns (Chinese + English)
_CONTENT_MARKERS = r"(?:检查项|检查事项|清单|检查清单|checklist|content|items)[:：]"

def _extract_content(text: str) -> tuple[str, str | None]:
    """Split text at content markers. Returns (title_part, content_json_or_None).

    If no marker found, returns (text, None).
    If marker found, splits into title + items, parses items into JSON string.
    Items are split by comma/顿号/newline.
    """
    m = re.search(_CONTENT_MARKERS, text)
    if not m:
        return text, None
    title = text[:m.start()].strip().rstrip("，,、")
    items_text = text[m.end():].strip()
    # Split by comma, 顿号(、), or newline
    items = re.split(r"[，,、\n]", items_text)
    items = [i.strip() for i in items if i.strip()]
    if not items:
        return title, None
    content_json = _json.dumps(
        [{"text": item, "checked": False} for item in items],
        ensure_ascii=False,
    )
    return title, content_json
```

Modify `CreateTaskRule.try_match` to use `_extract_content`:

```python
class CreateTaskRule:
    name = "create_task"

    def try_match(self, ctx: ChatContext) -> Optional[ResolutionResult]:
        m = _CREATE_PATTERN.match(ctx.message.strip())
        if not m:
            return None
        title_raw = m.group(1).strip()
        if not title_raw:
            return None
        title, content_json = _extract_content(title_raw)
        # extract_date may modify title further
        title, due_date = extract_date(title)
        params: dict = {"title": title}
        if due_date is not None:
            params["due_date"] = due_date.isoformat()
        if content_json is not None:
            params["content"] = content_json
        return ResolutionResult(
            status=ResolutionStatus.EXECUTABLE,
            intent="create_task",
            params=params,
            reply_text=f"已添加任务：{title}",
            source="rule",
        )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_rules.py::TestCreateTaskRule -v`
Expected: All PASS

- [ ] **Step 5: Run full pipeline rule tests**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/test_ai_pipeline_rules.py -v`
Expected: All PASS (no regressions)

- [ ] **Step 6: Commit**

```bash
git add backend/services/ai/pipeline/rules/task_rules.py backend/tests/test_ai_pipeline_rules.py
git commit -m "feat(ai): L1 CreateTaskRule extracts checklist content from message"
```

---

### Task 6: Integration verification

**Files:** No new files — run all tests

- [ ] **Step 1: Run complete test suite**

Run: `cd /home/ejoy/git/ticklist/backend && python -m pytest tests/ -v --tb=short`
Expected: All PASS

- [ ] **Step 2: Manual smoke test — verify snapshot includes content**

Run a quick check that the snapshot builder includes content:

```python
cd /home/ejoy/git/ticklist/backend && python -c "
from services.ai.system_prompt import _collect_snapshot
from database.dao.task_dao import task_dao
# This requires DB access; if DB not available in test env, skip manual check
# and rely on unit tests instead.
print('snapshot module importable')
"
```

Expected: Module importable without errors

- [ ] **Step 3: Final commit (if any cleanup needed)**

Only if code cleanup or test adjustments were needed during integration verification.