import { http, HttpResponse } from 'msw';
import {
  mockUser,
  mockTask,
  mockList,
  mockTag,
  mockCountdown,
  mockFilter,
  mockSettings,
  mockFocusSession,
} from './data';

// ─── Auth Handlers ───────────────────────────────────────────
const authHandlers = [
  http.post('/api/auth/login', () =>
    HttpResponse.json({ user: mockUser(), token: 'mock-jwt-token', success: true }),
  ),
  http.post('/api/auth/register', () =>
    HttpResponse.json({ success: true, message: '注册成功' }),
  ),
  http.get('/api/auth/me', () =>
    HttpResponse.json(mockUser()),
  ),
  http.post('/api/auth/logout', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/auth/change-password', () =>
    HttpResponse.json({ success: true, message: '密码修改成功' }),
  ),
  http.get('/api/auth/config', () =>
    HttpResponse.json({ register_enabled: true }),
  ),
  // WebAuthn
  http.post('/api/auth/webauthn/register/options', () =>
    HttpResponse.json({ challenge: 'mock-challenge' }),
  ),
  http.post('/api/auth/webauthn/register/verify', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/auth/webauthn/login/options', () =>
    HttpResponse.json({ challenge: 'mock-challenge' }),
  ),
  http.post('/api/auth/webauthn/login/verify', () =>
    HttpResponse.json({ user: mockUser(), token: 'mock-jwt-token', success: true }),
  ),
  http.get('/api/auth/webauthn/credentials', () =>
    HttpResponse.json({ credentials: [] }),
  ),
  http.delete('/api/auth/webauthn/credentials/:id', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── Task Handlers ───────────────────────────────────────────
const task1 = mockTask({ id: '100', title: '任务一' });
const task2 = mockTask({ id: '101', title: '任务二', status: 'in_progress' });

const taskHandlers = [
  http.get('/api/tasks', () =>
    HttpResponse.json({ tasks: [task1, task2], total: 2 }),
  ),
  http.get('/api/tasks/search', () =>
    HttpResponse.json({ tasks: [task1], count: 1 }),
  ),
  http.get('/api/tasks/trash', () =>
    HttpResponse.json({ tasks: [], total: 0, page: 1, page_size: 20 }),
  ),
  http.get('/api/tasks/:id/children', ({ params }) =>
    HttpResponse.json({ children: [], count: 0 }),
  ),
  http.get('/api/tasks/:id', ({ params }) =>
    HttpResponse.json(mockTask({ id: params.id as string })),
  ),
  http.post('/api/tasks', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockTask({ title: body.title as string }));
  }),
  http.put('/api/tasks/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockTask({ id: params.id as string, ...body as any }));
  }),
  http.delete('/api/tasks/trash/empty', () =>
    HttpResponse.json({ success: true }),
  ),
  http.delete('/api/tasks/:id/permanent', () =>
    HttpResponse.json({ success: true }),
  ),
  http.delete('/api/tasks/:id', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/tasks/:id/move', ({ params }) =>
    HttpResponse.json(mockTask({ id: params.id as string })),
  ),
  http.post('/api/tasks/:id/duplicate', ({ params }) =>
    HttpResponse.json(mockTask({ id: '200', title: '任务一 (副本)' })),
  ),
  http.post('/api/tasks/:id/restore', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/tasks/batch-update', () =>
    HttpResponse.json({ updated_count: 2 }),
  ),
];

// ─── List Handlers ───────────────────────────────────────────
const list1 = mockList({ id: '10', name: '工作' });

