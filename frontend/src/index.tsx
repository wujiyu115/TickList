import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import TrayMenu from './components/TrayMenu';
import { usesRemoteServer, isTauri } from './utils/platform';
import './index.less';
import './styles/glass.less';

// Native（Capacitor iOS/Android）/ 桌面（Tauri）端使用 HashRouter，因为内置协议不支持 history 模式
// Web 端保留 BrowserRouter 以维持现有路由与分享行为
const Router = usesRemoteServer() ? HashRouter : BrowserRouter;


export const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5000' 
  : '';

// Tauri 桌面端给根元素打标记，供 CSS 变量 --tl-titlebar-h 生效（须在首屏渲染前执行以避免闪现）
if (isTauri()) {
  document.documentElement.classList.add('tl-tauri');
}

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
