import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  normalizeApiUrl,
  isNativePlatform,
  getApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrl,
  testApiHealth,
} from '../platform';

describe('platform utils', () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as any).Capacitor;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeApiUrl', () => {
    it('移除末尾斜杠', () => {
      expect(normalizeApiUrl('https://example.com/api/')).toBe('https://example.com/api');
      expect(normalizeApiUrl('https://example.com/api///')).toBe('https://example.com/api');
    });

    it('裁剪首尾空白', () => {
      expect(normalizeApiUrl('  https://example.com/api  ')).toBe('https://example.com/api');
    });

    it('空字符串返回空串', () => {
      expect(normalizeApiUrl('')).toBe('');
      expect(normalizeApiUrl('   ')).toBe('');
    });
  });

  describe('isNativePlatform', () => {
    it('默认环境返回 false', () => {
      expect(isNativePlatform()).toBe(false);
    });

    it('Capacitor 注入后返回 true', () => {
      (window as any).Capacitor = { isNativePlatform: () => true };
      expect(isNativePlatform()).toBe(true);
    });

    it('兼容旧版 isNative 字段', () => {
      (window as any).Capacitor = { isNative: true };
      expect(isNativePlatform()).toBe(true);
    });
  });

  describe('getApiBaseUrl (Web)', () => {
    it('Web 端始终返回 /api', () => {
      expect(getApiBaseUrl()).toBe('/api');
    });

    it('Web 端忽略 localStorage 中的值', () => {
      localStorage.setItem('api_server_url', 'https://foo.com/api');
      expect(getApiBaseUrl()).toBe('/api');
    });
  });

  describe('Native 行为', () => {
    beforeEach(() => {
      (window as any).Capacitor = { isNativePlatform: () => true };
    });

    it('未配置时 getApiBaseUrl 返回 null', () => {
      expect(getApiBaseUrl()).toBeNull();
    });

    it('setApiBaseUrl 写入并可回读（自动 normalize）', () => {
      setApiBaseUrl('https://api.example.com/api///');
      expect(localStorage.getItem('api_server_url')).toBe('https://api.example.com/api');
      expect(getApiBaseUrl()).toBe('https://api.example.com/api');
    });

    it('setApiBaseUrl 空值不写入', () => {
      setApiBaseUrl('   ');
      expect(localStorage.getItem('api_server_url')).toBeNull();
    });

    it('clearApiBaseUrl 清除存储', () => {
      setApiBaseUrl('https://api.example.com/api');
      clearApiBaseUrl();
      expect(localStorage.getItem('api_server_url')).toBeNull();
      expect(getApiBaseUrl()).toBeNull();
    });
  });

  describe('Web 端写入限制', () => {
    it('Web 端 setApiBaseUrl 不写入', () => {
      setApiBaseUrl('https://foo.com/api');
      expect(localStorage.getItem('api_server_url')).toBeNull();
    });

    it('Web 端 clearApiBaseUrl 不影响 localStorage', () => {
      localStorage.setItem('api_server_url', 'https://bar.com/api');
      clearApiBaseUrl();
      expect(localStorage.getItem('api_server_url')).toBe('https://bar.com/api');
    });
  });

  describe('testApiHealth', () => {
    it('空 URL 返回 false', async () => {
      const ok = await testApiHealth('');
      expect(ok).toBe(false);
    });

    it('2xx 响应返回 true', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const ok = await testApiHealth('https://example.com/api');
      expect(ok).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/api/health',
        expect.objectContaining({ method: 'GET', credentials: 'omit' })
      );
    });

    it('非 2xx 返回 false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
      const ok = await testApiHealth('https://example.com/api');
      expect(ok).toBe(false);
    });

    it('网络错误返回 false', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
      const ok = await testApiHealth('https://example.com/api');
      expect(ok).toBe(false);
    });
  });
});
