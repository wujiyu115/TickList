import { describe, it, expect, beforeEach } from 'vitest';
import {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  searchTasks,
  batchUpdateTasks,
} from '../task';

describe('Task API', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-jwt-token');
  });

  it('getTasks() should return task list', async () => {
    const result = await getTasks();
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.tasks[0].title).toBe('任务一');
  });

  it('getTasks(params) should accept filter parameters', async () => {
    const result = await getTasks({ status: 'pending', limit: 10 });
    expect(result).toBeDefined();
    expect(result.tasks).toBeDefined();
    expect(Array.isArray(result.tasks)).toBe(true);
  });

  it('createTask() should create and return new task', async () => {
    const result = await createTask({ title: '新任务' });
    expect(result).toBeDefined();
    expect(result.title).toBe('新任务');
    expect(result.id).toBeDefined();
  });

  it('getTaskById() should return task detail', async () => {
    const result = await getTaskById('100');
    expect(result).toBeDefined();
    expect(result.id).toBe('100');
  });

  it('updateTask() should update and return task', async () => {
    const result = await updateTask('100', { title: '更新后标题', status: 'completed' });
    expect(result).toBeDefined();
    expect(result.id).toBe('100');
  });

  it('deleteTask() should complete successfully', async () => {
    await expect(deleteTask('100')).resolves.not.toThrow();
  });

  it('searchTasks() should return matching tasks', async () => {
    const result = await searchTasks('任务');
    expect(result).toBeDefined();
    expect(result.tasks).toHaveLength(1);
    expect(result.count).toBe(1);
  });

  it('batchUpdateTasks() should return updated count', async () => {
    const result = await batchUpdateTasks(['100', '101'], 'completed');
    expect(result).toBeDefined();
    expect(result.updated_count).toBe(2);
  });
});
