import api from './index';
import { UserSettings } from '../types';

// 获取当前用户设置
export const getSettings = (): Promise<UserSettings> => {
  return api.get('/settings');
};

// 更新用户设置（部分更新）
export const updateSettings = (settings: Partial<UserSettings>): Promise<UserSettings> => {
  return api.put('/settings', settings);
};

// 测试推送渠道
export const testPushChannel = (type: string, config: Record<string, any>): Promise<{ success: boolean; message: string }> => {
  return api.post('/settings/push/test', { type, config });
};
