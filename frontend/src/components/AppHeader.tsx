import React from 'react';
import { Layout, Avatar, Dropdown, Space, Button } from 'antd';
import { UserOutlined, LogoutOutlined, LockOutlined, CrownOutlined, MenuOutlined } from '@ant-design/icons';
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

  const items: MenuProps['items'] = [
    {
      key: 'change-password',
      icon: <LockOutlined />,
      label: '修改密码',
      onClick: () => navigate('/change-password'),
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
      <Dropdown menu={{ items }} placement="bottomRight">
        <Space style={{ cursor: 'pointer', marginLeft: 'auto' }}>
          <Avatar icon={<UserOutlined />} />
          <span>{user.username}</span>
        </Space>
      </Dropdown>
    </Header>
  );
};

export default AppHeader;
