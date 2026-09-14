import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import TaskItem from '../TaskItem';
import type { Task } from '../../types';

const mocks = vi.hoisted(() => ({
  isHost: vi.fn(),
  selectTask: vi.fn(),
  updateTaskData: vi.fn(),
  refreshTasks: vi.fn(),
  addTask: vi.fn(),
  setDragSource: vi.fn(),
  setDragTarget: vi.fn(),
  setDragStartX: vi.fn(),
  clearDrag: vi.fn(),
  onTouchStart: vi.fn(),
  onTouchMove: vi.fn(),
  onTouchEnd: vi.fn(),
}));

vi.mock('../../services/focusHost', () => ({ isFocusShieldHost: mocks.isHost }));
vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    selectedTask: null,
    selectTask: mocks.selectTask,
    updateTaskData: mocks.updateTaskData,
    refreshTasks: mocks.refreshTasks,
    addTask: mocks.addTask,
  }),
}));
// TaskItem always consumes DragContext, even with the non-hover test environment.
vi.mock('../../contexts/DragContext', () => ({
  useDragContext: () => ({
    dragSource: null,
    dragTarget: null,
    dragStartX: 0,
    dragging: false,
    setDragSource: mocks.setDragSource,
    setDragTarget: mocks.setDragTarget,
    setDragStartX: mocks.setDragStartX,
    clearDrag: mocks.clearDrag,
  }),
}));
vi.mock('../../hooks/useLongPress', () => ({
  useLongPress: () => ({
    onTouchStart: mocks.onTouchStart,
    onTouchMove: mocks.onTouchMove,
    onTouchEnd: mocks.onTouchEnd,
    isLongPress: { current: false },
  }),
}));
vi.mock('../TaskContextMenu', () => ({ default: () => null }));

const baseTask: Task = {
  id: 'task-1',
  title: '测试专注任务',
  description: '',
  content: '',
  status: 'pending',
  priority: 0,
  child_ids: [],
  user_id: 'user-1',
  is_pinned: false,
  tags: [],
  order: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
};

const renderTask = (props: Partial<React.ComponentProps<typeof TaskItem>> = {}, parentProps: React.HTMLAttributes<HTMLDivElement> = {}) => {
  const task = props.task ?? baseTask;
  return render(
    <MemoryRouter initialEntries={['/']}>
      <div {...parentProps}>
        <TaskItem task={task} allTasks={[task]} {...props} />
      </div>
      <LocationProbe />
    </MemoryRouter>,
  );
};

const focusButton = (title = baseTask.title) => screen.getByRole('button', { name: `开始番茄专注：${title}` });
const expectTaskUnchanged = () => {
  expect(mocks.selectTask).not.toHaveBeenCalled();
  expect(mocks.updateTaskData).not.toHaveBeenCalled();
  expect(mocks.addTask).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isHost.mockReturnValue(true);
});

