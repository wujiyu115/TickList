/**
 * 平台判断与 API 服务器地址管理
 *
 * - Web 端：baseURL 固定为相对路径 '/api'
 * - iOS / Android（Capacitor）/ 桌面（Tauri）端：baseURL 由用户在运行时动态配置，存储在 localStorage
 */

const API_SERVER_URL_KEY = 'api_server_url';

/**
 * 判断当前是否运行在 Capacitor 原生容器（iOS / Android）中。
 * 兼容未安装 @capacitor/core 的场景——直接返回 false。
 *
 * 注意：仅用于 Capacitor 专属能力（如 LocalNotifications 插件）。
 * 判断"是否需要用户配置服务器地址"请用 usesRemoteServer()。
 */
export const isNativePlatform = (): boolean => {
  try {
    // 动态读取全局注入的 Capacitor 对象，避免强依赖
    const cap = (window as any)?.Capacitor;
    if (cap && typeof cap.isNativePlatform === 'function') {
      return !!cap.isNativePlatform();
    }
    // 兼容旧版：isNative 字段
    if (cap && typeof cap.isNative === 'boolean') {
      return cap.isNative;
    }
  } catch {
    // ignore
  }
  return false;
};

/**
 * 判断当前是否运行在 Tauri 桌面容器（Windows / macOS / Linux）中。
 * Tauri v2 会注入 window.__TAURI_INTERNALS__；旧版注入 window.__TAURI__。
 */
export const isTauri = (): boolean => {
  try {
    const w = window as any;
    return !!(w?.__TAURI_INTERNALS__ || w?.__TAURI__);
  } catch {
    return false;
  }
};

/**
 * 判断当前平台是否需要用户配置绝对 API 服务器地址（而非 Web 的相对 '/api'）。
 * Capacitor（移动端）与 Tauri（桌面端）都以内置协议加载静态资源，需连接远程后端。
 */
export const usesRemoteServer = (): boolean => isNativePlatform() || isTauri();

/**
 * 标准化 API URL：去除末尾斜杠，并确保非空。
 */
export const normalizeApiUrl = (raw: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
};

/**
 * 读取当前 API baseURL。
 *
 * - Web：返回 '/api'
 * - Native / 桌面：返回用户配置的绝对 URL，未配置时返回 null（由上层决定跳转配置页）
 */
export const getApiBaseUrl = (): string | null => {
  if (!usesRemoteServer()) {
    return '/api';
  }
  try {
    const value = localStorage.getItem(API_SERVER_URL_KEY);
    const normalized = value ? normalizeApiUrl(value) : '';
    return normalized || null;
  } catch {
    return null;
  }
};

/**
 * 保存用户配置的 API URL。仅在 Native / 桌面平台有意义，Web 端调用将被忽略。
 */
export const setApiBaseUrl = (url: string): void => {
  if (!usesRemoteServer()) return;
  const normalized = normalizeApiUrl(url);
  if (!normalized) return;
  try {
    localStorage.setItem(API_SERVER_URL_KEY, normalized);
  } catch {
    // ignore
  }
};

/**
 * 清除已配置的 API URL（例如切换服务器、登出后重置）。仅在 Native / 桌面平台生效。
 */
export const clearApiBaseUrl = (): void => {
  if (!usesRemoteServer()) return;
  try {
    localStorage.removeItem(API_SERVER_URL_KEY);
  } catch {
    // ignore
  }
};

/**
 * 测试一个候选 API URL 是否可用。使用 fetch 直接请求 /health，避免走 axios 的 baseURL 拦截。
 *
 * 返回 true 表示 2xx 响应（服务器在线），否则返回 false。
 */
export const testApiHealth = async (url: string, timeoutMs = 8000): Promise<boolean> => {
  const normalized = normalizeApiUrl(url);
  if (!normalized) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(`${normalized}/health`, {
      method: 'GET',
      signal: controller.signal,
      // 不带 credentials，降低 CORS preflight 概率
      credentials: 'omit',
    });
    return resp.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
