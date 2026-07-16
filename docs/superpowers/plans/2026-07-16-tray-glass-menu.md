# 托盘磨砂菜单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用无边框透明 webview 弹窗替换 Tauri 原生托盘菜单，使托盘右键菜单跟随应用主题配色并呈现半透白霜磨砂效果。

**Architecture:** 托盘右键点击时，Rust 侧定位并显示一个预建的隐藏透明窗口 `tray-menu`；该窗口加载前端 `index.html#tray`，前端入口检测到 `#tray` 只渲染轻量 `<TrayMenu/>`（不挂载 App/Router）。TrayMenu 读 `localStorage.theme_key`，套 antd `ConfigProvider` + `data-theme`，用 glass.less 的白霜 token 渲染两个菜单项，点击经 `invoke` 调 Rust 命令并隐藏窗口。

**Tech Stack:** Tauri v2（tray-icon），React + antd，rsbuild，vitest，less。

## Global Constraints

- 构建：`rsbuild`（`bun run build`）；测试：`vitest`（`bunx vitest --run`）。
- Tauri v2；目标平台以 **Windows** 为主（透明窗在 Windows/WebView2 直接可用；macOS 透明需 `macos-private-api`，本次不涉及）。
- 菜单项固定两项：`显示/隐藏窗口`、`退出`（保持现有能力，不扩充）。
- 磨砂用 **CSS 白霜膜**，复用 `src/styles/glass.less` 的 token（`--tl-glass`/`--tl-glass-hover`/`--tl-blur`/`--tl-sat`/`--tl-shadow`/`--tl-edge`/`--tl-edge-soft`/`--tl-card-radius`），不引入 `window-vibrancy`。
- 主色作用域：`--ant-color-primary` 仅在 antd css-var 作用域内解析；玻璃容器必须裹在 `ConfigProvider` 内层。
- `invoke` 从 `@tauri-apps/api/core` 引入。
- 左键点击托盘图标行为不变（切换主窗口显隐）。

---

### Task 1: 抽取主题配色表到独立模块

把 `App.tsx` 内的 `THEME_COLORS` 与 `ThemeConfig` 移到共享模块，供 App 与 TrayMenu 复用，并新增回退 helper。

**Files:**
- Create: `frontend/src/theme/themeColors.ts`
- Create: `frontend/src/theme/themeColors.test.ts`
- Modify: `frontend/src/App.tsx`（删除本地 `ThemeConfig`/`THEME_COLORS` 定义，改为 import）

**Interfaces:**
- Produces:
  - `interface ThemeConfig { color: string; isDark: boolean; token?: Record<string, string>; }`
  - `const THEME_COLORS: Record<string, ThemeConfig>`（40 套配色，从 App.tsx 原样迁移）
  - `function resolveTheme(key: string): ThemeConfig`（未知 key 回退 `THEME_COLORS.default`）

- [ ] **Step 1: 写失败测试**

`frontend/src/theme/themeColors.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { resolveTheme, THEME_COLORS } from './themeColors';

describe('resolveTheme', () => {
  it('已知 key 返回对应配色', () => {
    expect(resolveTheme('default').color).toBe('#1677ff');
  });
  it('未知 key 回退到 default', () => {
    expect(resolveTheme('does-not-exist')).toBe(THEME_COLORS.default);
  });
  it('含 40 套配色', () => {
    expect(Object.keys(THEME_COLORS).length).toBe(40);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && bunx vitest --run src/theme/themeColors.test.ts`
Expected: FAIL —— 无法解析模块 `./themeColors`。

- [ ] **Step 3: 创建 themeColors.ts**

从 `App.tsx` 剪切 `ThemeConfig` 接口与整个 `THEME_COLORS` 对象（App.tsx 第 26-110 行，40 套配色）原样粘入新文件，追加 `resolveTheme`。文件结构：

