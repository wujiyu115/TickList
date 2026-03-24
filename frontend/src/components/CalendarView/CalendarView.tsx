import React, { useState, useEffect, useCallback } from 'react';
import { Button, Spin, Dropdown, Checkbox } from 'antd';
import {
  CalendarOutlined,
  PlusOutlined,
  LeftOutlined,
  RightOutlined,
  EllipsisOutlined,
  DownOutlined,
} from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Task, CalendarTasksByDate } from '../../types';
import { getCalendarTasks } from '../../api/calendar';
import { useTaskContext } from '../../contexts/TaskContext';
import TaskPopover from './TaskPopover';
import WeekView from './WeekView';
import DayView from './DayView';
import YearView from './YearView';
import './CalendarView.less';

interface CalendarViewProps {
  onTaskClick?: (task: Task) => void;
}

// 视图模式类型
export type ViewMode = 'month' | 'week' | 'day' | 'year';

// 任务颜色数组
export const TASK_COLORS = [
  '#FFE4E6', // 浅粉
  '#DBEAFE', // 浅蓝
  '#D1FAE5', // 浅绿
  '#FEF9C3', // 浅黄
  '#EDE9FE', // 浅紫
  '#CFFAFE', // 浅青
  '#FED7AA', // 浅橙
  '#E0E7FF', // 浅靛蓝
];

// 根据任务 id 的 hash 值稳定分配颜色
export const getTaskColor = (taskId: string): string => {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TASK_COLORS[Math.abs(hash) % TASK_COLORS.length];
};

