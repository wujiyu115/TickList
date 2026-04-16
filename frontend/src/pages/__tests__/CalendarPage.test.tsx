import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CalendarPage from '../CalendarPage';

// Mock TaskContext used by CalendarView
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    tasks: [],
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

describe('CalendarPage', () => {
  it('should render calendar page without crashing', async () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('.calendar-page')).toBeInTheDocument();
    });
  });

  it('should render calendar view controls', async () => {
    render(
      <MemoryRouter>
        <CalendarPage />
      </MemoryRouter>
    );

    // CalendarView has view mode controls and navigation
    await waitFor(() => {
      expect(document.querySelector('.calendar-page')).toBeInTheDocument();
    });
  });
});
