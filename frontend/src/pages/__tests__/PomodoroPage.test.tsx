import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PomodoroPage from '../PomodoroPage';

// Mock FocusContext used by PomodoroTimer
vi.mock('../../contexts/FocusContext', () => ({
  useFocus: () => ({
    timer: {
      timeLeft: 1500,
      isRunning: false,
      phase: 'idle',
      start: vi.fn(),
      pause: vi.fn(),
      reset: vi.fn(),
      setTimeLeft: vi.fn(),
    },
    timerMode: 'pomodoro',
    setTimerMode: vi.fn(),
    linkedTaskId: null,
    linkedTask: null,
    setLinkedTaskId: vi.fn(),
    setLinkedTask: vi.fn(),
    handleStart: vi.fn(),
    handleEnd: vi.fn(),
    handleStopStopwatch: vi.fn(),
    overview: {
      today_pomodoro_count: 3,
      today_focus_duration: 4500,
      total_pomodoro_count: 100,
      total_focus_duration: 150000,
    },
    sessions: [],
    loadOverview: vi.fn(),
    loadSessions: vi.fn(),
    settings: { pomodoro_duration: 25 },
    settingsLoaded: true,
    startedAtRef: { current: '' },
    workDuration: 1500,
    breakDuration: 300,
  }),
}));

describe('PomodoroPage', () => {
  it('should render pomodoro page without crashing', async () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(document.querySelector('.pomodoro-page')).toBeInTheDocument();
    });
  });

  it('should render timer display', async () => {
    render(
      <MemoryRouter>
        <PomodoroPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Timer shows time (25:00 for 1500 seconds)
      expect(screen.getByText('25:00')).toBeInTheDocument();
    });
  });
});
