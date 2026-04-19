import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Layout, Drawer, Spin } from 'antd';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import AppSider from '../components/AppSider';
import TaskPage from '../pages/TaskPage';

const StatisticsPage = lazy(() => import('../pages/StatisticsPage'));
const CalendarPage = lazy(() => import('../pages/CalendarPage'));
const PomodoroPage = lazy(() => import('../pages/PomodoroPage'));
const CountdownPage = lazy(() => import('../pages/CountdownPage'));
const CounterPage = lazy(() => import('../pages/CounterPage'));
const CounterDetailPage = lazy(() => import('../pages/CounterDetailPage'));
const NotePage = lazy(() => import('../pages/NotePage'));
const SummaryPage = lazy(() => import('../pages/SummaryPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const AdminPage = lazy(() => import('../pages/admin/AdminPage'));
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
  const isNotePage = location.pathname === '/notes';
  const showSiderPanel = isTaskPage || isNotePage;
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
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>}>
            <Routes>
              <Route path="/" element={<TaskPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/countdown" element={<CountdownPage />} />
              <Route path="/counter" element={<CounterPage />} />
              <Route path="/counter/:id" element={<CounterDetailPage />} />
              <Route path="/notes" element={<NotePage />} />
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
            </Suspense>
          </Content>
        </Layout>

        {/* 移动端侧边栏 Drawer */}
        {isMobile && (
          <Drawer
            placement="left"
            width={showSiderPanel ? 280 : 'fit-content'}
            open={drawerVisible}
            onClose={() => setDrawerVisible(false)}
            className={`mobile-sider-drawer${showSiderPanel ? '' : ' icon-only'}`}
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
