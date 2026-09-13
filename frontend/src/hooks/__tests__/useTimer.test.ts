import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimer } from '../useTimer';
import type { TimerResetOptions } from '../useTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('useTimer reset', () => {
  it.each([false, true])(
    '完成一轮后重置休息保留计数，回到待开始的专注（autoStart=%s）',
    (autoStart) => {
      const onComplete = vi.fn();
      const { result } = renderHook(() => useTimer({
        workDuration: 2,
        breakDuration: 5,
        autoStart,
        onComplete,
      }));

      act(() => result.current.start());
      expect(result.current).toMatchObject({ phase: 'work', isRunning: true, isPaused: false });

      act(() => vi.advanceTimersByTime(2000));
      expect(result.current).toMatchObject({
        phase: 'break',
        pomodoroCount: 1,
        isRunning: autoStart,
        isPaused: !autoStart,
      });
      expect(onComplete).toHaveBeenCalledWith('work');
      onComplete.mockClear();

      act(() => result.current.reset({ resetPomodoroCount: false }));
      expect(result.current).toMatchObject({
        phase: 'idle',
        timeLeft: 2,
        pomodoroCount: 1,
        isRunning: false,
        isPaused: false,
      });

      act(() => vi.advanceTimersByTime(10000));
      expect(result.current).toMatchObject({ phase: 'idle', timeLeft: 2, pomodoroCount: 1 });
      expect(onComplete).not.toHaveBeenCalled();

      act(() => result.current.start());
      expect(result.current).toMatchObject({ phase: 'work', isRunning: true, isPaused: false, pomodoroCount: 1 });
      act(() => result.current.pause());
      expect(result.current).toMatchObject({ phase: 'work', isRunning: false, isPaused: true });
      act(() => result.current.start());
      expect(result.current).toMatchObject({ phase: 'work', isRunning: true, isPaused: false });
    }
  );

  it.each<{ label: string; options?: TimerResetOptions }>([
    { label: '默认 reset()' },
    { label: '空 options', options: {} },
    { label: '显式清零', options: { resetPomodoroCount: true } },
  ])('$label 仍清零已完成的番茄计数', ({ options }) => {
    const { result } = renderHook(() => useTimer({ workDuration: 2, breakDuration: 5 }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current).toMatchObject({ phase: 'break', pomodoroCount: 1, isPaused: true });

    act(() => {
      if (options === undefined) {
        result.current.reset();
      } else {
        result.current.reset(options);
      }
    });
    expect(result.current).toMatchObject({
      phase: 'idle',
      timeLeft: 2,
      pomodoroCount: 0,
      isRunning: false,
      isPaused: false,
    });
  });

  it('正计时重置仍清空已过时间和暂停状态', () => {
    const { result } = renderHook(() => useTimer({
      mode: 'stopwatch',
      workDuration: 2,
      breakDuration: 5,
    }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.pause());
    expect(result.current).toMatchObject({ elapsedTime: 2, isRunning: false, isPaused: true });

    act(() => result.current.reset({ resetPomodoroCount: false }));
    expect(result.current).toMatchObject({
      phase: 'idle',
      timeLeft: 0,
      elapsedTime: 0,
      pomodoroCount: 0,
      isRunning: false,
      isPaused: false,
    });
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.elapsedTime).toBe(0);
  });
});
