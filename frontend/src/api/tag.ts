import api from './index';
import { Tag, TagCreateRequest, TagUpdateRequest } from '../types';

// 获取标签列表
export const getTags = async (): Promise<{ tags: Tag[]; total: number }> => {
  return api.get('/tags');
};

// 创建标签
export const createTag = async (data: TagCreateRequest): Promise<Tag> => {
  return api.post('/tags', data);
};

// 更新标签
export const updateTag = async (tagId: string, data: TagUpdateRequest): Promise<Tag> => {
  return api.put(`/tags/${tagId}`, data);
};

// 删除标签
export const deleteTag = async (tagId: string): Promise<void> => {
  return api.delete(`/tags/${tagId}`);
};
