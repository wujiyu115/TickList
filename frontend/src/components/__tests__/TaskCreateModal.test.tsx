import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TaskCreateModal from '../TaskCreateModal';

// Mock TaskContext
const mockAddTask = vi.fn().mockResolvedValue({ id: '1', title: 'test' });

vi.mock('../../contexts/TaskContext', () => ({
  useTaskContext: () => ({
    addTask: mockAddTask,
  }),
}));

const renderModal = (visible = true) => {
  const onClose = vi.fn();
  const result = render(
    <MemoryRouter>
      <TaskCreateModal visible={visible} onClose={onClose} />
    </MemoryRouter>
  );
  return { ...result, onClose };
};

describe('TaskCreateModal', () => {
  it('should render form when visible', async () => {
    renderModal(true);
    await waitFor(() => {
      expect(screen.getByText('新建任务')).toBeInTheDocument();
    });
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('描述')).toBeInTheDocument();
  });

  it('should allow typing title and submitting', async () => {
    const user = userEvent.setup();
    renderModal(true);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('任务标题')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('任务标题');
    await user.type(titleInput, '新建测试任务');
    expect(titleInput).toHaveValue('新建测试任务');
  });

  it('should show validation error for empty title on submit', async () => {
    const user = userEvent.setup();
    renderModal(true);

    await waitFor(() => {
      expect(screen.getByText('新建任务')).toBeInTheDocument();
    });

    // Click OK button without filling title
    const okButton = screen.getByRole('button', { name: /确 定|OK/i });
    await user.click(okButton);

    // Ant Design form validation should show error
    await waitFor(() => {
      expect(screen.getByText('请输入任务标题')).toBeInTheDocument();
    });
  });
});
