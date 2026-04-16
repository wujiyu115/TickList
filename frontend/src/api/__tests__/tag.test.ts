import { describe, it, expect, beforeEach } from 'vitest';
import { getTags, createTag, updateTag, deleteTag } from '../tag';

describe('Tag API', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-jwt-token');
  });

  it('getTags() should return tag collection', async () => {
    const result = await getTags();
    expect(result).toBeDefined();
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].name).toBe('重要');
    expect(result.total).toBe(1);
  });

  it('createTag() should create and return new tag', async () => {
    const result = await createTag({ name: '紧急', color: '#ff0000' });
    expect(result).toBeDefined();
    expect(result.name).toBe('紧急');
    expect(result.id).toBeDefined();
  });

  it('updateTag() should update and return tag', async () => {
    const result = await updateTag('20', { name: '非常重要' });
    expect(result).toBeDefined();
    expect(result.id).toBe('20');
  });

  it('deleteTag() should complete successfully', async () => {
    await expect(deleteTag('20')).resolves.not.toThrow();
  });
});
