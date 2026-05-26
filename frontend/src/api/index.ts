import axios from 'axios';
import { message, Modal } from 'antd';
import { getApiBaseUrl, isNativePlatform } from '../utils/platform';
import { isBookmarked, removeBookmark, getCurrentPath } from '../utils/bookmarks';

const api = axios.create({
  timeout: 30000,
});

// 请求拦截器
api.interceptors.request.use(
  (config) => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) {
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

// Refresh token 逻辑
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) {
      resolve(token);
    } else {
      reject(error);
    }
  });
  failedQueue = [];
}

function doLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refresh_token');
  if (isNativePlatform()) {
    window.location.replace('#/login');
  } else {
    window.location.href = '/login';
  }
  message.error('登录已过期，请重新登录');
}

export async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return null;
  try {
    const baseUrl = getApiBaseUrl();
    const res = await axios.post(`${baseUrl}/auth/refresh`, { refresh_token: refreshToken });
    const { token, refresh_token } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('refresh_token', refresh_token);
    return token;
  } catch {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    return null;
  }
}

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  async (error) => {
    if (axios.isCancel(error)) {
      return Promise.reject(error);
    }

    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        doLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await tryRefreshToken();
        if (newToken) {
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          processQueue(error, null);
          doLogout();
          return Promise.reject(error);
        }
      } catch (refreshError) {
        processQueue(refreshError, null);
        doLogout();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    } else if (error.response?.status === 404) {
      const currentPath = getCurrentPath();
      if (isBookmarked(currentPath)) {
        Modal.confirm({
          title: '资源不存在',
          content: '当前收藏的页面对应资源已不存在，是否删除该收藏？',
          okText: '删除收藏',
          cancelText: '保留',
          okButtonProps: { danger: true },
          onOk: () => {
            removeBookmark(currentPath);
            message.success('已删除收藏');
          },
        });
      }
      if (error.response?.data?.message) {
        message.error(error.response.data.message);
      }
    } else if (error.response?.data?.message) {
      message.error(error.response.data.message);
    } else {
      message.error('请求失败，请稍后重试');
    }
    return Promise.reject(error);
  }
);

export default api;
