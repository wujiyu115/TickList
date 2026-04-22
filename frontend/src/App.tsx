import React, { useState, useEffect, createContext, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { message, ConfigProvider, theme as antdTheme, Spin } from 'antd';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';

const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ChangePasswordPage = lazy(() => import('./pages/ChangePasswordPage'));
const PasskeyManagePage = lazy(() => import('./pages/PasskeyManagePage'));
import { FocusProvider } from './contexts/FocusContext';
import { getCurrentUser } from './api/auth';
import { getSettings } from './api/settings';
import { User, UserSettings } from './types';

// 配色方案映射
interface ThemeConfig {
  color: string;
  isDark: boolean;
  token?: Record<string, string>;
}

const THEME_COLORS: Record<string, ThemeConfig> = {
  default: { color: '#1677ff', isDark: false },
  green: { color: '#52c41a', isDark: false },
  purple: { color: '#722ed1', isDark: false },
  orange: { color: '#fa8c16', isDark: false },
  rose: { color: '#eb2f96', isDark: false },
  minimal: { color: '#8c8c8c', isDark: false },
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

const App: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [primaryColor, setPrimaryColor] = useState('#1677ff');
  const [isDark, setIsDark] = useState(false);
  const [extraToken, setExtraToken] = useState<Record<string, string> | undefined>(undefined);
  const [defaultViewPath, setDefaultViewPath] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

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
            const themeConfig = THEME_COLORS[settings.theme];
            setPrimaryColor(themeConfig.color);
            setIsDark(themeConfig.isDark);
            setExtraToken(themeConfig.token);
          }
          // 设置默认视图路径，仅在首次加载时使用
          if (settings.default_view) {
            setDefaultViewPath(getDefaultViewPath(settings.default_view));
          }
        } catch (e) {
          console.error('Failed to load settings:', e);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  };

  const setTheme = (themeKey: string) => {
    const config = THEME_COLORS[themeKey];
    if (config) {
      setPrimaryColor(config.color);
      setIsDark(config.isDark);
      setExtraToken(config.token);
    }
  };

  const handleLogin = async (userData: User, token: string) => {
    localStorage.setItem('token', token);
    setUser(userData);
    message.success('登录成功');
    // 加载用户设置并跳转到默认视图
    try {
      const settings = await getSettings();
      if (settings.theme && THEME_COLORS[settings.theme]) {
        const themeConfig = THEME_COLORS[settings.theme];
        setPrimaryColor(themeConfig.color);
        setIsDark(themeConfig.isDark);
        setExtraToken(themeConfig.token);
      }
      // 登录成功后立即跳转到默认视图
      const targetPath = getDefaultViewPath(settings.default_view || 'tasks');
      navigate(targetPath, { replace: true });
    } catch (e) {
      console.error('Failed to load settings:', e);
      navigate('/', { replace: true });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
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
          ...extraToken,
        },
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <ThemeContext.Provider value={{ primaryColor, isDark, setTheme }}>
        <FocusProvider>
        <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}><Spin size="large" /></div>}>
        <Routes>
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
      </ThemeContext.Provider>
    </ConfigProvider>
  );
};

export default App;
