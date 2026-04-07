import api from './index';

// 导出数据
export const exportData = () => {
  return api.get('/data/export');
};

// 导入数据 (JSON)
export const importData = (data: any) => {
  return api.post('/data/import', data);
};

// 导入滴答清单 CSV 备份文件
export const importDidaCsv = async (file: File): Promise<any> => {
  const formData = new FormData();
  formData.append('file', file);
  return api.post('/data/import-dida', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};
