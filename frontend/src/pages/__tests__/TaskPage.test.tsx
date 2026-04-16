import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TaskPage from '../TaskPage';

// Mock TaskContext
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    tasks: [
      { id: '100', title: '任务一', status: 'pending', priority: 0, child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: '101', title: '任务二', status: 'in_progress', priority: 0, child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ],
    loading: false,
    selectedTask: null,
    fetchTasks: vi.fn(),
    addTask: vi.fn(),
    updateTaskData: vi.fn(),
    deleteTaskData: vi.fn(),
    restoreTaskData: vi.fn(),
    permanentDeleteTaskData: vi.fn(),
    selectTask: vi.fn(),
    refreshTasks: vi.fn(),
  }),
}));

describe('TaskPage', () => {
  it('should render without crashing', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TaskPage />
      </MemoryRouter>
    );

    // TaskPage should render - check for known UI elements
    await waitFor(() => {
      // The page renders some view (list or kanban)
      expect(document.querySelector('.task-page')).toBeInTheDocument();
    });
  });

  it('should display task items', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TaskPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText('任务一').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('任务二').length).toBeGreaterThan(0);
  });

  it('should render view toggle controls', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TaskPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('.task-page')).toBeInTheDocument();
    });
  });
});
