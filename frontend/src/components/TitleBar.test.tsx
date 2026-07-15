import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TitleBar, { titleBarBackground, isMacTitleBar } from './TitleBar';
import * as platform from '../utils/platform';

const hide = vi.fn();
const minimize = vi.fn();
const toggleMaximize = vi.fn();

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ hide, minimize, toggleMaximize }),
}));

describe('titleBarBackground', () => {
  it('浅色模式生成含主色与浅底色的横向渐变', () => {
    const bg = titleBarBackground('#1677ff', false);
    expect(bg).toContain('linear-gradient(90deg');
    expect(bg).toContain('#1677ff');
    expect(bg).toContain('#fbfcfe');
  });

  it('深色模式底色切换为深灰', () => {
    const bg = titleBarBackground('#1677ff', true);
    expect(bg).toContain('#1f1f1f');
  });
});

describe('TitleBar', () => {
  beforeEach(() => {
    hide.mockClear();
    minimize.mockClear();
    toggleMaximize.mockClear();
  });

  it('非 Tauri 环境不渲染任何内容', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(false);
    const { container } = render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('Tauri 环境渲染三个交通灯与标题', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(screen.getByText('TickList')).toBeInTheDocument();
    expect(screen.getByLabelText('关闭')).toBeInTheDocument();
    expect(screen.getByLabelText('最小化')).toBeInTheDocument();
    expect(screen.getByLabelText('最大化')).toBeInTheDocument();
  });

  it('点红灯调用 hide，黄灯 minimize，绿灯 toggleMaximize', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    fireEvent.click(screen.getByLabelText('关闭'));
    fireEvent.click(screen.getByLabelText('最小化'));
    fireEvent.click(screen.getByLabelText('最大化'));
    expect(hide).toHaveBeenCalledTimes(1);
    expect(minimize).toHaveBeenCalledTimes(1);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('macOS：交通灯在左侧，顺序为 close / min / max', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)');
    expect(isMacTitleBar()).toBe(true);
    const { container } = render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(container.querySelector('.tl-titlebar')?.classList).toContain('tl-titlebar--left');
    const lights = Array.from(container.querySelectorAll('.tl-light'));
    expect(lights.map((b) => b.className)).toEqual(['tl-light tl-light--close', 'tl-light tl-light--min', 'tl-light tl-light--max']);
    spy.mockRestore();
  });

  it('Windows / Linux：按钮在右侧，顺序为 min / max / close', () => {
    vi.spyOn(platform, 'isTauri').mockReturnValue(true);
    const spy = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
    expect(isMacTitleBar()).toBe(false);
    const { container } = render(<TitleBar primaryColor="#1677ff" isDark={false} />);
    expect(container.querySelector('.tl-titlebar')?.classList).toContain('tl-titlebar--right');
    const lights = Array.from(container.querySelectorAll('.tl-light'));
    expect(lights.map((b) => b.className)).toEqual(['tl-light tl-light--min', 'tl-light tl-light--max', 'tl-light tl-light--close']);
    spy.mockRestore();
  });
});
