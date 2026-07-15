# 桌面端自定义标题栏 + 系统托盘 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Tauri 桌面端做 macOS 风格的无边框自定义标题栏（交通灯 + 居中标题 + 随主题淡主色渐变）与系统托盘（显示/隐藏、退出，关闭→最小化到托盘）。

**Architecture:** 无边框窗口（`decorations:false`）三平台统一；标题栏为 React 组件，挂在 `App.tsx` 的 `ThemeContext.Provider` 内、从主题取 `primaryColor/isDark` 上色，拖动用 Tauri 内置 `data-tauri-drag-region`，窗口控制用 `@tauri-apps/api/window`；托盘与关闭拦截在 Rust `lib.rs`。

**Tech Stack:** Tauri v2（Rust），React 18 + TypeScript + antd v5，Less，Vitest + @testing-library/react。

## Global Constraints

- 平台：Windows / macOS / Linux 三平台统一同一套自绘标题栏；Web 端不渲染标题栏（`isTauri()` 为 false 时组件返回 `null`）。
- 标题栏配色必须从 `ThemeContext` 取纯 JS 值 `primaryColor`，**不得**依赖 `--ant-color-primary` CSS 变量（其作用域从 `.main-layout` 起，标题栏在其外部取不到）。
- 标题栏高度 40px；交通灯直径 12px，顺序红/黄/绿在左侧，hover 显示符号（× / − / +）。
- 交通灯功能映射：红 = 隐藏到托盘（`hide()`）、黄 = 最小化（`minimize()`）、绿 = 最大化切换（`toggleMaximize()`）。
- 关闭拦截：系统层面关闭（Alt+F4 等）走隐藏到托盘；仅托盘「退出」菜单真正结束进程。
- Tauri 前端 API 依赖 `@tauri-apps/api ^2`（已安装）；`isTauri()` 在 `frontend/src/utils/platform.ts` 已存在。

---

### Task 1: 无边框窗口 + 托盘依赖开启

**Files:**
- Modify: `frontend/src-tauri/tauri.conf.json`（window 加 `decorations: false`）
- Modify: `frontend/src-tauri/Cargo.toml`（tauri 加 `tray-icon` feature）

**Interfaces:**
- Consumes: 无
- Produces: 无边框主窗口；Cargo 启用托盘能力，供 Task 2 使用。

- [ ] **Step 1: 关闭系统边框**

编辑 `frontend/src-tauri/tauri.conf.json`，在 `app.windows[0]` 对象内（`"fullscreen": false` 之后）加入 `"decorations": false`：

```json
      {
        "title": "TickList",
        "width": 1120,
        "height": 760,
        "minWidth": 380,
        "minHeight": 560,
        "resizable": true,
        "fullscreen": false,
        "decorations": false
      }
```

- [ ] **Step 2: 开启 tray-icon feature**

编辑 `frontend/src-tauri/Cargo.toml`，把 `tauri` 依赖行改为：

```toml
tauri = { version = "2", features = ["tray-icon"] }
```

- [ ] **Step 3: 编译校验**

Run: `cd frontend/src-tauri && cargo build`
Expected: 编译成功（可能较慢，首次会拉取依赖），无报错。

- [ ] **Step 4: 目视校验无边框窗口**

Run: `cd frontend && bun run desktop:dev`
Expected: 应用窗口启动后**没有系统标题栏与边框**（此时暂时无法拖动/关闭，属正常，后续任务补齐）。按 Alt+F4 或从任务栏关闭进程结束验证。

- [ ] **Step 5: Commit**

```bash
git add frontend/src-tauri/tauri.conf.json frontend/src-tauri/Cargo.toml
git commit -m "feat(desktop): borderless window + enable tray-icon feature"
```

---

### Task 2: 系统托盘 + 关闭到托盘（Rust）

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: Task 1 的 tray-icon feature 与无边框窗口。
- Produces:
  - 托盘图标 + 菜单（id `toggle` = 显示/隐藏，id `quit` = 退出）。
  - 托盘左键单击切换窗口显示/隐藏。
  - `CloseRequested` 拦截为隐藏。
  - capability 放行前端将调用的窗口方法：`hide` / `show` / `minimize` / `toggle_maximize` / `set_focus` / `close` / `start_dragging`（供 Task 3、4 的前端调用）。

