# Refresh Token 双 Token 机制

## 概述

当前系统使用单一 JWT access_token（24h），移动端用户需频繁重新登录。引入 refresh token 机制：短命 access_token (2h) + 长命 refresh_token (30d)，每次续签轮换 refresh_token，实现用户无感续期。

## 配置

`config_loader.py` → `get_jwt_config()`:

```yaml
jwt:
  secret_key: "xxx"
  algorithm: HS256
  access_token_expire_hours: 2       # 从24改为2
  refresh_token_expire_days: 30      # 新增
```

```python
def get_jwt_config(self) -> Dict[str, Any]:
    return {
        'secret_key': self.get('jwt.secret_key', 'jwt-secret-string', 'JWT_SECRET_KEY'),
        'algorithm': self.get('jwt.algorithm', 'HS256'),
        'access_token_expire_hours': self.get('jwt.access_token_expire_hours', 2),
        'refresh_token_expire_days': self.get('jwt.refresh_token_expire_days', 30),
    }
```

## 数据库

### tokens 表新增列

```sql
ALTER TABLE tokens ADD COLUMN family_id VARCHAR(36);
```

现有列复用：
- `id` = jti（主键）
- `token_type`: 改为实际区分 `'access'` / `'refresh'`
- `revoked`: 吊销标记
- `expires_at`: 过期时间
- `family_id`: 新增，同一登录链共享

### migrate_tables() 新增

```python
'tokens': {
    'family_id': "ALTER TABLE tokens ADD COLUMN family_id VARCHAR(36)"
}
```

## 后端接口

### POST /auth/login 改动

返回值变更：

```python
{
    "success": True,
    "message": "登录成功",
    "token": "<access_token>",
    "refresh_token": "<refresh_token>",
    "user": { ... }
}
```

逻辑：
1. 验证用户名密码
2. 生成 `family_id = uuid4()`
3. `create_access_token({"sub": user_id})` → access_token (2h)
4. `create_refresh_token({"sub": user_id, "family_id": family_id})` → refresh_token (30d)
5. 两个 token 都存入 tokens 表，带 family_id 和对应 token_type
6. 返回两个 token

### POST /auth/refresh 新增

请求体：
```json
{ "refresh_token": "<refresh_token_string>" }
```

逻辑：
1. 解码 refresh_token JWT（验证签名+过期）
2. 提取 jti，从 DB 查找 token 记录
3. 验证 `token_type == 'refresh'` 且 `revoked == False`
4. **复用检测**：若已 revoked → 整族吊销 `deactivate_tokens_by_family(family_id)` → 401
5. 标记旧 refresh_token `revoked = True`
6. 签发新 access_token + 新 refresh_token（同 family_id）
7. 新 token 存入 DB
8. 返回 `{ token, refresh_token }`

失败响应：401 + `{"detail": "refresh token 无效或已过期"}`

### POST /auth/logout 改动

吊销整个 family：
```python
token_dao.deactivate_tokens_by_family(family_id)
```

### WebAuthn 登录

`routes/webauthn.py` verify endpoint 同样签发双 token，逻辑与 login 一致。

## jwt_middleware.py 改动

新增函数：

```python
REFRESH_TOKEN_EXPIRE_DAYS = jwt_config['refresh_token_expire_days']

def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    import uuid
    jti = str(uuid.uuid4())
    to_encode.update({"jti": jti})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
```

`create_access_token` 增加 `"type": "access"` claim 以区分。

## token_dao.py 改动

### 新增方法

```python
def create_token(self, user_id, token, jti, token_type='access', family_id=None, expires_hours=None, expires_days=None):
    """创建 token 记录，支持 access/refresh 两种类型"""

def deactivate_tokens_by_family(self, family_id):
    """吊销整个 token 家族（所有 access + refresh）"""

def find_refresh_by_jti(self, jti):
    """查找 refresh token 记录"""
```

### create_token 签名变更

现有 `create_token(user_id, token, jti)` 扩展参数，兼容现有调用。

