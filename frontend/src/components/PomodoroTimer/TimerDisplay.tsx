import React from 'react';
import { Progress } from 'antd';
import { TimerPhase, TimerMode } from '../../hooks/useTimer';

interface TimerDisplayProps {
  timeLeft: number; // 剩余秒数（番茄模式）
  elapsedTime?: number; // 已过秒数（正计时模式）
  phase: TimerPhase;
  totalTime: number; // 总时长（秒）
  mode?: TimerMode; // 计时模式
  isPaused?: boolean; // 是否暂停态
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeLeft,
  elapsedTime = 0,
  phase,
  totalTime,
  mode = 'pomodoro',
  isPaused = false,
}) => {
  // 格式化时间为 mm:ss 或 hh:mm:ss
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 计算进度百分比
  const calculateProgress = (): number => {
    // 正计时模式不显示进度
    if (mode === 'stopwatch') return 0;
    if (phase === 'idle') return 0;
    return Math.round(((totalTime - timeLeft) / totalTime) * 100);
  };

  // 获取进度条颜色
  const getProgressColor = (): string => {
    if (mode === 'stopwatch') {
      return phase === 'idle' ? 'var(--ant-color-fill-secondary)' : '#4f46e5';
    }
    switch (phase) {
      case 'work':
        return '#4f46e5'; // 蓝紫色
      case 'break':
        return '#52c41a';
      default:
        return 'var(--ant-color-fill-secondary)'; // idle 状态显示灰色轨道
    }
  };

  // 获取显示的时间值
  const displayTime = mode === 'stopwatch' ? elapsedTime : timeLeft;

  return (
    <div className="timer-display">
      <Progress
        type="circle"
        percent={calculateProgress()}
        size={300}
        strokeWidth={6}
        strokeColor={getProgressColor()}
        trailColor="var(--ant-color-fill-secondary)"
        format={() => (
          <div className="timer-text">
            <span className="time-value">{formatTime(displayTime)}</span>
            {isPaused && <span className="paused-label">已暂停</span>}
          </div>
        )}
        style={{ minWidth: 300, minHeight: 300 }}
      />
    </div>
  );
};

export default TimerDisplay;
