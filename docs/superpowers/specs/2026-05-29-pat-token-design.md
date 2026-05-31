# Personal Access Token (PAT) for AI Tool Authentication

## Purpose

Allow users to generate long-lived tokens for external AI tools (Claude Code, Cursor, MCP servers) to access ticklist API without exposing login credentials.

## Token Format

- Prefix: `tkl_` (enables secret scanning tools to detect leaks)
- Body: 40 random hex characters
- Full example: `tkl_a1b2c3d4e5f6...` (44 chars total)
- Storage: SHA-256 hash in DB (never store plaintext)

## Database

Reuse existing `TokenModel` table with:
- `token_type = 'pat'`
- `token` field stores SHA-256 hash (not plaintext)
- `expires_at` = `9999-12-31T23:59:59` (effectively never)
- Add `name` column (nullable, for PAT display name / memo)
- Add `last_used_at` column (nullable, updated on each auth)

### Migration

Add columns to TokenModel:
```python
name = Column(String, nullable=True)       # PAT display name
last_used_at = Column(String, nullable=True)  # ISO timestamp
```

## API Endpoints

### POST /api/auth/pat

Generate a new PAT.

Request:
```json
{ "name": "Claude Code" }
```

Response (200):
```json
{
  "id": "pat-xxxxxxxx",
  "name": "Claude Code",
  "token": "tkl_a1b2c3d4e5f6...",
  "created_at": "2026-05-29T10:00:00"
}
```

Note: `token` field only returned at creation time. Never retrievable again.

### GET /api/auth/pat

List all active PATs for current user.

Response:
```json
[
  {
    "id": "pat-xxxxxxxx",
    "name": "Claude Code",
    "created_at": "2026-05-29T10:00:00",
    "last_used_at": "2026-05-29T12:30:00",
    "token_preview": "tkl_a1b2...****"
  }
]
```

### DELETE /api/auth/pat/{id}

Revoke a PAT. Returns 204 on success.

## Authentication Middleware

Modify `get_current_user` in `jwt_middleware.py`:

```
1. Extract Bearer token
2. Check prefix FIRST (O(1) string compare, no fallback):
   - token.startswith("tkl_") → PAT path:
     a. Compute SHA-256 hash
     b. Query TokenModel where token=hash, token_type='pat', revoked=False
     c. If found: update last_used_at, return user_id
     d. If not found: 401
   - otherwise → JWT path (existing flow):
     a. Decode JWT
     b. Validate JTI via token_dao
     c. Return user_id
```

No fallback between paths. Prefix determines route immediately.

## Frontend (Settings Page)

New section "API Token" between "数据管理" and "调试日志":

- Section icon: `KeyOutlined`
- "生成新Token" button opens modal:
  - Input: name/memo (required, e.g., "Claude Code")
  - On submit: call POST /api/auth/pat
  - Show generated token with copy button + warning "仅显示一次"
- Token list table:
  - Columns: 名称 | 创建时间 | 上次使用 | 操作
  - 操作: Delete with Popconfirm
- Empty state: "暂无API Token"

## Security Considerations

- Plaintext token shown only once at creation; DB stores hash only
- `tkl_` prefix enables GitHub/GitLab secret scanning to detect leaks in repos
- Revocation is immediate (DB check on each request)
- PATs bypass refresh token rotation (they don't expire)
- Rate limiting applies same as normal user tokens
- PAT cannot be used to generate other PATs or change password (future consideration, not enforced in v1)
