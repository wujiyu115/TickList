# AI Assistant Task Content CRUD Design

## Problem

Task `content` field (checklist JSON string) is invisible to AI assistant at all 3 pipeline layers. Users cannot create tasks with checklist items, update existing checklist content, or reference individual checklist items via AI chat.

Note entity already supports content CRUD at all layers. Task content is structurally identical but was excluded.

## Approach: Minimal Change (Option A)

Add `content` parameter to existing `create_task`/`update_task` intents across all layers. Full-content JSON string, consistent with frontend's PUT model. No new intents.

## Changes

### L3 - ToolsCallHandler

**tools_schema.py**:
- `create_task` schema: add `content` property `{type: "string", description: "检查事项JSON字符串，格式: [{text:string,checked:boolean}]"}`
- `update_task` schema: add `content` property (same definition, optional)

**tools_executor.py**:
- `create_task`: read `tool_input.get("content")`, pass to Task constructor
- `update_task`: extract `content` from `tool_input` into `update_data`

### L2 - JsonModeHandler

**json_mode_handler.py** `_build_json_mode_prompt()`:
- `create_task` params reference: add `content?: string (检查事项JSON)`
- `update_task` params reference: add `content?: string (检查事项JSON)`

`_VALID_INTENTS` does not restrict params keys — no change needed.

### L1 - RuleHandler

**task_rules.py** `CreateTaskRule`:
- Extend regex to capture checklist items after "检查项：/检查事项：/清单：/content:" markers
- Split extracted text by comma/顿号/newline into individual items
- Build JSON string: `[{"text":"item1","checked":false},{"text":"item2","checked":false}]`
- Include in params as `content`

L1 does NOT support update content — regex cannot reliably handle "change the 3rd item to Y". Defer to L2/L3.

### Snapshot

**system_prompt.py**: task snapshot field list — add `content`
**toon_formatter.py**: `TASK_SCHEMA` — add `"content"`
**json_formatter.py**: task fields — add `content`

Full content included (not summary). LLM must see individual items to reference them ("delete 2nd item", "check first item"). Task checklist content is typically short (3-5 items), token overhead acceptable.

### Frontend

No changes needed. Frontend already handles `content` in Task type, create/update requests, and SSE task action results.

## Content Format

Same as frontend: JSON string of `[{text: string, checked: boolean}]` array.

Examples:
- Empty: `''` or `'[]'`
- 2 items unchecked: `[{"text":"买牛奶","checked":false},{"text":"买鸡蛋","checked":false}]`
- Mixed: `[{"text":"已完成项","checked":true},{"text":"待做项","checked":false}]`

## Intent Coverage Matrix

| Intent | Content Support | Layer |
|--------|----------------|-------|
| create_task | ✅ content param | L1, L2, L3 |
| update_task | ✅ content param | L2, L3 |
| list_tasks | ✅ content in snapshot | L1, L2, L3 (via snapshot) |
| complete_task | ❌ no content change | L1 (status only) |
| delete_task | ❌ no content change | L1, L2, L3 |

## Test Criteria

- L3: AI can create task with checklist items; AI can update task content (replace entire checklist)
- L2: JSON mode produces create_task/update_task with content field
- L1: "创建任务XX，检查项：a、b、c" → create_task with content JSON
- Snapshot: task objects in prompt include content field