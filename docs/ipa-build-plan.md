# 移动端（iOS / Android）打包方案

## 目标

Web 端不动；iOS / Android 端通过 Capacitor 打包，服务器地址由用户在 app 内运行时动态配置，不需要重新打包。

## 核心思路

- Web 端：axios 使用相对路径 `/api`，由同端口 FastAPI 提供静态与 API 服务
- Native 端（Capacitor）：首次启动强制进入服务器配置页，用户填入 `https://your-domain.com/api` 并本地持久化，axios 在请求拦截器中动态读取 baseURL
- 入口保留在「设置页 → 服务器地址」，随时可修改（修改后自动登出）

## 关键改动（已实施）

### 1. 平台工具 `frontend/src/utils/platform.ts`

- `isNativePlatform()`：通过 `window.Capacitor.isNativePlatform()` 判断，未安装 Capacitor 时返回 false
- `getApiBaseUrl()`：Web 返回 `/api`；Native 从 `localStorage` 读取，未配置时返回 `null`
- `setApiBaseUrl(url)` / `clearApiBaseUrl()`：native 下读写 localStorage，自动归一化
- `testApiHealth(url)`：以 `fetch` 请求 `/health` 校验地址可用性

### 2. axios 动态 baseURL `frontend/src/api/index.ts`

请求拦截器读取 `getApiBaseUrl()`。native 端若未配置则取消请求并跳转 `#/server-config?reason=missing`。

### 3. 服务器配置页 `frontend/src/pages/ServerConfigPage.tsx`

- 路由：`/server-config`
- 支持两种模式：首次配置（`?reason=missing`）/ 修改模式（`?mode=edit`）
- 「测试连接」按钮调用 `testApiHealth`
- 「保存」会先强制验证 `/health` 通过后才写入
- 修改模式保存时清除 token，跳转登录页

### 4. 路由守卫 `frontend/src/App.tsx`

进入时检测：`isNativePlatform() && !getApiBaseUrl()` → 强制跳 `/server-config`。同时注册 `/server-config` 路由。

### 5. Router 切换 `frontend/src/index.tsx`

```ts
const Router = isNativePlatform() ? HashRouter : BrowserRouter;
```

Native 容器无 history，必须 HashRouter。

### 6. 设置页入口 `frontend/src/pages/SettingsPage.tsx`

仅 native 平台渲染「服务器地址」卡片，点击跳 `/server-config?mode=edit`。

### 7. 后端 CORS `backend/app.py`

CORS allowed_origins 追加：

- `capacitor://localhost`（iOS）
- `http://localhost`、`https://localhost`（Android WebView）
- `ionic://localhost`（历史兼容）

### 8. Capacitor 配置 `frontend/capacitor.config.ts`

```ts
{
  appId: 'com.ticklist.app',
  appName: 'TickList',
  webDir: 'dist',
  server: { androidScheme: 'https', cleartext: true },
  ios: { contentInset: 'always' },
  android: { allowMixedContent: true },
}
```

### 9. 平台目录

已执行 `bunx cap add ios` 与 `bunx cap add android`，生成：

- `frontend/ios/`（Xcode 工程）
- `frontend/android/`（Gradle 工程）

手动补充：

- Android：`AndroidManifest.xml` 的 `<application>` 加 `android:usesCleartextTraffic="true"`
- iOS：`Info.plist` 加 `NSAppTransportSecurity.NSAllowsArbitraryLoads = true`

生产环境建议只允许 HTTPS，关闭 cleartext 与 ATS 放宽项。

## 构建与打包

### Web 构建（不变）

```bash
cd frontend
bun run build
```

请求仍走 `/api` 相对路径，现有部署方式不变。

### iOS 构建

依赖：Mac + Xcode + CocoaPods。

```bash
cd frontend
bun run cap:ios
# 等同于: rsbuild build && cap sync ios && cap open ios
```

在 Xcode 中：

1. 选择 Team & Bundle Identifier（默认 `com.ticklist.app`，可按需改）
2. Product → Archive → Distribute App → 导出 IPA

### Android 构建

依赖：Android Studio + JDK 17。

```bash
cd frontend
bun run cap:android
# 等同于: rsbuild build && cap sync android && cap open android
```

在 Android Studio：

1. Gradle Sync 完成后 Build → Generate Signed Bundle / APK
2. 选择 APK 或 AAB（上架 Google Play 用 AAB）
3. 配置 keystore 后导出

## 验证清单

- Web `bun run dev`：请求走 `/api`，页面行为不变
- iOS / Android：首次启动跳 `/server-config` → 输入 `https://your-domain.com/api` → 测试连接成功 → 保存 → 登录页 → 正常使用
- 设置页内「服务器地址」卡片可修改，修改后自动登出要求重新登录
- 后端日志：`allowed_origins` 包含 `capacitor://localhost` 等，native 请求不被 CORS 拦截

## 注意事项

- iOS ATS：线上建议仅保留 HTTPS + 有效证书，移除 `NSAllowsArbitraryLoads`
- Android cleartext：线上建议改用 `networkSecurityConfig` 精细化白名单
- 切换服务器地址 == 切换数据域，必须清 token（代码已处理）
- HashRouter 仅在 native 构建生效，Web 端继续使用 BrowserRouter
- `ios/`、`android/` 目录建议纳入版本控制以便 CI；若不纳入可在 `.gitignore` 过滤，打包前由 `cap add` 重新生成