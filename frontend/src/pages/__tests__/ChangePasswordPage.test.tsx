import React from 'react';
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import ChangePasswordPage from '../ChangePasswordPage';
import { renderWithRouter } from '../../tests/test-utils';

describe('ChangePasswordPage', () => {
  it('should render change password form', () => {
    renderWithRouter(<ChangePasswordPage />);

    expect(screen.getByText('修改密码')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入当前密码')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入新密码（至少6位）')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请再次输入新密码')).toBeInTheDocument();
  });

  it('should render submit button and back button', () => {
    renderWithRouter(<ChangePasswordPage />);

    expect(screen.getByRole('button', { name: /确认修改/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回/ })).toBeInTheDocument();
  });
});