## 前端改动

### api/index.ts — axios interceptor

```typescript
let isRefreshing = false;
let failedQueue: Array<{resolve: Function, reject: Function}> = [];

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        // 无 refresh_token，直接登出
        logout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // 排队等待 refresh 完成
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const res = await api.post('/auth/refresh', { refresh_token: refreshToken });
        const { token, refresh_token } = res.data;
        localStorage.setItem('token', token);
        localStorage.setItem('refresh_token', refresh_token);
        
        // 重试队列中的请求
        failedQueue.forEach(({ resolve }) => resolve(token));
        failedQueue = [];
        
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch {
        // refresh 也失败，登出
        failedQueue.forEach(({ reject }) => reject(error));
        failedQueue = [];
        logout();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### api/ai.ts — streaming fetch 处理

`ai.ts` 使用 raw `fetch` 做 SSE streaming，不经过 axios interceptor。需要独立处理 401：

1. 从 `api/index.ts` 导出 `tryRefreshToken()` 公共函数：
```typescript
export async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await api.post('/auth/refresh', { refresh_token: refreshToken });
    const { token, refresh_token } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', refresh_token);
    return token;
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    return null;
  }
}
```

2. `ai.ts` 的 `sendAiChatStream` 中处理 401：
```typescript
if (!response.ok) {
  if (response.status === 401) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      // 用新 token 重试
      const retryResponse = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${newToken}`,
        },
        body: JSON.stringify({ message, conversation_id: conversationId }),
      });
      if (retryResponse.ok) {
        // 继续处理 stream...
      }
    } else {
      // refresh 失败，跳登录
      window.location.href = '/login';
      return;
    }
  }
}
```

### 登录响应处理

```typescript
// App.tsx login success
localStorage.setItem('token', data.token);
localStorage.setItem('refresh_token', data.refresh_token);
```

### 登出清理

```typescript
localStorage.removeItem('token');
localStorage.removeItem('refresh_token');
```

### 类型更新

```typescript
interface LoginResponse {
  success: boolean;
  message?: string;
  token: string;
  refresh_token: string;
  user: User;
}
```

## 安全机制

1. **每次轮换**：refresh 成功后旧 refresh_token 立即失效
2. **复用检测**：已 revoked 的 refresh_token 被使用 → 整族吊销 → 强制重登
3. **family 吊销**：改密码/登出时吊销整族
4. **JWT type claim**：access_token 带 `"type":"access"`，refresh_token 带 `"type":"refresh"`，防止混用

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `backend/config/config_loader.py` | 新增 `refresh_token_expire_days` |
| `backend/middleware/jwt_middleware.py` | 新增 `create_refresh_token()`，access 加 type claim |
| `backend/database/models.py` | TokenModel 加 `family_id` 列 |
| `backend/database/connection.py` | migrate_tables 加 family_id 迁移 |
| `backend/database/dao/token_dao.py` | 新增 `deactivate_tokens_by_family()`，改 `create_token()` 签名 |
| `backend/routes/auth.py` | login 签发双 token，新增 `/auth/refresh`，logout 吊销整族 |
| `backend/routes/webauthn.py` | verify 签发双 token |
| `frontend/src/api/index.ts` | 401 interceptor 自动 refresh + 重试 |
| `frontend/src/api/ai.ts` | streaming fetch 401 处理 |
| `frontend/src/App.tsx` | 存储/清除 refresh_token |
| `frontend/src/types/index.ts` | LoginResponse 加 refresh_token 字段 |

## 验证方案

1. 登录 → 确认返回 token + refresh_token
2. 等 access_token 过期（或手动改短为10s测试）→ 请求自动 refresh → 无感续期
3. 手动调 `/auth/refresh` 用旧 refresh_token → 401（轮换生效）
4. 再用同一旧 token refresh → 整族被吊销 → 所有设备登出（复用检测）
5. 30天不活跃 → refresh_token 过期 → 需重新登录
