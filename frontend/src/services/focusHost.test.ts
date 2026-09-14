import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FocusShieldBridge, HostState } from './focusHost';

// Each case intentionally reloads the document-lifetime adapter after injection;
// static imports would capture the test runner's original window instead.

const idle: HostState = { phase: 'idle', canStart: true, remainingSeconds: null, cooldownSeconds: 0, refreshRevision: 0 };
const inject = (value: unknown) => Object.defineProperty(window, 'FocusShield', { value, configurable: true });
const makeBridge = (): FocusShieldBridge => ({
  version: 1, ready: vi.fn(async () => idle), getState: vi.fn(async () => idle),
  startFocus: vi.fn(async () => ({ ...idle, phase: 'focusing' as const, canStart: false })),
  subscribe: vi.fn(() => vi.fn()),
});

beforeEach(() => {
  vi.resetModules();
  window.history.replaceState({}, '', '/');
  Reflect.deleteProperty(window, 'FocusShield');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  Reflect.deleteProperty(window, 'Capacitor');
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'FocusShield');
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
  Reflect.deleteProperty(window, 'Capacitor');
  window.history.replaceState({}, '', '/');
});

describe('FocusShield v1 explicit adapter', () => {
  it('captures query before router changes and never mistakes the remote child for desktop/mobile', async () => {
    window.history.replaceState({}, '', '/?focus_host=focusshield');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    Object.defineProperty(window, 'Capacitor', { value: { isNativePlatform: () => true }, configurable: true });
    localStorage.setItem('api_server_url', 'https://wrong.example/api');
    const host = await import('./focusHost');
    const platform = await import('../utils/platform');
    window.history.replaceState({}, '', '/pomodoro');
    expect(host.isFocusShieldHost()).toBe(true);
    expect(platform.isTauri()).toBe(false);
    expect(platform.isNativePlatform()).toBe(false);
    expect(platform.usesRemoteServer()).toBe(false);
    expect(platform.getApiBaseUrl()).toBe('/api');
    await expect(host.readyFocusHost()).rejects.toThrow('桥接不可用');
  });

  it('detects an injected bridge without query, handshakes once and generates a fresh canonical request UUID', async () => {
    const bridge = makeBridge();
    inject(bridge);
    const randomUUID = vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const host = await import('./focusHost');
    expect(host.isFocusShieldHost()).toBe(true);
    await Promise.all([host.readyFocusHost(), host.readyFocusHost()]);
    await host.getFocusHostState('web-user');
    await host.startHostFocus('web-user', 'task-1');
    await host.startHostFocus('web-user', 'task-2');
    expect(bridge.ready).toHaveBeenCalledTimes(1);
    expect(bridge.getState).toHaveBeenCalledWith('web-user');
    expect(bridge.startFocus).toHaveBeenNthCalledWith(1, { userId: 'web-user', taskId: 'task-1', requestId: '11111111-1111-4111-8111-111111111111' });
    expect(bridge.startFocus).toHaveBeenNthCalledWith(2, { userId: 'web-user', taskId: 'task-2', requestId: '22222222-2222-4222-8222-222222222222' });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it('uses strong random RFC4122 v4 IDs when HTTP does not expose randomUUID', async () => {
    const bridge = makeBridge();
    inject(bridge);
    const descriptor = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    const random = vi.spyOn(crypto, 'getRandomValues');
    try {
      const host = await import('./focusHost');
      await host.startHostFocus('user', 'task');
      await host.startHostFocus('user', 'task');
      const requests = vi.mocked(bridge.startFocus).mock.calls.map(([request]) => request.requestId);
      expect(requests[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(requests[1]).not.toBe(requests[0]);
      expect(random).toHaveBeenCalledTimes(2);
    } finally {
      if (descriptor) Object.defineProperty(crypto, 'randomUUID', descriptor);
      else Reflect.deleteProperty(crypto, 'randomUUID');
    }
  });

  it.each([undefined, { version: 2 }, { version: 1 }])('fails closed for absent or incompatible bridge %j', async bridge => {
    window.history.replaceState({}, '', '/?focus_host=focusshield');
    if (bridge) inject(bridge);
    const host = await import('./focusHost');
    await expect(host.readyFocusHost()).rejects.toThrow();
    await expect(host.startHostFocus('user', 'task')).rejects.toThrow();
    expect(host.isFocusShieldHost()).toBe(true);
  });

  it('times out a non-responsive ready handshake without enabling standalone mode', async () => {
    vi.useFakeTimers();
    const bridge = makeBridge();
    vi.mocked(bridge.ready).mockReturnValue(new Promise(() => {}));
    inject(bridge);
    const host = await import('./focusHost');
    const rejected = expect(host.readyFocusHost()).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(host.isFocusShieldHost()).toBe(true);
  });

  it('validates subscription projection and ignores queued events after unsubscribe', async () => {
    const bridge = makeBridge();
    let emit!: (state: HostState) => void;
    const unsubscribe = vi.fn();
    vi.mocked(bridge.subscribe).mockImplementation(listener => { emit = listener; return unsubscribe; });
    inject(bridge);
    const host = await import('./focusHost');
    await host.readyFocusHost();
    const listener = vi.fn();
    const error = vi.fn();
    const cleanup = host.subscribeFocusHost(listener, error);
    emit({ ...idle, remainingSeconds: -1 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    emit(idle);
    cleanup();
    emit({ ...idle, refreshRevision: 1 });
    expect(listener).toHaveBeenCalledExactlyOnceWith(idle);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps ordinary browser, project desktop and mobile platform behavior', async () => {
    const host = await import('./focusHost');
    const platform = await import('../utils/platform');
    expect(host.isFocusShieldHost()).toBe(false);
    expect(platform.getApiBaseUrl()).toBe('/api');
    Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true });
    expect(platform.isTauri()).toBe(true);
    expect(platform.usesRemoteServer()).toBe(true);
    expect(platform.getApiBaseUrl()).toBeNull();
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    Object.defineProperty(window, 'Capacitor', { value: { isNativePlatform: () => true }, configurable: true });
    expect(platform.isNativePlatform()).toBe(true);
    platform.setApiBaseUrl('https://mobile.example/api/');
    expect(platform.getApiBaseUrl()).toBe('https://mobile.example/api');
  });
});
