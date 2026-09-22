import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskProvider, useTaskContext } from '../TaskContext';
import TaskList from '../../components/TaskList';
import { getTasks } from '../../api/task';
import { HOST_TASKS_REFRESH_EVENT } from '../../services/focusHost';
import { message } from '../../utils/antdApp';
import {
  TODO_RENDER_COMPLETE, TODO_REQUEST_COMPLETE, getTaskListMetricSnapshot,
} from '../../services/taskListMetrics';
import type { Task } from '../../types';

const flags = vi.hoisted(() => ({ hosted: true }));
vi.mock('../../services/focusHost', () => ({
  isFocusShieldHost: () => flags.hosted,
  HOST_TASKS_REFRESH_EVENT: 'focusshield-tasks-refresh',
}));
vi.mock('../../api/task', () => ({
  getTasks: vi.fn(),
  getTaskById: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  moveTask: vi.fn(),
  duplicateTask: vi.fn(),
  batchUpdateTasks: vi.fn(),
  getChildTasks: vi.fn(),
  searchTasks: vi.fn(),
  getTrashTasks: vi.fn(),
  restoreTask: vi.fn(),
  permanentDeleteTask: vi.fn(),
  emptyTrash: vi.fn(),
  reorderTasks: vi.fn(),
}));
vi.mock('../../services/notificationService', () => ({
  scheduleTaskNotification: vi.fn(),
  cancelTaskNotification: vi.fn(),
}));
vi.mock('../../utils/antdApp', () => ({
  message: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  modalApi: { confirm: vi.fn(), info: vi.fn() },
  notification: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  AntdAppBridge: () => null,
}));
vi.mock('../../hooks/useLongPress', () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    isLongPress: { current: false },
  }),
}));

interface FakeEntry {
  name: string;
  entryType: 'mark' | 'measure';
  startTime: number;
  duration: number;
}

// User Timing 替身：L2 名称引用重载；起点 mark 缺失时像真实浏览器一样抛错
const installFakePerformance = () => {
  const entries: FakeEntry[] = [];
  let clock = 1000;
  const findMark = (name: string): FakeEntry => {
    const mark = [...entries].reverse().find(entry => entry.entryType === 'mark' && entry.name === name);
    if (!mark) throw new Error(`start mark not found: ${name}`);
    return mark;
  };
  const perf = {
    now: () => clock,
    mark: (name: string) => {
      entries.push({ name, entryType: 'mark', startTime: clock, duration: 0 });
    },
    measure: (name: string, startMark: string) => {
      const startTime = findMark(startMark).startTime;
      entries.push({ name, entryType: 'measure', startTime, duration: clock - startTime });
    },
    clearMarks: (name?: string) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'mark' && (!name || entries[i].name === name)) entries.splice(i, 1);
      }
    },
    clearMeasures: (name?: string) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'measure' && (!name || entries[i].name === name)) entries.splice(i, 1);
      }
    },
  };
  vi.stubGlobal('performance', perf);
  return { entries, advance: (ms: number) => { clock += ms; } };
};

const measuresOf = (entries: FakeEntry[], name: string) =>
  entries.filter(entry => entry.entryType === 'measure' && entry.name === name);

