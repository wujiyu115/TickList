import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskItem from '../TaskItem';
import { Task } from '../../types';

// Mock TaskContext
const mockUpdateTaskData = vi.fn();
const mockSelectTask = vi.fn();

vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    updateTaskData: mockUpdateTaskData,
    selectTask: mockSelectTask,
    selectedTask: null,
  }),
}));

// Mock useLongPress
vi.mock('../../hooks/useLongPress', () => ({
  useLongPress: () => ({
    onTouchStart: vi.fn(),
    onTouchMove: vi.fn(),
    onTouchEnd: vi.fn(),
    isLongPress: { current: false },
  }),
}));

const baseTask: Task = {
  id: '1',
  title: '测试任务标题',
  description: '任务描述',
  content: '',
  status: 'pending',
  priority: 1,
  child_ids: [],
  user_id: '1',
  is_pinned: false,
  tags: [],
  order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const renderTaskItem = (task: Task, allTasks: Task[] = [task]) => {
  return render(
    <MemoryRouter>
      <TaskItem task={task} allTasks={allTasks} />
    </MemoryRouter>
  );
};

describe('TaskItem', () => {
  it('should render task title', () => {
    renderTaskItem(baseTask);
    expect(screen.getByText('测试任务标题')).toBeInTheDocument();
  });

  it('should display priority indicator via CSS class', () => {
    const { container } = renderTaskItem({ ...baseTask, priority: 2 });
    const checkboxWrapper = container.querySelector('.priority-2');
    expect(checkboxWrapper).toBeInTheDocument();
  });

  it('should display due date', () => {
    const taskWithDue: Task = {
      ...baseTask,
      due_date: '2026-12-25T00:00:00Z',
    };
    renderTaskItem(taskWithDue);
    expect(screen.getByText('12月25日')).toBeInTheDocument();
  });

  it('should call selectTask on click', async () => {
    const { container } = renderTaskItem(baseTask);
    const taskEl = container.querySelector('.task-item-new');
    if (taskEl) {
      taskEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    expect(mockSelectTask).toHaveBeenCalledWith(baseTask);
  });
});
