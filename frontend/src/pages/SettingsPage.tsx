import React, { useState, useEffect, useContext } from 'react';
import { 
  Select, 
  Switch, 
  InputNumber, 
  Radio, 
  Button, 
  Upload, 
  message, 
  Modal,
  Spin
} from 'antd';
import {
  BgColorsOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  BellOutlined,
  DatabaseOutlined,
  CheckOutlined,
  ExportOutlined,
  ImportOutlined,
  UploadOutlined
} from '@ant-design/icons';
import { UserSettings, TaskList } from '../types';
import { getSettings, updateSettings } from '../api/settings';
import { getLists } from '../api/list';
import { exportData, importData } from '../api/data';
import { ThemeContext } from '../App';
import './SettingsPage.less';

// 配色方案定义
const THEME_OPTIONS = [
  { key: 'default', name: '默认蓝', color: '#1677ff', isDark: false },
  { key: 'green', name: '翠绿', color: '#52c41a', isDark: false },
  { key: 'purple', name: '薰衣紫', color: '#722ed1', isDark: false },
  { key: 'orange', name: '活力橙', color: '#fa8c16', isDark: false },
  { key: 'rose', name: '玫瑰红', color: '#eb2f96', isDark: false },
  { key: 'minimal', name: '极简灰', color: '#8c8c8c', isDark: false },
  { key: 'dark', name: '暗夜黑', color: '#141414', isDark: true },
  { key: 'midnight', name: '午夜蓝', color: '#001529', isDark: true },
];

// 语言选项
const LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

// 默认视图选项
const VIEW_OPTIONS = [
  { value: 'tasks', label: '任务' },
  { value: 'calendar', label: '日历' },
  { value: 'statistics', label: '统计' },
  { value: 'pomodoro', label: '番茄钟' },
];

// 默认任务视图模式选项
const TASK_VIEW_OPTIONS = [
  { value: 'list', label: '列表视图' },
  { value: 'kanban', label: '看板视图' },
];

// 周起始日选项
const WEEK_START_OPTIONS = [
  { value: 1, label: '周一' },
  { value: 0, label: '周日' },
];

