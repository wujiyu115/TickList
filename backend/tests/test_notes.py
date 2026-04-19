# -*- coding: utf-8 -*-
"""笔记模块测试"""


# ========== 辅助函数 ==========

def _create_note_folder(client, headers, **kwargs):
    payload = {
        "name": kwargs.get("name", "Test Folder"),
    }
    payload.update(kwargs)
    resp = client.post("/api/note-folders", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_note(client, headers, **kwargs):
    payload = {
        "title": kwargs.get("title", "Test Note"),
        "content": kwargs.get("content", "# Hello\nThis is a test note."),
    }
    payload.update(kwargs)
    resp = client.post("/api/notes", json=payload, headers=headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


# ========== 文件夹测试 ==========

def test_create_note_folder(app_client, auth_headers):
    """创建笔记文件夹"""
    data = _create_note_folder(app_client, auth_headers, name="My Notes")
    assert data["name"] == "My Notes"
    assert data["id"] is not None
    assert data["color"] == "#1677ff"


def test_get_note_folders(app_client, auth_headers):
    """获取笔记文件夹列表"""
    _create_note_folder(app_client, auth_headers, name="Folder1")
    _create_note_folder(app_client, auth_headers, name="Folder2")
    resp = app_client.get("/api/note-folders", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2
    assert len(body["folders"]) >= 2


def test_update_note_folder(app_client, auth_headers):
    """更新笔记文件夹"""
    folder = _create_note_folder(app_client, auth_headers, name="Old Folder")
    resp = app_client.put(
        f"/api/note-folders/{folder['id']}",
        json={"name": "Updated Folder", "color": "#ff4d4f"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Folder"
    assert resp.json()["color"] == "#ff4d4f"


def test_delete_note_folder(app_client, auth_headers):
    """删除笔记文件夹"""
    folder = _create_note_folder(app_client, auth_headers, name="Delete Folder")
    resp = app_client.delete(f"/api/note-folders/{folder['id']}", headers=auth_headers)
    assert resp.status_code == 200


def test_delete_folder_cascades(app_client, auth_headers):
    """删除文件夹时级联删除子文件夹和笔记"""
    parent = _create_note_folder(app_client, auth_headers, name="Parent")
    child = _create_note_folder(app_client, auth_headers, name="Child", parent_id=parent["id"])
    note = _create_note(app_client, auth_headers, title="Note in Parent", folder_id=parent["id"])
    child_note = _create_note(app_client, auth_headers, title="Note in Child", folder_id=child["id"])

    # 删除父文件夹
    resp = app_client.delete(f"/api/note-folders/{parent['id']}", headers=auth_headers)
    assert resp.status_code == 200

    # 子文件夹应该也被删除
    resp = app_client.get("/api/note-folders", headers=auth_headers)
    folder_ids = [f["id"] for f in resp.json()["folders"]]
    assert child["id"] not in folder_ids

    # 笔记也应该被删除
    resp = app_client.get(f"/api/notes/{note['id']}", headers=auth_headers)
    assert resp.status_code == 404
    resp = app_client.get(f"/api/notes/{child_note['id']}", headers=auth_headers)
    assert resp.status_code == 404


def test_nested_folders(app_client, auth_headers):
    """多层嵌套文件夹"""
    root = _create_note_folder(app_client, auth_headers, name="Root")
    level1 = _create_note_folder(app_client, auth_headers, name="Level1", parent_id=root["id"])
    level2 = _create_note_folder(app_client, auth_headers, name="Level2", parent_id=level1["id"])

    assert level1["parent_id"] == root["id"]
    assert level2["parent_id"] == level1["id"]


def test_reorder_note_folders(app_client, auth_headers):
    """批量排序文件夹"""
    f1 = _create_note_folder(app_client, auth_headers, name="F1")
    f2 = _create_note_folder(app_client, auth_headers, name="F2")
    resp = app_client.post(
        "/api/note-folders/reorder",
        json=[{"id": f1["id"], "order": 2}, {"id": f2["id"], "order": 1}],
        headers=auth_headers,
    )
    assert resp.status_code == 200


# ========== 笔记测试 ==========

def test_create_note(app_client, auth_headers):
    """创建笔记"""
    data = _create_note(app_client, auth_headers, title="My Note", content="# Hello")
    assert data["title"] == "My Note"
    assert data["content"] == "# Hello"
    assert data["id"] is not None


def test_get_notes(app_client, auth_headers):
    """获取笔记列表"""
    _create_note(app_client, auth_headers, title="Note1")
    _create_note(app_client, auth_headers, title="Note2")
    resp = app_client.get("/api/notes", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] >= 2
    assert len(body["notes"]) >= 2


def test_get_notes_by_folder(app_client, auth_headers):
    """按文件夹过滤笔记"""
    folder = _create_note_folder(app_client, auth_headers, name="Filter Folder")
    _create_note(app_client, auth_headers, title="In Folder", folder_id=folder["id"])
    _create_note(app_client, auth_headers, title="No Folder")

    resp = app_client.get(f"/api/notes?folder_id={folder['id']}", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["notes"][0]["title"] == "In Folder"


def test_get_note_detail(app_client, auth_headers):
    """获取笔记详情"""
    note = _create_note(app_client, auth_headers, title="Detail Note", content="## Content")
    resp = app_client.get(f"/api/notes/{note['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Detail Note"
    assert resp.json()["content"] == "## Content"


def test_update_note(app_client, auth_headers):
    """更新笔记"""
    note = _create_note(app_client, auth_headers, title="Old Note")
    resp = app_client.put(
        f"/api/notes/{note['id']}",
        json={"title": "Updated Note", "content": "New content"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "Updated Note"
    assert resp.json()["content"] == "New content"


def test_delete_note(app_client, auth_headers):
    """删除笔记"""
    note = _create_note(app_client, auth_headers, title="Delete Note")
    resp = app_client.delete(f"/api/notes/{note['id']}", headers=auth_headers)
    assert resp.status_code == 200

    # 确认已删除
    resp = app_client.get(f"/api/notes/{note['id']}", headers=auth_headers)
    assert resp.status_code == 404


def test_move_note(app_client, auth_headers):
    """移动笔记到其他文件夹"""
    folder1 = _create_note_folder(app_client, auth_headers, name="Source")
    folder2 = _create_note_folder(app_client, auth_headers, name="Target")
    note = _create_note(app_client, auth_headers, title="Move Note", folder_id=folder1["id"])

    resp = app_client.put(
        f"/api/notes/{note['id']}/move",
        json={"folder_id": folder2["id"]},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["folder_id"] == folder2["id"]


def test_move_note_to_root(app_client, auth_headers):
    """移动笔记到根目录（未归类）"""
    folder = _create_note_folder(app_client, auth_headers, name="Some Folder")
    note = _create_note(app_client, auth_headers, title="Root Note", folder_id=folder["id"])

    resp = app_client.put(
        f"/api/notes/{note['id']}/move",
        json={"folder_id": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["folder_id"] is None


def test_pin_note(app_client, auth_headers):
    """置顶笔记"""
    note = _create_note(app_client, auth_headers, title="Pin Note")
    resp = app_client.put(
        f"/api/notes/{note['id']}",
        json={"is_pinned": True},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["is_pinned"] is True


def test_note_color(app_client, auth_headers):
    """笔记颜色标记"""
    note = _create_note(app_client, auth_headers, title="Color Note")
    resp = app_client.put(
        f"/api/notes/{note['id']}",
        json={"color": "#52c41a"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["color"] == "#52c41a"


def test_reorder_notes(app_client, auth_headers):
    """批量排序笔记"""
    n1 = _create_note(app_client, auth_headers, title="N1")
    n2 = _create_note(app_client, auth_headers, title="N2")
    resp = app_client.post(
        "/api/notes/reorder",
        json=[{"id": n1["id"], "order": 2}, {"id": n2["id"], "order": 1}],
        headers=auth_headers,
    )
    assert resp.status_code == 200


def test_note_not_found(app_client, auth_headers):
    """访问不存在的笔记返回 404"""
    resp = app_client.get("/api/notes/nonexistent-id", headers=auth_headers)
    assert resp.status_code == 404


def test_folder_not_found(app_client, auth_headers):
    """更新不存在的文件夹返回 404"""
    resp = app_client.put(
        "/api/note-folders/nonexistent-id",
        json={"name": "X"},
        headers=auth_headers,
    )
    assert resp.status_code == 404
