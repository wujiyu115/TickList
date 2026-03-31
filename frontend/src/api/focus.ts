import request from './index';

// 专注概览响应
export interface FocusOverview {
  today_pomodoro_count: number;
  today_focus_duration: number;  // 秒
  total_pomodoro_count: number;
  total_focus_duration: number;  // 秒
}

// 专注记录
export interface FocusSession {
  id: string;
  user_id: string;
  task_id?: string;
  task_title?: string;
  type: 'pomodoro' | 'stopwatch';
  duration: number;  // 秒
  started_at: string;
  ended_at: string;
  created_at: string;
}

// 专注记录列表响应
export interface FocusSessionsResponse {
  sessions: FocusSession[];
  total: number;
  page: number;
  page_size: number;
}

// 创建专注记录请求
export interface FocusSessionCreateRequest {
  task_id?: string;
  type: 'pomodoro' | 'stopwatch';
  duration: number;
  started_at: string;
  ended_at: string;
}

// 获取专注概览
export const getFocusOverview = (): Promise<FocusOverview> => {
  return request.get('/focus/overview');
};

// 获取专注记录列表
export const getFocusSessions = (params?: {
  page?: number;
  page_size?: number;
  start_date?: string;
  end_date?: string;
}): Promise<FocusSessionsResponse> => {
  return request.get('/focus/sessions', { params });
};

// 创建专注记录
export const createFocusSession = (data: FocusSessionCreateRequest): Promise<FocusSession> => {
  return request.post('/focus/sessions', data);
};

// 删除专注记录
export const deleteFocusSession = (id: string): Promise<{ success: boolean }> => {
  return request.delete(`/focus/sessions/${id}`);
};
