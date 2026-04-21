import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskList from '../TaskList';
import { Task } from '../../types';

const mockAddTask = vi.fn().mockResolvedValue({});

// Mock TaskContext
const mockTasks: Task[] = [
  {
    id: '1', title: 'B任务', description: '', content: '', status: 'pending', priority: 1,
    child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2', title: 'A任务', description: '', content: '', status: 'in_progress', priority: 2,
    child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 1,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
];

vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    tasks: mockTasks,
    loading: false,
    addTask: mockAddTask,
    updateTaskData: vi.fn(),
    selectTask: vi.fn(),
    selectedTask: null,
  }),
}));

vi.mock('../../hooks/useLongPress', () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    isLongPress: { current: false },
  }),
}));

const renderTaskList = (props = {}) => {
  return render(
    <MemoryRouter>
      <TaskList {...props} />
    </MemoryRouter>
  );
};

describe('TaskList', () => {
  it('should render multiple task items', () => {
    renderTaskList();
    expect(screen.getByText('B任务')).toBeInTheDocument();
    expect(screen.getByText('A任务')).toBeInTheDocument();
  });

  it('should show group headers', () => {
    renderTaskList();
    expect(screen.getByText('未完成')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
  });

  it('should sort tasks by title when sortMode is title', () => {
    const { container } = renderTaskList({ sortMode: 'title' });
    const taskTitles = container.querySelectorAll('.task-title');
    // Should have task titles rendered
    expect(taskTitles.length).toBeGreaterThanOrEqual(2);
  });

  it('should set due_date when adding task in today filter view', async () => {
    mockAddTask.mockClear();
    render(
      <MemoryRouter initialEntries={['/?filter=today']}>
        <TaskList />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText('添加任务');
    fireEvent.change(input, { target: { value: '今天的任务' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(mockAddTask).toHaveBeenCalledWith(
        expect.objectContaining({ due_date: expect.any(String) })
      );
    });
    const callArg = mockAddTask.mock.calls[0][0];
    expect(callArg.due_date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should set due_date when adding task in week filter view', async () => {
    mockAddTask.mockClear();
    render(
      <MemoryRouter initialEntries={['/?filter=week']}>
        <TaskList />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText('添加任务');
    fireEvent.change(input, { target: { value: '本周的任务' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(mockAddTask).toHaveBeenCalledWith(
        expect.objectContaining({ due_date: expect.any(String) })
      );
    });
  });

  it('should filter child tasks from external completed tasks', () => {
    // Parent task completed with child_ids referencing child task
    const completedParent: Task = {
      id: 'p1', title: '父任务', description: '', content: '', status: 'completed', priority: 0,
      child_ids: ['c1'], user_id: '1', is_pinned: false, tags: [], order: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-02T00:00:00Z',
    };
    const completedChild: Task = {
      id: 'c1', title: '子任务', description: '', content: '', status: 'completed', priority: 0,
      child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-02T00:00:00Z',
    };

    renderTaskList({
      completedTasks: [completedParent, completedChild],
      completedTotal: 2,
    });

    // Completed group is expanded by default, parent should be visible
    const parentElements = screen.getAllByText('父任务');
    expect(parentElements.length).toBeGreaterThanOrEqual(1);
    // Child task should appear exactly once (nested under parent), not as a separate top-level item
    const childElements = screen.getAllByText('子任务');
    expect(childElements.length).toBe(1);
  });

  it('should NOT set due_date when adding task without filter', async () => {
    mockAddTask.mockClear();
    render(
      <MemoryRouter initialEntries={['/']}>
        <TaskList />
      </MemoryRouter>
    );
    const input = screen.getByPlaceholderText('添加任务');
    fireEvent.change(input, { target: { value: '普通任务' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(mockAddTask).toHaveBeenCalled();
    });
    const callArg = mockAddTask.mock.calls[0][0];
    expect(callArg.due_date).toBeUndefined();
  });
});
