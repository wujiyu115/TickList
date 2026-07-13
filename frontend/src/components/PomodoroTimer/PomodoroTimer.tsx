import React, { useState, useEffect, useCallback } from 'react';
import { Segmented, Empty, Modal, List as AntList, Input } from 'antd';
import { message } from '../../utils/antdApp';
import { RightOutlined, PlusOutlined, SearchOutlined, ClockCircleFilled, FieldTimeOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { TimerMode } from '../../hooks/useTimer';
import { getTasks } from '../../api/task';
import { FocusSession } from '../../api/focus';
import { Task } from '../../types';
import { useFocus } from '../../contexts/FocusContext';
import TimerDisplay from './TimerDisplay';
import TimerControls from './TimerControls';
import './PomodoroTimer.less';

const PomodoroTimer: React.FC = () => {
  // 从 FocusContext 获取全局状态
  const {
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
    startedAtRef,
    workDuration,
    breakDuration,
  } = useFocus();

  // URL 参数处理
  const [searchParams] = useSearchParams();
  const taskIdFromUrl = searchParams.get('task_id');
  const modeFromUrl = (searchParams.get('mode') as TimerMode) || null;

  // 任务选择弹窗（本地 UI 状态）
  const [taskSelectVisible, setTaskSelectVisible] = useState(false);
  const [taskSearchKeyword, setTaskSearchKeyword] = useState('');
  const [taskList, setTaskList] = useState<Task[]>([]);

  // URL 参数变化时同步状态（仅在计时器空闲时）
  useEffect(() => {
    if (taskIdFromUrl && timer.phase === 'idle') {
      setLinkedTaskId(taskIdFromUrl);
      if (modeFromUrl) {
        setTimerMode(modeFromUrl);
      }
    }
  }, [taskIdFromUrl, modeFromUrl, timer.phase, setLinkedTaskId, setTimerMode]);

  // 从右键菜单进入时自动开始专注
  useEffect(() => {
    if (taskIdFromUrl && !timer.isRunning && timer.phase === 'idle') {
      // 短暂延迟确保组件完全初始化
      const autoStartTimer = setTimeout(() => {
        handleStart();
      }, 300);
      return () => clearTimeout(autoStartTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdFromUrl]); // 只在 taskIdFromUrl 变化时触发

  // 页面挂载时刷新数据
  useEffect(() => {
    loadOverview();
    loadSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 加载任务列表
  const loadTaskList = useCallback(async () => {
    try {
      const data = await getTasks({ status: 'pending,in_progress', limit: 50 });
      setTaskList(data.tasks || []);
    } catch (e) {
      console.error('加载任务列表失败:', e);
    }
  }, []);

  // 打开任务选择弹窗
  const handleOpenTaskSelect = useCallback(() => {
    loadTaskList();
    setTaskSelectVisible(true);
  }, [loadTaskList]);

  // 选择任务
  const handleSelectTask = useCallback((task: Task | null) => {
    setLinkedTaskId(task?.id || null);
    setLinkedTask(task);
    setTaskSelectVisible(false);
    setTaskSearchKeyword('');
  }, [setLinkedTaskId, setLinkedTask]);

  // 模式切换
  const handleModeChange = useCallback((value: string | number) => {
    const newMode: TimerMode = value === '番茄计时' ? 'pomodoro' : 'stopwatch';
    if (timer.phase !== 'idle') {
      message.warning('请先停止当前计时');
      return;
    }
    setTimerMode(newMode);
    timer.reset();
  }, [timer, setTimerMode]);

  // 格式化时长显示
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  };

  // 格式化时间段
  const formatTimeRange = (startedAt: string, endedAt: string): string => {
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const formatTime = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return `${formatTime(start)} - ${formatTime(end)}`;
  };

  // 按日期分组专注记录
  const groupSessionsByDate = (sessions: FocusSession[]) => {
    const groups: Record<string, FocusSession[]> = {};
    sessions.forEach(s => {
      const date = s.started_at?.split('T')[0] || '';
      if (!groups[date]) groups[date] = [];
      groups[date].push(s);
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  };

  // 格式化日期显示
  const formatDateLabel = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    
    if (date.getFullYear() === now.getFullYear()) {
      return `${month}月${day}日`;
    }
    return `${date.getFullYear()}/${month}/${day}`;
  };

  // 过滤任务列表
  const filteredTaskList = taskList.filter(task => 
    !taskSearchKeyword || task.title.toLowerCase().includes(taskSearchKeyword.toLowerCase())
  );

  const groupedSessions = groupSessionsByDate(sessions);
  const isIdle = timer.phase === 'idle';

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
              value={timerMode === 'pomodoro' ? '番茄计时' : '正计时'}
              onChange={handleModeChange}
            />
          </div>
          <div className="toolbar-actions">
            <span className="toolbar-icon more-icon">...</span>
          </div>
        </div>

        {/* 计时器主体 */}
        <div className="timer-main">
          <div className="focus-label" onClick={handleOpenTaskSelect}>
            <span>
              {!isIdle && timerMode === 'pomodoro' && timer.phase === 'work' && (linkedTask?.title || '工作中')}
              {!isIdle && timerMode === 'pomodoro' && timer.phase === 'break' && '休息中'}
              {!isIdle && timerMode === 'stopwatch' && (linkedTask?.title || '专注中')}
              {isIdle && (linkedTask?.title || '专注')}
            </span>
            <RightOutlined style={{ fontSize: 12 }} />
          </div>
          
          <TimerDisplay
            timeLeft={timer.timeLeft}
            elapsedTime={timer.elapsedTime}
            phase={timer.phase}
            totalTime={timer.phase === 'break' ? breakDuration : workDuration}
            mode={timerMode}
            isPaused={timer.isPaused}
          />
          
          <TimerControls
            isRunning={timer.isRunning}
            isPaused={timer.isPaused}
            phase={timer.phase}
            mode={timerMode}
            onStart={handleStart}
            onPause={timer.pause}
            onResume={timer.start}
            onEnd={handleEnd}
            onStop={handleStopStopwatch}
          />
        </div>
      </div>

      {/* 右侧 - 统计面板 */}
      <div className="pomodoro-right">
        <h3 className="panel-title">概览</h3>
        <div className="stats-grid">
          <div className="stat-card stat-card-purple">
            <span className="stat-label">今日番茄</span>
            <span className="stat-number">{overview?.today_pomodoro_count || 0}</span>
          </div>
          <div className="stat-card stat-card-blue">
            <span className="stat-label">今日专注时长</span>
            <span className="stat-number">
              {formatDuration(overview?.today_focus_duration || 0)}
            </span>
          </div>
          <div className="stat-card stat-card-purple">
            <span className="stat-label">总番茄</span>
            <span className="stat-number">{overview?.total_pomodoro_count || 0}</span>
          </div>
          <div className="stat-card stat-card-blue">
            <span className="stat-label">总专注时长</span>
            <span className="stat-number">
              {formatDuration(overview?.total_focus_duration || 0)}
            </span>
          </div>
        </div>

        <div className="records-section">
          <div className="records-header">
            <h3 className="panel-title">专注记录</h3>
            <PlusOutlined className="add-record-btn" />
          </div>
          
          {groupedSessions.length === 0 ? (
            <div className="records-empty">
              <Empty description="还没有专注记录" />
            </div>
          ) : (
            <div className="records-list">
              {groupedSessions.map(([date, dateSessions]) => (
                <div key={date} className="records-date-group">
                  <div className="date-label">{formatDateLabel(date)}</div>
                  {dateSessions.map(session => (
                    <div key={session.id} className="record-item">
                      <div className="record-main">
                        <span className={`record-type-icon ${session.type === 'pomodoro' ? 'icon-pomodoro' : 'icon-stopwatch'}`}>
                          {session.type === 'pomodoro' 
                            ? <ClockCircleFilled /> 
                            : <FieldTimeOutlined />}
                        </span>
                        <span className="record-time-range">
                          {formatTimeRange(session.started_at, session.ended_at)}
                        </span>
                        <span className="record-duration">
                          {formatDuration(session.duration)}
                        </span>
                      </div>
                      {session.task_title && (
                        <div className="record-task">
                          <span className="task-dot">○</span>
                          <span className="task-name">{session.task_title}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 任务选择弹窗 */}
      <Modal
        title="选择关联任务"
        open={taskSelectVisible}
        onCancel={() => setTaskSelectVisible(false)}
        footer={null}
        width={400}
      >
        <Input
          placeholder="搜索任务..."
          prefix={<SearchOutlined />}
          value={taskSearchKeyword}
          onChange={e => setTaskSearchKeyword(e.target.value)}
          style={{ marginBottom: 16 }}
        />
        <AntList
          dataSource={[{ id: '', title: '不关联任务' } as Task, ...filteredTaskList]}
          renderItem={task => (
            <AntList.Item 
              onClick={() => handleSelectTask(task.id ? task : null)}
              style={{ cursor: 'pointer', padding: '8px 12px' }}
              className={linkedTaskId === task.id ? 'selected-task' : ''}
            >
              {task.title}
            </AntList.Item>
          )}
          style={{ maxHeight: 300, overflow: 'auto' }}
        />
      </Modal>
    </div>
  );
};

export default PomodoroTimer;