- [ ] **Step 1: 重写 `lib.rs`**

将 `frontend/src-tauri/src/lib.rs` 全文替换为：

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

/// 切换主窗口显示/隐藏；隐藏状态则显示并聚焦。
fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 托盘菜单：显示/隐藏、退出
            let toggle_item = MenuItem::with_id(app, "toggle", "显示/隐藏窗口", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "toggle" => toggle_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            // 关闭请求（红灯之外的 Alt+F4 等）拦截为隐藏到托盘
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: 放行前端窗口权限**

将 `frontend/src-tauri/capabilities/default.json` 的 `permissions` 数组替换为：

```json
  "permissions": [
    "core:default",
    "opener:default",
    "core:window:allow-minimize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "core:window:allow-close",
    "core:window:allow-start-dragging"
  ]
```

- [ ] **Step 3: 编译校验**

Run: `cd frontend/src-tauri && cargo build`
Expected: 编译成功，无报错。若权限项名称不被 schema 接受而报错，按报错信息提示的合法权限名修正对应项。

- [ ] **Step 4: 目视校验托盘与关闭行为**

Run: `cd frontend && bun run desktop:dev`
Expected:
- 系统托盘出现 TickList 图标。
- 左键单击托盘图标：窗口在显示/隐藏间切换。
- 右键托盘：出现「显示/隐藏窗口」「退出」两项，点「显示/隐藏窗口」切换窗口；点「退出」进程结束。
- 按 Alt+F4：窗口隐藏（进程仍在，托盘图标还在），从托盘可再次唤出。

- [ ] **Step 5: Commit**

```bash
git add frontend/src-tauri/src/lib.rs frontend/src-tauri/capabilities/default.json
git commit -m "feat(desktop): system tray + close-to-tray with window permissions"
```

---

### Task 3: TitleBar 组件（含渐变逻辑与窗口控制，TDD）

**Files:**
- Create: `frontend/src/components/TitleBar.tsx`
- Create: `frontend/src/components/TitleBar.less`
- Test: `frontend/src/components/TitleBar.test.tsx`

**Interfaces:**
- Consumes: `isTauri()`（`frontend/src/utils/platform.ts`）；`getCurrentWindow()`（`@tauri-apps/api/window`），其 `.hide()` / `.minimize()` / `.toggleMaximize()`。
- Produces:
  - `export const titleBarBackground(primaryColor: string, isDark: boolean): string` — 返回 CSS `linear-gradient(...)` 字符串。
  - `export default TitleBar: React.FC<{ primaryColor: string; isDark: boolean }>` — Tauri 下渲染标题栏，否则返回 `null`。供 Task 4 挂载。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/TitleBar.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TitleBar, { titleBarBackground } from './TitleBar';
import * as platform from '../utils/platform';

const hide = vi.fn();
const minimize = vi.fn();
const toggleMaximize = vi.fn();

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ hide, minimize, toggleMaximize }),
}));

describe('titleBarBackground', () => {
  it('浅色模式生成含主色与浅底色的横向渐变', () => {
    const bg = titleBarBackground('#1677ff', false);
    expect(bg).toContain('linear-gradient(90deg');
    expect(bg).toContain('#1677ff');
    expect(bg).toContain('#fbfcfe');
  });

  it('深色模式底色切换为深灰', () => {
    const bg = titleBarBackground('#1677ff', true);
    expect(bg).toContain('#1f1f1f');
  });
});

