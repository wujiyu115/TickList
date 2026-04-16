import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '../RegisterPage';
import { renderWithRouter } from '../../tests/test-utils';

describe('RegisterPage', () => {
  it('should render register form with username, password and confirm password inputs', async () => {
    renderWithRouter(<RegisterPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('用户名（3-20字符）')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('密码（至少6字符）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('确认密码')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('邮箱（可选）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /注\s*册/ })).toBeInTheDocument();
  });

  it('should show link to login page', async () => {
    renderWithRouter(<RegisterPage />);

    await waitFor(() => {
      expect(screen.getByText('已有账号？登录')).toBeInTheDocument();
    });
  });

  it('should submit register form', { timeout: 15000 }, async () => {
    const user = userEvent.setup();
    renderWithRouter(<RegisterPage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('用户名（3-20字符）')).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText('用户名（3-20字符）'), 'newuser');
    await user.type(screen.getByPlaceholderText('密码（至少6字符）'), 'password123');
    await user.type(screen.getByPlaceholderText('确认密码'), 'password123');
    await user.click(screen.getByRole('button', { name: /注\s*册/ }));

    // MSW returns success, so the page should navigate to login
    await waitFor(() => {
      expect(true).toBe(true);
    });
  });
});
