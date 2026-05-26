# Refresh Token 双 Token 机制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement refresh token rotation so users stay logged in without frequent re-authentication. Access token (2h) + refresh token (30d) with per-use rotation and family-based revocation.

**Architecture:** Login issues both tokens stored in `tokens` table with shared `family_id`. Frontend axios interceptor auto-refreshes on 401. AI streaming endpoints use shared `tryRefreshToken()` helper. Reuse detection revokes entire token family.

**Tech Stack:** Python/FastAPI (backend), python-jose JWT, SQLAlchemy, TypeScript/React (frontend), axios interceptors

---

### Task 1: Config — Add refresh_token_expire_days

**Files:**
- Modify: `backend/config/config_loader.py:92-98`

- [ ] **Step 1: Add refresh_token_expire_days to get_jwt_config**

```python
def get_jwt_config(self) -> Dict[str, Any]:
    """获取JWT配置"""
    return {
        'secret_key': self.get('jwt.secret_key', 'jwt-secret-string', 'JWT_SECRET_KEY'),
        'algorithm': self.get('jwt.algorithm', 'HS256'),
        'access_token_expire_hours': self.get('jwt.access_token_expire_hours', 2),
        'refresh_token_expire_days': self.get('jwt.refresh_token_expire_days', 30),
    }
```

Note: default for `access_token_expire_hours` changes from `24` to `2`.

- [ ] **Step 2: Commit**

```bash
git add backend/config/config_loader.py
git commit -m "feat(auth): add refresh_token_expire_days config, shorten access to 2h"
```

---

### Task 2: Database — Add family_id column to tokens table

**Files:**
- Modify: `backend/database/models.py:147-162`
- Modify: `backend/database/connection.py:73-123`

- [ ] **Step 1: Add family_id to TokenModel**

In `backend/database/models.py`, add column to `TokenModel`:

```python
class TokenModel(Base):
    """令牌表（用于刷新令牌或 API 密钥管理）"""
    __tablename__ = 'tokens'
    
    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    token = Column(String(500), nullable=False, unique=True)
    token_type = Column(String(50), default='access')  # access/refresh
    family_id = Column(String(36), nullable=True, index=True)
    expires_at = Column(String(50))
    created_at = Column(String(50))
    revoked = Column(Boolean, default=False)
    
    __table_args__ = (
        Index('idx_tokens_user', 'user_id'),
        Index('idx_tokens_token', 'token'),
        Index('idx_tokens_family', 'family_id'),
    )
```

- [ ] **Step 2: Add migration for existing databases**

In `backend/database/connection.py` `migrate_tables()`, add to `migrations` dict:

```python
'tokens': [
    ('family_id', 'VARCHAR(36)'),
],
```

- [ ] **Step 3: Commit**

```bash
git add backend/database/models.py backend/database/connection.py
git commit -m "feat(auth): add family_id column to tokens table"
```

---

### Task 3: token_dao — Add family-based operations

**Files:**
- Modify: `backend/database/dao/token_dao.py`

- [ ] **Step 1: Update create_token signature to accept token_type and family_id**

Replace the existing `create_token` method:

```python
def create_token(self, user_id: str, token: str, jti: str = None,
                 token_type: str = 'access', family_id: str = None,
                 expires_hours: int = None, expires_days: int = None) -> Dict:
    """创建并存储JWT token"""
    session = self._get_session()
    try:
        now = datetime.utcnow()
        if expires_days:
            expires_at = now + timedelta(days=expires_days)
        elif expires_hours:
            expires_at = now + timedelta(hours=expires_hours)
        else:
            expires_at = now + timedelta(hours=24)
        
        if not jti:
            jti = f'jti-{str(uuid.uuid4())[:8]}'
        
        token_id = jti
        
        token_model = TokenModel(
            id=token_id,
            token=token,
            user_id=user_id,
            token_type=token_type,
            family_id=family_id,
            created_at=now.isoformat(),
            expires_at=expires_at.isoformat(),
            revoked=False
        )
        
        session.add(token_model)
        session.commit()
        
        logger.info(f"JWT token ({token_type}) created for user: {user_id}")
        return self._model_to_dict(token_model)
            
    except IntegrityError:
        session.rollback()
        logger.warning(f"JWT token already exists: {token[:20]}...")
        raise ValueError(f"JWT token already exists")
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to create JWT token for user {user_id}: {e}")
        raise
    finally:
        session.close()
```

- [ ] **Step 2: Add deactivate_tokens_by_family method**

