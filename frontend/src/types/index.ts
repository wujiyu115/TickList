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
  status: 'pending' | 'in_progress' | 'completed';
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
  push_due_notify?: boolean;  // 截止推送通知
  pomodoro_count?: number;     // 番茄专注次数
  focus_duration?: number;     // 专注时长（秒）
  created_at: string;
  updated_at: string;
  content: string;
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
  content?: string;
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
  push_due_notify?: boolean;
  content?: string;
}

// 任务统计
export interface TaskStatistics {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
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
  push_due_notify?: boolean;  // 到期推送通知
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
  push_due_notify?: boolean;
}

export interface CountdownUpdateRequest {
  title?: string;
  target_date?: string;
  category?: string;
  is_pinned?: boolean;
  color?: string;
  repeat_annually?: boolean;
  note?: string;
  push_due_notify?: boolean;
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

// 用户设置类型
export interface UserSettings {
  user_id: string;
  // 外观设置
  theme: string;                    // 配色方案: default/green/purple/orange/rose/minimal/dark/midnight
  language: string;                 // 语言: zh-CN/en-US
  // 任务默认设置
  default_view: string;             // 默认视图: tasks/calendar/statistics/pomodoro
  default_task_view: string;        // 默认任务视图模式: list/kanban
  default_priority: number;         // 默认优先级: 0-4
  default_list_id: string | null;   // 默认清单ID
  // 日期与时间
  week_start_day: number;           // 周起始日: 0=周日, 1=周一
  date_format: string;              // 日期格式: MM-DD/DD-MM/YYYY-MM-DD
  time_format: string;              // 时间格式: 24h/12h
  timezone: string;                 // 时区
  // 番茄钟设置
  pomodoro_duration: number;        // 番茄钟时长（分钟）
  short_break_duration: number;     // 短休息时长
  long_break_duration: number;      // 长休息时长
  pomodoro_auto_start: boolean;     // 是否自动开始下一个
  focus_min_duration: number;       // 最短专注时长（分钟）
  // 通知设置
  notification_enabled: boolean;    // 是否启用通知
  notification_sound: boolean;      // 是否播放提示音
  // 推送设置
  push_enabled: boolean;            // 全局推送开关
  push_channels: string;            // 推送渠道配置 JSON 字符串
  push_interval: number;            // 推送检查间隔（分钟）
  push_batch_size: number;          // 每次推送合并的最大条数
  // 时间戳
  created_at?: string;
  updated_at?: string;
}

// 推送渠道配置类型
export interface BarkConfig {
  device_key: string;
  server_url: string;
  sound: string;
  group: string;
}

export interface CustomHttpConfig {
  url: string;
  method: string;
  headers: Record<string, string>;
  body_template: string;
}

export interface PushChannelConfig {
  id: string;
  type: 'bark' | 'custom_http';
  name: string;
  enabled: boolean;
  config: BarkConfig | CustomHttpConfig;
}
