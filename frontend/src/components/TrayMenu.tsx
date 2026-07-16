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