```python
def deactivate_tokens_by_family(self, family_id: str) -> int:
    """吊销整个 token 家族（复用检测时使用）"""
    if not family_id:
        return 0
    session = self._get_session()
    try:
        result = session.query(TokenModel).filter(
            TokenModel.family_id == family_id,
            TokenModel.revoked == False
        ).update({'revoked': True})
        session.commit()
        
        if result > 0:
            logger.warning(f"Revoked {result} tokens in family: {family_id}")
        
        return result
        
    except Exception as e:
        session.rollback()
        logger.error(f"Failed to deactivate token family {family_id}: {e}")
        return 0
    finally:
        session.close()
```

- [ ] **Step 3: Add find_token_by_jti (without validity checks, for refresh logic)**

```python
def find_token_by_jti_raw(self, jti: str) -> Optional[Dict]:
    """根据JTI查找token记录（不检查过期和revoked，用于refresh复用检测）"""
    session = self._get_session()
    try:
        token_model = session.query(TokenModel).filter(
            TokenModel.id == jti
        ).first()
        if not token_model:
            return None
        result = self._model_to_dict(token_model)
        result['revoked'] = token_model.revoked
        result['family_id'] = token_model.family_id
        result['token_type'] = token_model.token_type
        return result
    except Exception as e:
        logger.error(f"Failed to find token by jti raw: {e}")
        return None
    finally:
        session.close()
```

- [ ] **Step 4: Update _model_to_dict to include family_id**

Add `family_id` to the returned dict in `_model_to_dict`:

```python
def _model_to_dict(self, model: TokenModel) -> Optional[Dict]:
    """将 ORM 模型转为 Dict"""
    if model is None:
        return None
    expires_at = model.expires_at
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except:
            pass
    
    created_at = model.created_at
    if isinstance(created_at, str):
        try:
            created_at = datetime.fromisoformat(created_at)
        except:
            pass
    
    return {
        'id': model.id,
        'token': model.token,
        'jti': model.id,
        'user_id': model.user_id,
        'token_type': model.token_type,
        'family_id': model.family_id,
        'created_at': created_at,
        'expires_at': expires_at,
        'is_active': not model.revoked
    }
```

- [ ] **Step 5: Commit**

```bash
git add backend/database/dao/token_dao.py
git commit -m "feat(auth): add family-based token operations to token_dao"
```

---

### Task 4: jwt_middleware — Add create_refresh_token function

**Files:**
- Modify: `backend/middleware/jwt_middleware.py`

- [ ] **Step 1: Add REFRESH_TOKEN_EXPIRE_DAYS constant and create_refresh_token function**

After the existing `ACCESS_TOKEN_EXPIRE_HOURS` line (line 18), add:

```python
REFRESH_TOKEN_EXPIRE_DAYS = jwt_config['refresh_token_expire_days']
```

After `create_access_token` function (after line 42), add:

```python
def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None):
    """创建刷新令牌"""
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

- [ ] **Step 2: Add type claim to create_access_token**

Update `create_access_token` to include type:

```python
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    
    to_encode.update({"exp": expire, "type": "access"})
    
    import uuid
    jti = str(uuid.uuid4())
    to_encode.update({"jti": jti})
    
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
```

- [ ] **Step 3: Commit**

```bash
git add backend/middleware/jwt_middleware.py
git commit -m "feat(auth): add create_refresh_token and type claim to access token"
```

---

### Task 5: Backend — Login issues dual tokens

**Files:**
- Modify: `backend/routes/auth.py`

- [ ] **Step 1: Update imports**

```python
from middleware.jwt_middleware import get_current_user, create_access_token, create_refresh_token
```

- [ ] **Step 2: Update LoginResponse model**

```python
class LoginResponse(BaseModel):
    user: dict = None
    token: str = None
    refresh_token: str = None
    success: bool = True
    message: str = None
    error_code: int = None
