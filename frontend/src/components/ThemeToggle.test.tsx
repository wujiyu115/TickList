import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateSettings } from '../api/settings';
import { mockSettings } from '../tests/mocks/data';
import type { UserSettings } from '../types';
import { message } from '../utils/antdApp';
import ThemeToggle from './ThemeToggle';

vi.mock('../api/settings', () => ({ updateSettings: vi.fn() }));
vi.mock('../utils/antdApp', () => ({ message: { error: vi.fn() } }));

const directions = [
  { isDark: false, nextTheme: 'dark', label: '切换到深色主题', nextLabel: '切换到浅色主题' },
  { isDark: true, nextTheme: 'default', label: '切换到浅色主题', nextLabel: '切换到深色主题' },
];

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderToggle = (initialDark: boolean, persist?: boolean) => {
  const onThemeChange = vi.fn();
  const Harness = () => {
    const [isDark, setIsDark] = useState(initialDark);
    return (
      <ThemeToggle
        isDark={isDark}
        persist={persist}
        onThemeChange={(key) => {
          onThemeChange(key);
          setIsDark(key === 'dark');
        }}
      />
    );
  };
  render(<Harness />);
  return onThemeChange;
};

beforeEach(() => {
  vi.resetAllMocks();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ThemeToggle', () => {
  it.each([false, true])('does not write settings or apply a theme on mount (persist=%s)', (persist) => {
    const onThemeChange = vi.fn();
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <StrictMode>
        <ThemeToggle isDark={false} onThemeChange={onThemeChange} persist={persist} />
      </StrictMode>
    );
    expect(updateSettings).not.toHaveBeenCalled();
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it.each(directions)('switches to $nextTheme anonymously without an API request', ({ isDark, nextTheme, label, nextLabel }) => {
    const onThemeChange = renderToggle(isDark);
    const button = screen.getByRole('button', { name: label });
    expect(button).toHaveAttribute('title', label);
    expect(button).toHaveAttribute('type', 'button');
    expect(button.textContent).toBe('');

    fireEvent.click(button);

    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith(nextTheme);
    expect(updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: nextLabel })).toHaveAttribute('title', nextLabel);
  });

  it.each(directions)('saves $nextTheme before applying the account theme', async ({ isDark, nextTheme, label, nextLabel }) => {
    const request = deferred<UserSettings>();
    vi.mocked(updateSettings).mockReturnValue(request.promise);
    const onThemeChange = renderToggle(isDark, true);

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: nextTheme });
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-busy', 'true');

    await act(async () => request.resolve(mockSettings({ theme: nextTheme })));

    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith(nextTheme);
    expect(screen.getByRole('button', { name: nextLabel })).toBeEnabled();
    expect(screen.getByRole('button', { name: nextLabel })).toHaveAttribute('aria-busy', 'false');
  });

  it.each(directions)('keeps the current theme when saving $nextTheme fails and permits retry', async ({ isDark, nextTheme, label, nextLabel }) => {
    const request = deferred<UserSettings>();
    vi.mocked(updateSettings).mockReturnValueOnce(request.promise);
    const onThemeChange = renderToggle(isDark, true);

    fireEvent.click(screen.getByRole('button', { name: label }));
    await act(async () => request.reject(new Error('save failed')));

    expect(onThemeChange).not.toHaveBeenCalled();
    expect(message.error).toHaveBeenCalledWith('保存失败');
    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('title', label);
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-busy', 'false');

    vi.mocked(updateSettings).mockResolvedValueOnce(mockSettings({ theme: nextTheme }));
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onThemeChange).toHaveBeenCalledExactlyOnceWith(nextTheme));
    expect(updateSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: nextLabel })).toBeEnabled();
  });

  it('blocks re-entry before the pending render and while a save is in flight', async () => {
    const request = deferred<UserSettings>();
    vi.mocked(updateSettings).mockReturnValue(request.promise);
    const onThemeChange = renderToggle(false, true);
    const button = screen.getByRole('button', { name: '切换到深色主题' });

    act(() => {
      button.click();
      button.click();
    });
    fireEvent.click(button);
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({ theme: 'dark' });
    expect(onThemeChange).not.toHaveBeenCalled();
    expect(button).toBeDisabled();

    await act(async () => request.resolve(mockSettings({ theme: 'dark' })));
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith('dark');
    expect(screen.getByRole('button', { name: '切换到浅色主题' })).toBeEnabled();
  });
});
