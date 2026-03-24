import React from 'react';
import { Checkbox } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Task, CalendarTasksByDate } from '../../types';
import { getTaskColor } from './CalendarView';
import TaskPopover from './TaskPopover';

interface WeekViewProps {
  currentDate: Dayjs;
  tasksByDate: CalendarTasksByDate;
  allTasks?: Task[];
  onTaskClick?: (task: Task) => void;
  onToggleComplete?: (task: Task) => void;
  weekStartDay?: number; // 0=周日, 1=周一
}

const WEEKDAY_NAMES_ALL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 60;

// 根据 weekStartDay 获取排序后的星期名称
const getOrderedWeekdayNames = (weekStartDay: number = 0): string[] => {
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    result.push(WEEKDAY_NAMES_ALL[(weekStartDay + i) % 7]);
  }
  return result;
};

// 计算当前周的日期，支持 weekStartDay
const getWeekDays = (date: Dayjs, weekStartDay: number = 0): Dayjs[] => {
  const currentDayOfWeek = date.day();
  let daysFromStart = currentDayOfWeek - weekStartDay;
  if (daysFromStart < 0) daysFromStart += 7;
  const startOfWeek = date.subtract(daysFromStart, 'day');
  return Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, 'day'));
};

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

const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  tasksByDate,
  allTasks = [],
  onTaskClick,
  onToggleComplete,
  weekStartDay = 0,
}) => {
  const weekDays = getWeekDays(currentDate, weekStartDay);
  const today = dayjs();
  const orderedWeekdayNames = getOrderedWeekdayNames(weekStartDay);

  // 获取指定日期的任务
  const getTasksForDay = (day: Dayjs): Task[] => {
    const dateKey = day.format('YYYY-MM-DD');
    return tasksByDate[dateKey] || [];
  };

  return (
    <div className="week-view">
      {/* 星期头部 */}
      <div className="week-view-header">
        <div className="time-axis-placeholder" />
        {weekDays.map((day, index) => {
          const isToday = day.isSame(today, 'day');
          return (
            <div key={index} className="week-day-header">
              <div className="day-name">{orderedWeekdayNames[index]}</div>
              <div className={`day-number ${isToday ? 'today-highlight' : ''}`}>
                {day.date()}
              </div>
            </div>
          );
        })}
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
        <div className="time-grid week-grid">
          {/* 背景网格线 */}
          <div className="grid-lines">
            {HOURS.map((hour) => (
              <div key={hour} className="hour-row" />
            ))}
          </div>

          {/* 7列任务区域 */}
          <div className="week-columns">
            {weekDays.map((day, colIndex) => {
              const tasks = getTasksForDay(day);
              const isToday = day.isSame(today, 'day');
              
              return (
                <div
                  key={colIndex}
                  className={`week-column ${isToday ? 'today-column' : ''}`}
                >
                  {tasks.map((task) => {
                    const { top, height } = getTaskPosition(task);
                    const backgroundColor = getTaskColor(task.id);
                    const time = task.due_date
                      ? dayjs(task.due_date).format('HH:mm')
                      : '';
                    const endTime = task.due_date
                      ? dayjs(task.due_date).add(1, 'hour').format('HH:mm')
                      : '';
                    const isCompleted = task.status === 'completed';

                    return (
                      <TaskPopover
                        key={task.id}
                        tasks={[task]}
                        date={day}
                        allTasks={allTasks}
                        onTaskClick={onTaskClick}
                        onToggleComplete={onToggleComplete}
                      >
                        <div
                          className={`task-block ${isCompleted ? 'task-block-completed' : ''}`}
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                            backgroundColor,
                          }}
                        >
                          <div className="task-block-title">
                            <Checkbox
                              checked={isCompleted}
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleComplete?.(task);
                              }}
                              className="task-block-checkbox"
                            />
                            <span className={isCompleted ? 'task-title-completed' : ''}>
                              {task.title}
                            </span>
                          </div>
                          <div className="task-block-time">
                            {time}-{endTime}
                          </div>
                        </div>
                      </TaskPopover>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeekView;
