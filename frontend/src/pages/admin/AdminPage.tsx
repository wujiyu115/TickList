import React, { useState } from 'react';
import { TeamOutlined } from '@ant-design/icons';
import { User } from '../../types';
import UserManagement from './UserManagement';
import './AdminPage.less';

const ADMIN_NAV_ITEMS = [
  { key: 'users', icon: TeamOutlined, label: '用户管理' },
  // 未来扩展：{ key: 'system', icon: SettingOutlined, label: '系统配置' },
];

interface AdminPageProps {
  user: User;
}

const AdminPage: React.FC<AdminPageProps> = ({ user }) => {
  const [activeKey, setActiveKey] = useState('users');

  const renderContent = () => {
    switch (activeKey) {
      case 'users':
        return <UserManagement currentUser={user} />;
      // 未来扩展：
      // case 'system':
      //   return <SystemConfig />;
      default:
        return null;
    }
  };

  return (
    <div className="admin-page">
      {/* 左侧导航 */}
      <div className="admin-nav">
        <div className="nav-title">管理后台</div>
        {ADMIN_NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`nav-item ${activeKey === item.key ? 'active' : ''}`}
              onClick={() => setActiveKey(item.key)}
            >
              <Icon />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* 右侧内容 */}
      <div className="admin-content">
        {renderContent()}
      </div>
    </div>
  );
};

export default AdminPage;
