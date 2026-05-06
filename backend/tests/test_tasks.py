# -*- coding: utf-8 -*-
"""任务管理模块测试"""


def _create_task(client, headers, **kwargs):
    """辅助：创建一个任务并返回响应 JSON"""
    payload = {"title": kwargs.get("title", "Test Task")}
    payload.update(kwargs)
    resp = client.post("/api/tasks", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ------------------------------------------------------------------
# CRUD
# ------------------------------------------------------------------

def test_create_task(app_client, auth_headers):
    """创建任务"""
    data = _create_task(app_client, auth_headers, title="My Task")
    assert data["title"] == "My Task"
    assert data["status"] == "pending"
    assert data["content"] == ""


def test_get_tasks(app_client, auth_headers):
    """获取任务列表"""
    _create_task(app_client, auth_headers, title="Task A")
    _create_task(app_client, auth_headers, title="Task B")
    resp = app_client.get("/api/tasks", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "tasks" in body
    assert body["total"] >= 2


def test_get_task_detail(app_client, auth_headers):
    """获取任务详情"""
    task = _create_task(app_client, auth_headers, title="Detail Task")
    resp = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail Task"


def test_update_task(app_client, auth_headers):
    """更新任务（标题、状态、优先级）"""
    task = _create_task(app_client, auth_headers, title="Old Title")
    resp = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"title": "New Title", "status": "in_progress", "priority": 1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["title"] == "New Title"
    assert updated["status"] == "in_progress"
    assert updated["priority"] == 1


def test_delete_task(app_client, auth_headers):
    """软删除任务"""
    task = _create_task(app_client, auth_headers, title="To Delete")
    resp = app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp.status_code == 200

    # 删除后获取应 404 或不在列表中
    resp2 = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp2.status_code == 404


# ------------------------------------------------------------------
# 子任务
# ------------------------------------------------------------------

def test_create_subtask(app_client, auth_headers):
    """创建子任务"""
    parent = _create_task(app_client, auth_headers, title="Parent")
    child = _create_task(
        app_client, auth_headers, title="Child", parent_task_id=parent["id"]
    )
    assert child["title"] == "Child"
    assert child["content"] == ""


def test_get_children(app_client, auth_headers):
    """获取子任务列表"""
    parent = _create_task(app_client, auth_headers, title="Parent2")
    _create_task(app_client, auth_headers, title="Child A", parent_task_id=parent["id"])
    _create_task(app_client, auth_headers, title="Child B", parent_task_id=parent["id"])
    resp = app_client.get(f"/api/tasks/{parent['id']}/children", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] == 2


def test_subtask_order_auto_increment(app_client, auth_headers):
    """子任务创建时 order 应自动递增，新子任务追加到最后"""
    parent = _create_task(app_client, auth_headers, title="Order Parent")
    child1 = _create_task(app_client, auth_headers, title="Child 1", parent_task_id=parent["id"])
    child2 = _create_task(app_client, auth_headers, title="Child 2", parent_task_id=parent["id"])
    child3 = _create_task(app_client, auth_headers, title="Child 3", parent_task_id=parent["id"])
    # 每个子任务的 order 应该递增
    assert child1["order"] < child2["order"]
    assert child2["order"] < child3["order"]

# ------------------------------------------------------------------
# 级联完成（父 -> 子 -> 孙）
# ------------------------------------------------------------------

def test_complete_task_cascades_to_descendants(app_client, auth_headers):
    """完成主任务时，子级、孙级任务应一并被标记为 completed"""
    parent = _create_task(app_client, auth_headers, title="Cascade Parent")
    child = _create_task(
        app_client, auth_headers, title="Cascade Child", parent_task_id=parent["id"]
    )
    grandchild = _create_task(
        app_client, auth_headers, title="Cascade Grandchild", parent_task_id=child["id"]
    )

    # 完成父任务
    resp = app_client.put(
        f"/api/tasks/{parent['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"
    assert resp.json()["completed_at"] is not None

    # 子级、孙级任务应该一起被完成
    child_resp = app_client.get(f"/api/tasks/{child['id']}", headers=auth_headers)
    assert child_resp.status_code == 200
    assert child_resp.json()["status"] == "completed"
    assert child_resp.json()["completed_at"] is not None

    grandchild_resp = app_client.get(
        f"/api/tasks/{grandchild['id']}", headers=auth_headers
    )
    assert grandchild_resp.status_code == 200
    assert grandchild_resp.json()["status"] == "completed"
    assert grandchild_resp.json()["completed_at"] is not None

def test_complete_task_does_not_affect_unrelated_tasks(app_client, auth_headers):
    """级联完成不应影响其他无关任务"""
    parent = _create_task(app_client, auth_headers, title="P")
    _create_task(app_client, auth_headers, title="P-Child", parent_task_id=parent["id"])
    other = _create_task(app_client, auth_headers, title="Unrelated")

    app_client.put(
        f"/api/tasks/{parent['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )

    other_resp = app_client.get(f"/api/tasks/{other['id']}", headers=auth_headers)
    assert other_resp.status_code == 200
    assert other_resp.json()["status"] == "pending"

def test_complete_task_records_completed_at_when_only_status_passed(app_client, auth_headers, test_user):
    """完成任务时 completed_at 应自动写入（caller 只传 status，不传 completed_at）

    回归用例：AI 链路下 tools_executor 只透传 status='completed'，DAO 必须兜底
    自动写入 completed_at，否则统计模块、已完成列表的"完成时间"会全部为空。
    """
    from database.dao.task_dao import task_dao

    task = _create_task(app_client, auth_headers, title="DAO Fallback")
    # 直接调用 DAO 模拟 AI 路径，update_data 不带 completed_at
    ok = task_dao.update_task(task["id"], test_user.id, {"status": "completed"})
    assert ok is True

    detail = task_dao.get_task_by_id(task["id"], test_user.id)
    assert detail["status"] == "completed"
    assert detail["completed_at"] is not None, "DAO 未自动补 completed_at"


def test_uncomplete_task_clears_completed_at(app_client, auth_headers, test_user):
    """反完成任务时 completed_at 应被清空（caller 只传 status，不传 completed_at）"""
    from database.dao.task_dao import task_dao

    task = _create_task(app_client, auth_headers, title="UnC Clear")
    task_dao.update_task(task["id"], test_user.id, {"status": "completed"})
    assert task_dao.get_task_by_id(task["id"], test_user.id)["completed_at"] is not None

    # 反完成
    task_dao.update_task(task["id"], test_user.id, {"status": "pending"})
    detail = task_dao.get_task_by_id(task["id"], test_user.id)
    assert detail["status"] == "pending"
    assert detail["completed_at"] is None, "反完成后 completed_at 未被清空"


def test_complete_task_fills_content_completed_at(app_client, auth_headers, test_user):
    """完成任务时，content 子项也应被自动勾选并补 completedAt（caller 只传 status）

    回归用例：AI 链路下 LLM 仅传 status='completed'，未重写 content。
    DAO 必须把现有 content 里所有未勾选子项一并勾选并补 completedAt，否则
    前端「检查事项的完成时间」会全部为空。
    """
    import json as _json
    from database.dao.task_dao import task_dao

    raw_content = _json.dumps([
        {"text": "买菜", "checked": False},
        {"text": "做饭", "checked": False},
    ], ensure_ascii=False)
    task = _create_task(app_client, auth_headers, title="Cook", content=raw_content)

    # 模拟 AI 路径：只传 status='completed'，不动 content
    ok = task_dao.update_task(task["id"], test_user.id, {"status": "completed"})
    assert ok is True

    detail = task_dao.get_task_by_id(task["id"], test_user.id)
    assert detail["status"] == "completed"
    items = _json.loads(detail["content"])
    assert len(items) == 2
    for item in items:
        assert item["checked"] is True, "未勾选的子项应被自动勾选"
        assert item.get("completedAt"), f"子项 completedAt 未被补：{item}"


def test_update_task_content_fixes_missing_completed_at(app_client, auth_headers, test_user):
    """caller 传入 content 含 checked=true 但缺 completedAt 的子项 → 自动补

    回归用例：LLM 重写 content 时按 prompt schema 不会写 completedAt，
    DAO 必须识别并补全，避免前端"已勾选但无完成时间"的脏数据。
    """
    import json as _json
    from database.dao.task_dao import task_dao

    task = _create_task(app_client, auth_headers, title="Mixed")

    # 模拟 LLM 透传：第一项已勾但缺 completedAt，第二项保留旧的 completedAt 不动
    incoming = _json.dumps([
        {"text": "A", "checked": True},
        {"text": "B", "checked": True, "completedAt": "2025-01-01T00:00:00"},
        {"text": "C", "checked": False},
    ], ensure_ascii=False)
    task_dao.update_task(task["id"], test_user.id, {"content": incoming})

    detail = task_dao.get_task_by_id(task["id"], test_user.id)
    items = _json.loads(detail["content"])
    assert items[0]["checked"] is True
    assert items[0].get("completedAt"), "缺 completedAt 的已勾选子项未被补"
    # 已有 completedAt 的子项不应被覆盖
    assert items[1]["completedAt"] == "2025-01-01T00:00:00"
    # 未勾选的子项不应被强制勾选（仅 status=completed 场景才级联）
    assert items[2]["checked"] is False
    assert "completedAt" not in items[2] or items[2].get("completedAt") in (None, "")


def test_uncomplete_task_does_not_cascade(app_client, auth_headers):
    """把任务从 completed 改回 pending 时，不应级联修改子任务（避免误伤）"""
    parent = _create_task(app_client, auth_headers, title="UnC Parent")
    child = _create_task(
        app_client, auth_headers, title="UnC Child", parent_task_id=parent["id"]
    )

    # 先级联完成
    app_client.put(
        f"/api/tasks/{parent['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )
    # 把父任务改回 pending
    resp = app_client.put(
        f"/api/tasks/{parent['id']}",
        json={"status": "pending"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"

    # 子任务应该保持 completed
    child_resp = app_client.get(f"/api/tasks/{child['id']}", headers=auth_headers)
    assert child_resp.status_code == 200
    assert child_resp.json()["status"] == "completed"

def test_batch_update_completed_cascades_to_descendants(app_client, auth_headers):
    """批量接口完成任务时，应级联完成所有子孙任务"""
    # 任务 A: A -> A1 -> A11
    a = _create_task(app_client, auth_headers, title="Batch A")
    a1 = _create_task(app_client, auth_headers, title="Batch A1", parent_task_id=a["id"])
    a11 = _create_task(
        app_client, auth_headers, title="Batch A11", parent_task_id=a1["id"]
    )
    # 任务 B: B -> B1
    b = _create_task(app_client, auth_headers, title="Batch B")
    b1 = _create_task(app_client, auth_headers, title="Batch B1", parent_task_id=b["id"])

    # 批量完成 A 和 B
    resp = app_client.post(
        "/api/tasks/batch-update",
        json={"task_ids": [a["id"], b["id"]], "status": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    # updated_count 应包含级联更新的子孙（A、A1、A11、B、B1 共 5 个）
    assert resp.json()["updated_count"] >= 2

    # 校验所有子孙都被完成
    for task_id in [a["id"], a1["id"], a11["id"], b["id"], b1["id"]]:
        r = app_client.get(f"/api/tasks/{task_id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "completed", f"{task_id} 未被完成"


# ------------------------------------------------------------------
# 移动 / 复制
# ------------------------------------------------------------------

def test_move_task(app_client, auth_headers):
    """移动任务"""
    task = _create_task(app_client, auth_headers, title="Movable")
    resp = app_client.post(
        f"/api/tasks/{task['id']}/move",
        json={"new_parent_id": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_duplicate_task(app_client, auth_headers):
    """复制任务"""
    task = _create_task(app_client, auth_headers, title="Original")
    resp = app_client.post(
        f"/api/tasks/{task['id']}/duplicate", headers=auth_headers
    )
    assert resp.status_code == 200
    dup = resp.json()
    assert dup["id"] != task["id"]
    assert dup["content"] == ""


# ------------------------------------------------------------------
# 垃圾箱
# ------------------------------------------------------------------

def test_update_task_content(app_client, auth_headers):
    """更新任务 content 字段（检查事项）

    注意：DAO 层会对 content 里 checked=true 但缺 completedAt 的子项自动补
    completedAt（统一兜底），所以这里断言"checked 字段一致"而不是"原文一致"。
    """
    import json as _json

    task = _create_task(app_client, auth_headers, title="Content Task")
    assert task["content"] == ""

    # 第一次更新 content：第二项 checked=true 但缺 completedAt → DAO 应自动补
    content_v1 = '[{"text": "检查项1", "checked": false}, {"text": "检查项2", "checked": true}]'
    resp = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"content": content_v1},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    items_v1 = _json.loads(resp.json()["content"])
    assert items_v1[0]["text"] == "检查项1" and items_v1[0]["checked"] is False
    assert items_v1[1]["text"] == "检查项2" and items_v1[1]["checked"] is True
    assert items_v1[1].get("completedAt"), "checked=true 的子项应被自动补 completedAt"

    # 获取详情验证持久化结果一致
    resp2 = app_client.get(f"/api/tasks/{task['id']}", headers=auth_headers)
    assert resp2.status_code == 200
    assert resp2.json()["content"] == resp.json()["content"]

    # 第二次更新 content（模拟勾选状态变化）：两项都 checked=true 但都缺 completedAt
    content_v2 = '[{"text": "检查项1", "checked": true}, {"text": "检查项2", "checked": true}]'
    resp3 = app_client.put(
        f"/api/tasks/{task['id']}",
        json={"content": content_v2},
        headers=auth_headers,
    )
    assert resp3.status_code == 200
    items_v2 = _json.loads(resp3.json()["content"])
    assert all(item["checked"] is True for item in items_v2)
    assert all(item.get("completedAt") for item in items_v2), \
        "所有 checked=true 的子项都应被自动补 completedAt"


# ------------------------------------------------------------------
# 垃圾箱
# ------------------------------------------------------------------

def test_get_trash(app_client, auth_headers):
    """获取垃圾箱"""
    task = _create_task(app_client, auth_headers, title="Trash Me")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.get("/api/tasks/trash", headers=auth_headers)
    assert resp.status_code == 200


def test_restore_task(app_client, auth_headers):
    """恢复任务"""
    task = _create_task(app_client, auth_headers, title="Restore Me")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.post(
        f"/api/tasks/{task['id']}/restore", headers=auth_headers
    )
    assert resp.status_code == 200


def test_permanent_delete(app_client, auth_headers):
    """永久删除"""
    task = _create_task(app_client, auth_headers, title="Perm Delete")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.delete(
        f"/api/tasks/{task['id']}/permanent", headers=auth_headers
    )
    assert resp.status_code == 200


def test_empty_trash(app_client, auth_headers):
    """清空垃圾箱"""
    task = _create_task(app_client, auth_headers, title="Empty Trash")
    app_client.delete(f"/api/tasks/{task['id']}", headers=auth_headers)
    resp = app_client.delete("/api/tasks/trash/empty", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["success"] is True


# ------------------------------------------------------------------
# 批量 / 过滤 / 搜索
# ------------------------------------------------------------------

def test_batch_update(app_client, auth_headers):
    """批量更新状态"""
    t1 = _create_task(app_client, auth_headers, title="Batch 1")
    t2 = _create_task(app_client, auth_headers, title="Batch 2")
    resp = app_client.post(
        "/api/tasks/batch-update",
        json={"task_ids": [t1["id"], t2["id"]], "status": "completed"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["updated_count"] == 2


def test_filter_tasks_by_status(app_client, auth_headers):
    """按状态过滤"""
    _create_task(app_client, auth_headers, title="Pending Task")
    t2 = _create_task(app_client, auth_headers, title="Done Task")
    app_client.put(
        f"/api/tasks/{t2['id']}",
        json={"status": "completed"},
        headers=auth_headers,
    )
    resp = app_client.get(
        "/api/tasks", params={"status": "completed"}, headers=auth_headers
    )
    assert resp.status_code == 200
    tasks = resp.json()["tasks"]
    assert all(t["status"] == "completed" for t in tasks)


def test_search_tasks(app_client, auth_headers):
    """搜索任务"""
    _create_task(app_client, auth_headers, title="UniqueSearchTerm123")
    resp = app_client.get(
        "/api/tasks/search",
        params={"keyword": "UniqueSearchTerm123"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] >= 1
