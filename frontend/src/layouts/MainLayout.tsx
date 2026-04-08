import React, { useState, useEffect, useCallback } from 'react';
import { Layout, Drawer } from 'antd';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppSider from '../components/AppSider';
import TaskPage from '../pages/TaskPage';
import StatisticsPage from '../pages/StatisticsPage';
import CalendarPage from '../pages/CalendarPage';
import PomodoroPage from '../pages/PomodoroPage';
import CountdownPage from '../pages/CountdownPage';
import SummaryPage from '../pages/SummaryPage';
import SettingsPage from '../pages/SettingsPage';
import AdminPage from '../pages/admin/AdminPage';
import { TaskProvider } from '../contexts/TaskContext';
import { User } from '../types';
import './MainLayout.less';

const { Content } = Layout;

const MOBILE_BREAKPOINT = 768;

interface MainLayoutProps {
  user: User;
  onLogout: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user, onLogout }) => {
  const location = useLocation();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // 判断当前是否在任务页面（与 AppSider 的 isTaskView 逻辑一致）
  const isTaskPage = location.pathname === '/';
  const [siderCollapsed, setSiderCollapsed] = useState(() => {
    return localStorage.getItem('siderPanelCollapsed') === 'true';
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) setDrawerVisible(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDrawerNavigate = useCallback(() => {
    setDrawerVisible(false);
  }, []);

  const handleMenuClick = useCallback(() => {
    if (isMobile) {
      setDrawerVisible(prev => !prev);
    } else {
      setSiderCollapsed(prev => {
        const next = !prev;
        localStorage.setItem('siderPanelCollapsed', String(next));
        return next;
      });
    }
  }, [isMobile]);

  const handleTogglePanel = useCallback(() => {
    setSiderCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('siderPanelCollapsed', String(next));
      return next;
    });
  }, []);

  return (
    <TaskProvider>
      <Layout className="main-layout" style={{ height: '100vh' }} hasSider>
        {!isMobile && (
          <AppSider
            user={user}
            panelCollapsed={siderCollapsed}
            onTogglePanel={handleTogglePanel}
          />
        )}
        <Layout style={{ flex: 1 }}>
          <AppHeader
            user={user}
            onLogout={onLogout}
            onMenuClick={handleMenuClick}
          />
          <Content className="main-content" style={{ padding: 24, overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<TaskPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/countdown" element={<CountdownPage />} />
              <Route path="/pomodoro" element={<PomodoroPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/summary" element={<SummaryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/admin"
                element={
                  user.role_group === 'admin'
                    ? <AdminPage user={user} />
                    : <Navigate to="/" replace />
                }
              />
            </Routes>
          </Content>
        </Layout>

        {/* 移动端侧边栏 Drawer */}
        {isMobile && (
          <Drawer
            placement="left"
            width={isTaskPage ? 280 : 'fit-content'}
            open={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            className={`mobile-sider-drawer${isTaskPage ? '' : ' icon-only'}`}
            styles={{ body: { padding: 0 } }}
          >
            <AppSider user={user} onNavigate={handleDrawerNavigate} />
          </Drawer>
        )}
      </Layout>
    </TaskProvider>
  );
};

export default MainLayout;