const taskA: Task = {
  id: '1', title: '任务一', description: '', content: '', status: 'pending', priority: 1,
  child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const taskB: Task = { ...taskA, id: '2', title: '任务二', status: 'in_progress', order: 1 };

type TasksResponse = { tasks: Task[]; total: number };
const deferredTasks = () => {
  let resolve!: (value: TasksResponse) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<TasksResponse>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

// TaskPage 之外的直达路径（standalone 用），宿主路径走 HOST_TASKS_REFRESH_EVENT
const FetchTrigger: React.FC = () => {
  const { fetchTasks } = useTaskContext();
  return <button type="button" onClick={() => { void fetchTasks({}); }}>load</button>;
};

const renderHostList = () => render(
  <MemoryRouter initialEntries={['/']}>
    <TaskProvider>
      <FetchTrigger />
      <TaskList />
    </TaskProvider>
  </MemoryRouter>
);

const triggerHostRefresh = async () => {
  await act(async () => {
    window.dispatchEvent(new Event(HOST_TASKS_REFRESH_EVENT));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  flags.hosted = true;
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('host-gated task list load metrics', () => {
  it('measures the host-gated load from real request start to the real list commit', async () => {
    const fake = installFakePerformance();
    const first = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(first.promise);
    renderHostList();
    await triggerHostRefresh();
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'loading', revision: 1 });
    expect(getTasks).toHaveBeenCalledTimes(1);
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(0); // 加载中不产生条目
    await act(async () => {
      fake.advance(120);
      first.resolve({ tasks: [taskA, taskB], total: 2 });
    });
    await waitFor(() => expect(getTaskListMetricSnapshot().phase).toBe('committed'));
    const requestMeasure = measuresOf(fake.entries, TODO_REQUEST_COMPLETE)[0];
    const renderMeasure = measuresOf(fake.entries, TODO_RENDER_COMPLETE)[0];
    // request_complete startTime = 真实请求发起时刻（begin 时的 startedAt），而非完成时刻
    expect(requestMeasure.startTime).toBe(getTaskListMetricSnapshot().startedAt);
    expect(requestMeasure.duration).toBe(120);
    // render_complete startTime = apply 时刻（= request.startTime + duration），真正 commit 在其后
    expect(renderMeasure.startTime).toBe(requestMeasure.startTime + requestMeasure.duration);
    // detail 不带 payload：条目仅含 name/entryType/startTime/duration
    expect(Object.keys(requestMeasure).sort()).toEqual(['duration', 'entryType', 'name', 'startTime']);
    expect(screen.getByText('任务一')).toBeInTheDocument();
  });

  it('counts a successful empty list as a render commit', async () => {
    const fake = installFakePerformance();
    const first = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(first.promise);
    renderHostList();
    await triggerHostRefresh();
    await act(async () => { first.resolve({ tasks: [], total: 0 }); });
    await waitFor(() => expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', count: 0 }));
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
    // "进行中"组的空占位与 antd Empty 都渲染该文案
    expect(screen.getAllByText('暂无任务').length).toBeGreaterThan(0);
  });

  it('does not count loading or failed requests as commits', async () => {
    const fake = installFakePerformance();
    const failing = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(failing.promise);
    renderHostList();
    await triggerHostRefresh();
    expect(getTaskListMetricSnapshot().phase).toBe('loading');
    await act(async () => { failing.reject(new Error('network down')); });
    await waitFor(() => expect(getTaskListMetricSnapshot().phase).toBe('error'));
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(0);
    expect(message.error).toHaveBeenCalledWith('获取任务列表失败');
  });

  it('emits nothing for a stale completion that lands after a newer cycle begins', async () => {
    const fake = installFakePerformance();
    const first = deferredTasks();
    const second = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderHostList();
    // 两条真实路径重叠：TaskPage 直达 fetchTasks + 宿主刷新事件
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'load' })); });
    fake.advance(300);
    await triggerHostRefresh(); // 新 trace context 在旧请求仍在途时分配
    await act(async () => {
      fake.advance(500);
      first.resolve({ tasks: [taskA], total: 1 }); // 旧响应迟到
    });
    expect(getTasks).toHaveBeenCalledTimes(2);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'loading', revision: 2 });
    // 旧请求被丢弃：不发 request_complete，快照仍归属新周期
    expect(fake.entries.filter(entry => entry.entryType === 'measure')).toEqual([]);
    await act(async () => { second.resolve({ tasks: [taskA, taskB], total: 2 }); });
    await waitFor(() => expect(getTaskListMetricSnapshot().phase).toBe('committed'));
    // 仅 success 产生 request_complete，startTime 是新周期自己的真实发起时刻
    const requestMeasure = measuresOf(fake.entries, TODO_REQUEST_COMPLETE)[0];
    expect(requestMeasure.startTime).toBe(getTaskListMetricSnapshot().startedAt);
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', revision: 2, count: 2 });
    expect(screen.getByText('任务二')).toBeInTheDocument();
  });

  it('clears the previous cycle measures when the next refresh begins', async () => {
    const fake = installFakePerformance();
    const first = deferredTasks();
    const second = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderHostList();
    await triggerHostRefresh();
    await act(async () => { first.resolve({ tasks: [taskA], total: 1 }); });
    await waitFor(() => expect(getTaskListMetricSnapshot().phase).toBe('committed'));
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(1);
    await triggerHostRefresh();
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(0);
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    await act(async () => { second.resolve({ tasks: [], total: 0 }); });
    await waitFor(() => expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', count: 0 }));
  });

  it('does not re-report a commit when the list remounts with old data', async () => {
    const fake = installFakePerformance();
    const first = deferredTasks();
    vi.mocked(getTasks).mockReturnValueOnce(first.promise);
    const view = renderHostList();
    await triggerHostRefresh();
    await act(async () => { first.resolve({ tasks: [taskA], total: 1 }); });
    await waitFor(() => expect(getTaskListMetricSnapshot().phase).toBe('committed'));
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <TaskProvider>
          <FetchTrigger />
          <div>blank</div>
        </TaskProvider>
      </MemoryRouter>
    );
    view.rerender(
      <MemoryRouter initialEntries={['/']}>
        <TaskProvider>
          <FetchTrigger />
          <TaskList />
        </TaskProvider>
      </MemoryRouter>
    );
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
  });

  it('stays completely inert outside the FocusShield host', async () => {
    flags.hosted = false;
    const fake = installFakePerformance();
    vi.mocked(getTasks).mockResolvedValueOnce({ tasks: [taskA], total: 1 });
    renderHostList();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'load' })); });
    await screen.findByText('任务一');
    // 全程零契约条目；快照 idle 语义由单测在全新模块态下覆盖（helper 模块态跨用例存活）
    expect(fake.entries).toEqual([]);
  });
});
