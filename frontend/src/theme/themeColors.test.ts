import { describe, it, expect } from 'vitest';
import { resolveTheme, THEME_COLORS } from './themeColors';

describe('resolveTheme', () => {
  it('已知 key 返回对应配色', () => {
    expect(resolveTheme('default').color).toBe('#1677ff');
  });
  it('未知 key 回退到 default', () => {
    expect(resolveTheme('does-not-exist')).toBe(THEME_COLORS.default);
  });
  it('含 42 套配色（浅色 21 + 深色 21，含两套空间玻璃）', () => {
    expect(Object.keys(THEME_COLORS).length).toBe(42);
  });
});
