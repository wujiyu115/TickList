import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from '../admin/AdminPage';
import { mockUser } from '../../tests/mocks/data';

describe('AdminPage', () => {
  const adminUser = mockUser({ id: '1', username: 'admin', role_group: 'admin' });

  it('should render admin page with navigation', () => {
    render(
      <MemoryRouter>
        <AdminPage user={adminUser} />
      </MemoryRouter>
    );

    expect(screen.getByText('管理后台')).toBeInTheDocument();
    expect(screen.getAllByText('用户管理').length).toBeGreaterThan(0);
  });

  it('should render user management content by default', async () => {
    render(
      <MemoryRouter>
        <AdminPage user={adminUser} />
      </MemoryRouter>
    );

    // UserManagement is rendered by default, it fetches users from MSW
    await waitFor(() => {
      expect(screen.getAllByText('用户管理').length).toBeGreaterThan(0);
    });
  });
});
