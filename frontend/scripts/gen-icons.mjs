/**
 * 从 resources/icon-only.svg 生成桌面端（Tauri）全套图标。
 *
 * 流程：
 * 1. 用 @resvg/resvg-js 将 svg 渲染为 1024×1024 png（带透明外角）
 * 2. 调 `tauri icon` 一键生成 32/128/128@2x/png/ico/icns 到 src-tauri/icons/
 *
 * 用法：bun run gen:icons
 * 图标很少变动，手动跑即可，不必接入每次构建。
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..'); // frontend/

const SIZE = 1024;
const svgPath = join(root, 'resources', 'icon-only.svg');
const pngPath = join(root, 'resources', 'icon-1024.png');

console.log(`渲染 ${svgPath} → ${pngPath} (${SIZE}×${SIZE})`);
const svg = readFileSync(svgPath, 'utf-8');
const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: SIZE } });
const pngBuffer = resvg.render().asPng();
writeFileSync(pngPath, pngBuffer);
console.log('✓ svg → png 完成');

// 转成 CLI 友好的正斜杠路径（Windows 下 tauri CLI 也能接受）
const pngCli = pngPath.replace(/\\/g, '/');
console.log(`调用 tauri icon ${pngCli}`);
execSync(`bun run tauri icon "${pngCli}"`, { cwd: root, stdio: 'inherit' });
console.log('✓ 桌面端全套图标已生成到 src-tauri/icons/');
