import api from './index';

// 导出数据
export const exportData = () => {
  return api.get('/data/export');
};

// 导入数据
export const importData = (data: any) => {
  return api.post('/data/import', data);
};
