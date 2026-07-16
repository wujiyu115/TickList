// 配色方案映射（原 App.tsx 内定义，抽出供 App 与托盘菜单共用）
export interface ThemeConfig {
  color: string;
  isDark: boolean;
  token?: Record<string, string>;
}

export const THEME_COLORS: Record<string, ThemeConfig> = {
  // 浅色主题（20 种）
  default: { color: '#1677ff', isDark: false },
  sky: { color: '#69b1ff', isDark: false },
  geekblue: { color: '#2f54eb', isDark: false },
  indigo: { color: '#597ef7', isDark: false },
  cyan: { color: '#13c2c2', isDark: false },
  mint: { color: '#36cfc9', isDark: false },
  green: { color: '#52c41a', isDark: false },
  sage: { color: '#73d13d', isDark: false },
  lime: { color: '#7cb305', isDark: false },
  olive: { color: '#5b8c00', isDark: false },
  yellow: { color: '#fadb14', isDark: false },
  gold: { color: '#d48806', isDark: false },
  orange: { color: '#fa8c16', isDark: false },
  volcano: { color: '#fa541c', isDark: false },
  red: { color: '#ff4d4f', isDark: false },
  rose: { color: '#eb2f96', isDark: false },
  magenta: { color: '#c41d7f', isDark: false },
  purple: { color: '#722ed1', isDark: false },
  lavender: { color: '#b37feb', isDark: false },
  minimal: { color: '#8c8c8c', isDark: false },
  // 空间玻璃青（浅色）：与深色 spaceglass 同色系电光青，冷白磨砂底
  spaceglasslight: {
    color: '#0ca5c0',
    isDark: false,
    token: {
      colorBgContainer: '#ffffff',
      colorBgElevated: '#ffffff',
      colorBgLayout: '#e8f1f5',
      colorBgSpotlight: '#d6eaf0',
      colorBorderSecondary: '#dce9ee',
      colorBorder: '#c9dee5',
    },
  },
  // 深色主题（20 种）
  dark: { color: '#1677ff', isDark: true },
  midnight: {
    color: '#4096ff',
    isDark: true,
    token: {
      colorBgContainer: '#0a1628',
      colorBgElevated: '#0f1d30',
      colorBgLayout: '#020d1a',
      colorBgSpotlight: '#112a45',
      colorBorderSecondary: '#1a3050',
      colorBorder: '#1d3b5a',
    },
  },
  abyss: { color: '#1d39c4', isDark: true },
  steel: { color: '#2f54eb', isDark: true },
  obsidian: { color: '#08979c', isDark: true },
  void: { color: '#13c2c2', isDark: true },
  ocean: { color: '#006d75', isDark: true },
  forest: { color: '#389e0d', isDark: true },
  emerald: { color: '#52c41a', isDark: true },
  neon: { color: '#a0d911', isDark: true },
  sunset: { color: '#faad14', isDark: true },
  amber: { color: '#d48806', isDark: true },
  ember: { color: '#ff7a45', isDark: true },
  magma: { color: '#fa541c', isDark: true },
  crimson: { color: '#cf1322', isDark: true },
  plum: { color: '#c41d7f', isDark: true },
  orchid: { color: '#eb2f96', isDark: true },
  royal: { color: '#9254de', isDark: true },
  nebula: { color: '#b37feb', isDark: true },
  slate: { color: '#bfbfbf', isDark: true },
  // 空间玻璃青（参考 Vision Pro 空间玻璃设计系统的电光青）
  spaceglass: {
    color: '#3ad6ea',
    isDark: true,
    token: {
      colorBgContainer: '#0d1620',
      colorBgElevated: '#111e2b',
      colorBgLayout: '#070d15',
      colorBgSpotlight: '#16293b',
      colorBorderSecondary: '#173042',
      colorBorder: '#1d3849',
    },
  },
};

/** 按 key 取配色；未知 key 回退 default。 */
export function resolveTheme(key: string): ThemeConfig {
  return THEME_COLORS[key] || THEME_COLORS.default;
}