```

- [ ] **Step 3: Update login_local to issue dual tokens**

Replace the login logic (the try block starting at line 131):

```python
    try:
        import uuid as _uuid
        family_id = str(_uuid.uuid4())
        
        # 生成 access_token
        token_data = {"sub": user['id']}
        jwt_token = create_access_token(data=token_data)
        
        # 生成 refresh_token
        refresh_data = {"sub": user['id'], "family_id": family_id}
        refresh_token = create_refresh_token(data=refresh_data)
        
        # 从JWT中提取JTI
        from jose import jwt
        jwt_cfg = config.get_jwt_config()
        access_decoded = jwt.decode(jwt_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
        refresh_decoded = jwt.decode(refresh_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
        
        # 存储两个 token
        token_dao.create_token(
            user['id'], jwt_token, access_decoded.get('jti'),
            token_type='access', family_id=family_id,
            expires_hours=jwt_cfg['access_token_expire_hours']
        )
        token_dao.create_token(
            user['id'], refresh_token, refresh_decoded.get('jti'),
            token_type='refresh', family_id=family_id,
            expires_days=jwt_cfg['refresh_token_expire_days']
        )
        
        return LoginResponse(
            success=True,
            message='登录成功',
            token=jwt_token,
            refresh_token=refresh_token,
            user={
                'id': user['id'],
                'username': user['username'],
                'email': user.get('email', ''),
                'role_group': user.get('role_group', 'user')
            }
        )
        
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=500, detail='登录失败，请稍后重试')
```

- [ ] **Step 4: Commit**

```bash
git add backend/routes/auth.py
git commit -m "feat(auth): login issues dual tokens with family_id"
```

---

### Task 6: Backend — POST /auth/refresh endpoint

**Files:**
- Modify: `backend/routes/auth.py`

- [ ] **Step 1: Add RefreshRequest model**

After the existing Pydantic models:

```python
class RefreshRequest(BaseModel):
    refresh_token: str
```

- [ ] **Step 2: Add refresh endpoint**

```python
@router.post('/api/auth/refresh')
async def refresh_token(data: RefreshRequest):
    """使用 refresh_token 换取新的 token 对"""
    from middleware.jwt_middleware import verify_token, create_access_token, create_refresh_token
    from jose import jwt as jose_jwt
    import uuid as _uuid
    
    # 1. 验证 refresh_token JWT 签名和过期
    payload = verify_token(data.refresh_token)
    if payload is None:
        raise HTTPException(status_code=401, detail='refresh token 无效或已过期')
    
    # 2. 检查 type claim
    if payload.get('type') != 'refresh':
        raise HTTPException(status_code=401, detail='非法的 token 类型')
    
    jti = payload.get('jti')
    user_id = payload.get('sub')
    family_id = payload.get('family_id')
    
    if not jti or not user_id or not family_id:
        raise HTTPException(status_code=401, detail='refresh token 格式无效')
    
    # 3. 从 DB 查找该 token（不检查过期/revoked，用于复用检测）
    token_record = token_dao.find_token_by_jti_raw(jti)
    if token_record is None:
        raise HTTPException(status_code=401, detail='refresh token 不存在')
    
    # 4. 复用检测：如果已 revoked，说明被重放攻击
    if token_record.get('revoked'):
        logger.warning(f"Refresh token reuse detected! family={family_id}, user={user_id}")
        token_dao.deactivate_tokens_by_family(family_id)
        raise HTTPException(status_code=401, detail='检测到异常，已吊销所有相关登录')
    
    # 5. 验证 token_type
    if token_record.get('token_type') != 'refresh':
        raise HTTPException(status_code=401, detail='非法的 token 类型')
    
    # 6. 标记旧 refresh_token 为 revoked
    token_dao.deactivate_token_by_jti(jti)
    
    # 7. 签发新的 access_token + refresh_token（同 family_id）
    jwt_cfg = config.get_jwt_config()
    
    new_access = create_access_token(data={"sub": user_id})
    new_refresh = create_refresh_token(data={"sub": user_id, "family_id": family_id})
    
    access_decoded = jose_jwt.decode(new_access, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
    refresh_decoded = jose_jwt.decode(new_refresh, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
    
    token_dao.create_token(
        user_id, new_access, access_decoded.get('jti'),
        token_type='access', family_id=family_id,
        expires_hours=jwt_cfg['access_token_expire_hours']
    )
    token_dao.create_token(
        user_id, new_refresh, refresh_decoded.get('jti'),
        token_type='refresh', family_id=family_id,
        expires_days=jwt_cfg['refresh_token_expire_days']
    )
    
    return {
        'token': new_access,
        'refresh_token': new_refresh,
    }
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/auth.py
git commit -m "feat(auth): add POST /auth/refresh endpoint with rotation and reuse detection"
```

---

### Task 7: Backend — Update logout and WebAuthn

**Files:**
- Modify: `backend/routes/auth.py`
- Modify: `backend/routes/webauthn.py`

- [ ] **Step 1: Update logout to use family-based revocation**

Replace the `logout` endpoint:

```python
@router.post('/api/auth/logout')
async def logout(current_user_id: str = Depends(get_current_user)):
    """登出当前设备"""
    try:
        count = token_dao.deactivate_user_tokens(current_user_id)
        return LogoutResponse(message='登出成功')
    except Exception as e:
        raise HTTPException(status_code=500, detail='登出失败')
```

(Keep as-is — `deactivate_user_tokens` already revokes all tokens for the user, which covers the family. This is fine for logout-all behavior.)

- [ ] **Step 2: Update WebAuthn verify to issue dual tokens**

In `backend/routes/webauthn.py`, locate the section that creates tokens after WebAuthn verification (around line 234). Replace with dual-token logic:

```python
    # 生成 JWT Token（双 token 机制）
    try:
        import uuid as _uuid
        family_id = str(_uuid.uuid4())
        
        token_data = {"sub": user['id']}
        jwt_token = create_access_token(data=token_data)
        
        refresh_data = {"sub": user['id'], "family_id": family_id}
        refresh_token = create_refresh_token(data=refresh_data)
        
        from jose import jwt as jose_jwt
        jwt_cfg = config.get_jwt_config()
        access_decoded = jose_jwt.decode(jwt_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
        refresh_decoded = jose_jwt.decode(refresh_token, jwt_cfg['secret_key'], algorithms=[jwt_cfg['algorithm']])
        
        token_dao.create_token(
            user['id'], jwt_token, access_decoded.get('jti'),
            token_type='access', family_id=family_id,
            expires_hours=jwt_cfg['access_token_expire_hours']
        )
        token_dao.create_token(
            user['id'], refresh_token, refresh_decoded.get('jti'),
            token_type='refresh', family_id=family_id,
            expires_days=jwt_cfg['refresh_token_expire_days']
        )
```

Update the WebAuthn return value to include `refresh_token`.

Also add import at top:
```python
from middleware.jwt_middleware import get_current_user, create_access_token, create_refresh_token
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/auth.py backend/routes/webauthn.py
git commit -m "feat(auth): webauthn issues dual tokens, logout revokes all"
```

---

### Task 8: Frontend — axios interceptor auto-refresh

**Files:**
- Modify: `frontend/src/api/index.ts`

- [ ] **Step 1: Rewrite response interceptor with refresh logic**

Replace the entire file content:

```typescript
import axios from 'axios';
import { message, Modal } from 'antd';
import { getApiBaseUrl, isNativePlatform } from '../utils/platform';
import { isBookmarked, removeBookmark, getCurrentPath } from '../utils/bookmarks';

const api = axios.create({
  timeout: 30000,
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      if (isNativePlatform() && !window.location.hash.includes('/server-config')) {
        window.location.replace('#/server-config?reason=missing');
      }
      return Promise.reject(new axios.Cancel('api_server_url not configured'));
    }
    config.baseURL = baseUrl;

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Refresh token 逻辑
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
}

function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  if (isNativePlatform()) {
    window.location.replace('#/login');
  } else {
    window.location.href = '/login';
  }
  message.error('登录已过期，请重新登录');
}

export async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.post(`${baseUrl}/auth/refresh`, { refresh_token: refreshToken });
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

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        doLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await tryRefreshToken();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          processQueue(error, null);
          doLogout();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        doLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    } else if (error.response?.status === 404) {
      const currentPath = getCurrentPath();
      if (isBookmarked(currentPath)) {
        Modal.confirm({
          title: '资源不存在',
          content: '当前收藏的页面对应资源已不存在，是否删除该收藏？',
          okText: '删除收藏',
          cancelText: '保留',
          okButtonProps: { danger: true },
          onOk: () => {
            removeBookmark(currentPath);
            message.success('已删除收藏');
          },
        });
      }
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      }
    } else if (error.response?.data?.message) {
      message.error(error.response.data.message);
    } else {
      message.error('请求失败，请稍后重试');
    }
    return Promise.reject(error);
  }
);

