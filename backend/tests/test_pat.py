# -*- coding: utf-8 -*-
"""PAT (Personal Access Token) tests"""


def test_create_pat(app_client, auth_headers):
    """Generate a new PAT"""
    response = app_client.post(
        "/api/auth/pat",
        json={"name": "Claude Code"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Claude Code"
    assert data["token"].startswith("tkl_")
    assert len(data["token"]) == 44  # tkl_ + 40 hex chars
    assert "id" in data
    assert "created_at" in data


def test_list_pats(app_client, auth_headers):
    """List PATs shows preview, not full token"""
    app_client.post(
        "/api/auth/pat",
        json={"name": "Test Token"},
        headers=auth_headers,
    )

    response = app_client.get("/api/auth/pat", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    pat = data[0]
    assert "token_preview" in pat
    assert pat["token_preview"].startswith("tkl_")
    assert "*" in pat["token_preview"]
    assert pat["name"] == "Test Token"
    assert len(pat.get("token_preview", "")) < 44


def test_delete_pat(app_client, auth_headers):
    """Revoke a PAT"""
    create_resp = app_client.post(
        "/api/auth/pat",
        json={"name": "To Delete"},
        headers=auth_headers,
    )
    pat_id = create_resp.json()["id"]

    delete_resp = app_client.delete(
        f"/api/auth/pat/{pat_id}",
        headers=auth_headers,
    )
    assert delete_resp.status_code == 204

    list_resp = app_client.get("/api/auth/pat", headers=auth_headers)
    ids = [p["id"] for p in list_resp.json()]
    assert pat_id not in ids


def test_pat_auth(app_client, auth_headers):
    """PAT can be used as Bearer token to authenticate"""
    create_resp = app_client.post(
        "/api/auth/pat",
        json={"name": "Auth Test"},
        headers=auth_headers,
    )
    raw_token = create_resp.json()["token"]

    me_resp = app_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {raw_token}"},
    )
    assert me_resp.status_code == 200
    assert "username" in me_resp.json()


def test_revoked_pat_rejected(app_client, auth_headers):
    """Revoked PAT should return 401"""
    create_resp = app_client.post(
        "/api/auth/pat",
        json={"name": "Revoke Test"},
        headers=auth_headers,
    )
    raw_token = create_resp.json()["token"]
    pat_id = create_resp.json()["id"]

    app_client.delete(f"/api/auth/pat/{pat_id}", headers=auth_headers)

    me_resp = app_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {raw_token}"},
    )
    assert me_resp.status_code == 401


def test_pat_name_required(app_client, auth_headers):
    """PAT creation requires a name"""
    response = app_client.post(
        "/api/auth/pat",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 422
