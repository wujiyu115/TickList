import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import { isNativePlatform } from './utils/platform';
import './index.less';
import './styles/glass.less';

// Native 端（Capacitor iOS/Android）使用 HashRouter，因为内置协议不支持 history 模式
// Web 端保留 BrowserRouter 以维持现有路由与分享行为
const Router = isNativePlatform() ? HashRouter : BrowserRouter;


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
