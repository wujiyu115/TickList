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
 * 判断当前 Tauri 桌面平台是否为 macOS。
 * macOS 交通灯放左侧（红/黄/绿），Windows / Linux 放右侧。
 * 通过 navigator.userAgent 判定，Tauri WebView 的 UA 含平台标识（Macintosh / Windows / Linux）。
 */
export const isMacTitleBar = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.userAgent || '');
};

interface LightDef {
  cls: string;
  label: string;
  onClick: (win: ReturnType<typeof getCurrentWindow>) => void;
}

const LIGHTS: Record<'close' | 'min' | 'max', LightDef> = {
  close: { cls: 'tl-light--close', label: '关闭', onClick: (win) => win.hide() },
  min: { cls: 'tl-light--min', label: '最小化', onClick: (win) => win.minimize() },
  max: { cls: 'tl-light--max', label: '最大化', onClick: (win) => win.toggleMaximize() },
};

/**
 * 桌面端自定义标题栏。仅在 Tauri 环境渲染；Web 端返回 null。
 * 颜色从主题（primaryColor / isDark）直接取值，随主题切换自动重渲染。
 *
 * 按钮布局随平台切换：
 * - macOS：左侧，顺序 close / min / max（红黄绿）
 * - Windows / Linux：右侧，顺序 min / max / close（黄绿红，关闭在最右）
 */
const TitleBar: React.FC<TitleBarProps> = ({ primaryColor, isDark }) => {
  if (!isTauri()) return null;

  const win = getCurrentWindow();
  const textColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.72)';

  const onMac = isMacTitleBar();
  const order = onMac
    ? [LIGHTS.close, LIGHTS.min, LIGHTS.max]
    : [LIGHTS.min, LIGHTS.max, LIGHTS.close];
  const side = onMac ? 'left' : 'right';

  return (
    <div
      className={`tl-titlebar tl-titlebar--${side}`}
      style={{ background: titleBarBackground(primaryColor, isDark) }}
      data-tauri-drag-region
    >
      <div className="tl-titlebar__lights">
        {order.map((l) => (
          <button
            key={l.cls}
            type="button"
            className={`tl-light ${l.cls}`}
            aria-label={l.label}
            onClick={() => l.onClick(win)}
          />
        ))}
      </div>
      <div className="tl-titlebar__title" style={{ color: textColor }} data-tauri-drag-region>
        TickList
      </div>
    </div>
  );
};

export default TitleBar;
