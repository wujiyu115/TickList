export interface HostState {
  phase: 'idle' | 'focusing' | 'paused' | 'breaking' | 'reviewing';
  canStart: boolean;
  remainingSeconds: number | null;
  cooldownSeconds: number;
  refreshRevision: number;
}

export interface FocusShieldBridge {
  readonly version: 1;
  ready(): Promise<HostState>;
  getState(userId: string): Promise<HostState>;
  startFocus(request: { userId: string; taskId: string; requestId: string }): Promise<HostState>;
  subscribe(listener: (state: HostState) => void): () => void;
}

declare global {
  interface Window {
    readonly FocusShield?: FocusShieldBridge;
  }
}

// Capture before platform/router/provider initialization. Removing the query or
// losing a bridge must never enable the standalone timer in this document.
const hosted = typeof window !== 'undefined' && (
  new URLSearchParams(window.location.search).get('focus_host') === 'focusshield'
  || 'FocusShield' in window
);
export const isFocusShieldHost = (): boolean => hosted;
export const HOST_TASKS_REFRESH_EVENT = 'focusshield-tasks-refresh';
export const HOST_CONTROL_HINT = '专注由 FocusShield 管理，请回到本地 HUD 暂停、继续、结束或跳过休息。';

let bridge: FocusShieldBridge | undefined;
let readiness: Promise<HostState> | undefined;

function requireBridge(): FocusShieldBridge {
  if (!hosted) throw new Error('当前页面不在 FocusShield 宿主中');
  const candidate = bridge ?? window.FocusShield;
  if (!candidate) throw new Error('FocusShield 桥接不可用，请返回本地重新打开任务页面');
  if (candidate.version !== 1) throw new Error('FocusShield 桥接版本不兼容，请更新并重新打开页面');
  if (['ready', 'getState', 'startFocus', 'subscribe'].some(key => typeof candidate[key as keyof FocusShieldBridge] !== 'function')) {
    throw new Error('FocusShield 桥接不完整，请返回本地重新打开任务页面');
  }
  bridge = candidate;
  return candidate;
}

function validateState(state: HostState): HostState {
  if (!state || !['idle', 'focusing', 'paused', 'breaking', 'reviewing'].includes(state.phase)
    || typeof state.canStart !== 'boolean'
    || !(state.remainingSeconds === null || (Number.isFinite(state.remainingSeconds) && state.remainingSeconds >= 0))
    || !Number.isFinite(state.cooldownSeconds) || state.cooldownSeconds < 0
    || !Number.isSafeInteger(state.refreshRevision) || state.refreshRevision < 0) {
    throw new Error('FocusShield 返回了无效状态，请返回本地重新打开任务页面');
  }
  // Keep only the explicitly agreed projection; never retain arbitrary bridge data.
  return { phase: state.phase, canStart: state.canStart, remainingSeconds: state.remainingSeconds,
    cooldownSeconds: state.cooldownSeconds, refreshRevision: state.refreshRevision };
}

export function readyFocusHost(): Promise<HostState> {
  if (!readiness) {
    readiness = new Promise<HostState>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('FocusShield 握手超时，请返回本地重新打开任务页面')), 10000);
      Promise.resolve().then(() => requireBridge().ready()).then(validateState)
        .then(resolve, reject).finally(() => clearTimeout(timeout));
    });
  }
  return readiness;
}

export async function getFocusHostState(userId: string): Promise<HostState> {
  await readyFocusHost();
  if (!userId.trim()) throw new Error('请先登录 TickList');
  return validateState(await requireBridge().getState(userId));
}

export async function startHostFocus(userId: string, taskId: string): Promise<HostState> {
  await readyFocusHost();
  if (!userId.trim() || !taskId.trim()) throw new Error('请先登录并选择任务');
  let requestId: string;
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    requestId = crypto.randomUUID();
  } else {
    if (typeof globalThis.crypto?.getRandomValues !== 'function') throw new Error('当前环境无法安全创建专注请求，请返回本地重新打开页面');
    // HTTP intranet pages may lack randomUUID, but still expose Web Crypto.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return validateState(await requireBridge().startFocus({ userId, taskId, requestId }));
}

export function subscribeFocusHost(listener: (state: HostState) => void, onError?: (error: unknown) => void): () => void {
  let active = true;
  const unsubscribe = requireBridge().subscribe(state => {
    if (!active) return;
    try { listener(validateState(state)); } catch (error) { onError?.(error); }
  });
  if (typeof unsubscribe !== 'function') throw new Error('FocusShield 状态订阅不可用');
  return () => {
    active = false;
    unsubscribe();
  };
}
