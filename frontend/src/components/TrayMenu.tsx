import React, { useLayoutEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { invoke } from '@tauri-apps/api/core';
import { resolveTheme } from '../theme/themeColors';
import './TrayMenu.less';

/**
 * 托盘弹窗菜单：独立 webview 窗口内渲染（index.html#tray）。
 * 读 localStorage 主题，套 ConfigProvider 提供 token；
 * 内层用 theme.useToken() 取值内联，主题底色/文字色随主题变，
 * 叠加 glass token 呈现白霜磨砂。
 */
const TrayMenuInner: React.FC = () => {
  const { token } = theme.useToken();

  return (
    <div className="tray-menu" style={{ backgroundColor: token.colorBgLayout }}>
      <button
        className="tray-menu-item"
        style={{ color: token.colorText }}
        onClick={() => invoke('tray_toggle_window').catch(() => {})}
      >
        显示/隐藏窗口
      </button>
      <button
        className="tray-menu-item"
        style={{ color: token.colorText }}
        onClick={() => invoke('tray_quit').catch(() => {})}
      >
        退出
      </button>
    </div>
  );
};

const TrayMenu: React.FC = () => {
  const cfg = resolveTheme(localStorage.getItem('theme_key') || 'default');

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', cfg.isDark ? 'dark' : 'light');
  }, [cfg.isDark]);

  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        token: { colorPrimary: cfg.color, borderRadius: 10, ...cfg.token },
        algorithm: cfg.isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      }}
    >
      <TrayMenuInner />
    </ConfigProvider>
  );
};

export default TrayMenu;
