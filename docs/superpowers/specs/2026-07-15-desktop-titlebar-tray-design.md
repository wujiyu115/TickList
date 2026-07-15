# 桌面端自定义标题栏 + 系统托盘 设计文档

日期：2026-07-15
分支：feat/desktop-tauri
状态：已确认，待实现

## 目标

给 Tauri 桌面端（Windows / macOS / Linux）实现：

1. **自定义标题栏**：去掉系统原生边框，改为 macOS 风格标题栏——左侧红黄绿交通灯按钮、居中显示应用标题「TickList」，背景随当前主题主色做淡渐变、跟随明暗模式。
2. **系统托盘**：托盘图标 + 右键菜单（显示/隐藏窗口、退出），左键单击切换窗口显示/隐藏。
3. **关闭行为**：点标题栏红灯（或系统层面的关闭，如 Alt+F4）时最小化到托盘而非退出；仅「退出」菜单项真正结束进程。

三平台统一采用同一套自绘标题栏，Web 端不受影响（不渲染标题栏）。

## 方案选择

采用**方案 A：无边框全自绘 + React 标题栏 + Rust 托盘**。

- 无边框（`decorations: false`）三平台一致，可完整呈现 macOS 交通灯风格。
- 标题栏是 React 组件，直接读主题 `ThemeContext`，与配色实时联动。
- 拖动用 Tauri 内置 `data-tauri-drag-region`，窗口控制用 `@tauri-apps/api/window`，托盘与关闭拦截在 Rust。

已否决的替代方案：

- **方案 B（保留系统装饰，仅 Windows overlay 调色）**：三平台不统一，做不出交通灯，不贴合参考图。
- **方案 C（Rust 端原生构建标题栏/菜单）**：无法与前端主题联动，样式僵硬。

## 架构总览

三层协作：

| 层 | 职责 | 涉及文件 |
|---|---|---|
| Rust 窗口/托盘 | 无边框窗口、系统托盘、关闭→隐藏拦截 | `src-tauri/src/lib.rs`、`src-tauri/Cargo.toml`、`src-tauri/capabilities/default.json`、`src-tauri/tauri.conf.json` |
| React 标题栏 | 自绘交通灯 + 居中标题 + 拖动区，淡主色渐变 | 新增 `frontend/src/components/TitleBar.tsx` 及样式 |
| 主题取值 | 从 `ThemeContext` 取 `primaryColor` / `isDark` | 复用 `frontend/src/App.tsx` 现有 context |

**关键约束**：无边框后每个页面（登录、服务器配置、主界面）都必须有标题栏，否则无法拖动/关闭窗口。因此标题栏挂在 `App.tsx` 的 `ThemeContext.Provider` 内、`Routes` 之外，作为全局固定顶部条；仅 `isTauri()` 为真时渲染。

另外，探索发现 antd 的 `--ant-color-primary` CSS 变量作用域从 `.main-layout` 起，在其外部（如整窗顶栏）取不到值会退化成白色。因此标题栏配色**必须从 `ThemeContext` 取纯 JS 值**（`primaryColor`），不能依赖该 CSS 变量。

## 详细设计

### 1. Rust 侧（`lib.rs` / 配置）

- **`Cargo.toml`**：`tauri` 依赖加 `features = ["tray-icon"]`。
- **托盘**：用 `TrayIconBuilder` 创建，图标复用现有 `src-tauri/icons/icon.ico`（或对应 png）。
  - 菜单两项：「显示/隐藏窗口」「退出」。
  - 左键单击托盘图标：toggle 主窗口显示/隐藏（隐藏则 `show()+set_focus()`，可见则 `hide()`）。
- **关闭拦截**：`WindowEvent::CloseRequested` 时 `api.prevent_close()` 并 `window.hide()`，覆盖红灯之外的关闭路径（Alt+F4 等）。
- **退出**：菜单「退出」调用 `app.exit(0)` 真正结束进程。
- **`tauri.conf.json`**：主窗口加 `"decorations": false`。保留系统默认背景（不启用 transparent），圆角/阴影交给系统。

### 2. React 标题栏组件 `TitleBar.tsx`

- **布局**：固定高度 **40px** 的横条。
  - 左侧：三个直径 **12px** 圆点，顺序红/黄/绿（macOS 风格）；默认纯色，hover 时在圆点内显示符号（红 ×、黄 −、绿 +）。
  - 中间：`data-tauri-drag-region` 可拖动空白区 + 居中标题文字「TickList」。
  - 双击标题区触发 `toggleMaximize()`。
- **按钮行为**（`@tauri-apps/api/window` 的 `getCurrentWindow()`）：
  - 🔴 红 = `hide()`（最小化到托盘）
  - 🟡 黄 = `minimize()`
  - 🟢 绿 = `toggleMaximize()`
- **渲染条件**：仅 `isTauri()` 为真时渲染；Web 端返回 `null`。

### 3. 主题融合（淡主色渐变）

从 `ThemeContext` 读 `primaryColor`、`isDark`：

- 背景横向淡渐变，例如：
  `linear-gradient(90deg, color-mix(in srgb, {primaryColor} 14%, {bg}) 0%, {bg} 60%)`
  其中 `{bg}` 亮色模式取近白色、暗色模式取深灰。
- 文字与交通灯以外区域的图标颜色随 `isDark` 切换。
- 主题切换时 `ThemeContext` 值变化，组件自动重渲染，无需额外同步逻辑。

### 4. 布局适配

- 标题栏 `position: fixed; top: 0; height: 40px`，`z-index` 高于内容。
- 仅 Tauri 环境给全局根容器加 `padding-top: 40px`，避免内容被遮挡。
- `MainLayout` 的 `AppHeader` / 侧栏顶部相应下移；登录页、服务器配置页为居中卡片，整体下移 40px 即可。

### 5. 权限（`capabilities/default.json`）

主窗口 capability 增加窗口控制与托盘相关权限，至少包含：

- `core:window:allow-minimize`
- `core:window:allow-toggle-maximize`（及 `allow-is-maximized`）
- `core:window:allow-hide` / `core:window:allow-show`
- `core:window:allow-close`
- `core:window:allow-start-dragging`
- `core:window:allow-set-focus`
- 托盘相关：`core:tray:default`（或按 Tauri v2 实际权限项补齐）

（具体权限项以 Tauri v2 schema 校验为准，实现时按报错补齐。）

## 测试与验证

- `bun run desktop:dev` 手动验证：
  - 拖动标题栏移动窗口、双击最大化/还原。
  - 三个交通灯功能：红→隐藏到托盘、黄→最小化、绿→最大化切换。
  - 托盘左键单击 toggle、右键菜单「显示/隐藏」「退出」。
  - 关闭（Alt+F4）走最小化到托盘、「退出」真正结束进程。
  - 切换多套主题（亮/暗）观察标题栏渐变与文字色跟随。
- 三平台差异：Windows 优先本地验证；macOS/Linux 依赖 CI 构建产物确认可启动，无法本地手测的项在实现说明中标注。

## 待定项（已按推荐值定稿）

- 标题栏高度 40px、交通灯直径 12px、hover 显示符号、圆点顺序红黄绿在左侧。
