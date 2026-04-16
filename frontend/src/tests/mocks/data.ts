import type { User, Task, TaskList, Tag, Countdown, Filter, FilterConditions, UserSettings } from '../../types';
import type { FocusSession } from '../../api/focus';

let idCounter = 1;
const nextId = () => String(idCounter++);

/** 重置 ID 计数器（测试间隔调用） */
export const resetIdCounter = () => { idCounter = 1; };

// ─── User ────────────────────────────────────────────────────
export const mockUser = (overrides?: Partial<User>): User => ({
  id: nextId(),
  username: 'testuser',
  email: 'test@example.com',
  role_group: 'user',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── Task ────────────────────────────────────────────────────
export const mockTask = (overrides?: Partial<Task>): Task => ({
  id: nextId(),
  title: '测试任务',
  description: '',
  status: 'pending',
  priority: 0,
  child_ids: [],
  user_id: '1',
  is_pinned: false,
  tags: [],
  order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── TaskList ────────────────────────────────────────────────
export const mockList = (overrides?: Partial<TaskList>): TaskList => ({
  id: nextId(),
  name: '默认清单',
  user_id: '1',
  type: 'list',
  color: '#1890ff',
  order: 0,
  is_archived: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── Tag ─────────────────────────────────────────────────────
export const mockTag = (overrides?: Partial<Tag>): Tag => ({
  id: nextId(),
  name: '测试标签',
  user_id: '1',
  color: '#f50',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── Countdown ───────────────────────────────────────────────
export const mockCountdown = (overrides?: Partial<Countdown>): Countdown => ({
  id: nextId(),
  user_id: '1',
  title: '倒数日测试',
  target_date: '2026-12-31',
  category: 'custom',
  is_pinned: false,
  color: '#1890ff',
  repeat_annually: false,
  note: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── Filter ──────────────────────────────────────────────────
export const mockFilter = (overrides?: Partial<Filter>): Filter => ({
  id: nextId(),
  name: '测试过滤器',
  user_id: '1',
  conditions: { date_range: 'all' } as FilterConditions,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

// ─── UserSettings ────────────────────────────────────────────
export const mockSettings = (overrides?: Partial<UserSettings>): UserSettings => ({
  user_id: '1',
  theme: 'default',
  language: 'zh-CN',
  default_view: 'tasks',
  default_task_view: 'list',
  default_priority: 0,
  default_list_id: null,
  week_start_day: 1,
  date_format: 'YYYY-MM-DD',
  time_format: '24h',
  timezone: 'Asia/Shanghai',
  pomodoro_duration: 25,
  short_break_duration: 5,
  long_break_duration: 15,
  pomodoro_auto_start: false,
  focus_min_duration: 1,
  notification_enabled: true,
  notification_sound: true,
  push_enabled: false,
  push_channels: '[]',
  push_interval: 5,
  push_batch_size: 5,
  ...overrides,
});

// ─── FocusSession ────────────────────────────────────────────
export const mockFocusSession = (overrides?: Partial<FocusSession>): FocusSession => ({
  id: nextId(),
  user_id: '1',
  type: 'pomodoro',
  duration: 1500,
  started_at: '2026-01-01T08:00:00Z',
  ended_at: '2026-01-01T08:25:00Z',
  created_at: '2026-01-01T08:25:00Z',
  ...overrides,
});
