import api from './index';

export const getDebugLogs = (): Promise<{ logs: any[] }> => api.get('/debug-logs');
export const clearDebugLogs = () => api.delete('/debug-logs');
