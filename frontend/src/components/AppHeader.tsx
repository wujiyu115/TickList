import React, { useState, useCallback, useEffect } from 'react';
import { Layout, Avatar, Dropdown, Space, Button, Input } from 'antd';
import { message, modalApi } from '../utils/antdApp';
import { UserOutlined, LogoutOutlined, LockOutlined, KeyOutlined, CrownOutlined, MenuOutlined, FullscreenOutlined, FullscreenExitOutlined, RobotOutlined, StarOutlined, StarFilled, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import type { MenuProps } from 'antd';
import { User } from '../types';
import { useAiContext } from '../contexts/AiContext';
import { getBookmarks, addBookmark, removeBookmark, isBookmarked, getCurrentPath, Bookmark } from '../utils/bookmarks';

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
  const location = useLocation();
  const { openPanel, panelVisible, closePanel } = useAiContext();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);

  // 当路由变化时更新收藏状态
  useEffect(() => {
    const currentPath = getCurrentPath();
    setBookmarked(isBookmarked(currentPath));
    setBookmarks(getBookmarks());
  }, [location]);

  const handleToggleBookmark = () => {
    const currentPath = getCurrentPath();
    if (bookmarked) {
      removeBookmark(currentPath);
      setBookmarked(false);
      setBookmarks(getBookmarks());
      message.success('已取消收藏');
    } else {
      // 从路径中提取有意义的部分作为默认标题
      const pathOnly = currentPath.split('?')[0].replace(/^\//, '');
      const defaultTitle = pathOnly || 'Home';
      modalApi.confirm({
        title: '收藏当前页面',
        content: (
          <Input
            id="bookmark-title-input"
            defaultValue={defaultTitle}
            placeholder="输入收藏标题"
            style={{ marginTop: 8 }}
          />
        ),
        okText: '收藏',
        cancelText: '取消',
        onOk: () => {
          const inputEl = document.getElementById('bookmark-title-input') as HTMLInputElement;
          const title = inputEl?.value?.trim() || defaultTitle;
          addBookmark(currentPath, title);
          setBookmarked(true);
          setBookmarks(getBookmarks());
          message.success('已收藏');
        },
      });
    }
  };

  const handleDeleteBookmark = (event: React.MouseEvent, url: string) => {
    event.stopPropagation();
    event.preventDefault();
    removeBookmark(url);
    setBookmarks(getBookmarks());
    const currentPath = getCurrentPath();
    setBookmarked(isBookmarked(currentPath));
  };

  const bookmarkMenuItems: MenuProps['items'] = [
    {
      key: 'toggle',
      icon: bookmarked ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />,
      label: bookmarked ? '取消收藏' : '收藏当前页面',
      onClick: handleToggleBookmark,
    },
    ...(bookmarks.length > 0
      ? [
          { type: 'divider' as const },
          ...bookmarks.map((item) => ({
            key: item.url,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 180, maxWidth: 260 }}>
                <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--ant-color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.url}</div>
                </div>
                <DeleteOutlined
                  style={{ marginLeft: 8, color: '#ff4d4f', fontSize: 12, flexShrink: 0 }}
                  onClick={(e) => handleDeleteBookmark(e, item.url)}
                />
              </div>
            ),
            onClick: () => navigate(item.url),
          })),
        ]
      : []),
  ];

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
      modalApi.info({
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
        <Dropdown menu={{ items: bookmarkMenuItems }} placement="bottomRight" trigger={['click']}>
          <Button
            type="text"
            icon={bookmarked ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
            style={{ fontSize: 18, width: 40, height: 40 }}
            title="收藏"
          />
        </Dropdown>
        <Button
          type={panelVisible ? 'primary' : 'text'}
          icon={<RobotOutlined />}
          onClick={panelVisible ? closePanel : openPanel}
          style={{ fontSize: 18, width: 40, height: 40 }}
          title="AI 助手"
        />
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
