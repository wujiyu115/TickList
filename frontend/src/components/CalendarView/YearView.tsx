import React from 'react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { CalendarTasksByDate } from '../../types';

interface YearViewProps {
  currentDate: Dayjs;
  tasksByDate: CalendarTasksByDate;
  onMonthClick?: (month: number) => void;
}

const MONTH_NAMES = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
];

const WEEKDAY_SHORT = ['日', '一', '二', '三', '四', '五', '六'];

// 计算某月的迷你日历显示的42天
const getMiniCalendarDays = (year: number, month: number): Dayjs[] => {
  const firstDay = dayjs().year(year).month(month).startOf('month');
  const endOfMonth = firstDay.endOf('month');
  const startDay = firstDay.day();
  const daysInMonth = endOfMonth.date();

  const days: Dayjs[] = [];

  // 上月末尾的日期
  for (let i = startDay - 1; i >= 0; i--) {
    days.push(firstDay.subtract(i + 1, 'day'));
  }

  // 当月日期
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(firstDay.date(i));
  }

  // 下月开头的日期（补满6行 = 42天）
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(endOfMonth.add(i, 'day'));
  }

  return days;
};

const YearView: React.FC<YearViewProps> = ({ currentDate, tasksByDate, onMonthClick }) => {
  const currentYear = currentDate.year();
  const today = dayjs();

  // 获取某一天的任务数量
  const getTaskCount = (day: Dayjs): number => {
    const dateKey = day.format('YYYY-MM-DD');
    return (tasksByDate[dateKey] || []).length;
  };

  // 根据任务数量返回样式类名
  const getTaskClass = (taskCount: number): string => {
    if (taskCount === 0) return '';
    if (taskCount >= 3) return 'has-many-tasks';
    return 'has-tasks';
  };

  return (
    <div className="year-view">
      <div className="year-grid">
        {MONTH_NAMES.map((monthName, monthIndex) => {
          const miniDays = getMiniCalendarDays(currentYear, monthIndex);

          return (
            <div key={monthIndex} className="mini-calendar">
              <div
                className="mini-month-title"
                onClick={() => onMonthClick?.(monthIndex)}
              >
                {monthName}
              </div>
              
              <div className="mini-weekdays">
                {WEEKDAY_SHORT.map((day) => (
                  <div key={day} className="mini-weekday">
                    {day}
                  </div>
                ))}
              </div>

              <div className="mini-days">
                {miniDays.map((day, dayIndex) => {
                  const isCurrentMonth = day.month() === monthIndex;
                  const isToday = day.isSame(today, 'day');
                  const taskCount = getTaskCount(day);
                  const taskClass = getTaskClass(taskCount);

                  return (
                    <div
                      key={dayIndex}
                      className={`mini-day ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${taskClass}`}
                    >
                      {day.date()}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default YearView;
