import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFocusSession, getFocusOverview, getFocusSessions } from '../focus';
import request from '../index';

const state = vi.hoisted(() => ({ hosted: true }));
vi.mock('../../services/focusHost', () => ({ isFocusShieldHost: () => state.hosted }));
vi.mock('../index', () => ({ default: { post: vi.fn(async () => ({ id: 'session' })), get: vi.fn(), delete: vi.fn() } }));
const session = { task_id: 'task', type: 'pomodoro' as const, duration: 1500, started_at: '2026-01-01T00:00:00Z', ended_at: '2026-01-01T00:25:00Z' };

beforeEach(() => { vi.clearAllMocks(); state.hosted = true; });

describe('focus API host write boundary', () => {
  it.each(['pomodoro', 'stopwatch'] as const)('rejects host %s writes before making a POST', async type => {
    await expect(createFocusSession({ ...session, type })).rejects.toThrow('只能由 FocusShield 保存');
    expect(request.post).not.toHaveBeenCalled();
  });

  it('keeps authenticated overview and history reads available', async () => {
    await getFocusOverview();
    await getFocusSessions({ page: 1 });
    expect(request.get).toHaveBeenCalledWith('/focus/overview');
    expect(request.get).toHaveBeenCalledWith('/focus/sessions', { params: { page: 1 } });
    expect(request.post).not.toHaveBeenCalled();
  });

  it('preserves standalone POST behavior', async () => {
    state.hosted = false;
    await createFocusSession(session);
    expect(request.post).toHaveBeenCalledExactlyOnceWith('/focus/sessions', session);
  });
});
