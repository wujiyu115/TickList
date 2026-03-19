import React from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Task, CalendarTasksByDate } from '../../types';
import { getTaskColor } from './CalendarView';
import TaskPopover from './TaskPopover';

interface DayViewProps {
  currentDate: Dayjs;
  tasksByDate: CalendarTasksByDate;
  onTaskClick?: (task: Task) => void;
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;

// 格式化时间显示
const formatHour = (hour: number): string => {
  if (hour === 0) return '00:00';
  return `${hour.toString().padStart(2, '0')}:00`;
};

// 解析任务时间，返回小时和分钟
const parseTaskTime = (dueDate: string): { hour: number; minute: number } => {
  const date = dayjs(dueDate);
  return {
    hour: date.hour(),
    minute: date.minute(),
  };
};

// 计算任务在时间网格中的位置
const getTaskPosition = (task: Task): { top: number; height: number } => {
  if (!task.due_date) {
    return { top: 0, height: HOUR_HEIGHT };
  }
  const { hour, minute } = parseTaskTime(task.due_date);
  const top = hour * HOUR_HEIGHT + (minute / 60) * HOUR_HEIGHT;
  // 默认任务持续1小时
  const height = HOUR_HEIGHT;
  return { top, height };
};

const DayView: React.FC<DayViewProps> = ({ currentDate, tasksByDate, onTaskClick }) => {
  const today = dayjs();
  const isToday = currentDate.isSame(today, 'day');
  const dayOfWeek = currentDate.day();
  const dateKey = currentDate.format('YYYY-MM-DD');
  const tasks = tasksByDate[dateKey] || [];

  return (
    <div className="day-view">
      {/* 日期头部 */}
      <div className="day-view-header">
        <div className="time-axis-placeholder" />
        <div className="day-header-content">
          <div className="day-name">{WEEKDAY_NAMES[dayOfWeek]}</div>
          <div className={`day-number ${isToday ? 'today-highlight' : ''}`}>
            {currentDate.date()}
          </div>
        </div>
      </div>

      {/* 时间网格容器 */}
      <div className="time-grid-container">
        {/* 左侧时间轴 */}
        <div className="time-axis">
          {HOURS.map((hour) => (
            <div key={hour} className="hour-label">
              {formatHour(hour)}
            </div>
          ))}
        </div>

        {/* 主体时间网格 */}
        <div className="time-grid day-grid">
          {/* 背景网格线 */}
          <div className="grid-lines">
            {HOURS.map((hour) => (
              <div key={hour} className="hour-row" />
            ))}
          </div>

          {/* 任务区域 */}
          <div className={`day-column ${isToday ? 'today-column' : ''}`}>
            {tasks.map((task) => {
              const { top, height } = getTaskPosition(task);
              const backgroundColor = getTaskColor(task.id);
              const time = task.due_date
                ? dayjs(task.due_date).format('HH:mm')
                : '';
              const endTime = task.due_date
                ? dayjs(task.due_date).add(1, 'hour').format('HH:mm')
                : '';

              return (
                <TaskPopover
                  key={task.id}
                  tasks={[task]}
                  date={currentDate}
                  onTaskClick={onTaskClick}
                >
                  <div
                    className="task-block day-task-block"
                    style={{
                      top: `${top}px`,
                      height: `${height}px`,
                      backgroundColor,
                    }}
                  >
                    <div className="task-block-title">
                      <span className="task-checkbox">☐</span>
                      {task.title}
                    </div>
                    <div className="task-block-time">
                      {time}-{endTime}
                    </div>
                  </div>
                </TaskPopover>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DayView;
