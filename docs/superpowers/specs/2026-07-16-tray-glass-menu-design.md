# 托盘磨砂菜单设计（主题配色 + 半透白霜玻璃）

日期：2026-07-16
分支：feat/desktop-tauri 已合入 main，本功能在新分支开展

## 背景与目标

当前 Tauri 托盘（`frontend/src-tauri/src/lib.rs`）使用原生 `Menu`/`MenuItem`，由操作系统绘制，无法应用 CSS 磨砂或跟随应用主题配色。

目标：托盘右键菜单沿用全站「半透白霜磨砂 + 主题配色」的空间玻璃观感（对齐 `src/styles/glass.less` 的浮层材质），与 TitleBar、侧栏、弹窗视觉统一。

## 交互约定（已确认）

- **左键点击托盘图标**：保持现状 —— 切换主窗口显示/隐藏。
- **右键点击托盘图标**：弹出自定义磨砂菜单窗口。
- **菜单项**：两项，保持现有能力
  - 显示/隐藏窗口
  - 退出
- **关闭**：点击任一菜单项后隐藏弹窗；弹窗失焦（点击别处）自动隐藏。

## 架构

原生托盘菜单无法定制外观，因此改为「点击托盘图标 → 显示一个无边框透明 webview 小窗，窗内用 React 渲染菜单项」。

### Rust 侧（`lib.rs`）

- 移除 `TrayIconBuilder` 的 `.menu(&menu)` 与 `Menu`/`MenuItem` 构造（不再挂原生菜单）。
- 左键事件保留 `toggle_main_window`（现状不变）。
- 右键事件（`TrayIconEvent::Click { button: MouseButton::Right, button_state: Up, rect, .. }`）→ 计算位置 → 定位并显示托盘弹窗。
- 启动时（`setup`）用 `WebviewWindowBuilder` 预建一个隐藏窗 `tray-menu`：
  - `decorations(false)`、`transparent(true)`、`always_on_top(true)`、`skip_taskbar(true)`
  - `resizable(false)`、`shadow(false)`（阴影由 CSS 画，避免与透明窗冲突）
  - `visible(false)` 初始隐藏
  - URL：`WebviewUrl::App("index.html#tray".into())`
  - 固定尺寸（含透明外边距，见「尺寸与定位」）
- 两个 `#[tauri::command]`：
  - `tray_toggle_window(app)` → `toggle_main_window` + 隐藏 tray-menu 窗
  - `tray_quit(app)` → `app.exit(0)`
- `on_window_event`：对 `label == "tray-menu"` 的窗口，`WindowEvent::Focused(false)` → `hide()`（失焦自动关）。主窗的 `CloseRequested` 拦截逻辑保持不变。
- `invoke_handler` 注册两个命令。

### 前端

- **轻量入口**：`src/index.tsx` 开头判断 `window.location.hash === '#tray'`。若是，只渲染 `<TrayMenu/>`（裹在 `ConfigProvider` 内），**不挂载 App / Router / 业务 Provider**。否则走现有 App 渲染路径。
- **抽取主题表**：把 `App.tsx` 内的 `THEME_COLORS`（40 套配色，含 `color`/`isDark`/`token`）与 `ThemeConfig` 类型移到独立模块 `src/theme/themeColors.ts` 并导出；`App.tsx` 改为 import。新增 helper `resolveTheme(key: string): ThemeConfig`（缺省回退 `default`）。
- **`src/components/TrayMenu.tsx`**：
  - 读 `localStorage.getItem('theme_key')` → `resolveTheme` → 得主色 + 明暗。
  - 外层 `ConfigProvider`：`theme={{ algorithm: isDark ? darkAlgorithm : defaultAlgorithm, token: { colorPrimary } }}`，使 `--ant-color-*` 在窗内解析（对齐记忆：主色作用域坑，玻璃容器必须在此 Provider 内层）。
  - 在挂载时 `document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')`，让 glass token 取到明/暗分支。
  - 渲染磨砂菜单容器 + 两个菜单项按钮；点击 → `invoke('tray_toggle_window')` / `invoke('tray_quit')`（经 `@tauri-apps/api/core`）。
