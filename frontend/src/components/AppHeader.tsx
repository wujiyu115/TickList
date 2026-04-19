import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Space, Button, message, Modal } from 'antd';
import { UserOutlined, LogoutOutlined, LockOutlined, KeyOutlined, CrownOutlined, MenuOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { User } from '../types';

const { Header } = Layout;

// 检测是否为 iOS 设备
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);

// 检测是否已在 PWA standalone 模式下运行
const isStandalone = () =>
  (window.navigator as any).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches;

interface AppHeaderProps {
  user: User;
  onLogout: () => void;
  onMenuClick?: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({ user, onLogout, onMenuClick }) => {
  const navigate = useNavigate();
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    // 检测 PWA standalone 模式
    if (isStandalone()) {
      setIsFullscreen(true);
      return;
    }
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    // 已在 PWA standalone 模式下，无需操作
    if (isStandalone()) {
      message.info('当前已处于全屏模式');
      return;
    }

    // iOS 不支持 Fullscreen API，引导用户添加到主屏幕
    if (isIOS()) {
      Modal.info({
        title: '在 iOS 上实现全屏',
        content: (
          <div>
            <p>iOS Safari 不支持网页全屏，但你可以通过以下步骤获得全屏体验：</p>
            <ol style={{ paddingLeft: 20 }}>
              <li>点击 Safari 底部的 <strong>分享按钮</strong>（方框+箭头图标）</li>
              <li>向下滑动，选择 <strong>"添加到主屏幕"</strong></li>
              <li>点击 <strong>"添加"</strong></li>
              <li>从主屏幕打开 TickList，即可全屏使用</li>
            </ol>
          </div>
        ),
        okText: '知道了',
      });
      return;
    }

    // 其他浏览器使用标准 Fullscreen API
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
