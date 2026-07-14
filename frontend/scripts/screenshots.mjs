// 用 Playwright 以 admin 账户登录 TickList，抓取各主要界面 × 桌面/移动端 × 深色/浅色截图。
// 用法：ADMIN_USER=xxx ADMIN_PASS=yyy node scripts/screenshots.mjs
// 依赖：应用需在 BASE_URL（默认 http://localhost:5000）运行；chromium 已由 playwright 安装。
// 造演示数据见 scripts/seed.mjs，先跑 seed 再跑本脚本，界面才不空。
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const USER = process.env.ADMIN_USER;
const PASS = process.env.ADMIN_PASS;
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../img');

if (!USER || !PASS) {
  console.error('缺少凭据：请设置 ADMIN_USER 和 ADMIN_PASS 环境变量');
  process.exit(1);
}

// 主题：浅色 default / 深色 dark（通过拦截 /api/settings 强制，不改服务端数据）
const THEMES = [
  { key: 'default', mode: 'light' },
  { key: 'dark', mode: 'dark' },
];
const DEVICES = [
  { name: 'desktop', viewport: { width: 1440, height: 900 }, dsf: 2, isMobile: false },
  { name: 'mobile', viewport: { width: 390, height: 844 }, dsf: 3, isMobile: true },
];
// 要截图的界面。path 为路由，afterNav 可选：进入后额外操作（如点开第一条笔记）。
const SECTIONS = [
  { name: 'task', path: '/' },
  { name: 'calendar', path: '/calendar' },
  { name: 'pomodoro', path: '/pomodoro' },
  { name: 'counter', path: '/counter' },
  { name: 'countdown', path: '/countdown' },
  { name: 'note', path: '/notes', afterNav: openFirstNote },
  { name: 'settings', path: '/settings' },
];

// 笔记页：点开演示笔记「产品设计要点」，让编辑器有整洁内容（桌面三栏 / 移动端进入编辑）。
async function openFirstNote(page) {
  try {
    const item = page.getByText('产品设计要点', { exact: true }).first();
    await item.waitFor({ timeout: 4000 });
    await item.click();
    await page.waitForTimeout(1200);
  } catch {
    /* 无该笔记则跳过 */
  }
}

async function settle(page, theme) {
  // 隐藏全局 toast/通知层，避免"登录成功/请求失败"浮层入镜
  await page.addStyleTag({ content: '.ant-message,.ant-notification{display:none!important}' });
  await page.waitForFunction(
    (m) => document.documentElement.getAttribute('data-theme') === m,
    theme.mode,
    { timeout: 10000 },
  );
  await page.waitForTimeout(1800); // 让景深光晕/动效/数据加载稳定
}

async function shootDevice(browser, device) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: device.viewport,
      deviceScaleFactor: device.dsf,
      isMobile: device.isMobile,
      hasTouch: device.isMobile,
    });
    const page = await context.newPage();

    // 强制主题：重写 GET /api/settings 响应里的 theme 字段
    await page.route('**/api/settings', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      try {
        const resp = await route.fetch();
        const json = await resp.json();
        json.theme = theme.key;
        await route.fulfill({ response: resp, json });
      } catch {
        await route.continue();
      }
    });

    // 登录一次（token 存 localStorage，后续跳转复用）
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.fill('#login_username', USER);
    await page.fill('#login_password', PASS);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.status() < 400),
      page.click('button[type="submit"]'),
    ]);
    await page.waitForSelector('.main-layout', { timeout: 15000 });

    for (const section of SECTIONS) {
      await page.goto(BASE_URL + section.path, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.main-layout', { timeout: 15000 });
      await settle(page, theme);
      if (section.afterNav) await section.afterNav(page);
      const file = path.join(OUT_DIR, `${section.name}-${device.name}-${theme.mode}.png`);
      await page.screenshot({ path: file });
      console.log('saved', file);
    }

    await context.close();
  }
}

const browser = await chromium.launch();
try {
  for (const device of DEVICES) {
    await shootDevice(browser, device);
  }
} finally {
  await browser.close();
}
