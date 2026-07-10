---
name: ticklist-visual-check
description: Use to visually verify TickList frontend UI/CSS changes by driving the real running app (or a static harness) with Playwright + system Chrome and screenshotting — instead of asking the user to screenshot. Use whenever a change affects appearance (theme, glass, layout, colors, components).
---

# TickList Visual Check (Playwright)

Screenshot the TickList frontend yourself so you can iterate on visual changes without asking the user for screenshots.

Playwright is installed as a devDependency in `frontend/`. It uses the **system Google Chrome** (`channel: 'chrome'`) — the bundled browser download is not required.

## Option A — real running app (preferred for real data / interactions)

Requires the dev servers running: backend (`cd backend && .venv/bin/python app.py` or the project's run command) and frontend (`cd frontend && npm run dev`, serves http://localhost:5000).

```bash
cd frontend
# with auto-login (fills the /login form):
TL_USER=<user> TL_PASS=<pass> node scripts/shot.mjs / /tmp/tasks.png
# or inject an existing token to skip login:
TL_TOKEN=<jwt> node scripts/shot.mjs /pomodoro /tmp/pomo.png
# force a theme + custom viewport:
node scripts/shot.mjs /countdown /tmp/cd.png '{"theme":"dark","width":1440,"waitMs":600}'
```

Then read the PNG with the Read tool. Args: `<url> [outfile] [opts-json]`. Opts: `theme` ('dark'|'light'), `width`, `height`, `dpr`, `fullPage`, `waitMs`. Env: `TL_BASE` (default http://localhost:5000), `TL_USER`/`TL_PASS`, `TL_TOKEN`.

Ask the user for test credentials (or a token) if you don't have them; do not guess.

## Option B — static style harness (fast, no backend/auth)

For pure CSS/theme iteration, compile the LESS and render a static page with the real class names + real antd CSS-var values (see the spaceglass/dark tokens in `frontend/src/App.tsx` `THEME_COLORS`). This is how the glass redesign was verified.

```bash
cd frontend
./node_modules/.bin/lessc src/styles/glass.less /tmp/prev/glass.css
./node_modules/.bin/lessc src/components/TaskItem.less /tmp/prev/taskitem.css
# author /tmp/prev/index.html: set :root/[data-theme=dark] --ant-color-* vars,
# render .main-layout > .app-sider + .main-content > .task-page with .task-item-new,
# <link> the two compiled CSS files, then:
node scripts/shot.mjs "file:///tmp/prev/index.html" /tmp/prev/shot.png
```

## Notes
- Always Read the resulting PNG to confirm the change before committing/pushing.
- backdrop-filter (glass blur) renders under `channel: 'chrome'`; avoid `--disable-gpu`.
- Keep harness token values in sync with `THEME_COLORS` in `App.tsx`.
