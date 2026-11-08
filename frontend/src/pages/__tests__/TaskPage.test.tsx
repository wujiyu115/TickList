/// <reference lib="es2024.promise" />
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import TaskPage from '../TaskPage';
import { getTasks } from '../../api/task';
import { getFilters } from '../../api/filter';
import type { Filter, Task } from '../../types';

const context = vi.hoisted(() => ({ fetchTasks: vi.fn(), selectTask: vi.fn() }));
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({ ...context, selectedTask: null }),
}));
vi.mock('../../api/task', () => ({ getTasks: vi.fn(), getTrashTasks: vi.fn(), emptyTrash: vi.fn() }));
vi.mock('../../api/list', () => ({ getLists: vi.fn(async () => ({ lists: [] })) }));
vi.mock('../../api/tag', () => ({ getTags: vi.fn(async () => ({ tags: [] })) }));
vi.mock('../../api/filter', () => ({ getFilters: vi.fn() }));
vi.mock('../../api/settings', () => ({ getSettings: vi.fn(async () => ({ default_task_view: 'list' })) }));
vi.mock('../../components/TaskList', () => ({
  default: ({ completedTasks }: { completedTasks: Task[] }) => <div>{completedTasks.map(task => <p key={task.id}>{task.title}</p>)}</div>,
}));
vi.mock('../../components/CompletedTaskList', () => ({
  default: ({ tasks, onLoadMore }: { tasks: Task[]; onLoadMore: () => void }) => <div>
    {tasks.map(task => <p key={task.id}>{task.title}</p>)}
    <button onClick={onLoadMore}>更多已完成</button>
  </div>,
}));
vi.mock('../../components/KanbanView', () => ({ default: () => null }));
vi.mock('../../components/TaskEditor', () => ({ default: () => null }));
vi.mock('../../components/TaskContextMenu', () => ({ default: () => null }));

const completed = (id: string): Task => ({
  id, title: id, description: '', content: '', status: 'completed', priority: 0,
  child_ids: [], user_id: 'user', is_pinned: false, tags: [], order: 0,
  created_at: '2026-11-08T00:00:00Z', updated_at: '2026-11-08T00:00:00Z',
});

function Navigation() {
  const navigate = useNavigate();
  return <>
    <button onClick={() => navigate('/?filter=today')}>进入今天</button>
    <button onClick={() => navigate('/?filter=week')}>进入七天</button>
    <button onClick={() => navigate('/?filter=completed')}>进入已完成</button>
  </>;
}
const renderPage = (url = '/?filter=today') => render(
  <MemoryRouter initialEntries={[url]}><Navigation /><TaskPage /></MemoryRouter>
);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  vi.mocked(getTasks).mockResolvedValue({ tasks: [], total: 0 });
  vi.mocked(getFilters).mockResolvedValue({ filters: [], total: 0 });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('task view loading', () => {
  it('loads today on a fresh visit without requiring a filter switch', async () => {
    vi.mocked(getTasks).mockResolvedValue({ tasks: [completed('今日已完成')], total: 1 });
    renderPage('/');
    expect(await screen.findByText('今日已完成')).toBeInTheDocument();
    expect(context.fetchTasks).toHaveBeenCalledWith(expect.objectContaining({
      exclude_status: 'completed', include_overdue: true,
      start_date: expect.any(String), end_date: expect.any(String),
    }));
    const params = context.fetchTasks.mock.calls[0][0];
    expect(new Date(params.end_date).getTime() - new Date(params.start_date).getTime()).toBe(86400000);
  });

  it('reloads server data when clicking the already selected today view', async () => {
    vi.mocked(getTasks)
      .mockResolvedValueOnce({ tasks: [completed('旧任务')], total: 1 })
      .mockResolvedValueOnce({ tasks: [completed('另一台机器的新任务')], total: 1 });
    renderPage();
    await screen.findByText('旧任务');
    fireEvent.click(screen.getByText('进入今天'));
    expect(await screen.findByText('另一台机器的新任务')).toBeInTheDocument();
    expect(screen.queryByText('旧任务')).not.toBeInTheDocument();
  });

  it('refreshes on returning to the foreground and recomputes the local day after midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 8, 23, 50));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    renderPage();
    await act(async () => {});
    const before = context.fetchTasks.mock.calls[0][0];
    vi.mocked(getTasks).mockResolvedValue({ tasks: [completed('跨设备新增任务')], total: 1 });
    vi.setSystemTime(new Date(2026, 10, 9, 0, 10));
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText('跨设备新增任务')).toBeInTheDocument();
    const after = context.fetchTasks.mock.calls.at(-1)![0];
    expect(new Date(after.start_date).getDate()).toBe(9);
    expect(new Date(before.start_date).getDate()).toBe(8);
    expect(context.fetchTasks).toHaveBeenCalledTimes(2);
  });

  it('ignores a previous views completed response arriving after the new view', async () => {
    const old = Promise.withResolvers<{ tasks: Task[]; total: number }>();
    vi.mocked(getTasks).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ tasks: [completed('七天任务')], total: 1 });
    renderPage();
    fireEvent.click(screen.getByText('进入七天'));
    await screen.findByText('七天任务');
    await act(async () => { old.resolve({ tasks: [completed('旧今天任务')], total: 1 }); });
    expect(screen.getByText('七天任务')).toBeInTheDocument();
    expect(screen.queryByText('旧今天任务')).not.toBeInTheDocument();
  });

  it('waits for a saved filters conditions instead of first fetching an unfiltered list', async () => {
    const filters = Promise.withResolvers<{ filters: Filter[]; total: number }>();
    vi.mocked(getFilters).mockReturnValueOnce(filters.promise);
    renderPage('/?filter_id=saved');
    await act(async () => {});
    expect(context.fetchTasks).not.toHaveBeenCalled();
    expect(getTasks).not.toHaveBeenCalled();
    await act(async () => {
      filters.resolve({ filters: [{ id: 'saved', name: '指定清单', user_id: 'user', created_at: '', updated_at: '', conditions: { list_id: 'my-list' } }], total: 1 });
    });
    await waitFor(() => expect(context.fetchTasks).toHaveBeenCalledWith({ list_id: 'my-list', exclude_status: 'completed' }));
  });

  it('does not reuse todays date filter when loading more in the all-completed view', async () => {
    renderPage();
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText('进入已完成'));
    await waitFor(() => expect(getTasks).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('更多已完成'));
    await waitFor(() => expect(getTasks).toHaveBeenLastCalledWith({ status: 'completed', skip: 25, limit: 25 }));
  });
});
