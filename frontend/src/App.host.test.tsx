import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { readyFocusHost } from './services/focusHost';
import type { HostState } from './services/focusHost';
import { getCurrentUser } from './api/auth';

vi.mock('./services/focusHost', () => ({ isFocusShieldHost: () => true, readyFocusHost: vi.fn() }));
vi.mock('./utils/platform', () => ({ isNativePlatform: () => false, usesRemoteServer: () => false, getApiBaseUrl: () => '/api' }));
vi.mock('./services/notificationService', () => ({
  initNotifications: vi.fn(), addNotificationListeners: vi.fn(), syncAllTaskNotifications: vi.fn(), syncAllCountdownNotifications: vi.fn(),
}));
vi.mock('./services/remoteLog', () => ({ remoteLog: vi.fn() }));
vi.mock('./api/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('./api/settings', () => ({ getSettings: vi.fn() }));
vi.mock('./api/task', () => ({ getTasks: vi.fn() }));
vi.mock('./api/countdown', () => ({ getCountdowns: vi.fn() }));
vi.mock('./layouts/MainLayout', () => ({ default: () => <div>Tasks</div> }));
vi.mock('./pages/LoginPage', () => ({ default: () => <div>TickList JWT login</div> }));
vi.mock('./components/TitleBar', () => ({ default: () => <div>Desktop titlebar</div> }));
vi.mock('./contexts/FocusContext', () => ({ FocusProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const idle: HostState = { phase: 'idle', canStart: true, remainingSeconds: null, cooldownSeconds: 0, refreshRevision: 0 };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(cleanup);

describe('host application ready gate', () => {
  it('calls ready before login and mounts the existing JWT login only after the handshake', async () => {
    // ES6 Promise target: the application/test contract does not provide withResolvers.
    let resolveReady!: (state: HostState) => void;
    vi.mocked(readyFocusHost).mockReturnValue(new Promise<HostState>(resolve => { resolveReady = resolve; }));
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);
    expect(readyFocusHost).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('正在连接 FocusShield');
    expect(screen.queryByText('TickList JWT login')).not.toBeInTheDocument();
    expect(getCurrentUser).not.toHaveBeenCalled();
    await act(async () => resolveReady(idle));
    expect(await screen.findByText('TickList JWT login')).toBeInTheDocument();
    expect(screen.queryByText('Desktop titlebar')).not.toBeInTheDocument();
  });

  it('shows bridge failure instead of mounting auth or standalone timer UI', async () => {
    vi.mocked(readyFocusHost).mockRejectedValue(new Error('bridge unavailable'));
    render(<MemoryRouter initialEntries={['/login']}><App /></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('bridge unavailable');
    expect(screen.queryByText('TickList JWT login')).not.toBeInTheDocument();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
