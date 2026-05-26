import api from '../api/index';

const STORAGE_KEY = 'debug_log_enabled';

let enabled = localStorage.getItem(STORAGE_KEY) === 'true';

export function setRemoteLogEnabled(v: boolean) {
  enabled = v;
  localStorage.setItem(STORAGE_KEY, String(v));
}

export function isRemoteLogEnabled(): boolean {
  return enabled;
}

export async function remoteLog(tag: string, data: Record<string, unknown>) {
  if (!enabled) return;
  try {
    await api.post('/debug-logs', { tag, data });
  } catch { /* never block business logic */ }
}