describe('TitleBar', () => {
  beforeEach(() => {
    hide.mockClear();
    minimize.mockClear();
    toggleMaximize.mockClear();
  });

  it('非 Tauri 环境不渲染任何内容', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(false);
    const { container } = render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Tauri 环境渲染三个交通灯与标题', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(screen.getByText('TickList')).toBeInTheDocument();
    expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    expect(screen.getByLabelText('最小化')).toBeInTheDocument();
    expect(screen.getByLabelText('最大化')).toBeInTheDocument();
  });

  it('点红灯调用 hide，黄灯 minimize，绿灯 toggleMaximize', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    fireEvent.click(screen.getByLabelText('关闭'));
    fireEvent.click(screen.getByLabelText('最小化'));
    fireEvent.click(screen.getByLabelText('最大化'));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(minimize).toHaveBeenCalledTimes(1);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && bun run test:run src/components/TitleBar.test.tsx`
Expected: FAIL（`TitleBar` 模块不存在 / 无法解析导入）。

- [ ] **Step 3: 写组件实现**

创建 `frontend/src/components/TitleBar.tsx`：

```tsx
import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../utils/platform';
import './TitleBar.less';

export interface TitleBarProps {
  primaryColor: string;
  isDark: boolean;
}

/** 计算标题栏淡主色横向渐变背景（从主色 14% tint 过渡到底色）。 */
export const titleBarBackground = (primaryColor: string, isDark: boolean): string => {
  const bg = isDark ? '#1f1f1f' : '#fbfcfe';
  return `linear-gradient(90deg, color-mix(in srgb, ${primaryColor} 14%, ${bg}) 0%, ${bg} 60%)`;
};

/**
 * 桌面端自定义标题栏。仅在 Tauri 环境渲染；Web 端返回 null。
 * 颜色从主题（primaryColor / isDark）直接取值，随主题切换自动重渲染。
 */
const TitleBar: React.FC<TitleBarProps> = ({ primaryColor, isDark }) => {
  if (!isTauri()) return null;

  const win = getCurrentWindow();
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.72)';

  return (
    <div
      className="tl-titlebar"
      style={{ background: titleBarBackground(primaryColor, isDark) }}
      data-tauri-drag-region
    >
      <div className="tl-titlebar__lights">
        <button
          type="button"
          className="tl-light tl-light--close"
          aria-label="关闭"
          onClick={() => win.hide()}
        />
        <button
          type="button"
          className="tl-light tl-light--min"
          aria-label="最小化"
          onClick={() => win.minimize()}
        />
        <button
          type="button"
          className="tl-light tl-light--max"
          aria-label="最大化"
          onClick={() => win.toggleMaximize()}
        />
      </div>
      <div className="tl-titlebar__title" style={{ color: textColor }} data-tauri-drag-region>
        TickList
      </div>
    </div>
  );
};

export default TitleBar;
```

创建 `frontend/src/components/TitleBar.less`：

```less
.tl-titlebar {
  position: relative;
  flex: 0 0 40px;
  height: 40px;
  display: flex;
  align-items: center;
  z-index: 1000;
  user-select: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  html[data-theme='dark'] & {
    border-bottom-color: rgba(255, 255, 255, 0.08);
  }
}

.tl-titlebar__lights {
  display: flex;
  gap: 8px;
  padding-left: 12px;
  z-index: 1; // 高于拖动区，保证按钮可点击
}

.tl-light {
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  line-height: 1;

  &::after {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    color: rgba(0, 0, 0, 0.5);
    opacity: 0;
  }

  &:hover::after {
    opacity: 1;
  }
}

.tl-light--close {
  background: #ff5f57;
  &::after { content: '\00d7'; } // ×
}
.tl-light--min {
  background: #febc2e;
  &::after { content: '\2212'; } // −
}
.tl-light--max {
  background: #28c840;
  &::after { content: '\002b'; } // +
}

.tl-titlebar__title {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  pointer-events: none; // 交给整条标题栏的拖动区处理
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && bun run test:run src/components/TitleBar.test.tsx`
Expected: PASS（全部用例通过）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TitleBar.tsx frontend/src/components/TitleBar.less frontend/src/components/TitleBar.test.tsx
git commit -m "feat(desktop): add themed TitleBar component with traffic-light controls"
```

---

### Task 4: 挂载标题栏 + 布局高度适配

**Files:**
- Modify: `frontend/src/App.tsx`（引入并渲染 `<TitleBar>`，用 `.app-content` 包裹 `Routes`）
- Modify: `frontend/src/index.less:20-24`（`#root` 改为纵向 flex + 新增 `.app-content`）
- Modify: `frontend/src/styles/glass.less:357`（`.auth-page` 高度 `100dvh` → `100%`）

**Interfaces:**
- Consumes: Task 3 的 `TitleBar`（default export，props `{ primaryColor, isDark }`）；`App.tsx` 作用域内已有的 `primaryColor` / `isDark` state（见 `App.tsx:280` 的 `ThemeContext.Provider value`）。
- Produces: 标题栏挂在所有页面顶部；内容区在标题栏下方且不被裁切。

- [ ] **Step 1: App.tsx 引入并挂载 TitleBar**

在 `frontend/src/App.tsx` 顶部 import 区加入：

```tsx
import TitleBar from './components/TitleBar';
```

然后把渲染树里从 `<AntApp component={false}>` 到 `<Routes>` 外层结构（`App.tsx:276-280` 一带）改为在 `<AntdAppBridge />` 之后插入 `<TitleBar>`，并用 `.app-content` 包裹 `Suspense`：

```tsx
      <ThemeContext.Provider value={{ primaryColor, isDark, setTheme }}>
        <AntApp component={false}>
        <AntdAppBridge />
        <TitleBar primaryColor={primaryColor} isDark={isDark} />
        <div className="app-content">
        <FocusProvider>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}><Spin size="large" /></div>}>
        <Routes>
```

并在原 `Routes`/`Suspense`/`FocusProvider` 闭合处补上 `.app-content` 的闭合 `</div>`：

```tsx
        </Routes>
        </Suspense>
        </FocusProvider>
        </div>
        </AntApp>
      </ThemeContext.Provider>
```

（即：`TitleBar` 在 `FocusProvider` 之外、`.app-content` 之前；`.app-content` 包住 `FocusProvider`→`Suspense`→`Routes` 整体。）

- [ ] **Step 2: index.less 调整根布局**

编辑 `frontend/src/index.less`，把 `#root` 块（第 20-24 行）改为：

```less
#root {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
```

- [ ] **Step 3: glass.less 修正 auth-page 高度**

编辑 `frontend/src/styles/glass.less` 第 357 行，把 `.auth-page.ant-layout` 里的：

```less
  min-height: 100dvh;
```

改为：

```less
  min-height: 100%;
```

- [ ] **Step 4: 运行组件测试确保未回归**

Run: `cd frontend && bun run test:run src/components/TitleBar.test.tsx`
Expected: PASS（挂载改动不影响组件单测）。

- [ ] **Step 5: Web 构建冒烟校验**

Run: `cd frontend && bun run build`
Expected: 构建成功，无 TypeScript / less 报错。

- [ ] **Step 6: 桌面端端到端目视校验**

Run: `cd frontend && bun run desktop:dev`
Expected：
- 登录页 / 服务器配置页 / 主界面顶部都出现 40px 标题栏，内容未被遮挡、无 40px 溢出滚动。
- 拖动标题栏空白处可移动窗口；双击标题栏最大化/还原。
- 红灯隐藏到托盘、黄灯最小化、绿灯最大化切换；交通灯 hover 显示 × − + 符号。
- 进入设置页切换若干套主题（含亮色与暗色）：标题栏渐变主色与文字色随之变化。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/index.less frontend/src/styles/glass.less
git commit -m "feat(desktop): mount TitleBar and adapt layout height for borderless shell"
```

---

## Self-Review

**Spec coverage：**
- 自定义标题栏无边框 → Task 1（decorations:false）。
- macOS 交通灯 + 居中标题 → Task 3（组件）+ Task 4（挂载）。
- 淡主色渐变随主题/明暗 → Task 3 `titleBarBackground` + props，Task 4 端到端校验切换。
- 从 ThemeContext 取值而非 CSS 变量 → Task 4 以 props 传入 `primaryColor/isDark`（Global Constraints 已固化）。
- 系统托盘（显示/隐藏、退出）+ 左键切换 → Task 2。
- 关闭→最小化到托盘（红灯 hide + CloseRequested 拦截），退出真正结束 → Task 2 + Task 3（红灯 hide）。
- 三平台统一、Web 不渲染 → Task 3（`isTauri()` 返回 null）。
- 布局适配（内容不被遮挡）→ Task 4。
- 测试与验证 → 各任务的测试/目视校验步骤。

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码；权限名一处标注「按 schema 报错修正」为实操策略而非占位。

**Type consistency：** `titleBarBackground(primaryColor, isDark)`、`TitleBar` props `{ primaryColor, isDark }`、Rust `toggle_main_window(&AppHandle)`、菜单 id `toggle`/`quit`、窗口方法 `hide/minimize/toggleMaximize` 在 Task 2/3/4 中一致。