```ts
// 配色方案映射（原 App.tsx 内定义，抽出供 App 与托盘菜单共用）
export interface ThemeConfig {
  color: string;
  isDark: boolean;
  token?: Record<string, string>;
}

export const THEME_COLORS: Record<string, ThemeConfig> = {
  // ↓↓↓ 从 App.tsx 原样迁移的 40 套配色（default/sky/.../ 深色系）↓↓↓
  default: { color: '#1677ff', isDark: false },
  // ... 其余 39 套保持不变 ...
};

/** 按 key 取配色；未知 key 回退 default。 */
export function resolveTheme(key: string): ThemeConfig {
  return THEME_COLORS[key] || THEME_COLORS.default;
}
```

- [ ] **Step 4: 改 App.tsx 引用共享模块**

删除 App.tsx 内的 `interface ThemeConfig {...}` 与 `const THEME_COLORS = {...}`（第 26-110 行），在 import 区加：

```ts
import { THEME_COLORS } from './theme/themeColors';
```

App.tsx 其余对 `THEME_COLORS[...]` 的引用保持不变。

- [ ] **Step 5: 运行测试确认通过 + 全量测试无回归**

Run: `cd frontend && bunx vitest --run src/theme/themeColors.test.ts`
Expected: PASS（3 项）。

Run: `cd frontend && bunx vitest --run`
Expected: 全部 PASS（含既有 TitleBar 测试）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/theme/themeColors.ts frontend/src/theme/themeColors.test.ts frontend/src/App.tsx
git commit -m "refactor(theme): extract THEME_COLORS to shared module with resolveTheme"
```

---

### Task 2: TrayMenu 组件 + 磨砂样式

新建托盘菜单 React 组件与白霜磨砂样式，点击项调用 Rust 命令。

**Files:**
- Create: `frontend/src/components/TrayMenu.tsx`
- Create: `frontend/src/components/TrayMenu.less`
- Create: `frontend/src/components/TrayMenu.test.tsx`

**Interfaces:**
- Consumes: `resolveTheme` from `../theme/themeColors`（Task 1）。
- Produces: `TrayMenu`（default export）；触发命令名 `tray_toggle_window`、`tray_quit`（Task 4 在 Rust 实现同名命令）。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/TrayMenu.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrayMenu from './TrayMenu';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => invoke(...args) }));

beforeEach(() => {
  invoke.mockClear();
  localStorage.setItem('theme_key', 'default');
});

describe('TrayMenu', () => {
  it('渲染显示/隐藏与退出两项', () => {
    render(<TrayMenu />);
    expect(screen.getByText('显示/隐藏窗口')).toBeTruthy();
    expect(screen.getByText('退出')).toBeTruthy();
  });
  it('点击显示/隐藏调用 tray_toggle_window', () => {
    render(<TrayMenu />);
    fireEvent.click(screen.getByText('显示/隐藏窗口'));
    expect(invoke).toHaveBeenCalledWith('tray_toggle_window');
  });
  it('点击退出调用 tray_quit', () => {
    render(<TrayMenu />);
    fireEvent.click(screen.getByText('退出'));
    expect(invoke).toHaveBeenCalledWith('tray_quit');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && bunx vitest --run src/components/TrayMenu.test.tsx`
Expected: FAIL —— 无法解析 `./TrayMenu`。

- [ ] **Step 3: 创建 TrayMenu.tsx**

```tsx
import React, { useEffect } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { resolveTheme } from '../theme/themeColors';
import './TrayMenu.less';

/**
 * 托盘弹窗菜单：独立 webview 窗口内渲染（index.html#tray）。
 * 读 localStorage 主题，套 ConfigProvider 使 --ant-color-* 解析，
 * 用 glass token 呈现白霜磨砂。
 */
const TrayMenu: React.FC = () => {
  const cfg = resolveTheme(localStorage.getItem('theme_key') || 'default');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', cfg.isDark ? 'dark' : 'light');
  }, [cfg.isDark]);

  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        token: { colorPrimary: cfg.color, borderRadius: 10, ...cfg.token },
        algorithm: cfg.isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <div className="tray-menu">
        <button className="tray-menu-item" onClick={() => invoke('tray_toggle_window')}>
          显示/隐藏窗口
        </button>
        <button className="tray-menu-item" onClick={() => invoke('tray_quit')}>
          退出
        </button>
      </div>
    </ConfigProvider>
  );
};

export default TrayMenu;
```

