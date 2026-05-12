import axios from 'axios';
import { message } from 'antd';
import { getApiBaseUrl, isNativePlatform } from '../utils/platform';

// Web 端：走相对路径 '/api'（同端口）
// Native 端：baseURL 由用户在服务器配置页动态设置，运行时由请求拦截器读取
const api = axios.create({
  timeout: 30000,
});

// 请求拦截器：动态注入 baseURL + token；native 端未配置 API 地址时阻断请求并跳转配置页
api.interceptors.request.use(
  (config) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
      // 仅 Native 平台会走到这里（Web 端始终返回 '/api'）
      if (isNativePlatform() && !window.location.hash.includes('/server-config')) {
        window.location.replace('#/server-config?reason=missing');
      }
      return Promise.reject(new axios.Cancel('api_server_url not configured'));
    }
    config.baseURL = baseUrl;

    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    // 取消请求（例如 native 未配置 API 地址），静默返回
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      // native 端使用 hash 路由
      if (isNativePlatform()) {
        window.location.replace('#/login');
      } else {
        window.location.href = '/login';
      }
      message.error('登录已过期，请重新登录');
    } else if (error.response?.data?.message) {
      message.error(error.response.data.message);
    } else {
      message.error('请求失败，请稍后重试');
    }
    return Promise.reject(error);
  }
);

export default api;