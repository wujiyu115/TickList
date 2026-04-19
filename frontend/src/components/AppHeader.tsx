import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Space, Button, message } from 'antd';
import { UserOutlined, LogoutOutlined, LockOutlined, KeyOutlined, CrownOutlined, MenuOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { User } from '../types';

const { Header } = Layout;

interface AppHeaderProps {
  user: User;
  onLogout: () => void;
  onMenuClick?: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ user, onLogout, onMenuClick }) => {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      message.info('当前浏览器不支持全屏，请尝试"添加到主屏幕"实现全屏体验');
    }
  }, []);

  const items: MenuProps['items'] = [
    {
      key: 'change-password',
      icon: <LockOutlined />,
      label: '修改密码',
      onClick: () => navigate('/change-password'),
    },
    {
      key: 'passkey',
      icon: <KeyOutlined />,
      label: 'Passkey 管理',
      onClick: () => navigate('/passkey'),
    },
    ...(user.role_group === 'admin'
      ? [
          {
            key: 'admin',
            icon: <CrownOutlined />,
            label: '管理后台',
            onClick: () => navigate('/admin'),
          },
        ]
      : []),
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout,
    },
  ];

  return (
    <Header className="app-header" style={{ 
      background: 'var(--ant-color-bg-container)', 
      padding: '0 24px', 
      display: 'flex', 
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--ant-color-border)'
    }}>
      <Button
        type="text"
        icon={<MenuOutlined />}
        onClick={onMenuClick}
        className="mobile-menu-btn"
        style={{ fontSize: 18, width: 40, height: 40 }}
      />
      <Space style={{ marginLeft: 'auto', alignItems: 'center' }}>
        <Button
          type="text"
          icon={isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          onClick={toggleFullscreen}
          style={{ fontSize: 18, width: 40, height: 40 }}
          title={isFullscreen ? '退出全屏' : '全屏'}
        />
        <Dropdown menu={{ items }} placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar icon={<UserOutlined />} />
            <span>{user.username}</span>
          </Space>
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppHeader;
