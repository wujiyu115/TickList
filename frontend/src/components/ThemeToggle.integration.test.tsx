import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeContext } from '../App';
import { getPasskeyLoginOptions, localLogin, verifyPasskeyLogin } from '../api/auth';
import { updateSettings } from '../api/settings';
import LoginPage from '../pages/LoginPage';
import { mockSettings, mockUser } from '../tests/mocks/data';
import AppHeader from './AppHeader';

// 只提供 Context，避免接入测试加载 App 的认证及通知副作用。
vi.mock('../App', async () => {
  // vi.mock 工厂会被提升，静态 React 绑定此时尚未初始化；在模块隔离边界内加载。
  const { createContext } = await import('react');
  return {
    ThemeContext: createContext<{
      primaryColor: string;
      isDark: boolean;
      setTheme: (themeKey: string) => void;
    } | null>(null),
  };
});
vi.mock('../contexts/AiContext', () => ({
  useAiContext: () => ({ openPanel: vi.fn(), closePanel: vi.fn(), panelVisible: false }),
}));
vi.mock('../api/settings', () => ({ updateSettings: vi.fn() }));
vi.mock('../api/auth', () => ({
  getAuthConfig: vi.fn(async () => ({ register_enabled: true })),
  localLogin: vi.fn(),
  getPasskeyLoginOptions: vi.fn(),
  verifyPasskeyLogin: vi.fn(),
}));
vi.mock('../utils/platform', () => ({ isNativePlatform: () => false }));
vi.mock('../utils/antdApp', () => ({
  message: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  modalApi: { confirm: vi.fn(), info: vi.fn() },
}));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: vi.fn(),
}));

const renderWithTheme = (children: React.ReactNode, initialDark = false) => {
  const setTheme = vi.fn();
  const Harness = () => {
    const [isDark, setIsDark] = useState(initialDark);
    return (
      <MemoryRouter>
        <ThemeContext.Provider value={{
          primaryColor: '#1677ff',
          isDark,
          setTheme: (key) => {
            setTheme(key);
            setIsDark(key === 'dark');
          },
        }}>
          {children}
        </ThemeContext.Provider>
      </MemoryRouter>
    );
  };
  render(<Harness />);
  return setTheme;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

describe('ThemeToggle integration', () => {
  it('exposes an always-visible account toggle in AppHeader and saves only on click', async () => {
    vi.mocked(updateSettings).mockResolvedValueOnce(mockSettings({ theme: 'dark' }));
    const setTheme = renderWithTheme(<AppHeader user={mockUser()} onLogout={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: '切换到深色主题' });
    expect(toggle).toBeVisible();
    expect(toggle.closest('.app-header .ant-space')).not.toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(setTheme).not.toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: 'dark' });
    await waitFor(() => expect(setTheme).toHaveBeenCalledExactlyOnceWith('dark'));
    expect(screen.getByRole('button', { name: '切换到浅色主题' })).toBeVisible();
  });

  it('toggles beside the login title without saving or submitting and keeps password login intact', async () => {
    const user = userEvent.setup();
    const account = mockUser();
    const onLogin = vi.fn();
    vi.mocked(localLogin).mockResolvedValueOnce({
      success: true, user: account, token: 'jwt-token', refresh_token: 'refresh-token',
    });
    const setTheme = renderWithTheme(<LoginPage onLogin={onLogin} />, true);
    await screen.findByRole('link', { name: '没有账号？注册' });
    const toggle = screen.getByRole('button', { name: '切换到浅色主题' });
    expect(toggle.parentElement?.parentElement).toContainElement(screen.getByRole('heading', { name: 'TickList' }));
    expect(updateSettings).not.toHaveBeenCalled();
    expect(setTheme).not.toHaveBeenCalled();

    await user.type(screen.getByPlaceholderText('用户名'), 'testuser');
    await user.type(screen.getByPlaceholderText('密码'), 'secret');
    await user.click(toggle);

    expect(setTheme).toHaveBeenCalledExactlyOnceWith('default');
    expect(updateSettings).not.toHaveBeenCalled();
    expect(localLogin).not.toHaveBeenCalled();
    expect(getPasskeyLoginOptions).not.toHaveBeenCalled();
    expect(verifyPasskeyLogin).not.toHaveBeenCalled();
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '切换到深色主题' })).toBeVisible();
    expect(screen.getByRole('button', { name: /使用 Passkey 登录/ })).toBeEnabled();
    expect(screen.getByPlaceholderText('用户名')).toHaveValue('testuser');
    expect(screen.getByPlaceholderText('密码')).toHaveValue('secret');

    await user.click(screen.getByRole('button', { name: /^登\s*录$/ }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledExactlyOnceWith(account, 'jwt-token', 'refresh-token'));
    expect(localLogin).toHaveBeenCalledExactlyOnceWith({ username: 'testuser', password: 'secret' });
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
