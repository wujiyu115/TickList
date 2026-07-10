#!/usr/bin/env node
/**
 * TickList 截图助手 —— 用系统 Chrome 驱动真实运行的前端，供视觉自查。
 *
 * 用法：
 *   node scripts/shot.mjs <url> [outfile] [options-json]
 *
 * 环境变量（可选，用于自动登录后再截图）：
 *   TL_USER, TL_PASS   —— 登录用户名/密码（在 /login 自动填写并提交）
 *   TL_TOKEN           —— 直接注入 localStorage 的 token（跳过登录表单）
 *   TL_BASE            —— 前端地址前缀，默认 http://localhost:5000
 *
 * 例：
 *   TL_USER=admin TL_PASS=xxx node scripts/shot.mjs / /tmp/tasks.png
 *   node scripts/shot.mjs /pomodoro /tmp/pomo.png '{"theme":"dark","width":1440}'
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';

// WSL2/无 GUI 环境：系统缺 libgbm 等库时，用本地解压的补充库目录（见 SKILL.md）。
const extraLibs = path.join(os.homedir(), '.cache/ticklist-pwlibs');
if (fs.existsSync(extraLibs)) {
  process.env.LD_LIBRARY_PATH = process.env.LD_LIBRARY_PATH
    ? `${extraLibs}:${process.env.LD_LIBRARY_PATH}`
    : extraLibs;
}

const [, , urlArg = '/', outFile = '/tmp/ticklist-shot.png', optsArg = '{}'] = process.argv;
const opts = JSON.parse(optsArg);
const base = process.env.TL_BASE || 'http://localhost:5000';
const url = urlArg.startsWith('http') ? urlArg : base.replace(/\/$/, '') + urlArg;
const width = opts.width || 1440;
const height = opts.height || 900;

// 默认用 Playwright 自带 Chromium（WSL2 无系统 Chrome）；
// 设 TL_CHROME_CHANNEL=chrome 可切回系统 Chrome。
const channel = process.env.TL_CHROME_CHANNEL;
const browser = await chromium.launch(channel ? { channel } : {});
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: opts.dpr || 1 });
const page = await ctx.newPage();

// 可选：直接注入 token 跳过登录
if (process.env.TL_TOKEN) {
  await page.goto(base);
  await page.evaluate((t) => localStorage.setItem('token', t), process.env.TL_TOKEN);
}

await page.goto(url, { waitUntil: 'networkidle' });

// 可选：自动登录
if (process.env.TL_USER && (await page.locator('input').first().count())) {
  const isLogin = /login/.test(page.url()) || (await page.getByText('登录', { exact: false }).count());
  if (isLogin) {
    try {
      await page.fill('input[type="text"], input:not([type="password"]):visible', process.env.TL_USER, { timeout: 3000 });
      await page.fill('input[type="password"]', process.env.TL_PASS, { timeout: 3000 });
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');
    } catch (e) {
      console.warn('自动登录跳过：', e.message);
    }
  }
}

if (opts.theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), opts.theme);
}
if (opts.waitMs) await page.waitForTimeout(opts.waitMs);

await page.screenshot({ path: outFile, fullPage: !!opts.fullPage });
console.log('saved', outFile, `(${width}x${height}) <- ${url}`);
await browser.close();
