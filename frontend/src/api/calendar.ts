import api from './index';
import { CalendarTasksResponse } from '../types';

// 获取日历任务
export const getCalendarTasks = async (
  startDate: string,
  endDate: string
): Promise<CalendarTasksResponse> => {
  return api.get('/calendar/tasks', {
    params: {
      start_date: startDate,
      end_date: endDate,
    },
  });
};
