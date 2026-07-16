import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TrayMenu from './TrayMenu';

const invoke = vi.fn(() => Promise.resolve());
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => invoke(...args) }));

beforeEach(() => {
  invoke.mockClear();
  localStorage.setItem('theme_key', 'default');
});

describe('TrayMenu', () => {
  it('渲染显示/隐藏与退出两项', () => {
    render(<TrayMenu />);
    expect(screen.getByText('显示/隐藏窗口')).toBeTruthy();
    expect(screen.getByText('退出')).toBeTruthy();
  });
  it('点击显示/隐藏调用 tray_toggle_window', () => {
    render(<TrayMenu />);
    fireEvent.click(screen.getByText('显示/隐藏窗口'));
    expect(invoke).toHaveBeenCalledWith('tray_toggle_window');
  });
  it('点击退出调用 tray_quit', () => {
    render(<TrayMenu />);
    fireEvent.click(screen.getByText('退出'));
    expect(invoke).toHaveBeenCalledWith('tray_quit');
  });
  it('窗口获焦后重读 localStorage 主题（切换配色跟随）', () => {
    localStorage.setItem('theme_key', 'default');
    render(<TrayMenu />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    // 模拟主窗切换到暗色主题后，Rust 右键 show → set_focus 触发 focus 事件
    localStorage.setItem('theme_key', 'dark');
    fireEvent(window, new Event('focus'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
