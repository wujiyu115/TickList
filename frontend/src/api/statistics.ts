import api from './index';
import { TaskStatistics, DailyStats } from '../types';

// 获取统计概览
export const getStatisticsOverview = async (): Promise<TaskStatistics> => {
  return api.get('/statistics/overview');
};

// 获取每日统计
export const getDailyStatistics = async (date: string): Promise<DailyStats> => {
  return api.get('/statistics/daily', { params: { date_str: date } });
};

// 获取趋势数据
export const getStatisticsTrend = async (days: number = 30): Promise<{ trend: DailyStats[]; days: number }> => {
  return api.get('/statistics/trend', { params: { days } });
};

// 获取时间范围内的统计
export const getStatisticsRange = async (startDate: string, endDate: string): Promise<{
  statistics: DailyStats[];
  start_date: string;
  end_date: string;
}> => {
  return api.get('/statistics/range', { params: { start_date: startDate, end_date: endDate } });
};
