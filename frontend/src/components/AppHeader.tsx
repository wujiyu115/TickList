import React from 'react';
import { Layout, Avatar, Dropdown, Space } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { User } from '../types';

const { Header } = Layout;

interface AppHeaderProps {
  user: User;
  onLogout: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ user, onLogout }) => {
  const items: MenuProps['items'] = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: onLogout,
    },
  ];

  return (
    <Header style={{ 
      background: 'var(--ant-color-bg-container)', 
      padding: '0 24px', 
      display: 'flex', 
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid var(--ant-color-border)'
    }}>
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
