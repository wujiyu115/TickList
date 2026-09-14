import React from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { FocusProvider, useFocus } from '../FocusContext';
import { useTimer } from '../../hooks/useTimer';
import type { UseTimerReturn } from '../../hooks/useTimer';
import type { FocusContextValue } from '../FocusContext';
import type { HostState } from '../../services/focusHost';
import type { Task, User } from '../../types';
import { getCurrentUser } from '../../api/auth';
import { getTaskById, updateTask } from '../../api/task';
import { createFocusSession, getFocusOverview, getFocusSessions } from '../../api/focus';
import { getFocusHostState, readyFocusHost, startHostFocus, subscribeFocusHost, HOST_TASKS_REFRESH_EVENT } from '../../services/focusHost';

const flags = vi.hoisted(() => ({ hosted: true }));
vi.mock('../../services/focusHost', () => ({
  isFocusShieldHost: () => flags.hosted,
  readyFocusHost: vi.fn(), getFocusHostState: vi.fn(), startHostFocus: vi.fn(), subscribeFocusHost: vi.fn(),
  HOST_CONTROL_HINT: '请回到本地 HUD', HOST_TASKS_REFRESH_EVENT: 'focusshield-tasks-refresh',
}));
vi.mock('../../hooks/useTimer', () => ({ useTimer: vi.fn() }));
vi.mock('../../api/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('../../api/settings', () => ({ getSettings: vi.fn(async () => ({ notification_enabled: false })) }));
vi.mock('../../api/task', () => ({ getTaskById: vi.fn(), updateTask: vi.fn(async () => ({})) }));
vi.mock('../../api/focus', () => ({ createFocusSession: vi.fn(), getFocusOverview: vi.fn(), getFocusSessions: vi.fn() }));
vi.mock('../../services/notify', () => ({ notify: vi.fn() }));
vi.mock('../../utils/antdApp', () => ({
  message: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  modalApi: { confirm: vi.fn(), info: vi.fn() },
}));

const idle: HostState = { phase: 'idle', canStart: true, remainingSeconds: null, cooldownSeconds: 0, refreshRevision: 0 };
const focusing: HostState = { ...idle, phase: 'focusing', canStart: false, remainingSeconds: 1500 };
let emit: (state: HostState) => void;
let timer: UseTimerReturn;
let unsubscribe: Mock;
beforeEach(() => {
  vi.clearAllMocks();
  flags.hosted = true;
  localStorage.setItem('token', 'jwt-a');
  timer = { phase: 'idle', timeLeft: 1500, isRunning: false, isPaused: false, pomodoroCount: 0, elapsedTime: 0,
    start: vi.fn(), pause: vi.fn(), reset: vi.fn(), skip: vi.fn(), setTimeLeft: vi.fn() };
  vi.mocked(useTimer).mockReturnValue(timer);
  vi.mocked(readyFocusHost).mockResolvedValue(idle);
  vi.mocked(getFocusHostState).mockResolvedValue(idle);
  vi.mocked(startHostFocus).mockResolvedValue(focusing);
  unsubscribe = vi.fn();
  vi.mocked(subscribeFocusHost).mockImplementation(listener => { emit = listener; return unsubscribe; });
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-a' } as User);
  vi.mocked(getTaskById).mockImplementation(async id => ({ id, title: `Task ${id}` } as Task));
  vi.mocked(getFocusOverview).mockResolvedValue({ today_pomodoro_count: 0, today_focus_duration: 0, total_pomodoro_count: 0, total_focus_duration: 0 });
  vi.mocked(getFocusSessions).mockResolvedValue({ sessions: [], total: 0, page: 1, page_size: 100 });
});
afterEach(() => { cleanup(); localStorage.clear(); });

const renderHost = async () => {
  const hook = renderHook(() => useFocus(), { wrapper: ({ children }) => <FocusProvider currentUserId="user-a">{children}</FocusProvider> });
  await waitFor(() => expect(hook.result.current.hostReady).toBe(true));
  return hook;
};

describe('FocusProvider host ownership', () => {
  it('starts only via fresh web identity + task, without constructing a web timer, updating status or POSTing focus', async () => {
    const { result } = await renderHost();
    await act(async () => { await result.current.handleStart('task-1'); });
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
    expect(startHostFocus).toHaveBeenCalledExactlyOnceWith('user-a', 'task-1');
    expect(result.current.hostState).toEqual(focusing);
    expect(useTimer).not.toHaveBeenCalled();
    expect(updateTask).not.toHaveBeenCalled();
    expect(createFocusSession).not.toHaveBeenCalled();
    expect(timer.start).not.toHaveBeenCalled();
  });

  it('blocks free focus, stopwatch, timer control/keyboard facade and manual save paths', async () => {
    const { result } = await renderHost();
    await act(async () => { await result.current.handleStart(); });
    expect(result.current.hostError).toContain('选择任务');
    act(() => { result.current.setLinkedTaskId('task-1'); result.current.setTimerMode('stopwatch'); });
    await act(async () => {
      await result.current.handleStart();
      result.current.timer.start(); result.current.timer.pause(); result.current.timer.reset();
      result.current.timer.skip(); result.current.timer.setTimeLeft(1);
      await result.current.handleEnd(); await result.current.handleStopStopwatch();
    });
    expect(startHostFocus).not.toHaveBeenCalled();
    expect(useTimer).not.toHaveBeenCalled();
    expect(createFocusSession).not.toHaveBeenCalled();
  });

  it('fails closed and visibly reports bridge handshake failure', async () => {
    vi.mocked(readyFocusHost).mockRejectedValue(new Error('bridge unavailable'));
    const { result } = renderHook(() => useFocus(), { wrapper: ({ children }) => <FocusProvider currentUserId="user-a">{children}</FocusProvider> });
    await waitFor(() => expect(result.current.hostError).toBe('bridge unavailable'));
    expect(screen.getByRole('alert')).toHaveTextContent('bridge unavailable');
    await act(async () => { await result.current.handleStart('task-1'); });
    expect(startHostFocus).not.toHaveBeenCalled();
    expect(useTimer).not.toHaveBeenCalled();
    expect(createFocusSession).not.toHaveBeenCalled();
  });

  it('does not fallback after Rust rejects a PAT/web-account mismatch', async () => {
    vi.mocked(startHostFocus).mockRejectedValue(new Error('account_mismatch'));
    const { result } = await renderHost();
    await act(async () => { await result.current.handleStart('task-1'); });
    expect(result.current.hostError).toBe('account_mismatch');
    expect(useTimer).not.toHaveBeenCalled();
    expect(createFocusSession).not.toHaveBeenCalled();
  });

  it('requires the freshly loaded JWT account to match the current provider account', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-b' } as User);
    const { result } = await renderHost();
    await act(async () => { await result.current.handleStart('task-1'); });
    expect(result.current.hostError).toContain('账号已变更');
    expect(startHostFocus).not.toHaveBeenCalled();
  });

  it('refreshes original tasks and overview on revision/phase changes, not each countdown event', async () => {
    const refresh = vi.fn();
    window.addEventListener(HOST_TASKS_REFRESH_EVENT, refresh);
    try {
      const { result } = await renderHost();
      act(() => result.current.setLinkedTaskId('task-1'));
      await waitFor(() => expect(result.current.linkedTask?.id).toBe('task-1'));
      act(() => emit(focusing));
      await waitFor(() => expect(result.current.hostState?.phase).toBe('focusing'));
      const reads = vi.mocked(getFocusOverview).mock.calls.length;
      const taskReads = vi.mocked(getTaskById).mock.calls.length;
      const refreshes = refresh.mock.calls.length;
      for (let seconds = 1499; seconds > 1490; seconds--) {
        act(() => emit({ ...focusing, remainingSeconds: seconds }));
      }
      expect(getFocusOverview).toHaveBeenCalledTimes(reads);
      expect(getTaskById).toHaveBeenCalledTimes(taskReads);
      expect(refresh).toHaveBeenCalledTimes(refreshes);
      act(() => emit({ ...focusing, refreshRevision: 1 }));
      await waitFor(() => expect(getFocusOverview).toHaveBeenCalledTimes(reads + 1));
      expect(getTaskById).toHaveBeenCalledTimes(taskReads + 1);
      expect(refresh).toHaveBeenCalledTimes(refreshes + 1);
      act(() => emit({ ...focusing, refreshRevision: 1 }));
      expect(getFocusOverview).toHaveBeenCalledTimes(reads + 1);
      expect(createFocusSession).not.toHaveBeenCalled();
    } finally { window.removeEventListener(HOST_TASKS_REFRESH_EVENT, refresh); }
  });

  it('switches accounts, drops stale starts and unsubscribes on logout/unmount', async () => {
    let current!: FocusContextValue;
    const Probe = () => { current = useFocus(); return null; };
    const view = render(<FocusProvider currentUserId="user-a"><Probe /></FocusProvider>);
    await waitFor(() => expect(current.hostReady).toBe(true));
    // This project targets ES6 Promise; withResolvers is not available in its lib/runtime contract.
    let resolveUser!: (user: User) => void;
    vi.mocked(getCurrentUser).mockReturnValueOnce(new Promise<User>(resolve => { resolveUser = resolve; }));
    let pending: unknown;
    act(() => { pending = current.handleStart('old-task'); });
    const oldListener = emit;
    view.rerender(<FocusProvider currentUserId="user-b"><Probe /></FocusProvider>);
    await waitFor(() => expect(getFocusHostState).toHaveBeenCalledWith('user-b'));
    await waitFor(() => expect(current.hostReady).toBe(true));
    await act(async () => { resolveUser({ id: 'user-a' } as User); await pending; });
    act(() => oldListener({ ...focusing, refreshRevision: 99 }));
    expect(startHostFocus).not.toHaveBeenCalled();
    expect(current.linkedTaskId).toBeNull();
    expect(current.hostState?.refreshRevision).toBe(0);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'user-b' } as User);
    await act(async () => { await current.handleStart('new-task'); });
    expect(startHostFocus).toHaveBeenCalledExactlyOnceWith('user-b', 'new-task');
    view.rerender(<FocusProvider currentUserId={null}><Probe /></FocusProvider>);
    await waitFor(() => expect(current.hostReady).toBe(false));
    await act(async () => { await current.handleStart('task'); });
    expect(startHostFocus).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(unsubscribe.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(createFocusSession).not.toHaveBeenCalled();
  });

  it('ordinary mode still constructs and starts the existing timer and saves completed work', async () => {
    flags.hosted = false;
    const { result } = renderHook(() => useFocus(), { wrapper: ({ children }) => <FocusProvider>{children}</FocusProvider> });
    await waitFor(() => expect(result.current.settingsLoaded).toBe(true));
    act(() => result.current.handleStart());
    expect(useTimer).toHaveBeenCalled();
    expect(timer.start).toHaveBeenCalledTimes(1);
    expect(startHostFocus).not.toHaveBeenCalled();
    const options = vi.mocked(useTimer).mock.calls[vi.mocked(useTimer).mock.calls.length - 1][0];
    await act(async () => { await options.onComplete?.('work'); });
    expect(createFocusSession).toHaveBeenCalledTimes(1);
  });
});
