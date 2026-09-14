import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HostedFocusPanel from './HostedFocusPanel';
import { useFocus } from '../../contexts/FocusContext';
import type { FocusContextValue } from '../../contexts/FocusContext';

vi.mock('../../contexts/FocusContext', () => ({ useFocus: vi.fn() }));
let value: FocusContextValue;
beforeEach(() => {
  value = { hostReady: true, hostStarting: false, linkedTask: null, overview: null,
    hostState: { phase: 'idle', canStart: true, remainingSeconds: null, cooldownSeconds: 0, refreshRevision: 0 },
    handleStart: vi.fn() } as unknown as FocusContextValue;
  vi.mocked(useFocus).mockImplementation(() => value);
});
afterEach(cleanup);

const LocationProbe = () => { const location = useLocation(); return <output aria-label="route">{location.pathname}{location.search}</output>; };
const mount = (entry: string) => render(<React.StrictMode><MemoryRouter initialEntries={[entry]}><HostedFocusPanel /><LocationProbe /></MemoryRouter></React.StrictMode>);

describe('host focus page', () => {
  it('consumes a task URL exactly once even under StrictMode, without exposing timer controls', async () => {
    mount('/pomodoro?task_id=subtask-1&mode=pomodoro');
    await waitFor(() => expect(value.handleStart).toHaveBeenCalledExactlyOnceWith('subtask-1'));
    expect(screen.getByLabelText('route')).toHaveTextContent('/pomodoro');
    expect(screen.getByLabelText('route')).not.toHaveTextContent('task_id');
    expect(screen.getByText(/本地 HUD/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /暂停|继续|结束|跳过|保存/ })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ' });
    expect(value.handleStart).toHaveBeenCalledTimes(1);
  });

  it.each(['/pomodoro', '/pomodoro?task_id=task-1&mode=stopwatch'])('blocks free focus and stopwatch URL %s', entry => {
    mount(entry);
    expect(value.handleStart).not.toHaveBeenCalled();
    expect(screen.getByRole('note')).toHaveTextContent('请先选择任务');
  });

  it('does not consume/start while bridge is unavailable', () => {
    value.hostReady = false;
    mount('/pomodoro?task_id=task-1&mode=pomodoro');
    expect(value.handleStart).not.toHaveBeenCalled();
    expect(screen.getByLabelText('route')).toHaveTextContent('task_id=task-1');
  });

  it('renders only host projection and returns to the original task list', () => {
    value.hostState = { phase: 'breaking', canStart: false, remainingSeconds: 120, cooldownSeconds: 10, refreshRevision: 3 };
    mount('/pomodoro');
    expect(within(screen.getByRole('region', { name: 'FocusShield 专注' })).getByRole('status')).toHaveTextContent('休息中');
    expect(screen.getByText('宿主剩余 120 秒')).toBeInTheDocument();
    expect(screen.getByText('冷却剩余 10 秒')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回任务列表选择任务' }));
    expect(screen.getByLabelText('route').textContent).toBe('/');
    expect(value.handleStart).not.toHaveBeenCalled();
  });
});
