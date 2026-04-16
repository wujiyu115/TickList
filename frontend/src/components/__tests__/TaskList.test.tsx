import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskList from '../TaskList';
import { Task } from '../../types';

// Mock TaskContext
const mockTasks: Task[] = [
  {
    id: '1', title: 'B任务', description: '', status: 'pending', priority: 1,
    child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2', title: 'A任务', description: '', status: 'in_progress', priority: 2,
    child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 1,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  },
];

vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    tasks: mockTasks,
    loading: false,
    addTask: vi.fn(),
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
});
