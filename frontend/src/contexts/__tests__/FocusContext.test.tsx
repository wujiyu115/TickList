import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusProvider, useFocus } from '../FocusContext';
import { useTimer } from '../../hooks/useTimer';
import type { TimerMode, UseTimerReturn } from '../../hooks/useTimer';
import { createFocusSession } from '../../api/focus';
import { modalApi } from '../../utils/antdApp';

vi.mock('../../hooks/useTimer', () => ({ useTimer: vi.fn() }));
vi.mock('../../api/settings', () => ({
  getSettings: vi.fn(async () => ({
    pomodoro_duration: 25,
    short_break_duration: 5,
    focus_min_duration: 5,
    notification_enabled: false,
  })),
}));
vi.mock('../../api/focus', () => ({
  createFocusSession: vi.fn(async () => ({})),
  getFocusOverview: vi.fn(async () => ({
    today_pomodoro_count: 0,
    today_focus_duration: 0,
    total_pomodoro_count: 0,
    total_focus_duration: 0,
  })),
  getFocusSessions: vi.fn(async () => ({ sessions: [], total: 0, page: 1, page_size: 100 })),
}));
vi.mock('../../api/task', () => ({
  getTaskById: vi.fn(),
  updateTask: vi.fn(async () => ({})),
}));
vi.mock('../../services/notify', () => ({ notify: vi.fn() }));
vi.mock('../../utils/antdApp', () => ({
  message: { success: vi.fn(), error: vi.fn() },
  modalApi: { confirm: vi.fn(), info: vi.fn() },
}));

let timer: UseTimerReturn;

beforeEach(() => {
  vi.clearAllMocks();
  timer = {
    phase: 'work',
    timeLeft: 1200,
    isRunning: false,
    isPaused: true,
    pomodoroCount: 2,
    elapsedTime: 300,
    start: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    skip: vi.fn(),
    setTimeLeft: vi.fn(),
  };
  vi.mocked(useTimer).mockReturnValue(timer);
});

const renderFocus = async () => {
  const hook = renderHook(() => useFocus(), {
    wrapper: ({ children }) => <FocusProvider>{children}</FocusProvider>,
  });
  await waitFor(() => expect(hook.result.current.settingsLoaded).toBe(true));
  return hook;
};

describe('FocusProvider handleEnd', () => {
  it.each([300, 1500, 1800])(
    '休息剩余 %i 秒时跳过，不保存记录或弹出专注过短确认，并保留番茄计数',
    async (timeLeft) => {
      timer.phase = 'break';
      timer.timeLeft = timeLeft;
      const { result } = await renderFocus();

      await act(async () => {
        await result.current.handleEnd();
      });

      expect(createFocusSession).not.toHaveBeenCalled();
      expect(modalApi.confirm).not.toHaveBeenCalled();
      expect(timer.reset).toHaveBeenCalledExactlyOnceWith({ resetPomodoroCount: false });
    }
  );

  it.each<{ mode: TimerMode; duration: number }>([
    { mode: 'pomodoro', duration: 300 },
    { mode: 'pomodoro', duration: 420 },
    { mode: 'stopwatch', duration: 300 },
    { mode: 'stopwatch', duration: 420 },
  ])('$mode 专注 $duration 秒达到阈值时仍保存实际时长', async ({ mode, duration }) => {
    timer.timeLeft = mode === 'pomodoro' ? 1500 - duration : 1490;
    timer.elapsedTime = mode === 'stopwatch' ? duration : 999;
    const { result } = await renderFocus();
    const startedAt = '2026-01-01T10:00:00.000Z';
    act(() => {
      result.current.setTimerMode(mode);
      result.current.startedAtRef.current = startedAt;
    });

    await act(async () => {
      await result.current.handleEnd();
    });

    expect(createFocusSession).toHaveBeenCalledExactlyOnceWith({
      task_id: undefined,
      type: mode,
      duration,
      started_at: startedAt,
      ended_at: expect.any(String),
    });
    expect(modalApi.confirm).not.toHaveBeenCalled();
    expect(timer.reset).toHaveBeenCalledExactlyOnceWith();
  });

  it.each<TimerMode>(['pomodoro', 'stopwatch'])(
    '%s 专注不足阈值时仍需确认，确认前不重置或保存',
    async (mode) => {
      timer.timeLeft = 1500 - 299;
      timer.elapsedTime = 299;
      const { result } = await renderFocus();
      act(() => result.current.setTimerMode(mode));

      await act(async () => {
        await result.current.handleEnd();
      });

      expect(createFocusSession).not.toHaveBeenCalled();
      expect(timer.reset).not.toHaveBeenCalled();
      expect(modalApi.confirm).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        title: '提前放弃专注？',
        onOk: expect.any(Function),
      }));

      act(() => {
        vi.mocked(modalApi.confirm).mock.calls[0][0].onOk?.();
      });
      expect(timer.reset).toHaveBeenCalledExactlyOnceWith();
      expect(createFocusSession).not.toHaveBeenCalled();
    }
  );
});
