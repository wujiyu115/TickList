import api from './index';
import { LoginRequest, LoginResponse, User } from '../types';

export const login = async (data: LoginRequest): Promise<LoginResponse> => {
  return api.post('/auth/login', data);
};

export const getCurrentUser = async (): Promise<User> => {
  return api.get('/auth/me');
};

export const logout = async (): Promise<void> => {
  return api.post('/auth/logout');
};

// 本地注册
export const register = (data: { username: string; password: string; email?: string }): Promise<{ success: boolean; message?: string }> => {
  return api.post('/auth/register', data);
};

// 本地登录
export const localLogin = (data: { username: string; password: string }): Promise<LoginResponse> => {
  return api.post('/auth/login', data);
};

// 修改密码
export const changePassword = (data: { old_password: string; new_password: string }) =>
  api.post('/auth/change-password', data);

// 获取认证配置（注册开关等）
export const getAuthConfig = () =>
  api.get<{ register_enabled: boolean }>('/auth/config');

// ===== WebAuthn Passkey API =====

// 注册流程
export const getPasskeyRegisterOptions = () =>
  api.post('/auth/webauthn/register/options');

export const verifyPasskeyRegister = (credential: any, deviceName?: string) =>
  api.post('/auth/webauthn/register/verify', { ...credential, device_name: deviceName || 'My Passkey' });

// 登录流程
export const getPasskeyLoginOptions = (username?: string) =>
  api.post('/auth/webauthn/login/options', username ? { username } : {});

export const verifyPasskeyLogin = (credential: any) =>
  api.post('/auth/webauthn/login/verify', credential);

// 凭证管理
export const getPasskeyCredentials = () =>
  api.get('/auth/webauthn/credentials');

export const deletePasskeyCredential = (id: string) =>
  api.delete(`/auth/webauthn/credentials/${id}`);