- **`src/components/TrayMenu.less`**：复用 `--tl-glass`/`--tl-glass-hover`/`--tl-blur`/`--tl-sat`/`--tl-shadow`/`--tl-edge-soft`/`--tl-card-radius` 等 token，画白霜磨砂面板（半透明主题底 + `backdrop-filter` + 圆角 + 阴影 + 顶部高光边）。菜单项 hover 用 `--tl-glass-hover`。字色用 `--ant-color-text`。
  - `glass.less` 已在入口 import，token 可用。

## 数据流

```
右键托盘图标
  → Rust: 读 rect → 计算 x/y → tray-menu.set_position() → show() + set_focus()
  → 窗内 TrayMenu 渲染（读 theme_key，套主题+玻璃）
  → 用户点菜单项 → invoke(command) → Rust 执行 + tray-menu.hide()
  或 用户点别处 → Focused(false) → tray-menu.hide()
```

## 尺寸与定位

- **透明外边距放阴影**：CSS `box-shadow` 会被裁在窗口边界内。窗口比可视面板大一圈（四周留 ~20px 透明 padding），阴影落在透明区内。
  - 建议窗口尺寸：宽 240、高 140（可视面板约 200×100，四周 20px 透明区）。实现时按实际内容微调。
- **定位（Windows 托盘在右下，菜单向上展开）**：右键 `rect` 给图标屏幕矩形（PhysicalPosition + size）。
  - `x = rect.right - windowWidth`（右对齐图标）
  - `y = rect.top - windowHeight`（图标上方）
  - 用 `PhysicalPosition` 设置。夹取到当前显示器工作区内，避免超出屏幕。
- macOS/Linux 菜单栏在顶部，展开方向相反，但主要目标平台为 Windows；定位用 rect 通用计算，其它平台先按同逻辑落地，后续如需再调。

## 复用点

- `THEME_COLORS` 单一数据源（`src/theme/themeColors.ts`），App 与 TrayMenu 共用，避免配色表重复。
- glass token（`glass.less` 的 `:root` / `[data-theme=dark]` 变量）由 TrayMenu.less 复用。

## 关键坑（来自项目记忆）

- **主色作用域**（[[主题系统]]）：`--ant-color-primary` 仅在 antd css-var 作用域内解析；TrayMenu 的玻璃容器必须裹在 `ConfigProvider` 内层，不能挂 html 根。
- **CORS/origin**（[[ticklist-tauri-cors]]）：tray-menu 窗与主窗同源（`tauri.localhost` / dev `localhost:3000`），不新增 origin，后端 CORS 无需改动。
- **透明窗阴影裁切**：透明窗 CSS 阴影须靠窗口透明外边距容纳。
- **AppLocker**（[[windows-desktop-dev-applocker]]）：dev 偶发 os error 786，与本功能无关，重试或用打包版验证。

## 测试

- **单元/组件测试**（Vitest，仿 `TitleBar.test.tsx`）：`TrayMenu.test.tsx`
  - 给定 `theme_key`，渲染出两个菜单项；
  - 点击「显示/隐藏窗口」调用 `invoke('tray_toggle_window')`；
  - 点击「退出」调用 `invoke('tray_quit')`（mock `@tauri-apps/api/core`）。
- **手动验证**（打包版，规避 AppLocker）：右键托盘弹磨砂菜单；切换 40 套配色 + 明暗后重开菜单，配色/明暗跟随；点项生效、失焦自动关；菜单出现在图标附近不超屏。

## 非目标（YAGNI）

- OS 级真桌面模糊（acrylic/mica/vibrancy）—— 本次用 CSS 白霜膜。
- 菜单项扩充（新建任务、番茄开关等）—— 保持现有两项。
- 弹窗动画 —— 先不做。