export default api;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat(auth): axios interceptor auto-refresh with queue and tryRefreshToken export"
```

---

### Task 9: Frontend — AI streaming 401 handling

**Files:**
- Modify: `frontend/src/api/ai.ts`

- [ ] **Step 1: Add 401 handling with refresh retry to all fetch functions**

Add import at top:

```typescript
import { tryRefreshToken } from './index';
```

Replace `sendAiChatStream` error handling block (lines 92-99):

```typescript
  if (!response.ok) {
    if (response.status === 401) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        const retryResponse = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify({ message, conversation_id: conversationId }),
        });
        if (retryResponse.ok) {
          await readSSEStream(retryResponse, onEvent);
          console.info('[AI][api] stream end (after refresh)', { elapsedMs: Math.round(performance.now() - _t0) });
          return;
        }
      }
      onEvent({ type: 'error', content: '登录已过期，请重新登录' });
      onEvent({ type: 'done' });
      return;
    }
    if (response.status === 429) {
      onEvent({ type: 'error', content: '消息频率超限，请稍后重试' });
    } else {
      onEvent({ type: 'error', content: '请求失败，请稍后重试' });
    }
    onEvent({ type: 'done' });
    return;
  }
```

Apply same pattern to `sendAiConfirmStream` (lines 126-130):

```typescript
  if (!response.ok) {
    if (response.status === 401) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        const retryResponse = await fetch('/api/ai/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (retryResponse.ok) {
          await readSSEStream(retryResponse, onEvent);
          return;
        }
      }
      onEvent({ type: 'error', content: '登录已过期，请重新登录' });
      onEvent({ type: 'done' });
      return;
    }
    onEvent({ type: 'error', content: '确认请求失败，请稍后重试' });
    onEvent({ type: 'done' });
    return;
  }
