import { useState, useEffect, useRef, useCallback } from 'react';

export type TimerPhase = 'work' | 'break' | 'idle';
export type TimerMode = 'pomodoro' | 'stopwatch';

interface TimerState {
  phase: TimerPhase;
  timeLeft: number; // 剩余秒数
  isRunning: boolean;
}

interface UseTimerOptions {
  mode?: TimerMode; // 计时模式，默认 'pomodoro'
  workDuration: number; // 工作时长（秒）
  breakDuration: number; // 短休息时长（秒）
  longBreakDuration?: number; // 长休息时长（秒）
  autoStart?: boolean; // 计时完成后是否自动开始下一阶段
  onComplete?: (phase: TimerPhase) => void;
}

interface UseTimerReturn extends TimerState {
  start: () => void;
  pause: () => void;
  reset: () => void;
  skip: () => void;
  setTimeLeft: (seconds: number) => void;
  pomodoroCount: number; // 已完成的番茄数
  elapsedTime: number; // 正计时已过秒数
  isPaused: boolean; // 是否处于暂停状态
}

export const useTimer = (options: UseTimerOptions): UseTimerReturn => {
  const { mode = 'pomodoro', workDuration, breakDuration, longBreakDuration, autoStart = false, onComplete } = options;

  const [state, setState] = useState<TimerState>({
    phase: 'idle',
    timeLeft: workDuration,
    isRunning: false,
  });
  
  // 记录已完成的番茄数（用于决定长休息）
  const [pomodoroCount, setPomodoroCount] = useState(0);
  
  // 正计时模式：已过时间（秒）
  const [elapsedTime, setElapsedTime] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null); // 正计时开始时间戳
  const autoStartRef = useRef(autoStart);
  const isPausedRef = useRef(false); // 正计时暂停状态
  
  // 保持 autoStart 最新值
  useEffect(() => {
    autoStartRef.current = autoStart;
  }, [autoStart]);

  // 清除定时器
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    endTimeRef.current = null;
    startTimeRef.current = null;
  }, []);

  // 更新剩余时间
  const updateTimeLeft = useCallback(() => {
    if (!endTimeRef.current) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTimeRef.current - now) / 1000));

    if (remaining <= 0) {
      clearTimer();
      setState((prev) => {
        const wasWork = prev.phase === 'work';
        const newPhase = wasWork ? 'break' : 'work';
        
        // 计算新的番茄计数和休息时长
        let newPomodoroCount = pomodoroCount;
        let newBreakDuration = breakDuration;
        
        if (wasWork) {
          // 工作完成，增加番茄计数
          newPomodoroCount = pomodoroCount + 1;
          setPomodoroCount(newPomodoroCount);
          
          // 每4个番茄钟后使用长休息
          if (longBreakDuration && newPomodoroCount % 4 === 0) {
            newBreakDuration = longBreakDuration;
          }
        }
        
        const newTimeLeft = newPhase === 'work' ? workDuration : newBreakDuration;
        
        // 触发完成回调
        onComplete?.(prev.phase);

        // 根据 autoStart 决定是否自动开始
        const shouldAutoStart = autoStartRef.current;
        
        if (shouldAutoStart) {
          // 设置结束时间并启动定时器
          endTimeRef.current = Date.now() + newTimeLeft * 1000;
          intervalRef.current = setInterval(updateTimeLeftInternal, 200);
        }

        return {
          ...prev,
          phase: newPhase,
          timeLeft: newTimeLeft,
          isRunning: shouldAutoStart,
        };
      });
    } else {
      setState((prev) => ({ ...prev, timeLeft: remaining }));
    }
  }, [clearTimer, workDuration, breakDuration, longBreakDuration, onComplete, pomodoroCount]);
  
  // 内部更新函数（避免循环依赖）
  const updateTimeLeftInternal = useCallback(() => {
    if (!endTimeRef.current) return;

    const now = Date.now();
    const remaining = Math.max(0, Math.floor((endTimeRef.current - now) / 1000));

    if (remaining <= 0) {
      // 时间到，触发 updateTimeLeft 处理
      updateTimeLeft();
    } else {
      setState((prev) => ({ ...prev, timeLeft: remaining }));
    }
  }, [updateTimeLeft]);

  // 正计时模式：更新已过时间
  const updateElapsedTime = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
    setElapsedTime(elapsed);
  }, []);

  // 开始计时
  const start = useCallback(() => {
    if (mode === 'stopwatch') {
      // 正计时模式
      setState((prev) => {
        if (prev.isRunning) return prev;

        if (prev.phase === 'idle') {
          // 首次开始
          startTimeRef.current = Date.now();
          setElapsedTime(0);
        } else if (isPausedRef.current) {
          // 恢复暂停：调整开始时间以保持时间连续
          startTimeRef.current = Date.now() - elapsedTime * 1000;
        }

        isPausedRef.current = false;
        intervalRef.current = setInterval(updateElapsedTime, 200);

        return {
          ...prev,
          phase: prev.phase === 'idle' ? 'work' : prev.phase,
          isRunning: true,
        };
      });
    } else {
      // 番茄模式
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
    }
  }, [mode, elapsedTime, updateTimeLeft, updateElapsedTime]);

  // 暂停计时
  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (mode === 'stopwatch') {
      isPausedRef.current = true;
      // 保留 startTimeRef 用于恢复计算
    } else {
      endTimeRef.current = null;
    }
    setState((prev) => ({ ...prev, isRunning: false }));
  }, [mode]);

  // 重置计时
  const reset = useCallback(() => {
    clearTimer();
    if (mode === 'stopwatch') {
      setElapsedTime(0);
      isPausedRef.current = false;
      setState({
        phase: 'idle',
        timeLeft: 0,
        isRunning: false,
      });
    } else {
      setState({
        phase: 'idle',
        timeLeft: workDuration,
        isRunning: false,
      });
      setPomodoroCount(0);
    }
  }, [clearTimer, mode, workDuration]);

  // 跳过当前阶段（仅番茄模式有效）
  const skip = useCallback(() => {
    if (mode === 'stopwatch') {
      // 正计时模式下 skip 不生效
      return;
    }
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
  }, [mode, clearTimer, workDuration, breakDuration]);

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

  // 判断是否处于暂停状态：不在 idle 且没有在运行
  const isPaused = state.phase !== 'idle' && !state.isRunning;

  return {
    ...state,
    start,
    pause,
    reset,
    skip,
    setTimeLeft,
    pomodoroCount: mode === 'stopwatch' ? 0 : pomodoroCount,
    elapsedTime: mode === 'stopwatch' ? elapsedTime : 0,
    isPaused,
  };
};

export default useTimer;
