import React from 'react';
import { Progress } from 'antd';
import { TimerPhase } from '../../hooks/useTimer';

interface TimerDisplayProps {
  timeLeft: number; // 剩余秒数
  phase: TimerPhase;
  totalTime: number; // 总时长（秒）
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({
  timeLeft,
  phase,
  totalTime,
}) => {
  // 格式化时间为 mm:ss
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // 计算进度百分比
  const calculateProgress = (): number => {
    if (phase === 'idle') return 0;
    return Math.round(((totalTime - timeLeft) / totalTime) * 100);
  };

  // 获取进度条颜色
  const getProgressColor = (): string => {
    switch (phase) {
      case 'work':
        return '#4f46e5'; // 蓝紫色
      case 'break':
        return '#52c41a';
      default:
        return '#e8e8e8'; // idle 状态显示灰色轨道
    }
  };

  return (
    <div className="timer-display">
      <Progress
        type="circle"
        percent={calculateProgress()}
        size={300}
        strokeWidth={6}
        strokeColor={getProgressColor()}
        trailColor="#e8e8e8"
        format={() => (
          <div className="timer-text">
            <span className="time-value">{formatTime(timeLeft)}</span>
          </div>
        )}
        style={{ minWidth: 300, minHeight: 300 }}
      />
    </div>
  );
};

export default TimerDisplay;
