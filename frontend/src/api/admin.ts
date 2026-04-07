import api from './index';

export const getUsers = () => api.get('/admin/users');
export const createUser = (data: { username: string; password: string; email?: string; role_group?: string }) =>
  api.post('/admin/users', data);
export const updateUser = (userId: string, data: { role_group?: string; email?: string }) =>
  api.put(`/admin/users/${userId}`, data);
export const freezeUser = (userId: string) => api.post(`/admin/users/${userId}/freeze`);
export const resetUserPassword = (userId: string, data: { new_password: string }) =>
  api.post(`/admin/users/${userId}/reset-password`, data);