- [ ] **Step 4: 创建 TrayMenu.less（白霜磨砂）**

```less
/* 托盘磨砂菜单：复用 glass.less 的白霜 token。
   窗口透明，四周留透明外边距容纳 CSS 阴影（Rust 侧窗口比面板大一圈）。 */
html, body, #root {
  margin: 0;
  background: transparent !important;
  overflow: hidden;
}

.tray-menu {
  /* 距窗口边缘 16px：透明外边距，让 box-shadow 落在窗内不被裁切 */
  margin: 16px;
  padding: 6px;
  border-radius: var(--tl-card-radius);
  /* 半透明主题底 + 白霜膜（对齐全站浮层材质） */
  background-color: var(--ant-color-bg-layout);
  background-image: linear-gradient(0deg, var(--tl-glass), var(--tl-glass));
  backdrop-filter: blur(var(--tl-blur)) saturate(var(--tl-sat));
  -webkit-backdrop-filter: blur(var(--tl-blur)) saturate(var(--tl-sat));
  box-shadow: var(--tl-shadow);
  border: 1px solid var(--tl-edge-soft);
  display: flex;
  flex-direction: column;
  gap: 2px;
  user-select: none;
}

.tray-menu-item {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--ant-color-text);
  font-size: 13px;
  text-align: left;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.tray-menu-item:hover {
  background: var(--tl-glass-hover);
}
.tray-menu-item:active {
  transform: scale(0.98);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd frontend && bunx vitest --run src/components/TrayMenu.test.tsx`
Expected: PASS（3 项）。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/TrayMenu.tsx frontend/src/components/TrayMenu.less frontend/src/components/TrayMenu.test.tsx
git commit -m "feat(desktop): add themed frosted-glass TrayMenu component"
```

---

### Task 3: 前端入口按 #tray 分流

`index.tsx` 检测 `location.hash === '#tray'` 时只渲染 TrayMenu，绕过 App/Router。

**Files:**
- Modify: `frontend/src/index.tsx`

**Interfaces:**
- Consumes: `TrayMenu`（Task 2）。

- [ ] **Step 1: 改 index.tsx 分流渲染**

在 import 区加：

```ts
import TrayMenu from './components/TrayMenu';
```

把现有 `root.render(...)` 调用替换为分流（`glass.less` 已在文件顶部 import，托盘窗直接可用其 token）：

```tsx
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

if (window.location.hash === '#tray') {
  // 托盘弹窗：轻量入口，不挂 App/Router/业务 Provider
  root.render(
    <React.StrictMode>
      <TrayMenu />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ConfigProvider locale={zhCN}>
        <Router>
          <App />
        </Router>
      </ConfigProvider>
    </React.StrictMode>
  );
}
```

保留文件顶部 `if (isTauri()) { document.documentElement.classList.add('tl-tauri'); }` 不变。

- [ ] **Step 2: 构建确认无错**

Run: `cd frontend && bun run build`
Expected: 构建成功，无 TypeScript/打包错误。

- [ ] **Step 3: 全量测试无回归**

Run: `cd frontend && bunx vitest --run`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/index.tsx
git commit -m "feat(desktop): route index entry to TrayMenu on #tray hash"
```

---

### Task 4: Rust 托盘弹窗 —— 窗口、命令、事件

替换原生菜单为透明弹窗：预建隐藏窗、右键定位显示、命令执行后隐藏、失焦自动隐藏。

**Files:**
- Modify: `frontend/src-tauri/src/lib.rs`（整体重写）

**Interfaces:**
- Produces: `#[tauri::command] tray_toggle_window(app: AppHandle)`、`tray_quit(app: AppHandle)`（对应 Task 2 的 invoke 名）。
- Consumes: 前端 `index.html#tray` 入口（Task 3）。

- [ ] **Step 1: 重写 lib.rs**

