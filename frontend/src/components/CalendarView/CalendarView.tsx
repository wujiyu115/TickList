import React, { useState, useEffect, useCallback, useContext } from 'react';
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
import { getSettings } from '../../api/settings';
import { useTaskContext } from '../../contexts/TaskContext';
import { ThemeContext } from '../../App';
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

// 任务颜色数组 - 浅色模式
const TASK_COLORS_LIGHT = [
  '#FFE4E6', // 浅粉
  '#DBEAFE', // 浅蓝
  '#D1FAE5', // 浅绿
  '#FEF9C3', // 浅黄
  '#EDE9FE', // 浅紫
  '#CFFAFE', // 浅青
  '#FED7AA', // 浅橙
  '#E0E7FF', // 浅靛蓝
];

// 任务颜色数组 - 暗色模式
const TASK_COLORS_DARK = [
  'rgba(255, 228, 230, 0.15)', // 粉色调
  'rgba(219, 234, 254, 0.15)', // 蓝色调
  'rgba(209, 250, 229, 0.15)', // 绿色调
  'rgba(254, 249, 195, 0.15)', // 黄色调
  'rgba(237, 233, 254, 0.15)', // 紫色调
  'rgba(207, 250, 254, 0.15)', // 青色调
  'rgba(254, 215, 170, 0.15)', // 橙色调
  'rgba(224, 231, 255, 0.15)', // 靛蓝调
];

// 兼容旧引用
export const TASK_COLORS = TASK_COLORS_LIGHT;

// 根据任务 id 的 hash 值稳定分配颜色
export const getTaskColor = (taskId: string, isDark: boolean = false): string => {
  let hash = 0;
  for (let i = 0; i < taskId.length; i++) {
    hash = taskId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = isDark ? TASK_COLORS_DARK : TASK_COLORS_LIGHT;
  return colors[Math.abs(hash) % colors.length];
};

// 计算日历显示的42天（6行7列），支持 weekStartDay
const getCalendarDays = (month: Dayjs, weekStartDay: number = 0): Dayjs[] => {
  const startOfMonth = month.startOf('month');
  const endOfMonth = month.endOf('month');
  const monthStartDayOfWeek = startOfMonth.day(); // 0=周日, 1=周一, ...
  const daysInMonth = endOfMonth.date();

  const days: Dayjs[] = [];

  // 计算第一天之前需要填充的天数
  // 如果 weekStartDay=1(周一), monthStartDayOfWeek=0(周日), 则需要填充6天
  // 如果 weekStartDay=0(周日), monthStartDayOfWeek=0(周日), 则不需要填充
  let daysToFill = monthStartDayOfWeek - weekStartDay;
  if (daysToFill < 0) {
    daysToFill += 7;
  }

  // 上月末尾的日期
  for (let i = daysToFill - 1; i >= 0; i--) {
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

// 星期名称数组（0=周日，1=周一...）
const WEEKDAYS_ALL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

// 根据 weekStartDay 获取排序后的星期名称
const getOrderedWeekdays = (weekStartDay: number = 0): string[] => {
  const result: string[] = [];
  for (let i = 0; i < 7; i++) {
    result.push(WEEKDAYS_ALL[(weekStartDay + i) % 7]);
  }
  return result;
};

const CalendarView: React.FC<CalendarViewProps> = ({ onTaskClick }) => {
  const [currentDate, setCurrentDate] = useState<Dayjs>(dayjs());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [tasksByDate, setTasksByDate] = useState<CalendarTasksByDate>({});
  const [loading, setLoading] = useState(false);
  const [weekStartDay, setWeekStartDay] = useState<number>(0); // 0=周日, 1=周一
  
  // 使用 TaskContext 获取全局任务列表和更新方法
  const { tasks: allTasks, updateTaskData } = useTaskContext();
  const themeCtx = useContext(ThemeContext);
  const isDark = themeCtx?.isDark ?? false;

  // 加载用户设置中的周起始日
  useEffect(() => {
    const loadWeekStartDay = async () => {
      try {
        const settings = await getSettings();
        if (settings.week_start_day !== undefined) {
          setWeekStartDay(settings.week_start_day);
        }
      } catch (e) {
        console.error('Failed to load week start day:', e);
      }
    };
    loadWeekStartDay();
  }, []);

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
        const monthStartDayOfWeek = startOfMonth.day();
        let daysToFill = monthStartDayOfWeek - weekStartDay;
        if (daysToFill < 0) daysToFill += 7;
        const actualStart = startOfMonth.subtract(daysToFill, 'day');
        const actualEnd = actualStart.add(41, 'day');
        return { start: actualStart, end: actualEnd };
      }
      case 'week': {
        // 根据 weekStartDay 计算周的起始日
        const currentDayOfWeek = date.day();
        let daysFromStart = currentDayOfWeek - weekStartDay;
        if (daysFromStart < 0) daysFromStart += 7;
        const startOfWeek = date.subtract(daysFromStart, 'day');
        const endOfWeek = startOfWeek.add(6, 'day').endOf('day');
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
  }, [weekStartDay]);

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

  const calendarDays = getCalendarDays(currentDate, weekStartDay);
  const orderedWeekdays = getOrderedWeekdays(weekStartDay);

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
            {orderedWeekdays.map((day) => (
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
                            style={{ background: getTaskColor(task.id, isDark) }}
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
          weekStartDay={weekStartDay}
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
