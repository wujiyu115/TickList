import { describe, it, expect, beforeEach } from 'vitest';
import { login, getCurrentUser, logout, register, changePassword } from '../auth';

describe('Auth API', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-jwt-token');
  });

  it('login() should send credentials and return token + user', async () => {
    const result = await login({ username: 'testuser', password: 'test123' });
    expect(result).toBeDefined();
    expect(result.token).toBe('mock-jwt-token');
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.username).toBe('testuser');
  });

  it('register() should send registration request', async () => {
    const result = await register({ username: 'newuser', password: 'pass123' });
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });

  it('getCurrentUser() should return current user info', async () => {
    const user = await getCurrentUser();
    expect(user).toBeDefined();
    expect(user.username).toBe('testuser');
    expect(user.email).toBe('test@example.com');
  });

  it('changePassword() should send password change request', async () => {
    const result = await changePassword({ old_password: 'old123', new_password: 'new123' });
    expect(result).toBeDefined();
    expect((result as any).success).toBe(true);
  });

  it('logout() should complete successfully', async () => {
    await expect(logout()).resolves.not.toThrow();
  });
});
