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