// 计算日历显示的42天（6行7列）
const getCalendarDays = (month: Dayjs): Dayjs[] => {
  const startOfMonth = month.startOf('month');
  const endOfMonth = month.endOf('month');
  const startDay = startOfMonth.day(); // 0=周日
  const daysInMonth = endOfMonth.date();

  const days: Dayjs[] = [];

  // 上月末尾的日期
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(startOfMonth.subtract(i + 1, 'day'));
  }

  // 当月日期
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(month.date(i));
  }

  // 下月开头的日期（补满6行 = 42天）
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(endOfMonth.add(i, 'day'));
  }

  return days;
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const CalendarView: React.FC<CalendarViewProps> = ({ onTaskClick }) => {
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasksByDate, setTasksByDate] = useState<CalendarTasksByDate>({});
  const [loading, setLoading] = useState(false);
  
  // 使用 TaskContext 获取全局任务列表和更新方法
  const { tasks: allTasks, updateTaskData } = useTaskContext();

  // 切换任务完成状态
  const handleToggleComplete = useCallback(async (task: Task) => {
    const isCompleting = task.status !== 'completed';
    try {
      await updateTaskData(task.id, {
        status: isCompleting ? 'completed' : 'pending',
        completed_at: isCompleting ? dayjs().toISOString() : null,
      });
      // 刷新日历任务
      fetchTasks(currentDate, viewMode);
    } catch (error) {
      console.error('更新任务状态失败:', error);
    }
  }, [updateTaskData, currentDate, viewMode]);

  // 计算日期范围
  const getDateRange = useCallback((date: Dayjs, mode: ViewMode): { start: Dayjs; end: Dayjs } => {
    switch (mode) {
      case 'month': {
        const startOfMonth = date.startOf('month');
        const startDay = startOfMonth.day();
        const actualStart = startOfMonth.subtract(startDay, 'day');
        const actualEnd = actualStart.add(41, 'day');
        return { start: actualStart, end: actualEnd };
      }
      case 'week': {
        const startOfWeek = date.startOf('week');
        const endOfWeek = date.endOf('week');
        return { start: startOfWeek, end: endOfWeek };
      }
      case 'day': {
        return { start: date.startOf('day'), end: date.endOf('day') };
      }
      case 'year': {
        const startOfYear = date.startOf('year');
        const endOfYear = date.endOf('year');
        return { start: startOfYear, end: endOfYear };
      }
      default:
        return { start: date, end: date };
    }
  }, []);

  // 获取任务
  const fetchTasks = useCallback(async (date: Dayjs, mode: ViewMode) => {
    setLoading(true);
    try {
      const { start, end } = getDateRange(date, mode);

      const response = await getCalendarTasks(
        start.format('YYYY-MM-DD'),
        end.format('YYYY-MM-DD')
      );

      // 按日期分组任务
      const grouped: CalendarTasksByDate = {};
      response.tasks.forEach((task) => {
        if (task.due_date) {
          const dateKey = dayjs(task.due_date).format('YYYY-MM-DD');
          if (!grouped[dateKey]) {
            grouped[dateKey] = [];
          }
          grouped[dateKey].push(task);
        }
      });

      setTasksByDate(grouped);
    } catch (error) {
      console.error('获取日历任务失败:', error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchTasks(currentDate, viewMode);
  }, [currentDate, viewMode, fetchTasks]);

  // 导航方法
  const goToPrev = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate((prev) => prev.subtract(1, 'month'));
        break;
      case 'week':
        setCurrentDate((prev) => prev.subtract(1, 'week'));
        break;
      case 'day':
        setCurrentDate((prev) => prev.subtract(1, 'day'));
        break;
      case 'year':
        setCurrentDate((prev) => prev.subtract(1, 'year'));
        break;
    }
  };

  const goToNext = () => {
    switch (viewMode) {
      case 'month':
        setCurrentDate((prev) => prev.add(1, 'month'));
        break;
      case 'week':
        setCurrentDate((prev) => prev.add(1, 'week'));
        break;
      case 'day':
        setCurrentDate((prev) => prev.add(1, 'day'));
        break;
      case 'year':
        setCurrentDate((prev) => prev.add(1, 'year'));
        break;
    }
  };

  const goToToday = () => {
    setCurrentDate(dayjs());
  };

  // 获取标题文本
  const getTitleText = (): string => {
    switch (viewMode) {
      case 'month':
        return currentDate.format('M月');
      case 'week':
        return currentDate.format('M月');
      case 'day':
        return currentDate.format('M月D日');
      case 'year':
        return currentDate.format('YYYY年');
      default:
        return currentDate.format('M月');
    }
  };

  // 获取视图按钮文字
  const getViewButtonText = (): string => {
    switch (viewMode) {
      case 'month': return '月';
      case 'week': return '周';
      case 'day': return '日';
      case 'year': return '年';
      default: return '月';
    }
  };

  // 视图下拉菜单
  const viewMenuItems = [
    { key: 'year', label: '年视图' },
    { key: 'month', label: '月视图' },
    { key: 'week', label: '周视图' },
    { key: 'day', label: '日视图' },
  ];

  const handleViewChange = (key: string) => {
    setViewMode(key as ViewMode);
  };

  // 年视图点击月份
  const handleMonthClick = (month: number) => {
    setCurrentDate(currentDate.month(month));
    setViewMode('month');
  };

  const calendarDays = getCalendarDays(currentDate);

  if (loading && Object.keys(tasksByDate).length === 0) {
    return (
      <div className="calendar-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="calendar-view">
      {/* 顶部工具栏 */}
      <div className="calendar-toolbar">
        <div className="toolbar-left">
          <CalendarOutlined className="calendar-icon" />
          <h2 className="month-title">{getTitleText()}</h2>
        </div>
        <div className="toolbar-right">
          <Button icon={<PlusOutlined />} type="text" className="toolbar-btn" />
          <Dropdown
            menu={{
              items: viewMenuItems,
              onClick: ({ key }) => handleViewChange(key),
              selectedKeys: [viewMode],
            }}
            trigger={['click']}
          >
            <Button className="view-dropdown">
              {getViewButtonText()} <DownOutlined />
            </Button>
          </Dropdown>
          <Button.Group className="nav-btn-group">
            <Button icon={<LeftOutlined />} onClick={goToPrev} />
            <Button onClick={goToToday}>今天</Button>
            <Button icon={<RightOutlined />} onClick={goToNext} />
          </Button.Group>
          <Button icon={<EllipsisOutlined />} type="text" className="toolbar-btn" />
        </div>
      </div>

      {/* 根据视图模式渲染不同内容 */}
      {viewMode === 'month' && (
        <>
          {/* 星期行 */}
          <div className="calendar-weekdays">
            {WEEKDAYS.map((day) => (
              <div key={day} className="weekday-cell">
                {day}
              </div>
            ))}
          </div>

          {/* 日历网格 */}
          <div className="calendar-grid">
            {calendarDays.map((day, index) => {
              const dateKey = day.format('YYYY-MM-DD');
              const tasks = tasksByDate[dateKey] || [];
              const isToday = day.isSame(dayjs(), 'day');
              const isCurrentMonth = day.month() === currentDate.month();

              return (
                <div
                  key={index}
                  className={`calendar-cell ${!isCurrentMonth ? 'other-month' : ''} ${
                    isToday ? 'today' : ''
                  }`}
                >
                  <div className="cell-date">
                    <span className={`date-number ${isToday ? 'today-highlight' : ''}`}>
                      {day.date() === 1 ? day.format('M月D日') : day.date()}
                    </span>
                  </div>
                  <div className="cell-tasks">
                    {tasks.slice(0, 5).map((task) => {
                      const isCompleted = task.status === 'completed';
                      return (
                        <TaskPopover
                          key={task.id}
                          tasks={[task]}
                          date={day}
                          allTasks={allTasks}
                          onTaskClick={onTaskClick}
                          onToggleComplete={handleToggleComplete}
                        >
                          <div
                            className={`task-bar ${isCompleted ? 'task-bar-completed' : ''}`}
                            style={{ background: getTaskColor(task.id) }}
                          >
                            <Checkbox
                              checked={isCompleted}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleComplete(task);
                              }}
                              className="task-bar-checkbox"
                            />
                            <span className={`task-name ${isCompleted ? 'task-name-completed' : ''}`}>
                              {task.title}
                            </span>
                            {task.due_date && (
                              <span className="task-time">
                                {dayjs(task.due_date).format('H:mm')}
                              </span>
                            )}
                          </div>
                        </TaskPopover>
                      );
                    })}
                    {tasks.length > 5 && (
                      <TaskPopover
                        tasks={tasks}
                        date={day}
                        allTasks={allTasks}
                        onTaskClick={onTaskClick}
                        onToggleComplete={handleToggleComplete}
                      >
                        <div className="more-tasks">+{tasks.length - 5} 更多</div>
                      </TaskPopover>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          currentDate={currentDate}
          tasksByDate={tasksByDate}
          allTasks={allTasks}
          onTaskClick={onTaskClick}
          onToggleComplete={handleToggleComplete}
        />
      )}

      {viewMode === 'day' && (
        <DayView
          currentDate={currentDate}
          tasksByDate={tasksByDate}
          allTasks={allTasks}
          onTaskClick={onTaskClick}
          onToggleComplete={handleToggleComplete}
        />
      )}

      {viewMode === 'year' && (
        <YearView
          currentDate={currentDate}
          tasksByDate={tasksByDate}
          onMonthClick={handleMonthClick}
        />
      )}
    </div>
  );
};

export default CalendarView;
