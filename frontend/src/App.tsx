import React, { useState, useEffect, createContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { message, ConfigProvider, theme as antdTheme } from 'antd';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { getCurrentUser } from './api/auth';
import { getSettings } from './api/settings';
import { User } from './types';

// 配色方案映射
const THEME_COLORS: Record<string, { color: string; isDark: boolean }> = {
  default: { color: '#1677ff', isDark: false },
  green: { color: '#52c41a', isDark: false },
  purple: { color: '#722ed1', isDark: false },
  orange: { color: '#fa8c16', isDark: false },
  rose: { color: '#eb2f96', isDark: false },
  minimal: { color: '#8c8c8c', isDark: false },
  dark: { color: '#141414', isDark: true },
  midnight: { color: '#001529', isDark: true },
};

// 主题 Context
export const ThemeContext = createContext<{
  primaryColor: string;
  isDark: boolean;
  setTheme: (color: string, isDark: boolean) => void;
} | null>(null);

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [primaryColor, setPrimaryColor] = useState('#1677ff');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      if (token) {
        const userData = await getCurrentUser();
        setUser(userData);
        // 加载用户设置并应用主题
        try {
          const settings = await getSettings();
          if (settings.theme && THEME_COLORS[settings.theme]) {
            const themeConfig = THEME_COLORS[settings.theme];
            setPrimaryColor(themeConfig.color);
            setIsDark(themeConfig.isDark);
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

  const setTheme = (color: string, dark: boolean) => {
    setPrimaryColor(color);
    setIsDark(dark);
  };

  const handleLogin = (userData: User, token: string) => {
    localStorage.setItem('token', token);
    setUser(userData);
    message.success('登录成功');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    message.success('已退出登录');
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: primaryColor,
        },
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <ThemeContext.Provider value={{ primaryColor, isDark, setTheme }}>
        <Routes>
          <Route
            path="/login"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <LoginPage onLogin={handleLogin} />
              )
            }
          />
          <Route
            path="/register"
            element={
              user ? (
                <Navigate to="/" replace />
              ) : (
                <RegisterPage />
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
      </ThemeContext.Provider>
    </ConfigProvider>
  );
};

export default App;
