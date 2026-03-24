import { useState, useEffect, useRef, useCallback } from 'react';

export type TimerPhase = 'work' | 'break' | 'idle';

interface TimerState {
  phase: TimerPhase;
  timeLeft: number; // 剩余秒数
  isRunning: boolean;
}

interface UseTimerOptions {
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
}

export const useTimer = (options: UseTimerOptions): UseTimerReturn => {
  const { workDuration, breakDuration, longBreakDuration, autoStart = false, onComplete } = options;

  const [state, setState] = useState<TimerState>({
    phase: 'idle',
    timeLeft: workDuration,
    isRunning: false,
  });
  
  // 记录已完成的番茄数（用于决定长休息）
  const [pomodoroCount, setPomodoroCount] = useState(0);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const endTimeRef = useRef<number | null>(null);
  const autoStartRef = useRef(autoStart);
  
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
    setPomodoroCount(0);
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
    pomodoroCount,
  };
};

export default useTimer;
