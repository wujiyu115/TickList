// 用户类型
export interface User {
  id: string;
  username: string;
  email: string;
  role_group: string;
  created_at: string;
}

// 任务类型
export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 0 | 1 | 2 | 3 | 4;  // 0=无, 1=红旗, 2=黄旗, 3=蓝旗, 4=灰旗
  child_ids: string[];
  list_id?: string;
  user_id: string;
  start_time?: string;
  due_date?: string;
  reminder_time?: string;
  is_pinned: boolean;
  tags: string[];
  order: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  children?: Task[];
}

// 任务创建请求
export interface TaskCreateRequest {
  title: string;
  description?: string;
  status?: string;
  priority?: number;
  parent_task_id?: string;  // 创建子任务时传父任务 ID，后端负责维护 child_ids
  list_id?: string;
  start_time?: string;
  due_date?: string;
  reminder_time?: string;
  is_pinned?: boolean;
  tags?: string[];
  order?: number;
}

// 任务更新请求
export interface TaskUpdateRequest {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  list_id?: string;
  start_time?: string;
  due_date?: string;
  reminder_time?: string;
  is_pinned?: boolean;
  tags?: string[];
  order?: number;
}

// 任务统计
export interface TaskStatistics {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  cancelled_tasks: number;
  completion_rate: number;
  daily_stats: DailyStats[];
  tag_distribution: Record<string, number>;
  priority_distribution: Record<number, number>;
}

// 每日统计
export interface DailyStats {
  date: string;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  cancelled_tasks: number;
  completion_rate: number;
}

// 登录响应
export interface LoginResponse {
  user: User;
  token: string;
  success: boolean;
  message?: string;
}

// 登录请求
export interface LoginRequest {
  username: string;
  password: string;
}

// 日历任务分组
export interface CalendarTasksByDate {
  [date: string]: Task[];
}

// 日历API请求参数
export interface CalendarTasksRequest {
  start_date: string;
  end_date: string;
}

// 日历API响应
export interface CalendarTasksResponse {
  tasks: Task[];
  total: number;
}

// 倒数日相关类型
export interface Countdown {
  id: string;
  user_id: string;
  title: string;
  target_date: string;
  category: 'birthday' | 'anniversary' | 'holiday' | 'custom';
  is_pinned: boolean;
  color: string;
  repeat_annually: boolean;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface CountdownCreateRequest {
  title: string;
  target_date: string;
  category?: string;
  is_pinned?: boolean;
  color?: string;
  repeat_annually?: boolean;
  note?: string;
}

export interface CountdownUpdateRequest {
  title?: string;
  target_date?: string;
  category?: string;
  is_pinned?: boolean;
  color?: string;
  repeat_annually?: boolean;
  note?: string;
}

// 清单类型
export interface TaskList {
  id: string;
  name: string;
  user_id: string;
  type: 'folder' | 'list';
  parent_id?: string;
  color: string;
  order: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskListCreateRequest {
  name: string;
  type?: 'folder' | 'list';
  parent_id?: string;
  color?: string;
  order?: number;
}

export interface TaskListUpdateRequest {
  name?: string;
  parent_id?: string;
  color?: string;
  order?: number;
  is_archived?: boolean;
}

// 标签类型
export interface Tag {
  id: string;
  name: string;
  user_id: string;
  color: string;
  created_at: string;
}

export interface TagCreateRequest {
  name: string;
  color?: string;
}

export interface TagUpdateRequest {
  name?: string;
  color?: string;
}

// 过滤器类型
export interface Filter {
  id: string;
  name: string;
  user_id: string;
  conditions: FilterConditions;
  created_at: string;
  updated_at: string;
}

export interface FilterConditions {
  list_id?: string;       // 清单ID，null/undefined表示所有
  tags?: string[];        // 标签列表
  date_range?: string;    // 日期范围: today/week/month/all
  priority?: number[];    // 优先级列表
  keyword?: string;       // 内容包含
}
