import { useState, useEffect, useRef, useCallback } from 'react';

export type TimerPhase = 'work' | 'break' | 'idle';

interface TimerState {
  phase: TimerPhase;
  timeLeft: number; // 剩余秒数
  isRunning: boolean;
}

interface UseTimerOptions {
  workDuration: number; // 工作时长（秒）
  breakDuration: number; // 休息时长（秒）
  onComplete?: (phase: TimerPhase) => void;
}

interface UseTimerReturn extends TimerState {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setTimeLeft: (seconds: number) => void;
}

export const useTimer = (options: UseTimerOptions): UseTimerReturn => {
  const { workDuration, breakDuration, onComplete } = options;

  const [state, setState] = useState<TimerState>({
    phase: 'idle',
    timeLeft: workDuration,
    isRunning: false,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number | null>(null);

  // 清除定时器
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;
  }, []);

  // 更新剩余时间
  const updateTimeLeft = useCallback(() => {
    if (!endTimeRef.current) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTimeRef.current - now) / 1000));

    if (remaining <= 0) {
      clearTimer();
      setState((prev) => {
        const newPhase = prev.phase === 'work' ? 'break' : 'work';
        const newTimeLeft = newPhase === 'work' ? workDuration : breakDuration;
        
        // 触发完成回调
        onComplete?.(prev.phase);

        return {
          ...prev,
          phase: newPhase,
          timeLeft: newTimeLeft,
          isRunning: false,
        };
      });
    } else {
      setState((prev) => ({ ...prev, timeLeft: remaining }));
    }
  }, [clearTimer, workDuration, breakDuration, onComplete]);

  // 开始计时
  const start = useCallback(() => {
    setState((prev) => {
      if (prev.isRunning) return prev;

      // 设置结束时间
      endTimeRef.current = Date.now() + prev.timeLeft * 1000;

      // 启动定时器
      intervalRef.current = setInterval(updateTimeLeft, 200);

      return {
        ...prev,
        phase: prev.phase === 'idle' ? 'work' : prev.phase,
        isRunning: true,
      };
    });
  }, [updateTimeLeft]);

  // 暂停计时
  const pause = useCallback(() => {
    clearTimer();
    setState((prev) => ({ ...prev, isRunning: false }));
  }, [clearTimer]);

  // 重置计时
  const reset = useCallback(() => {
    clearTimer();
    setState({
      phase: 'idle',
      timeLeft: workDuration,
      isRunning: false,
    });
  }, [clearTimer, workDuration]);

  // 跳过当前阶段
  const skip = useCallback(() => {
    clearTimer();
    setState((prev) => {
      const newPhase = prev.phase === 'work' ? 'break' : 'work';
      const newTimeLeft = newPhase === 'work' ? workDuration : breakDuration;
      return {
        ...prev,
        phase: newPhase,
        timeLeft: newTimeLeft,
        isRunning: false,
      };
    });
  }, [clearTimer, workDuration, breakDuration]);

  // 设置剩余时间
  const setTimeLeft = useCallback((seconds: number) => {
    setState((prev) => ({ ...prev, timeLeft: seconds }));
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    ...state,
    start,
    pause,
    reset,
    skip,
    setTimeLeft,
  };
};

export default useTimer;
