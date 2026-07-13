import React, { useState, useEffect, createContext, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme as antdTheme, Spin } from 'antd';
import { message, AntdAppBridge } from './utils/antdApp';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const PasskeyManagePage = lazy(() => import('./pages/PasskeyManagePage'));
const ServerConfigPage = lazy(() => import('./pages/ServerConfigPage'));
import { FocusProvider } from './contexts/FocusContext';
import { getCurrentUser } from './api/auth';
import { getSettings } from './api/settings';
import { User, UserSettings } from './types';
import { isNativePlatform, getApiBaseUrl } from './utils/platform';
import { initNotifications, addNotificationListeners, syncAllTaskNotifications, syncAllCountdownNotifications } from './services/notificationService';
import { getTasks } from './api/task';
import { getCountdowns } from './api/countdown';
import { remoteLog } from './services/remoteLog';

// 配色方案映射
interface ThemeConfig {
  color: string;
  isDark: boolean;
  token?: Record<string, string>;
}

const THEME_COLORS: Record<string, ThemeConfig> = {
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

// 主题 Context
export const ThemeContext = createContext<{
  primaryColor: string;
  isDark: boolean;
  setTheme: (themeKey: string) => void;
} | null>(null);

// 根据 default_view 获取跳转路径
const getDefaultViewPath = (defaultView: string): string => {
  switch (defaultView) {
    case 'calendar':
      return '/calendar';
    case 'statistics':
      return '/statistics';
    case 'pomodoro':
      return '/pomodoro';
    case 'tasks':
    default:
      return '/';
  }
};

addNotificationListeners();

const cap = (window as any)?.Capacitor;
remoteLog('app-init', {
  isNative: isNativePlatform(),
  capacitorExists: !!cap,
  platform: cap?.getPlatform?.(),
  pluginsAvailable: cap?.Plugins ? Object.keys(cap.Plugins) : [],
  userAgent: navigator.userAgent,
});

const syncNotifications = () => {
  initNotifications().then(async (granted) => {
    if (!granted) return;
    const [taskResp, cdResp] = await Promise.all([
      getTasks({ status: 'pending,in_progress' }),
      getCountdowns(),
    ]);
    await syncAllTaskNotifications(taskResp.tasks);
    await syncAllCountdownNotifications(cdResp.countdowns);
  }).catch(console.error);
};

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // 初始主题从上次缓存读取，使登录页也能套用用户配色方案（设置需登录后才拉取）
  const cachedTheme = THEME_COLORS[localStorage.getItem('theme_key') || 'default'];
  const [primaryColor, setPrimaryColor] = useState(cachedTheme?.color || '#1677ff');
  const [isDark, setIsDark] = useState(cachedTheme?.isDark || false);
  const [extraToken, setExtraToken] = useState<Record<string, string> | undefined>(cachedTheme?.token);
  const [defaultViewPath, setDefaultViewPath] = useState<string | null>(null);

  useEffect(() => {
    // Native 端未配置服务器地址：强制跳转配置页，不发出任何认证请求
    if (isNativePlatform() && !getApiBaseUrl()) {
      setLoading(false);
      if (location.pathname !== '/server-config') {
        navigate('/server-config?reason=missing', { replace: true });
      }
      return;
    }
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyTheme = (themeKey: string) => {
    const config = THEME_COLORS[themeKey];
    if (!config) return;
    setPrimaryColor(config.color);
    setIsDark(config.isDark);
    setExtraToken(config.token);
    localStorage.setItem('theme_key', themeKey);
  };

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const userData = await getCurrentUser();
        setUser(userData);
        // 加载用户设置并应用主题和默认视图
        try {
          const settings = await getSettings();
          if (settings.theme && THEME_COLORS[settings.theme]) {
            applyTheme(settings.theme);
          }
          if (settings.default_view) {
            setDefaultViewPath(getDefaultViewPath(settings.default_view));
          }
          syncNotifications();
        } catch (e) {
          console.error('Failed to load settings:', e);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
    } finally {
      setLoading(false);
    }
  };

  const setTheme = (themeKey: string) => {
    applyTheme(themeKey);
  };

  const handleLogin = async (userData: User, token: string, refreshToken?: string) => {
    localStorage.setItem('token', token);
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    setUser(userData);
    message.success('登录成功');
    // 加载用户设置并跳转到默认视图
    try {
      const settings = await getSettings();
      if (settings.theme && THEME_COLORS[settings.theme]) {
        applyTheme(settings.theme);
      }
      syncNotifications();
      const targetPath = getDefaultViewPath(settings.default_view || 'tasks');
      navigate(targetPath, { replace: true });
    } catch (e) {
      console.error('Failed to load settings:', e);
      navigate('/', { replace: true });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setUser(null);
    message.success('已退出登录');
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <ConfigProvider
      theme={{
        cssVar: true,
        token: {
          colorPrimary: primaryColor,
          // 空间玻璃：更柔和的圆角节奏
          borderRadius: 10,
          borderRadiusLG: 16,
          borderRadiusSM: 8,
          ...extraToken,
        },
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <ThemeContext.Provider value={{ primaryColor, isDark, setTheme }}>
        <AntApp component={false}>
        <AntdAppBridge />
        <FocusProvider>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh' }}><Spin size="large" /></div>}>
        <Routes>
          <Route
            path="/server-config"
            element={<ServerConfigPage />}
          />
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to={defaultViewPath || '/'} replace />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/register"
            element={
              user ? (
                <Navigate to={defaultViewPath || '/'} replace />
              ) : (
                <RegisterPage />
              )
            }
          />
          <Route
            path="/change-password"
            element={
              user ? (
                <ChangePasswordPage />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/passkey"
            element={
              user ? (
                <PasskeyManagePage />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route
            path="/*"
            element={
              user ? (
                <MainLayout user={user} onLogout={handleLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
        </Suspense>
        </FocusProvider>
        </AntApp>
      </ThemeContext.Provider>
    </ConfigProvider>
  );
};

export default App;
