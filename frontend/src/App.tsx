import React, { useState, useEffect, createContext, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme as antdTheme, Spin } from 'antd';
import { message, AntdAppBridge } from './utils/antdApp';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import TitleBar from './components/TitleBar';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const PasskeyManagePage = lazy(() => import('./pages/PasskeyManagePage'));
const ServerConfigPage = lazy(() => import('./pages/ServerConfigPage'));
import { FocusProvider } from './contexts/FocusContext';
import { getCurrentUser } from './api/auth';
import { getSettings } from './api/settings';
import { User, UserSettings } from './types';
import { isNativePlatform, usesRemoteServer, getApiBaseUrl } from './utils/platform';
import { initNotifications, addNotificationListeners, syncAllTaskNotifications, syncAllCountdownNotifications } from './services/notificationService';
import { getTasks } from './api/task';
import { getCountdowns } from './api/countdown';
import { remoteLog } from './services/remoteLog';
import { THEME_COLORS } from './theme/themeColors';

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
    // Native / 桌面端未配置服务器地址：强制跳转配置页，不发出任何认证请求
    if (usesRemoteServer() && !getApiBaseUrl()) {
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
        <TitleBar primaryColor={primaryColor} isDark={isDark} />
        <div className="app-content">
        <FocusProvider>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100dvh - var(--tl-titlebar-h))' }}><Spin size="large" /></div>}>
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
        </div>
        </AntApp>
      </ThemeContext.Provider>
    </ConfigProvider>
  );
};

export default App;
