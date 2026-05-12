import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { isNativePlatform } from './utils/platform';
import './index.less';

// Native 端（Capacitor iOS/Android）使用 HashRouter，因为内置协议不支持 history 模式
// Web 端保留 BrowserRouter 以维持现有路由与分享行为
const Router = isNativePlatform() ? HashRouter : BrowserRouter;

// 动态计算浏览器底栏高度，解决移动端底部地址栏遮挡工具栏问题
// CSS 100vh 包含浏览器底栏区域，window.innerHeight 是真实可视高度，差值即底栏高度
const setBrowserBarHeight = () => {
  const measureEl = document.createElement('div');
  measureEl.style.cssText = 'position:fixed;top:0;height:100vh;pointer-events:none;';
  document.body.appendChild(measureEl);
  const fullVh = measureEl.offsetHeight;
  document.body.removeChild(measureEl);
  const diff = Math.max(0, fullVh - window.innerHeight);
  document.documentElement.style.setProperty('--browser-bar-height', `${diff}px`);
};
setBrowserBarHeight();
window.addEventListener('resize', setBrowserBarHeight);
window.addEventListener('orientationchange', () => setTimeout(setBrowserBarHeight, 100));

export const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:5000' 
  : '';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <Router>
        <App />
      </Router>
    </ConfigProvider>
  </React.StrictMode>
);