describe('TaskItem hosted focus shortcut', () => {
  it.each(['pending', 'in_progress'] as const)('renders an accessible host-only button for %s tasks', (status) => {
    renderTask({ task: { ...baseTask, status } });
    expect(focusButton()).toHaveAttribute('type', 'button');
    expect(focusButton()).toHaveAttribute('title', '开始番茄专注');
    expect(focusButton()).toHaveAttribute('draggable', 'false');
  });

  it('does not render the shortcut on an ordinary web page', () => {
    mocks.isHost.mockReturnValue(false);
    renderTask();
    expect(screen.queryByRole('button', { name: /开始番茄专注/ })).not.toBeInTheDocument();
  });

  it.each([
    { name: 'completed', task: { ...baseTask, status: 'completed' as const }, initialEditing: false },
    { name: 'title editing', task: baseTask, initialEditing: true },
  ])('does not render the shortcut while $name', ({ task, initialEditing }) => {
    renderTask({ task, initialEditing });
    expect(screen.queryByRole('button', { name: /开始番茄专注/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('hides the shortcut when title editing begins', async () => {
    const user = userEvent.setup();
    renderTask();
    expect(focusButton()).toBeInTheDocument();
    await user.click(screen.getByText(baseTask.title));
    expect(screen.getByRole('textbox')).toHaveValue(baseTask.title);
    expect(screen.queryByRole('button', { name: /开始番茄专注/ })).not.toBeInTheDocument();
  });

  it('navigates with an encoded task id without selecting, completing or editing', async () => {
    const user = userEvent.setup();
    renderTask({ task: { ...baseTask, id: 'task /中文?x=1&next=#z%' } });
    await user.click(focusButton());
    expect(screen.getByTestId('location').textContent).toBe('/pomodoro?task_id=task%20%2F%E4%B8%AD%E6%96%87%3Fx%3D1%26next%3D%23z%25&mode=pomodoro');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    expectTaskUnchanged();
  });

  it.each(['{Enter}', ' '])('supports native keyboard activation with %j', async (key) => {
    const user = userEvent.setup();
    renderTask();
    await user.tab();
    expect(screen.getByRole('checkbox')).toHaveFocus();
    await user.tab();
    expect(focusButton()).toHaveFocus();
    await user.keyboard(key);
    expect(screen.getByTestId('location').textContent).toBe('/pomodoro?task_id=task-1&mode=pomodoro');
    expectTaskUnchanged();
  });

  it('isolates pointer, drag, context-menu and long-press gestures from the row', () => {
    const parentGesture = vi.fn();
    renderTask({}, {
      onClick: parentGesture,
      onDoubleClick: parentGesture,
      onPointerDown: parentGesture,
      onPointerUp: parentGesture,
      onMouseDown: parentGesture,
      onMouseUp: parentGesture,
      onContextMenu: parentGesture,
      onDragStart: parentGesture,
      onDragEnd: parentGesture,
      onTouchStart: parentGesture,
      onTouchMove: parentGesture,
      onTouchEnd: parentGesture,
      onTouchCancel: parentGesture,
      onKeyDown: parentGesture,
      onKeyUp: parentGesture,
    });
    const button = focusButton();
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    expect(fireEvent.mouseDown(button, { button: 0 })).toBe(false);
    expect(button).toHaveFocus();
    fireEvent.mouseUp(button);
    expect(fireEvent.dragStart(button)).toBe(false);
    fireEvent.dragEnd(button);
    expect(fireEvent.contextMenu(button)).toBe(false);
    fireEvent.touchStart(button);
    fireEvent.touchMove(button);
    fireEvent.touchEnd(button);
    fireEvent.touchCancel(button);
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.keyUp(button, { key: 'Enter' });
    fireEvent.doubleClick(button);
    fireEvent.click(button);
    expect(parentGesture).not.toHaveBeenCalled();
    expect(mocks.onTouchStart).not.toHaveBeenCalled();
    expect(mocks.onTouchMove).not.toHaveBeenCalled();
    expect(mocks.onTouchEnd).not.toHaveBeenCalled();
    expect(mocks.setDragSource).not.toHaveBeenCalled();
    expect(mocks.clearDrag).not.toHaveBeenCalled();
    expectTaskUnchanged();
  });

  it('targets a nested child rather than its parent', async () => {
    const user = userEvent.setup();
    const child: Task = { ...baseTask, id: 'child/中文?x=1&next=#z%', title: '子任务专注' };
    const parent: Task = { ...baseTask, child_ids: [child.id] };
    renderTask({ task: parent, allTasks: [parent, child] });
    expect(screen.getAllByRole('button', { name: /开始番茄专注/ })).toHaveLength(2);
    await user.click(focusButton(child.title));
    const route = new URL(screen.getByTestId('location').textContent!, 'https://ticklist.test');
    expect(route.pathname).toBe('/pomodoro');
    expect(Array.from(route.searchParams.entries())).toEqual([['task_id', child.id], ['mode', 'pomodoro']]);
    expectTaskUnchanged();
  });
});