// 日期格式选项
const DATE_FORMAT_OPTIONS = [
  { value: 'MM-DD', label: 'MM-DD' },
  { value: 'DD-MM', label: 'DD-MM' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
];

// 时区选项
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
  { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
  { value: 'Asia/Singapore', label: '新加坡时间 (UTC+8)' },
  { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
  { value: 'America/Los_Angeles', label: '美国西部时间 (UTC-8)' },
  { value: 'Europe/London', label: '英国时间 (UTC+0)' },
  { value: 'Europe/Paris', label: '欧洲中部时间 (UTC+1)' },
];

// 优先级选项
const PRIORITY_OPTIONS = [
  { value: 0, label: '无' },
  { value: 1, label: '高 (红旗)' },
  { value: 2, label: '中 (黄旗)' },
  { value: 3, label: '低 (蓝旗)' },
  { value: 4, label: '灰' },
];

// 导航项
const NAV_ITEMS = [
  { key: 'appearance', icon: BgColorsOutlined, label: '外观设置' },
  { key: 'general', icon: SettingOutlined, label: '通用设置' },
  { key: 'task', icon: SettingOutlined, label: '任务设置' },
  { key: 'pomodoro', icon: ClockCircleOutlined, label: '番茄钟设置' },
  { key: 'notification', icon: BellOutlined, label: '通知设置' },
  { key: 'data', icon: DatabaseOutlined, label: '数据管理' },
];

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState('appearance');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importFileData, setImportFileData] = useState<any>(null);
  const [importLoading, setImportLoading] = useState(false);
  
  const themeContext = useContext(ThemeContext);

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadLists();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
    } catch (e) {
      console.error('Failed to load settings:', e);
      message.error('加载设置失败');
    } finally {
      setLoading(false);
    }
  };

  const loadLists = async () => {
    try {
      const data = await getLists();
      setLists(data.lists || []);
    } catch (e) {
      console.error('Failed to load lists:', e);
    }
  };

  // 更新设置
  const handleUpdateSetting = async (key: keyof UserSettings, value: any) => {
    if (!settings) return;
    
    // 乐观更新
    setSettings({ ...settings, [key]: value });
    
    try {
      await updateSettings({ [key]: value });
      
      // 如果是主题更新，更新全局主题
      if (key === 'theme' && themeContext) {
        const themeOption = THEME_OPTIONS.find(t => t.key === value);
        if (themeOption) {
          themeContext.setTheme(themeOption.color, themeOption.isDark);
        }
      }
    } catch (e) {
      // 回滚
      setSettings(settings);
      message.error('保存失败');
    }
  };

  // 导出数据
  const handleExport = async () => {
    try {
      const response = await exportData();
      const blob = new Blob([JSON.stringify(response.data || response, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ticklist-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      message.success('数据导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  // 导入数据
  const handleImport = async () => {
    if (!importFileData) {
      message.warning('请先选择文件');
      return;
    }
    setImportLoading(true);
    try {
      const result: any = await importData(importFileData);
      const stats = result.data?.stats || result.stats;
      message.success(`导入成功：${stats.tasks} 个任务，${stats.lists} 个清单，${stats.tags} 个标签`);
      setImportModalVisible(false);
      setImportFileData(null);
      window.location.reload();
    } catch (error) {
      message.error('导入失败');
    } finally {
      setImportLoading(false);
    }
  };

  // 滚动到指定区块
  const scrollToSection = (key: string) => {
    setActiveSection(key);
    const element = document.getElementById(`settings-${key}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div className="settings-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="settings-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div>加载设置失败</div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      {/* 左侧导航 */}
      <div className="settings-nav">
        {NAV_ITEMS.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.key}
              className={`nav-item ${activeSection === item.key ? 'active' : ''}`}
              onClick={() => scrollToSection(item.key)}
            >
              <Icon />
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* 右侧内容 */}
      <div className="settings-content">
        {/* 外观设置 */}
        <div id="settings-appearance" className="settings-section">
          <div className="section-title">外观设置</div>
          
          <div style={{ marginBottom: 16, color: '#666', fontSize: 14 }}>配色方案</div>
          <div className="theme-grid">
            {THEME_OPTIONS.map(theme => (
              <div
                key={theme.key}
                className={`theme-card ${settings.theme === theme.key ? 'selected' : ''} ${theme.isDark ? 'dark-theme' : ''}`}
                onClick={() => handleUpdateSetting('theme', theme.key)}
              >
                <div 
                  className="theme-preview" 
                  style={{ background: theme.color }}
                />
                <div className="theme-name">{theme.name}</div>
                {settings.theme === theme.key && (
                  <div className="theme-check">
                    <CheckOutlined />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 通用设置 */}
        <div id="settings-general" className="settings-section">
          <div className="section-title">通用设置</div>
          
          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">语言</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.language}
                onChange={(v) => handleUpdateSetting('language', v)}
                options={LANGUAGE_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">默认视图</span>
              <span className="label-desc">启动应用时默认显示的页面</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.default_view}
                onChange={(v) => handleUpdateSetting('default_view', v)}
                options={VIEW_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">周起始日</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.week_start_day}
                onChange={(v) => handleUpdateSetting('week_start_day', v)}
                options={WEEK_START_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">日期格式</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.date_format}
                onChange={(v) => handleUpdateSetting('date_format', v)}
                options={DATE_FORMAT_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">时间格式</span>
            </div>
            <div className="setting-control">
              <Radio.Group
                value={settings.time_format}
                onChange={(e) => handleUpdateSetting('time_format', e.target.value)}
              >
                <Radio value="24h">24小时制</Radio>
                <Radio value="12h">12小时制</Radio>
              </Radio.Group>
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">时区</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.timezone}
                onChange={(v) => handleUpdateSetting('timezone', v)}
                options={TIMEZONE_OPTIONS}
              />
            </div>
          </div>
        </div>

        {/* 任务设置 */}
        <div id="settings-task" className="settings-section">
          <div className="section-title">任务设置</div>
          
          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">默认任务视图</span>
              <span className="label-desc">进入任务页面时默认使用的视图模式</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.default_task_view}
                onChange={(v) => handleUpdateSetting('default_task_view', v)}
                options={TASK_VIEW_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">默认优先级</span>
              <span className="label-desc">新建任务时的默认优先级</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.default_priority}
                onChange={(v) => handleUpdateSetting('default_priority', v)}
                options={PRIORITY_OPTIONS}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">默认清单</span>
              <span className="label-desc">新建任务时的默认所属清单</span>
            </div>
            <div className="setting-control">
              <Select
                value={settings.default_list_id || undefined}
                onChange={(v) => handleUpdateSetting('default_list_id', v || null)}
                allowClear
                placeholder="收集箱"
                options={lists.filter(l => l.type === 'list').map(l => ({
                  value: l.id,
                  label: l.name
                }))}
              />
            </div>
          </div>
        </div>

        {/* 番茄钟设置 */}
        <div id="settings-pomodoro" className="settings-section">
          <div className="section-title">番茄钟设置</div>
          
          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">专注时长</span>
              <span className="label-desc">每个番茄钟的专注时间（分钟）</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.pomodoro_duration}
                onChange={(v) => handleUpdateSetting('pomodoro_duration', v || 25)}
                min={1}
                max={120}
                addonAfter="分钟"
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">短休息时长</span>
              <span className="label-desc">番茄钟之间的短休息时间（分钟）</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.short_break_duration}
                onChange={(v) => handleUpdateSetting('short_break_duration', v || 5)}
                min={1}
                max={30}
                addonAfter="分钟"
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">长休息时长</span>
              <span className="label-desc">完成一组番茄钟后的休息时间（分钟）</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.long_break_duration}
                onChange={(v) => handleUpdateSetting('long_break_duration', v || 15)}
                min={1}
                max={60}
                addonAfter="分钟"
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">自动开始下一个</span>
              <span className="label-desc">完成后自动开始下一个番茄钟或休息</span>
            </div>
            <div className="setting-control">
              <Switch
                checked={settings.pomodoro_auto_start}
                onChange={(v) => handleUpdateSetting('pomodoro_auto_start', v)}
              />
            </div>
          </div>
        </div>

        {/* 通知设置 */}
        <div id="settings-notification" className="settings-section">
          <div className="section-title">通知设置</div>
          
          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">启用通知</span>
              <span className="label-desc">允许应用发送通知提醒</span>
            </div>
            <div className="setting-control">
              <Switch
                checked={settings.notification_enabled}
                onChange={(v) => handleUpdateSetting('notification_enabled', v)}
              />
            </div>
          </div>

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">提示音</span>
              <span className="label-desc">通知时播放提示音</span>
            </div>
            <div className="setting-control">
              <Switch
                checked={settings.notification_sound}
                onChange={(v) => handleUpdateSetting('notification_sound', v)}
                disabled={!settings.notification_enabled}
              />
            </div>
          </div>
        </div>

        {/* 数据管理 */}
        <div id="settings-data" className="settings-section data-section">
          <div className="section-title">数据管理</div>
          
          <div className="data-actions">
            <div className="data-action-card" onClick={handleExport}>
              <ExportOutlined />
              <span className="action-title">导出数据</span>
              <span className="action-desc">将所有任务、清单、标签导出为 JSON 文件</span>
            </div>
            
            <div className="data-action-card" onClick={() => setImportModalVisible(true)}>
              <ImportOutlined />
              <span className="action-title">导入数据</span>
              <span className="action-desc">从 JSON 文件导入任务、清单、标签</span>
            </div>
          </div>
        </div>
      </div>

      {/* 导入数据 Modal */}
      <Modal
        title="导入数据"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false);
          setImportFileData(null);
        }}
        onOk={handleImport}
        confirmLoading={importLoading}
        okText="导入"
        cancelText="取消"
        className="import-modal"
      >
        <Upload
          accept=".json"
          beforeUpload={(file) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const data = JSON.parse(e.target?.result as string);
                setImportFileData(data);
                message.success(`已选择文件: ${file.name}`);
              } catch {
                message.error('文件格式错误');
              }
            };
            reader.readAsText(file);
            return false;
          }}
          maxCount={1}
          showUploadList={true}
        >
          <Button icon={<UploadOutlined />}>选择 JSON 文件</Button>
        </Upload>
        <p className="import-hint">
          支持从本应用导出的 JSON 格式数据文件
        </p>
      </Modal>
    </div>
  );
};

export default SettingsPage;
