import api from './index';
import { TaskList, TaskListCreateRequest, TaskListUpdateRequest } from '../types';

// 获取清单列表
export const getLists = async (params?: { type?: string; is_archived?: boolean }): Promise<{ lists: TaskList[]; total: number }> => {
  return api.get('/lists', { params });
};

// 创建清单
export const createList = async (data: TaskListCreateRequest): Promise<TaskList> => {
  return api.post('/lists', data);
};

// 更新清单
export const updateList = async (listId: string, data: TaskListUpdateRequest): Promise<TaskList> => {
  return api.put(`/lists/${listId}`, data);
};

// 删除清单
export const deleteList = async (listId: string): Promise<void> => {
  return api.delete(`/lists/${listId}`);
};

// 批量排序清单
export const reorderLists = async (items: Array<{ id: string; order: number }>): Promise<void> => {
  return api.post('/lists/reorder', items);
};
