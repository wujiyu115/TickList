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

// 删除清单（可选任务处理方式）
export const deleteList = async (
  listId: string,
  params?: { action?: string; target_list_id?: string }
): Promise<any> => {
  return api.delete(`/lists/${listId}`, { params });
};

// 获取清单任务数量（支持文件夹统计）
export const getListTaskCount = async (listId: string): Promise<{
  list_id: string;
  type: 'folder' | 'list';
  task_count: number;
  sublist_count?: number;
}> => {
  return api.get(`/lists/${listId}/task-count`);
};

// 批量排序清单
export const reorderLists = async (items: Array<{ id: string; order: number }>): Promise<void> => {
  return api.post('/lists/reorder', items);
};
