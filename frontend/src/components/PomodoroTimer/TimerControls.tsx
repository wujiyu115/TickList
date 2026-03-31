import React from 'react';
import { Button } from 'antd';
import { BorderOutlined } from '@ant-design/icons';
import { TimerPhase, TimerMode } from '../../hooks/useTimer';

interface TimerControlsProps {
  isRunning: boolean;
  isPaused: boolean;    // 是否暂停态
  phase: TimerPhase;
  mode?: TimerMode;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;  // 继续
  onEnd: () => void;     // 结束专注
  onStop?: () => void;   // 正计时模式停止并保存
}

const TimerControls: React.FC<TimerControlsProps> = ({
  isRunning,
  isPaused,
  phase,
  mode = 'pomodoro',
  onStart,
  onPause,
  onResume,
  onEnd,
  onStop,
}) => {
  const isStopwatch = mode === 'stopwatch';
  const isIdle = phase === 'idle';

  // 正计时模式
  if (isStopwatch) {
    return (
      <div className="timer-controls">
        {isRunning ? (
          <Button
            className="control-btn control-btn-outline"
            onClick={onPause}
          >
            暂停
          </Button>
        ) : isPaused ? (
          <>
            <Button
              className="control-btn control-btn-primary"
              onClick={onResume}
            >
              继续
            </Button>
            <Button
              className="control-btn control-btn-outline"
              icon={<BorderOutlined />}
              onClick={onStop}
            >
              停止
            </Button>
          </>
        ) : (
          <Button
            className="control-btn control-btn-primary"
            onClick={onStart}
          >
            开始
          </Button>
        )}
      </div>
    );
  }

  // 番茄模式
  return (
    <div className="timer-controls">
      {isRunning ? (
        // 运行中：只显示暂停按钮（边框样式）
        <Button
          className="control-btn control-btn-outline"
          onClick={onPause}
        >
          暂停
        </Button>
      ) : isPaused ? (
        // 暂停态：显示继续（实心）和结束（边框）按钮
        <>
          <Button
            className="control-btn control-btn-primary"
            onClick={onResume}
          >
            继续
          </Button>
          <Button
            className="control-btn control-btn-outline"
            onClick={onEnd}
          >
            结束
          </Button>
        </>
      ) : (
        // 空闲状态：显示开始按钮（实心）
        <Button
          className="control-btn control-btn-primary"
          onClick={onStart}
        >
          开始
        </Button>
      )}
    </div>
  );
};

export default TimerControls;
