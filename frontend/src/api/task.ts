import api from './index';
import { Task, TaskCreateRequest, TaskUpdateRequest } from '../types';

// 获取任务列表
export const getTasks = async (params?: {
  status?: string;
  list_id?: string;
  tags?: string;
  is_pinned?: boolean;
  start_date?: string;
  end_date?: string;
  no_start_time?: boolean;
  skip?: number;
  limit?: number;
}): Promise<{ tasks: Task[]; total: number }> => {
  return api.get('/tasks', { params });
};

// 获取任务详情
export const getTaskById = async (taskId: string): Promise<Task> => {
  return api.get(`/tasks/${taskId}`);
};

// 创建任务
export const createTask = async (data: TaskCreateRequest): Promise<Task> => {
  return api.post('/tasks', data);
};

// 更新任务
export const updateTask = async (taskId: string, data: TaskUpdateRequest): Promise<Task> => {
  return api.put(`/tasks/${taskId}`, data);
};

// 删除任务
export const deleteTask = async (taskId: string): Promise<void> => {
  return api.delete(`/tasks/${taskId}`);
};

// 移动任务
export const moveTask = async (taskId: string, newParentId?: string): Promise<Task> => {
  return api.post(`/tasks/${taskId}/move`, { new_parent_id: newParentId });
};

// 复制任务
export const duplicateTask = async (taskId: string): Promise<Task> => {
  return api.post(`/tasks/${taskId}/duplicate`);
};

// 批量更新任务状态
export const batchUpdateTasks = async (taskIds: string[], status: string): Promise<{ updated_count: number }> => {
  return api.post('/tasks/batch-update', { task_ids: taskIds, status });
};

// 获取子任务
export const getChildTasks = async (taskId: string): Promise<{ children: Task[]; count: number }> => {
  return api.get(`/tasks/${taskId}/children`);
};

// 搜索任务
export const searchTasks = async (keyword: string): Promise<{ tasks: Task[]; count: number }> => {
  return api.get('/tasks/search', { params: { keyword } });
};

// 获取垃圾箱任务（分页）
export const getTrashTasks = async (params?: { page?: number; page_size?: number }): Promise<any> => {
  return api.get('/tasks/trash', { params });
};

// 恢复任务
export const restoreTask = async (taskId: string): Promise<any> => {
  return api.post(`/tasks/${taskId}/restore`);
};

// 永久删除任务
export const permanentDeleteTask = async (taskId: string): Promise<any> => {
  return api.delete(`/tasks/${taskId}/permanent`);
};

// 清空垃圾箱
export const emptyTrash = async (): Promise<any> => {
  return api.delete('/tasks/trash/empty');
};