```rust
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent,
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

/// 托盘弹窗窗口尺寸（含四周透明外边距，用于容纳 CSS 阴影）。
const TRAY_MENU_W: f64 = 240.0;
const TRAY_MENU_H: f64 = 140.0;

#[tauri::command]
fn tray_toggle_window(app: AppHandle) {
    toggle_main_window(&app);
    if let Some(w) = app.get_webview_window("tray-menu") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn tray_quit(app: AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![tray_toggle_window, tray_quit])
        .setup(|app| {
            // 预建隐藏的透明托盘弹窗，加载前端轻量入口 index.html#tray
            let _tray_window = WebviewWindowBuilder::new(
                app,
                "tray-menu",
                WebviewUrl::App("index.html#tray".into()),
            )
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .shadow(false)
            .visible(false)
            .inner_size(TRAY_MENU_W, TRAY_MENU_H)
            .build()?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| match event {
                    // 左键：切换主窗口（现状不变）
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        toggle_main_window(tray.app_handle());
                    }
                    // 右键：在光标附近弹出磨砂菜单窗
                    TrayIconEvent::Click {
                        button: MouseButton::Right,
                        button_state: MouseButtonState::Up,
                        position,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("tray-menu") {
                            // 菜单出现在光标左上方（Windows 托盘在右下，向上展开）
                            let x = position.x - TRAY_MENU_W;
                            let y = position.y - TRAY_MENU_H;
                            let _ = win.set_position(PhysicalPosition::new(x, y));
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // 主窗口关闭请求拦截为隐藏到托盘
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            // 托盘弹窗失焦自动隐藏
            WindowEvent::Focused(false) => {
                if window.label() == "tray-menu" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: 编译检查**

Run: `cd frontend/src-tauri && cargo check`
Expected: 编译通过（若 `TrayIconEvent::Click` 的 `position` 字段名或类型在当前 tauri 2.x 版本不符，据编译错误改用其暴露的字段——同版本 `position: PhysicalPosition<f64>`；`rect` 亦可作备选定位源）。

- [ ] **Step 3: 手动验证（打包版，规避 AppLocker os error 786）**

Run: `cd frontend && bun run desktop:build`（或 `desktop:dev` 若无 AppLocker 拦截）

逐项确认：
1. 左键点托盘图标 → 主窗口显隐切换（行为不变）。
2. 右键点托盘图标 → 光标附近弹出磨砂菜单，含「显示/隐藏窗口」「退出」两项。
3. 菜单背景为半透白霜、圆角、跟随当前主题主色与明暗。
4. 切换配色/明暗后重新右键 → 菜单配色随之更新。
5. 点「显示/隐藏窗口」→ 主窗切换且菜单关闭；点「退出」→ 应用退出。
6. 点菜单外任意处 → 菜单失焦自动隐藏。
7. 菜单不超出屏幕（贴近托盘图标）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src-tauri/src/lib.rs
git commit -m "feat(desktop): replace native tray menu with themed frosted-glass popup window"
```

---

## Self-Review

**Spec 覆盖：**
- Rust 移除原生菜单 / 右键定位 / 预建隐藏透明窗 / 两命令 / 失焦隐藏 → Task 4 ✓
- 前端轻量入口分流 → Task 3 ✓
- 抽 THEME_COLORS 共享 → Task 1 ✓
- TrayMenu 组件（读主题、ConfigProvider 内层、invoke）→ Task 2 ✓
- TrayMenu.less 白霜磨砂复用 glass token → Task 2 ✓
- 数据流 / 尺寸与定位（透明外边距、光标定位）→ Task 4 ✓
- 测试（resolveTheme、TrayMenu 组件、手动验证）→ Task 1/2/4 ✓
- 关键坑（主色作用域、同源 CORS、阴影裁切、AppLocker）→ 各任务代码与验证步骤已纳入 ✓

**占位符扫描：** 无 TBD/TODO；唯一"原样迁移"处（THEME_COLORS 40 套）是对既有代码的机械搬运，已给出明确来源行号与结构，非占位。

**类型一致性：** `resolveTheme`/`THEME_COLORS`/`ThemeConfig`（Task 1）与 Task 2 引用一致；invoke 命令名 `tray_toggle_window`/`tray_quit` 在 Task 2（前端）与 Task 4（Rust）一致；窗口 label `tray-menu` 在 Task 3/4 一致。
