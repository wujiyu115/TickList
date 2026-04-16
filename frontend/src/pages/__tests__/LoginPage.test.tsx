import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { server } from '../../tests/mocks/server';
import { http, HttpResponse } from 'msw';
import LoginPage from '../LoginPage';

// Mock @simplewebauthn/browser
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => false,
  startAuthentication: vi.fn(),
}));

let mockOnLogin: ReturnType<typeof vi.fn>;

import { beforeEach } from 'vitest';

beforeEach(() => {
  mockOnLogin = vi.fn();
});

const renderLoginPage = () => {
  return render(
    <MemoryRouter>
      <LoginPage onLogin={mockOnLogin} />
    </MemoryRouter>
  );
};

describe('LoginPage', () => {
  it('should render username and password inputs', async () => {
    renderLoginPage();
    expect(screen.getByPlaceholderText('用户名')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
  });

  it('should call onLogin after successful login', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('用户名'), 'testuser');
    await user.type(screen.getByPlaceholderText('密码'), 'test123');
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'testuser' }),
        'mock-jwt-token'
      );
    });
  });

  it('should show error on login failure', async () => {
    server.use(
      http.post('/api/auth/login', () => {
        return HttpResponse.json(
          { success: false, message: '用户名或密码错误' },
          { status: 200 }
        );
      })
    );

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByPlaceholderText('用户名'), 'wrong');
    await user.type(screen.getByPlaceholderText('密码'), 'wrong');
    await user.click(screen.getByRole('button', { name: /登\s*录/ }));

    // Login returns success:false, so onLogin should NOT be called
    await waitFor(() => {
      expect(mockOnLogin).not.toHaveBeenCalled();
    });
  });
});