const listHandlers = [
  http.get('/api/lists', () =>
    HttpResponse.json({ lists: [list1], total: 1 }),
  ),
  http.post('/api/lists', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockList({ name: body.name as string }));
  }),
  http.put('/api/lists/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockList({ id: params.id as string, ...body as any }));
  }),
  http.delete('/api/lists/:id', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── Tag Handlers ────────────────────────────────────────────
const tag1 = mockTag({ id: '20', name: '重要' });

const tagHandlers = [
  http.get('/api/tags', () =>
    HttpResponse.json({ tags: [tag1], total: 1 }),
  ),
  http.post('/api/tags', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockTag({ name: body.name as string }));
  }),
  http.put('/api/tags/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockTag({ id: params.id as string, ...body as any }));
  }),
  http.delete('/api/tags/:id', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── Calendar Handlers ───────────────────────────────────────
const calendarHandlers = [
  http.get('/api/calendar/tasks', () =>
    HttpResponse.json({ tasks: [task1], total: 1 }),
  ),
];

// ─── Statistics Handlers ─────────────────────────────────────
const statisticsHandlers = [
  http.get('/api/statistics/overview', () =>
    HttpResponse.json({
      total_tasks: 10,
      completed_tasks: 5,
      pending_tasks: 3,
      in_progress_tasks: 2,
      completion_rate: 0.5,
      daily_stats: [],
      tag_distribution: {},
      priority_distribution: {},
    }),
  ),
  http.get('/api/statistics/daily', () =>
    HttpResponse.json({
      date: '2026-01-01',
      total_tasks: 5,
      completed_tasks: 2,
      pending_tasks: 2,
      in_progress_tasks: 1,
      completion_rate: 0.4,
    }),
  ),
  http.get('/api/statistics/trend', () =>
    HttpResponse.json({ trend: [], days: 30 }),
  ),
  http.get('/api/statistics/range', () =>
    HttpResponse.json({ statistics: [], start_date: '2026-01-01', end_date: '2026-01-31' }),
  ),
];

// ─── Countdown Handlers ──────────────────────────────────────
const countdown1 = mockCountdown({ id: '30', title: '新年倒计时' });

const countdownHandlers = [
  http.get('/api/countdowns', () =>
    HttpResponse.json({ countdowns: [countdown1], total: 1 }),
  ),
  http.get('/api/countdowns/:id', ({ params }) =>
    HttpResponse.json(mockCountdown({ id: params.id as string })),
  ),
  http.post('/api/countdowns', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockCountdown({ title: body.title as string }));
  }),
  http.put('/api/countdowns/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockCountdown({ id: params.id as string, ...body as any }));
  }),
  http.delete('/api/countdowns/:id', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── Focus Handlers ──────────────────────────────────────────
const focusHandlers = [
  http.get('/api/focus/overview', () =>
    HttpResponse.json({
      today_pomodoro_count: 3,
      today_focus_duration: 4500,
      total_pomodoro_count: 100,
      total_focus_duration: 150000,
    }),
  ),
  http.get('/api/focus/sessions', () =>
    HttpResponse.json({
      sessions: [mockFocusSession()],
      total: 1,
      page: 1,
      page_size: 20,
    }),
  ),
  http.post('/api/focus/sessions', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockFocusSession(body as any));
  }),
  http.delete('/api/focus/sessions/:id', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── Settings Handlers ───────────────────────────────────────
const settingsHandlers = [
  http.get('/api/settings', () =>
    HttpResponse.json(mockSettings()),
  ),
  http.put('/api/settings', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockSettings(body as any));
  }),
  http.post('/api/settings/push/test', () =>
    HttpResponse.json({ success: true, message: '推送测试成功' }),
  ),
];

// ─── Filter Handlers ─────────────────────────────────────────
const filter1 = mockFilter({ id: '40', name: '今日任务' });

const filterHandlers = [
  http.get('/api/filters', () =>
    HttpResponse.json({ filters: [filter1], total: 1 }),
  ),
  http.post('/api/filters', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockFilter({ name: body.name as string }));
  }),
  http.put('/api/filters/:id', async ({ params, request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockFilter({ id: params.id as string, ...body as any }));
  }),
  http.delete('/api/filters/:id', () =>
    HttpResponse.json({ message: '删除成功' }),
  ),
];

// ─── Data Handlers ───────────────────────────────────────────
const dataHandlers = [
  http.get('/api/data/export', () =>
    HttpResponse.json({ tasks: [], lists: [], tags: [], settings: {} }),
  ),
  http.post('/api/data/import', () =>
    HttpResponse.json({ success: true, message: '导入成功' }),
  ),
  http.post('/api/data/import-dida', () =>
    HttpResponse.json({ success: true, message: '滴答清单数据导入成功' }),
  ),
];

// ─── Admin Handlers ─────────────────────────────────────────
const adminHandlers = [
  http.get('/api/admin/users', () =>
    HttpResponse.json({
      users: [
        { id: '1', username: 'admin', email: 'admin@test.com', role_group: 'admin', is_frozen: false, created_at: '2026-01-01T00:00:00Z' },
        { id: '2', username: 'testuser', email: 'test@test.com', role_group: 'user', is_frozen: false, created_at: '2026-01-02T00:00:00Z' },
      ],
    }),
  ),
  http.post('/api/admin/users', () =>
    HttpResponse.json({ id: '3', username: 'newuser', role_group: 'user' }),
  ),
  http.put('/api/admin/users/:id', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/admin/users/:id/freeze', () =>
    HttpResponse.json({ success: true }),
  ),
  http.post('/api/admin/users/:id/reset-password', () =>
    HttpResponse.json({ success: true }),
  ),
];

// ─── All Handlers ────────────────────────────────────────────
export const handlers = [
  ...authHandlers,
  ...taskHandlers,
  ...listHandlers,
  ...tagHandlers,
  ...calendarHandlers,
  ...statisticsHandlers,
  ...countdownHandlers,
  ...focusHandlers,
  ...settingsHandlers,
  ...filterHandlers,
  ...dataHandlers,
  ...adminHandlers,
];
