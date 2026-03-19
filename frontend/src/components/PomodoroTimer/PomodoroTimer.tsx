import React, { useState, useEffect, useCallback } from 'react';
import { message, Segmented, Empty } from 'antd';
import { RightOutlined, PlusOutlined } from '@ant-design/icons';
import { useTimer, TimerPhase } from '../../hooks/useTimer';
import TimerDisplay from './TimerDisplay';
import TimerControls from './TimerControls';
import './PomodoroTimer.less';

// 标准番茄钟时间配置（秒）
const WORK_DURATION = 25 * 60; // 25分钟
const BREAK_DURATION = 5 * 60; // 5分钟

// 本地存储键
const STORAGE_KEY = 'pomodoro_stats';

interface PomodoroStats {
  date: string;
  completed: number;
}

const PomodoroTimer: React.FC = () => {
  const [completedToday, setCompletedToday] = useState(0);

  // 获取今日日期字符串
  const getTodayString = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  // 从本地存储加载统计数据
  const loadStats = useCallback((): PomodoroStats => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const stats: PomodoroStats = JSON.parse(stored);
        // 如果是今天的记录，返回它
        if (stats.date === getTodayString()) {
          return stats;
        }
      }
    } catch (e) {
      console.error('加载番茄钟统计失败:', e);
    }
    // 返回新的统计
    return { date: getTodayString(), completed: 0 };
  }, []);

  // 保存统计数据到本地存储
  const saveStats = useCallback((stats: PomodoroStats) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
      console.error('保存番茄钟统计失败:', e);
    }
  }, []);

  // 播放提示音
  const playNotificationSound = useCallback(() => {
    try {
      // 使用 Web Audio API 播放简单提示音
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
  }, []);

  // 计时完成回调
  const handleComplete = useCallback(
    (phase: TimerPhase) => {
      playNotificationSound();

      if (phase === 'work') {
        // 工作阶段完成，增加计数
        setCompletedToday((prev) => {
          const newCount = prev + 1;
          saveStats({ date: getTodayString(), completed: newCount });
          return newCount;
        });
        message.success('工作完成！休息一下吧 🎉');
      } else {
        message.info('休息结束，继续加油！💪');
      }
    },
    [playNotificationSound, saveStats]
  );

  // 计时器
  const timer = useTimer({
    workDuration: WORK_DURATION,
    breakDuration: BREAK_DURATION,
    onComplete: handleComplete,
  });

  // 初始化加载统计数据
  useEffect(() => {
    const stats = loadStats();
    setCompletedToday(stats.completed);
  }, [loadStats]);

  return (
    <div className="pomodoro-container">
      {/* 左侧 - 计时器区域 */}
      <div className="pomodoro-left">
        {/* 顶部工具栏 */}
        <div className="pomodoro-toolbar">
          <h2 className="pomodoro-title">番茄专注</h2>
          <div className="toolbar-center">
            <Segmented 
              options={['番茄计时', '正计时']} 
              value="番茄计时"
            />
          </div>
          <div className="toolbar-actions">
            <PlusOutlined className="toolbar-icon" />
            <span className="toolbar-icon more-icon">...</span>
          </div>
        </div>

        {/* 计时器主体 */}
        <div className="timer-main">
          <div className="focus-label">
            <span>
              {timer.phase === 'work' && '工作中'}
              {timer.phase === 'break' && '休息中'}
              {timer.phase === 'idle' && '专注'}
            </span>
            <RightOutlined style={{ fontSize: 12 }} />
          </div>
          
          <TimerDisplay
            timeLeft={timer.timeLeft}
            phase={timer.phase}
            totalTime={timer.phase === 'break' ? BREAK_DURATION : WORK_DURATION}
          />
          
          <TimerControls
            isRunning={timer.isRunning}
            phase={timer.phase}
            onStart={timer.start}
            onPause={timer.pause}
            onReset={timer.reset}
            onSkip={timer.skip}
          />
        </div>
      </div>

      {/* 右侧 - 统计面板 */}
      <div className="pomodoro-right">
        <h3 className="panel-title">概览</h3>
        <div className="stats-grid">
          <div className="stat-card">
            <span className="stat-label">今日番茄</span>
            <span className="stat-number">{completedToday}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">今日专注时长</span>
            <span className="stat-number">{completedToday * 25}<span className="stat-suffix">m</span></span>
          </div>
          <div className="stat-card">
            <span className="stat-label">总番茄</span>
            <span className="stat-number">{completedToday}</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">总专注时长</span>
            <span className="stat-number">{completedToday * 25}<span className="stat-suffix">m</span></span>
          </div>
        </div>

        <div className="records-section">
          <div className="records-header">
            <h3 className="panel-title">专注记录</h3>
            <PlusOutlined className="add-record-btn" />
          </div>
          <div className="records-empty">
            <Empty description="还没有专注记录" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PomodoroTimer;
