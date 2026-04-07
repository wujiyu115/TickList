import React, { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { message, Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import { useTimer, TimerPhase, TimerMode } from '../hooks/useTimer';
import { getSettings } from '../api/settings';
import { getTaskById, updateTask } from '../api/task';
import { createFocusSession, getFocusOverview, getFocusSessions, FocusOverview, FocusSession } from '../api/focus';
import { UserSettings, Task } from '../types';

// 默认番茄钟时间配置（秒）
const DEFAULT_WORK_DURATION = 25 * 60;
const DEFAULT_BREAK_DURATION = 5 * 60;
const DEFAULT_LONG_BREAK_DURATION = 15 * 60;

// useTimer 返回类型
type TimerReturn = ReturnType<typeof useTimer>;

interface FocusContextValue {
  // 计时器状态
  timer: TimerReturn;
  timerMode: TimerMode;
  setTimerMode: (mode: TimerMode) => void;
  
  // 关联任务
  linkedTaskId: string | null;
  linkedTask: Task | null;
  setLinkedTaskId: (id: string | null) => void;
  setLinkedTask: (task: Task | null) => void;
  
  // 操作
  handleStart: () => void;
  handleEnd: () => void;
  handleStopStopwatch: () => void;
  
  // 概览和记录
  overview: FocusOverview | null;
  sessions: FocusSession[];
  loadOverview: () => Promise<void>;
  loadSessions: () => Promise<void>;
  
  // 设置
  settings: Partial<UserSettings> | null;
  settingsLoaded: boolean;
  
  // 开始时间记录
  startedAtRef: React.MutableRefObject<string>;
  
  // 时长配置
  workDuration: number;
  breakDuration: number;
}

const FocusContext = createContext<FocusContextValue | null>(null);

export const useFocus = () => {
  const ctx = useContext(FocusContext);
  if (!ctx) throw new Error('useFocus must be used within FocusProvider');
  return ctx;
};

interface FocusProviderProps {
  children: ReactNode;
}

export const FocusProvider: React.FC<FocusProviderProps> = ({ children }) => {
  // 计时模式状态
  const [timerMode, setTimerMode] = useState<TimerMode>('pomodoro');
  
  // 关联任务状态
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const linkedTaskIdRef = useRef<string | null>(null);

  // 保持 ref 与 state 同步，确保 handleStart 闭包中能读到最新值
  useEffect(() => {
    linkedTaskIdRef.current = linkedTaskId;
  }, [linkedTaskId]);
  
  // 专注数据状态
  const [overview, setOverview] = useState<FocusOverview | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  
  // 用户设置状态
  const [settings, setSettings] = useState<Partial<UserSettings> | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // 记录开始时间
  const startedAtRef = useRef<string>('');
  
  // 根据设置计算时长（秒）
  const workDuration = settings?.pomodoro_duration 
    ? settings.pomodoro_duration * 60 
    : DEFAULT_WORK_DURATION;
  const breakDuration = settings?.short_break_duration 
    ? settings.short_break_duration * 60 
    : DEFAULT_BREAK_DURATION;
  const longBreakDuration = settings?.long_break_duration 
    ? settings.long_break_duration * 60 
    : DEFAULT_LONG_BREAK_DURATION;
  const autoStart = settings?.pomodoro_auto_start ?? false;
  const notificationEnabled = settings?.notification_enabled ?? true;
  const notificationSound = settings?.notification_sound ?? true;

  // 播放提示音
  const playNotificationSound = useCallback(() => {
    if (!notificationSound) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;

      oscillator.start();
      setTimeout(() => {
        oscillator.stop();
        audioContext.close();
      }, 200);
    } catch (e) {
      console.error('播放提示音失败:', e);
    }
  }, [notificationSound]);

  // 加载概览数据
  const loadOverview = useCallback(async () => {
    try {
      const data = await getFocusOverview();
      setOverview(data);
    } catch (e) {
      console.error('加载专注概览失败:', e);
    }
  }, []);

  // 加载专注记录
  const loadSessions = useCallback(async () => {
    try {
      const data = await getFocusSessions({ page: 1, page_size: 100 });
      setSessions(data.sessions || []);
    } catch (e) {
      console.error('加载专注记录失败:', e);
    }
  }, []);

  // 番茄计时完成回调
  const handleComplete = useCallback(
    async (phase: TimerPhase) => {
      if (notificationEnabled) {
        playNotificationSound();
      }

      if (phase === 'work') {
        // 工作阶段完成，保存记录
        try {
          await createFocusSession({
            task_id: linkedTaskId || undefined,
            type: 'pomodoro',
            duration: workDuration,
            started_at: startedAtRef.current,
            ended_at: new Date().toISOString(),
          });
          loadOverview();
          loadSessions();
        } catch (e) {
          console.error('保存专注记录失败:', e);
        }
        
        if (notificationEnabled) {
          message.success('工作完成！休息一下吧 🎉');
        }
      } else {
        if (notificationEnabled) {
          message.info('休息结束，继续加油！💪');
        }
      }
    },
    [notificationEnabled, playNotificationSound, linkedTaskId, workDuration, loadOverview, loadSessions]
  );

  // 计时器
  const timer = useTimer({
    mode: timerMode,
    workDuration,
    breakDuration,
    longBreakDuration,
    autoStart,
    onComplete: handleComplete,
  });

  // 包装 start 方法，记录开始时间
  const handleStart = useCallback(() => {
    if (timer.phase === 'idle') {
      startedAtRef.current = new Date().toISOString();
    }
    timer.start();

    // 当有关联任务时，更新状态为进行中（通过 ref 读取最新值，避免闭包陈旧问题）
    const taskId = linkedTaskIdRef.current;
    // console.log('Timer started task', taskId);
    if (taskId) {
      updateTask(taskId, { status: 'in_progress' })
        .then(() => {
          // 同步更新本地 linkedTask 状态
          setLinkedTask(prev => prev ? { ...prev, status: 'in_progress' } : prev);
        })
        .catch(e => console.error('Failed to update task status:', e));
    }
  }, [timer]);

  // 正计时模式停止并保存
  const handleStopStopwatch = useCallback(async () => {
    const duration = timer.elapsedTime;
    const minDuration = (settings?.focus_min_duration ?? 5) * 60; // 最短专注时长（秒）
    
    if (duration < minDuration) {
      // 专注不足最短时长，弹出确认 Modal
      Modal.confirm({
        title: '提前放弃专注？',
        icon: <ExclamationCircleOutlined />,
        content: `本次专注不足${settings?.focus_min_duration ?? 5}分钟，记录将不会被保存。`,
        okText: '放弃',
        cancelText: '取消',
        onOk: () => {
          timer.reset();
        },
      });
    } else {
      // 专注达标，保存记录
      try {
        await createFocusSession({
          task_id: linkedTaskId || undefined,
          type: 'stopwatch',
          duration: duration,
          started_at: startedAtRef.current,
          ended_at: new Date().toISOString(),
        });
        loadOverview();
        loadSessions();
        message.success('专注记录已保存');
      } catch (e) {
        console.error('保存专注记录失败:', e);
        message.error('保存失败');
      }
      timer.reset();
    }
  }, [timer, settings, linkedTaskId, loadOverview, loadSessions]);

  // 番茄模式结束专注（点击"结束"按钮）
  const handleEnd = useCallback(async () => {
    // 计算实际专注时长
    const actualDuration = timerMode === 'pomodoro' 
      ? (workDuration - timer.timeLeft) 
      : timer.elapsedTime;
    
    const minDuration = (settings?.focus_min_duration ?? 5) * 60; // 最短专注时长（秒）
    
    if (actualDuration < minDuration) {
      // 专注不足最短时长，弹出确认 Modal
      Modal.confirm({
        title: '提前放弃专注？',
        icon: <ExclamationCircleOutlined />,
        content: `本次专注不足${settings?.focus_min_duration ?? 5}分钟，记录将不会被保存。`,
        okText: '放弃',
        cancelText: '取消',
        onOk: () => {
          timer.reset();
        },
        // 取消则不做任何操作（继续保持暂停态）
      });
    } else {
      // 专注达标，保存记录
      try {
        await createFocusSession({
          task_id: linkedTaskId || undefined,
          type: timerMode,
          duration: actualDuration,
          started_at: startedAtRef.current,
          ended_at: new Date().toISOString(),
        });
        message.success('专注记录已保存');
        loadOverview();
        loadSessions();
      } catch (e) {
        console.error('保存专注记录失败:', e);
      }
      timer.reset();
    }
  }, [timerMode, workDuration, timer, settings, linkedTaskId, loadOverview, loadSessions]);

  // 加载用户设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const userSettings = await getSettings();
        setSettings(userSettings);
      } catch (e) {
        console.error('加载用户设置失败:', e);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // 初始化加载数据
  useEffect(() => {
    loadOverview();
    loadSessions();
  }, [loadOverview, loadSessions]);

  // 加载关联任务详情
  useEffect(() => {
    if (linkedTaskId) {
      getTaskById(linkedTaskId)
        .then(task => setLinkedTask(task))
        .catch(e => {
          console.error('加载任务详情失败:', e);
          setLinkedTask(null);
        });
    } else {
      setLinkedTask(null);
    }
  }, [linkedTaskId]);

  const contextValue: FocusContextValue = {
    timer,
    timerMode,
    setTimerMode,
    linkedTaskId,
    linkedTask,
    setLinkedTaskId,
    setLinkedTask,
    handleStart,
    handleEnd,
    handleStopStopwatch,
    overview,
    sessions,
    loadOverview,
    loadSessions,
    settings,
    settingsLoaded,
    startedAtRef,
    workDuration,
    breakDuration,
  };

  return (
    <FocusContext.Provider value={contextValue}>
      {children}
    </FocusContext.Provider>
  );
};
