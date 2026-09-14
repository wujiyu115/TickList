import React, { useRef, useState } from 'react';
import { Button } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { updateSettings } from '../api/settings';
import { message } from '../utils/antdApp';

interface ThemeToggleProps {
  isDark: boolean;
  onThemeChange: (themeKey: string) => void;
  persist?: boolean;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDark, onThemeChange, persist = false }) => {
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const label = isDark ? '切换到浅色主题' : '切换到深色主题';

  const handleToggle = async () => {
    if (saving.current) return;
    const nextTheme = isDark ? 'default' : 'dark';

    if (!persist) {
      onThemeChange(nextTheme);
      return;
    }

    // 同步锁避免连续点击在 loading 渲染前重复提交；保存成功后才应用主题。
    saving.current = true;
    setPending(true);
    try {
      await updateSettings({ theme: nextTheme });
      onThemeChange(nextTheme);
    } catch {
      message.error('保存失败');
    } finally {
      saving.current = false;
      setPending(false);
    }
  };

  return (
    <Button
      type="text"
      htmlType="button"
      icon={isDark ? <SunOutlined aria-hidden /> : <MoonOutlined aria-hidden />}
      aria-label={label}
      title={label}
      aria-busy={pending}
      loading={pending}
      disabled={pending}
      onClick={handleToggle}
      style={{ fontSize: 18, width: 40, height: 40 }}
    />
  );
};

export default ThemeToggle;