```

Apply same pattern to `sendAiDisambiguateStream` (lines 153-157):

```typescript
  if (!response.ok) {
    if (response.status === 401) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        const retryResponse = await fetch('/api/ai/disambiguate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${newToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (retryResponse.ok) {
          await readSSEStream(retryResponse, onEvent);
          return;
        }
      }
      onEvent({ type: 'error', content: '登录已过期，请重新登录' });
      onEvent({ type: 'done' });
      return;
    }
    onEvent({ type: 'error', content: '选择请求失败，请稍后重试' });
    onEvent({ type: 'done' });
    return;
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/ai.ts
git commit -m "feat(auth): AI streaming endpoints handle 401 with token refresh"
```

---

### Task 10: Frontend — Login/Logout handle refresh_token storage

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Update LoginResponse type**

In `frontend/src/types/index.ts` (line 93-98):

```typescript
export interface LoginResponse {
  user: User;
  token: string;
  refresh_token: string;
  success: boolean;
  message?: string;
}
```

- [ ] **Step 2: Update handleLogin in App.tsx**

Find the `handleLogin` function (around line 182) and add refresh_token storage:

```typescript
const handleLogin = async (userData: User, token: string, refreshToken?: string) => {
    localStorage.setItem('token', token);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    setUser(userData);
    message.success('登录成功');
    // ... rest unchanged
```

- [ ] **Step 3: Update handleLogout in App.tsx**

```typescript
const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    message.success('已退出登录');
};
```

- [ ] **Step 4: Update all localStorage.removeItem('token') calls to also remove refresh_token**

Search for other places that remove the token (auth check failure around line 167):

```typescript
localStorage.removeItem('token');
localStorage.removeItem('refresh_token');
```

- [ ] **Step 5: Update LoginPage to pass refresh_token to handleLogin**

Find where `handleLogin` is called from the login page and ensure it passes `response.refresh_token`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/App.tsx frontend/src/pages/LoginPage.tsx
git commit -m "feat(auth): frontend stores and clears refresh_token on login/logout"
```

---

### Task 11: Verification — End-to-end testing

- [ ] **Step 1: Start backend, verify login returns dual tokens**

```bash
cd backend && python -m pytest tests/ -k "login" -v 2>/dev/null || echo "manual test"
```

Manual: `curl -X POST /api/auth/login -d '{"username":"x","password":"y"}'`
Expected: response has both `token` and `refresh_token` fields.

- [ ] **Step 2: Verify refresh endpoint works**

```bash
curl -X POST /api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<token_from_step1>"}'
```

Expected: returns new `token` + `refresh_token`. Old refresh_token is now revoked.

- [ ] **Step 3: Verify reuse detection**

Use the same old refresh_token again:

```bash
curl -X POST /api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<same_old_token>"}'
```

Expected: 401 + entire family revoked.

- [ ] **Step 4: Frontend type check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no new errors in modified files.

- [ ] **Step 5: Browser test**

1. Login → check localStorage has both `token` and `refresh_token`
2. Manually expire access_token (DevTools → set short expiry or delete from DB)
3. Trigger any API call → should silently refresh and succeed
4. Check localStorage → both tokens updated

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(auth): address issues found during verification"
```
