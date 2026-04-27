# IPA 打包方案

## 目标

Web 端不动，IPA 端改服务器地址，前后端部署方式不变（同端口）。

## 核心思路

rsbuild 构建时通过环境变量注入 API 服务器地址。Web 构建不设变量，走相对路径 `/api`；IPA 构build 设绝对 URL。编译后 `process.env` 变成字符串常量，运行时不依赖环境。

## 改动清单

### 1. `frontend/src/api/index.ts`（1行改动）

```ts
// 原来
const API_BASE_URL = '/api';

// 改为
const API_BASE_URL = process.env.API_SERVER_URL || '/api';
```

Web 端：`process.env.API_SERVER_URL` 为 undefined → fallback `/api`（相对路径，同端口请求）
IPA 端：构建时注入 → 编译为 `"https://你的域名/api"`（绝对 URL）

### 2. `frontend/rsbuild.config.ts`（可选，更可靠）

在 `source` 配置中加 `define`，确保环境变量被编译替换：

```ts
source: {
  define: {
    'process.env.API_SERVER_URL': JSON.stringify(process.env.API_SERVER_URL || ''),
  },
  // ...原有配置
}
```

不加也能工作（rsbuild 默认替换 `process.env.X`），加了更明确。

### 3. 后端 CORS 配置

`backend/app.py` 的 `allowed_origins` 需加上 Capacitor app 的 origin：

```python
allowed_origins = config.get('cors.allowed_origins', [])
# Capacitor iOS app 的 origin
allowed_origins.append('capacitor://localhost')
# 本地调试用
allowed_origins.append('http://localhost:3000')
```

或更宽松（开发阶段）：

```python
allow_origins=['*']
```

### 4. 构建命令区分

**Web 构建（不变）**

```bash
cd frontend
bun run build
# API_SERVER_URL 未设 → baseURL = '/api'
```

**IPA 构建**

```bash
cd frontend
API_SERVER_URL=https://你的域名/api bun run build
# API_SERVER_URL 已设 → baseURL = 'https://你的域名/api'
```

### 5. Capacitor 集成

```bash
cd frontend
npm install @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "TickList" "com.ticklist.app" --web-dir dist
npx cap add ios
```

**capacitor.config.ts**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ticklist.app',
  appName: 'TickList',
  webDir: 'dist',
  server: {
    // 不需要配置，baseURL 已是绝对地址
    // 如果需要本地调试，可临时设 url 指向 dev server
  },
  ios: {
    content: {
      // 允许混合内容（HTTP API + HTTPS 本地）
      preferredContentMode: 'mobile',
    },
  },
};

export default config;
```

**打包流程**

```bash
# 1. IPA 构建前端
cd frontend
API_SERVER_URL=https://你的域名/api bun run build

# 2. 同步到 Capacitor
npx cap sync ios

# 3. Xcode 编译
open ios/App/App.xcworkspace
# Xcode → Product → Archive → Distribute App
```

## 验证

- Web 端：打开浏览器，请求仍走 `/api` 相对路径，无变化
- IPA 端：打开 app，请求走 `https://你的域名/api` 绝对路径
- 后端：CORS 允许 `capacitor://localhost` origin

## 注意事项

- 需要 Mac + Xcode 编译 IPA
- 无 Mac 可用云构建（EAS Build、Bitrise）
- HTTPS 服务器地址必须有效证书（iOS 强制 ATS）
- `API_SERVER_URL` 只在构建时生效，不能运行时动态切换