import React from 'react';
import { Layout } from 'antd';
import { Routes, Route, Navigate } from 'react-router-dom';
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

interface MainLayoutProps {
  user: User;
  onLogout: () => void;
}

const MainLayout: React.FC<MainLayoutProps> = ({ user, onLogout }) => {
  return (
    <TaskProvider>
      <Layout className="main-layout" style={{ height: '100vh' }} hasSider>
        <AppSider user={user} />
        <Layout style={{ flex: 1 }}>
          <AppHeader user={user} onLogout={onLogout} />
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
      </Layout>
    </TaskProvider>
  );
};

export default MainLayout;
