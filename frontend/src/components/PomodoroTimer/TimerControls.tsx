import React from 'react';
import { Button } from 'antd';
import {
  ReloadOutlined,
  ForwardOutlined,
} from '@ant-design/icons';
import { TimerPhase } from '../../hooks/useTimer';

interface TimerControlsProps {
  isRunning: boolean;
  phase: TimerPhase;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSkip: () => void;
}

const TimerControls: React.FC<TimerControlsProps> = ({
  isRunning,
  phase,
  onStart,
  onPause,
  onReset,
  onSkip,
}) => {
  return (
    <div className="timer-controls">
      {/* 主按钮 - 开始/暂停 */}
      {isRunning ? (
        <Button
          type="primary"
          size="large"
          onClick={onPause}
          className="main-action-btn"
          style={{
            backgroundColor: '#4f46e5',
            borderColor: '#4f46e5',
          }}
        >
          暂停
        </Button>
      ) : (
        <Button
          type="primary"
          size="large"
          onClick={onStart}
          className="main-action-btn"
          style={{
            backgroundColor: '#4f46e5',
            borderColor: '#4f46e5',
          }}
        >
          {phase === 'idle' ? '开始' : '继续'}
        </Button>
      )}

      {/* 次要操作 - 仅在非 idle 状态显示 */}
      {phase !== 'idle' && (
        <div className="secondary-actions">
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            onClick={onReset}
          >
            重置
          </Button>
          <Button
            type="text"
            size="small"
            icon={<ForwardOutlined />}
            onClick={onSkip}
          >
            跳过
          </Button>
        </div>
      )}
    </div>
  );
};

export default TimerControls;
