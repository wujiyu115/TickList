import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TimerControls from './TimerControls';
import type { TimerPhase } from '../../hooks/useTimer';

const createHandlers = () => ({
  onStart: vi.fn(),
  onPause: vi.fn(),
  onResume: vi.fn(),
  onEnd: vi.fn(),
  onStop: vi.fn(),
});

describe('TimerControls', () => {
  it.each<{ phase: TimerPhase; label: RegExp; absentLabel: RegExp }>([
    { phase: 'break', label: /跳过休息/, absentLabel: /结\s*束/ },
    { phase: 'work', label: /结\s*束/, absentLabel: /跳过休息/ },
  ])('$phase 暂停时显示正确结束标签并调用 onEnd', ({ phase, label, absentLabel }) => {
    const handlers = createHandlers();
    render(<TimerControls isRunning={false} isPaused phase={phase} {...handlers} />);

    expect(screen.queryByRole('button', { name: absentLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
    expect(handlers.onStart).not.toHaveBeenCalled();
    expect(handlers.onPause).not.toHaveBeenCalled();
    expect(handlers.onResume).not.toHaveBeenCalled();
    expect(handlers.onStop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /继\s*续/ }));
    expect(handlers.onResume).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).toHaveBeenCalledTimes(1);
  });

  it('休息运行时仍只显示暂停按钮并调用 onPause', () => {
    const handlers = createHandlers();
    render(<TimerControls isRunning isPaused={false} phase="break" {...handlers} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /暂\s*停/ }));
    expect(handlers.onPause).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('空闲时仍显示开始按钮并调用 onStart', () => {
    const handlers = createHandlers();
    render(<TimerControls isRunning={false} isPaused={false} phase="idle" {...handlers} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /开\s*始/ }));
    expect(handlers.onStart).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });

  it('正计时暂停时仍显示停止并调用 onStop', () => {
    const handlers = createHandlers();
    render(<TimerControls mode="stopwatch" isRunning={false} isPaused phase="work" {...handlers} />);

    expect(screen.queryByRole('button', { name: /跳过休息|结\s*束/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /停\s*止/ }));
    expect(handlers.onStop).toHaveBeenCalledTimes(1);
    expect(handlers.onEnd).not.toHaveBeenCalled();
  });
});
