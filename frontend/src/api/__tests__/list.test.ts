import { describe, it, expect, beforeEach } from 'vitest';
import { getLists, createList, updateList, deleteList } from '../list';

describe('List API', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-jwt-token');
  });

  it('getLists() should return list collection', async () => {
    const result = await getLists();
    expect(result).toBeDefined();
    expect(result.lists).toHaveLength(1);
    expect(result.lists[0].name).toBe('工作');
    expect(result.total).toBe(1);
  });

  it('createList() should create and return new list', async () => {
    const result = await createList({ name: '生活' });
    expect(result).toBeDefined();
    expect(result.name).toBe('生活');
    expect(result.id).toBeDefined();
  });

  it('updateList() should update and return list', async () => {
    const result = await updateList('10', { name: '工作更新' });
    expect(result).toBeDefined();
    expect(result.id).toBe('10');
  });

  it('deleteList() should complete successfully', async () => {
    await expect(deleteList('10')).resolves.not.toThrow();
  });
});
