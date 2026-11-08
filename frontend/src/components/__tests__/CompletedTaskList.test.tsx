import React from 'react';
import dayjs, { Dayjs } from 'dayjs';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import CompletedTaskList from '../CompletedTaskList';
import type { Task } from '../../types';

vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({ updateTaskData: vi.fn(), selectTask: vi.fn(), selectedTask: null }),
}));

vi.mock('../../api/list', () => ({ getLists: vi.fn().mockResolvedValue({ lists: [] }) }));

const taskAt = (title: string, date: Dayjs): Task => ({
  id: title, title, description: '', content: '', status: 'completed', priority: 0,
  child_ids: [], user_id: '1', is_pinned: false, tags: [], order: 0,
  created_at: date.toISOString(), updated_at: date.toISOString(), completed_at: date.toISOString(),
});

describe('CompletedTaskList date filters', () => {
  it.each([
    { label: '本周', unit: 'week' as const, previous: false },
    { label: '上周', unit: 'week' as const, previous: true },
    { label: '本月', unit: 'month' as const, previous: false },
    { label: '上月', unit: 'month' as const, previous: true },
  ])('includes boundary dates for $label', async ({ label, unit, previous }) => {
    const currentStart = dayjs().startOf(unit);
    const start = previous ? currentStart.subtract(1, unit).startOf(unit) : currentStart;
    const end = previous ? start.endOf(unit) : dayjs();
    const tasks = [
      taskAt('before boundary', start.subtract(1, 'millisecond')),
      taskAt('start boundary', start),
      taskAt('end boundary', end),
      ...(previous ? [taskAt('after boundary', currentStart)] : []),
    ];

    render(<CompletedTaskList tasks={tasks} total={tasks.length} loading={false} loadingMore={false} onLoadMore={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /所有日期/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: label }));

    expect(screen.queryByText('before boundary')).not.toBeInTheDocument();
    expect(screen.getByText('start boundary')).toBeInTheDocument();
    expect(screen.getByText('end boundary')).toBeInTheDocument();
    if (previous) expect(screen.queryByText('after boundary')).not.toBeInTheDocument();
  });
});
