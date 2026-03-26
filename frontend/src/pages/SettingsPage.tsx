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
  Spin,
  Card,
  Input,
  Form,
  Tag,
  Space,
  Popconfirm
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
  UploadOutlined,
  SendOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined
} from '@ant-design/icons';
import { UserSettings, TaskList, PushChannelConfig, BarkConfig, CustomHttpConfig } from '../types';
import { getSettings, updateSettings, testPushChannel } from '../api/settings';
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
  { key: 'push', icon: SendOutlined, label: '推送通知' },
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
  
  // 推送渠道相关状态
  const [pushChannels, setPushChannels] = useState<PushChannelConfig[]>([]);
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<PushChannelConfig | null>(null);
  const [channelForm] = Form.useForm();
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);
  
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
      // 解析推送渠道配置
      try {
        const channels = JSON.parse(data.push_channels || '[]');
        setPushChannels(channels);
      } catch {
        setPushChannels([]);
      }
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

  // 保存推送渠道配置
  const savePushChannels = async (channels: PushChannelConfig[]) => {
    try {
      await updateSettings({ push_channels: JSON.stringify(channels) });
      setPushChannels(channels);
    } catch (e) {
      message.error('保存推送渠道失败');
      throw e;
    }
  };

  // 打开添加渠道弹窗
  const handleAddChannel = () => {
    setEditingChannel(null);
    channelForm.resetFields();
    channelForm.setFieldsValue({
      type: 'bark',
      name: '',
      enabled: true,
      // Bark 默认值
      server_url: 'https://api.day.app',
      sound: 'alarm',
      group: 'ticklist',
      // 自定义 HTTP 默认值
      method: 'POST',
      headers: '{"Content-Type": "application/json"}',
      body_template: '{"title": "{{title}}", "content": "{{content}}"}'
    });
    setChannelModalVisible(true);
  };

  // 打开编辑渠道弹窗
  const handleEditChannel = (channel: PushChannelConfig) => {
    setEditingChannel(channel);
    const config = channel.config;
    if (channel.type === 'bark') {
      const barkConfig = config as BarkConfig;
      channelForm.setFieldsValue({
        type: channel.type,
        name: channel.name,
        enabled: channel.enabled,
        device_key: barkConfig.device_key,
        server_url: barkConfig.server_url,
        sound: barkConfig.sound,
        group: barkConfig.group,
      });
    } else {
      const httpConfig = config as CustomHttpConfig;
      channelForm.setFieldsValue({
        type: channel.type,
        name: channel.name,
        enabled: channel.enabled,
        url: httpConfig.url,
        method: httpConfig.method,
        headers: JSON.stringify(httpConfig.headers, null, 2),
        body_template: httpConfig.body_template,
      });
    }
    setChannelModalVisible(true);
  };

  // 删除渠道
  const handleDeleteChannel = async (channelId: string) => {
    const newChannels = pushChannels.filter(c => c.id !== channelId);
    await savePushChannels(newChannels);
    message.success('渠道已删除');
  };

  // 切换渠道启用状态
  const handleToggleChannel = async (channelId: string, enabled: boolean) => {
    const newChannels = pushChannels.map(c => 
      c.id === channelId ? { ...c, enabled } : c
    );
    await savePushChannels(newChannels);
  };

  // 提交渠道表单
  const handleChannelSubmit = async () => {
    try {
      const values = await channelForm.validateFields();
      
      let config: BarkConfig | CustomHttpConfig;
      if (values.type === 'bark') {
        config = {
          device_key: values.device_key,
          server_url: values.server_url,
          sound: values.sound,
          group: values.group,
        };
      } else {
        let headers: Record<string, string> = {};
        try {
          headers = JSON.parse(values.headers || '{}');
        } catch {
          message.error('请求头 JSON 格式错误');
          return;
        }
        config = {
          url: values.url,
          method: values.method,
          headers,
          body_template: values.body_template,
        };
      }

      const channelData: PushChannelConfig = {
        id: editingChannel?.id || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: values.type,
        name: values.name,
        enabled: values.enabled ?? true,
        config,
      };

      let newChannels: PushChannelConfig[];
      if (editingChannel) {
        newChannels = pushChannels.map(c => c.id === editingChannel.id ? channelData : c);
      } else {
        newChannels = [...pushChannels, channelData];
      }

      await savePushChannels(newChannels);
      setChannelModalVisible(false);
      message.success(editingChannel ? '渠道已更新' : '渠道已添加');
    } catch (error) {
      console.error('Failed to submit channel:', error);
    }
  };

  // 测试推送渠道
  const handleTestChannel = async (channel: PushChannelConfig) => {
    setTestingChannelId(channel.id);
    try {
      const result = await testPushChannel(channel.type, channel.config as any);
      if (result.success) {
        message.success('测试推送成功');
      } else {
        message.error(`测试失败: ${result.message}`);
      }
    } catch (e: any) {
      message.error(`测试失败: ${e.message || '未知错误'}`);
    } finally {
      setTestingChannelId(null);
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

        {/* 推送通知设置 */}
        <div id="settings-push" className="settings-section">
          <div className="section-title">推送通知</div>
          
          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">全局推送开关</span>
              <span className="label-desc">启用后，任务和倒数日的推送通知才会生效</span>
            </div>
            <div className="setting-control">
              <Switch
                checked={settings.push_enabled}
                onChange={(v) => handleUpdateSetting('push_enabled', v)}
              />
            </div>
          </div>

          <div className="setting-item" style={{ opacity: settings.push_enabled ? 1 : 0.5, pointerEvents: settings.push_enabled ? 'auto' : 'none' }}>
            <div className="setting-label">
              <span className="label-text">推送检查间隔</span>
              <span className="label-desc">系统检查到期任务的时间间隔</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.push_interval}
                onChange={(v) => handleUpdateSetting('push_interval', v || 30)}
                min={1}
                max={1440}
                addonAfter="分钟"
              />
            </div>
          </div>

          <div className="setting-item" style={{ opacity: settings.push_enabled ? 1 : 0.5, pointerEvents: settings.push_enabled ? 'auto' : 'none' }}>
            <div className="setting-label">
              <span className="label-text">每次合并条数</span>
              <span className="label-desc">单次推送最多合并的消息条数</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.push_batch_size}
                onChange={(v) => handleUpdateSetting('push_batch_size', v || 5)}
                min={1}
                max={50}
                addonAfter="条"
              />
            </div>
          </div>

          <div style={{ marginTop: 24, opacity: settings.push_enabled ? 1 : 0.5, pointerEvents: settings.push_enabled ? 'auto' : 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 14, color: 'var(--ant-color-text-secondary)' }}>推送渠道</span>
              <Button type="primary" icon={<PlusOutlined />} size="small" onClick={handleAddChannel}>
                添加渠道
              </Button>
            </div>

            {pushChannels.length === 0 ? (
              <Card style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ color: 'var(--ant-color-text-tertiary)' }}>暂无推送渠道，点击上方按钮添加</div>
              </Card>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {pushChannels.map(channel => (
                  <Card key={channel.id} size="small" style={{ borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Switch
                          size="small"
                          checked={channel.enabled}
                          onChange={(checked) => handleToggleChannel(channel.id, checked)}
                        />
                        <span style={{ fontWeight: 500 }}>{channel.name}</span>
                        <Tag color={channel.type === 'bark' ? 'green' : 'blue'}>
                          {channel.type === 'bark' ? 'Bark' : '自定义HTTP'}
                        </Tag>
                      </div>
                      <Space>
                        <Button
                          type="text"
                          size="small"
                          icon={<ExperimentOutlined />}
                          loading={testingChannelId === channel.id}
                          onClick={() => handleTestChannel(channel)}
                        >
                          测试
                        </Button>
                        <Button
                          type="text"
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => handleEditChannel(channel)}
                        >
                          编辑
                        </Button>
                        <Popconfirm
                          title="确定删除该渠道吗？"
                          onConfirm={() => handleDeleteChannel(channel.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                            删除
                          </Button>
                        </Popconfirm>
                      </Space>
                    </div>
                  </Card>
                ))}
              </Space>
            )}
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

      {/* 渠道编辑 Modal */}
      <Modal
        title={editingChannel ? '编辑推送渠道' : '添加推送渠道'}
        open={channelModalVisible}
        onCancel={() => setChannelModalVisible(false)}
        onOk={handleChannelSubmit}
        okText={editingChannel ? '保存' : '添加'}
        cancelText="取消"
        destroyOnClose
        width={520}
      >
        <Form form={channelForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="type"
            label="渠道类型"
            rules={[{ required: true, message: '请选择渠道类型' }]}
          >
            <Select disabled={!!editingChannel}>
              <Select.Option value="bark">Bark</Select.Option>
              <Select.Option value="custom_http">自定义 HTTP</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="name"
            label="渠道名称"
            rules={[{ required: true, message: '请输入渠道名称' }]}
          >
            <Input placeholder="例如：我的 iPhone" maxLength={50} />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) => {
              const type = getFieldValue('type');
              if (type === 'bark') {
                return (
                  <>
                    <Form.Item
                      name="device_key"
                      label="Device Key"
                      rules={[{ required: true, message: '请输入 Device Key' }]}
                      extra="从 Bark App 中复制"
                    >
                      <Input placeholder="请输入 Bark Device Key" />
                    </Form.Item>
                    <Form.Item
                      name="server_url"
                      label="服务器地址"
                      rules={[{ required: true, message: '请输入服务器地址' }]}
                    >
                      <Input placeholder="https://api.day.app" />
                    </Form.Item>
                    <Form.Item name="sound" label="提示音">
                      <Select>
                        <Select.Option value="alarm">alarm（默认）</Select.Option>
                        <Select.Option value="anticipate">anticipate</Select.Option>
                        <Select.Option value="bell">bell</Select.Option>
                        <Select.Option value="birdsong">birdsong</Select.Option>
                        <Select.Option value="bloom">bloom</Select.Option>
                        <Select.Option value="calypso">calypso</Select.Option>
                        <Select.Option value="chime">chime</Select.Option>
                        <Select.Option value="choo">choo</Select.Option>
                        <Select.Option value="descent">descent</Select.Option>
                        <Select.Option value="electronic">electronic</Select.Option>
                        <Select.Option value="fanfare">fanfare</Select.Option>
                        <Select.Option value="glass">glass</Select.Option>
                        <Select.Option value="gotosleep">gotosleep</Select.Option>
                        <Select.Option value="healthnotification">healthnotification</Select.Option>
                        <Select.Option value="horn">horn</Select.Option>
                        <Select.Option value="ladder">ladder</Select.Option>
                        <Select.Option value="mailsent">mailsent</Select.Option>
                        <Select.Option value="minuet">minuet</Select.Option>
                        <Select.Option value="multiwayinvitation">multiwayinvitation</Select.Option>
                        <Select.Option value="newmail">newmail</Select.Option>
                        <Select.Option value="newsflash">newsflash</Select.Option>
                        <Select.Option value="noir">noir</Select.Option>
                        <Select.Option value="paymentsuccess">paymentsuccess</Select.Option>
                        <Select.Option value="shake">shake</Select.Option>
                        <Select.Option value="sherwoodforest">sherwoodforest</Select.Option>
                        <Select.Option value="silence">silence（静音）</Select.Option>
                        <Select.Option value="spell">spell</Select.Option>
                        <Select.Option value="suspense">suspense</Select.Option>
                        <Select.Option value="telegraph">telegraph</Select.Option>
                        <Select.Option value="tiptoes">tiptoes</Select.Option>
                        <Select.Option value="typewriters">typewriters</Select.Option>
                        <Select.Option value="update">update</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="group" label="分组名称">
                      <Input placeholder="ticklist" />
                    </Form.Item>
                  </>
                );
              } else if (type === 'custom_http') {
                return (
                  <>
                    <Form.Item
                      name="url"
                      label="请求 URL"
                      rules={[{ required: true, message: '请输入请求 URL' }]}
                    >
                      <Input placeholder="https://example.com/webhook" />
                    </Form.Item>
                    <Form.Item name="method" label="请求方法">
                      <Select>
                        <Select.Option value="GET">GET</Select.Option>
                        <Select.Option value="POST">POST</Select.Option>
                        <Select.Option value="PUT">PUT</Select.Option>
                      </Select>
                    </Form.Item>
                    <Form.Item
                      name="headers"
                      label="请求头"
                      extra="JSON 格式"
                    >
                      <Input.TextArea
                        rows={3}
                        placeholder='{"Content-Type": "application/json"}'
                      />
                    </Form.Item>
                    <Form.Item
                      name="body_template"
                      label="Body 模板"
                      extra="支持 {{title}} 和 {{content}} 占位符"
                    >
                      <Input.TextArea
                        rows={4}
                        placeholder='{"title": "{{title}}", "content": "{{content}}"}'
                      />
                    </Form.Item>
                  </>
                );
              }
              return null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
