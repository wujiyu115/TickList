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
  Popconfirm,
  Tooltip,
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
  ExperimentOutlined,
  KeyOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { UserSettings, TaskList, PushChannelConfig, BarkConfig, CustomHttpConfig } from '../types';
import { getSettings, updateSettings, testPushChannel } from '../api/settings';
import { getLists } from '../api/list';
import { exportData, importData, importDidaCsv } from '../api/data';
import { getDebugLogs, clearDebugLogs } from '../api/debugLog';
import { setRemoteLogEnabled, isRemoteLogEnabled } from '../services/remoteLog';
import { createPAT, listPATs, deletePAT, PATItem } from '../api/auth';
import { ThemeContext } from '../App';
import { isNativePlatform, getApiBaseUrl } from '../utils/platform';
import { useNavigate } from 'react-router-dom';
import './SettingsPage.less';

// 配色方案定义（浅色 20 种在前、深色 20 种在后，同色系相邻）
const THEME_OPTIONS = [
  // 浅色主题
  { key: 'default', name: '默认蓝', color: '#1677ff', isDark: false },
  { key: 'sky', name: '天空蓝', color: '#69b1ff', isDark: false },
  { key: 'geekblue', name: '极客蓝', color: '#2f54eb', isDark: false },
  { key: 'indigo', name: '靖青', color: '#597ef7', isDark: false },
  { key: 'cyan', name: '青蓝', color: '#13c2c2', isDark: false },
  { key: 'mint', name: '薄荷', color: '#36cfc9', isDark: false },
  { key: 'green', name: '翠绿', color: '#52c41a', isDark: false },
  { key: 'sage', name: '嫩绿', color: '#73d13d', isDark: false },
  { key: 'lime', name: '青柠', color: '#7cb305', isDark: false },
  { key: 'olive', name: '橄榄', color: '#5b8c00', isDark: false },
  { key: 'yellow', name: '明黄', color: '#fadb14', isDark: false },
  { key: 'gold', name: '鎏金', color: '#d48806', isDark: false },
  { key: 'orange', name: '活力橙', color: '#fa8c16', isDark: false },
  { key: 'volcano', name: '火山', color: '#fa541c', isDark: false },
  { key: 'red', name: '朱红', color: '#ff4d4f', isDark: false },
  { key: 'rose', name: '玫瑰红', color: '#eb2f96', isDark: false },
  { key: 'magenta', name: '品红', color: '#c41d7f', isDark: false },
  { key: 'purple', name: '薰衣紫', color: '#722ed1', isDark: false },
  { key: 'lavender', name: '淡紫', color: '#b37feb', isDark: false },
  { key: 'minimal', name: '极简灰', color: '#8c8c8c', isDark: false },
  // 深色主题
  { key: 'dark', name: '暗夜黑', color: '#1677ff', isDark: true },
  { key: 'midnight', name: '午夜蓝', color: '#4096ff', isDark: true },
  { key: 'abyss', name: '深渊蓝', color: '#1d39c4', isDark: true },
  { key: 'steel', name: '钢蓝', color: '#2f54eb', isDark: true },
  { key: 'obsidian', name: '黑曜青', color: '#08979c', isDark: true },
  { key: 'void', name: '虚空青', color: '#13c2c2', isDark: true },
  { key: 'ocean', name: '深海', color: '#006d75', isDark: true },
  { key: 'forest', name: '暗夜林', color: '#389e0d', isDark: true },
  { key: 'emerald', name: '祖母绿', color: '#52c41a', isDark: true },
  { key: 'neon', name: '霓虹绿', color: '#a0d911', isDark: true },
  { key: 'sunset', name: '日落', color: '#faad14', isDark: true },
  { key: 'amber', name: '琥珀', color: '#d48806', isDark: true },
  { key: 'ember', name: '暗夜炽', color: '#ff7a45', isDark: true },
  { key: 'magma', name: '岩浆', color: '#fa541c', isDark: true },
  { key: 'crimson', name: '深红', color: '#cf1322', isDark: true },
  { key: 'plum', name: '梅紫', color: '#c41d7f', isDark: true },
  { key: 'orchid', name: '兰花', color: '#eb2f96', isDark: true },
  { key: 'royal', name: '暗夜紫', color: '#9254de', isDark: true },
  { key: 'nebula', name: '星云紫', color: '#b37feb', isDark: true },
  { key: 'slate', name: '深炭灰', color: '#bfbfbf', isDark: true },
  { key: 'spaceglass', name: '空间玻璃', color: '#3ad6ea', isDark: true },
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
  { key: 'token', icon: KeyOutlined, label: 'API Token' },
  { key: 'data', icon: DatabaseOutlined, label: '数据管理' },
  { key: 'debug', icon: ExperimentOutlined, label: '调试日志' },
];

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('appearance');
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState<TaskList[]>([]);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importFileData, setImportFileData] = useState<any>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileType, setImportFileType] = useState<'json' | 'csv' | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  
  // 推送渠道相关状态
  const [pushChannels, setPushChannels] = useState<PushChannelConfig[]>([]);
  const [channelModalVisible, setChannelModalVisible] = useState(false);
  const [editingChannel, setEditingChannel] = useState<PushChannelConfig | null>(null);
  const [channelForm] = Form.useForm();
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null);

  // 调试日志状态
  const [debugEnabled, setDebugEnabled] = useState(isRemoteLogEnabled());
  const [debugLogs, setDebugLogs] = useState<any[]>([]);
  const [debugLogsLoading, setDebugLogsLoading] = useState(false);

  // PAT 状态
  const [pats, setPats] = useState<PATItem[]>([]);
  const [patModalVisible, setPatModalVisible] = useState(false);
  const [patName, setPatName] = useState('');
  const [newPatToken, setNewPatToken] = useState<string | null>(null);
  const [patLoading, setPatLoading] = useState(false);
  
  
  const themeContext = useContext(ThemeContext);

  // 加载设置
  useEffect(() => {
    loadSettings();
    loadLists();
    loadPats();
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

  const loadPats = async () => {
    try {
      const data = await listPATs();
      setPats(data);
    } catch (e) {
      console.error('Failed to load PATs:', e);
    }
  };

  const handleCreatePat = async () => {
    if (!patName.trim()) {
      message.warning('请输入Token名称');
      return;
    }
    setPatLoading(true);
    try {
      const result = await createPAT(patName.trim());
      setNewPatToken(result.token);
      setPatName('');
      loadPats();
      message.success('Token已生成');
    } catch (e) {
      message.error('生成失败');
    } finally {
      setPatLoading(false);
    }
  };

  const handleDeletePat = async (id: string) => {
    try {
      await deletePAT(id);
      setPats(pats.filter(p => p.id !== id));
      message.success('已撤销');
    } catch (e) {
      message.error('撤销失败');
    }
  };

  const handleCopyToken = () => {
    if (newPatToken) {
      navigator.clipboard.writeText(newPatToken);
      message.success('已复制到剪贴板');
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
          themeContext.setTheme(themeOption.key);
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
    if (!importFileType) {
      message.warning('请先选择文件');
      return;
    }
    
    setImportLoading(true);
    try {
      let result: any;
      
      if (importFileType === 'csv' && importFile) {
        // CSV 导入（滴答清单）
        result = await importDidaCsv(importFile);
        const stats = result.data?.stats || result.stats;
        message.success(
          `滴答清单导入成功：${stats.tasks} 个任务，${stats.lists} 个清单，${stats.folders} 个文件夹，${stats.tags} 个标签`
        );
      } else if (importFileType === 'json' && importFileData) {
        // JSON 导入
        result = await importData(importFileData);
        const stats = result.data?.stats || result.stats;
        message.success(`导入成功：${stats.tasks} 个任务，${stats.lists} 个清单，${stats.tags} 个标签`);
      } else {
        message.warning('请先选择文件');
        return;
      }
      
      setImportModalVisible(false);
      setImportFileData(null);
      setImportFile(null);
      setImportFileType(null);
      window.location.reload();
    } catch (error: any) {
      const errorMsg = error?.response?.data?.detail || error?.message || '导入失败';
      message.error(errorMsg);
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

  // 在编辑/新增 Modal 内测试推送：从表单实时取值，无需先保存
  const MODAL_TEST_KEY = '__modal_test__';
  const handleTestChannelInModal = async () => {
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

      setTestingChannelId(MODAL_TEST_KEY);
      try {
        const result = await testPushChannel(values.type, config as any);
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
    } catch {
      // 表单校验失败，validateFields 已自动高亮错误项
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
        {/* 移动端专属：服务器地址配置入口 */}
        {isNativePlatform() && (
          <div className="settings-section" style={{ marginBottom: 16 }}>
            <div className="section-title">服务器地址</div>
            <Card size="small" style={{ marginTop: 8 }}>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                  当前连接：<Tag color="blue">{getApiBaseUrl() || '未配置'}</Tag>
                </div>
                <Button
                  type="default"
                  onClick={() => navigate('/server-config?mode=edit')}
                >
                  修改服务器地址
                </Button>
                <div style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 12 }}>
                  修改服务器后会自动退出当前登录。
                </div>
              </Space>
            </Card>
          </div>
        )}

        {/* 外观设置 */}
        <div id="settings-appearance" className="settings-section">
          <div className="section-title">外观设置</div>
          
          <div style={{ marginBottom: 12, color: 'var(--ant-color-text-secondary)', fontSize: 14 }}>配色方案</div>

          <div className="theme-group-title">浅色主题</div>
          <div className="theme-grid">
            {THEME_OPTIONS.filter(t => !t.isDark).map(theme => (
              <Tooltip title={theme.name} key={theme.key}>
                <div
                  className={`theme-card ${settings.theme === theme.key ? 'selected' : ''}`}
                  onClick={() => handleUpdateSetting('theme', theme.key)}
                  aria-label={theme.name}
                  role="button"
                >
                  <div className="theme-preview" style={{ background: theme.color }} />
                </div>
              </Tooltip>
            ))}
          </div>

          <div className="theme-group-title">深色主题</div>
          <div className="theme-grid">
            {THEME_OPTIONS.filter(t => t.isDark).map(theme => (
              <Tooltip title={theme.name} key={theme.key}>
                <div
                  className={`theme-card dark-theme ${settings.theme === theme.key ? 'selected' : ''}`}
                  onClick={() => handleUpdateSetting('theme', theme.key)}
                  aria-label={theme.name}
                  role="button"
                >
                  <div className="theme-preview" style={{ background: theme.color }} />
                </div>
              </Tooltip>
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

          <div className="setting-item">
            <div className="setting-label">
              <span className="label-text">最短专注时长</span>
              <span className="label-desc">专注不足此时长将不会保存记录</span>
            </div>
            <div className="setting-control">
              <InputNumber
                value={settings.focus_min_duration}
                onChange={(v) => handleUpdateSetting('focus_min_duration', v || 5)}
                min={1}
                max={60}
                addonAfter="分钟"
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

        {/* API Token */}
        <div id="settings-token" className="settings-section">
          <div className="section-title">API Token</div>
          <div style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--ant-color-text-secondary)' }}>
              生成长期有效的API Token，供外部工具（如Claude Code、Cursor）访问你的数据
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Input
              placeholder="Token名称（如 Claude Code）"
              value={patName}
              onChange={(e) => setPatName(e.target.value)}
              onPressEnter={handleCreatePat}
              style={{ maxWidth: 240 }}
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={patLoading}
              onClick={handleCreatePat}
            >
              生成
            </Button>
          </div>

          {newPatToken && (
            <Card size="small" style={{ marginBottom: 16, background: 'var(--ant-color-warning-bg)' }}>
              <div style={{ marginBottom: 8, fontWeight: 500, color: 'var(--ant-color-warning)' }}>
                Token仅显示一次，请立即复制保存
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input.TextArea
                  value={newPatToken}
                  readOnly
                  autoSize={{ minRows: 1, maxRows: 2 }}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
                <Button icon={<CopyOutlined />} onClick={handleCopyToken}>
                  复制
                </Button>
              </div>
              <Button
                type="link"
                size="small"
                style={{ marginTop: 8, padding: 0 }}
                onClick={() => setNewPatToken(null)}
              >
                我已保存，关闭提示
              </Button>
            </Card>
          )}

          {pats.length === 0 ? (
            <Card style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ color: 'var(--ant-color-text-tertiary)' }}>暂无API Token</div>
            </Card>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              {pats.map(pat => (
                <Card key={pat.id} size="small" style={{ borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{pat.name}</span>
                      <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--ant-color-text-tertiary)', fontFamily: 'monospace' }}>
                        {pat.token_preview}
                      </span>
                      <div style={{ fontSize: 12, color: 'var(--ant-color-text-tertiary)', marginTop: 4 }}>
                        创建于 {pat.created_at?.slice(0, 10)}
                        {pat.last_used_at && ` · 上次使用 ${pat.last_used_at.slice(0, 10)}`}
                      </div>
                    </div>
                    <Popconfirm
                      title="确定撤销该Token吗？撤销后不可恢复"
                      onConfirm={() => handleDeletePat(pat.id)}
                      okText="撤销"
                      cancelText="取消"
                    >
                      <Button type="text" size="small" danger icon={<DeleteOutlined />}>
                        撤销
                      </Button>
                    </Popconfirm>
                  </div>
                </Card>
              ))}
            </Space>
          )}
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
              <span className="action-desc">支持 JSON 或滴答清单 CSV 备份文件</span>
            </div>
          </div>
        </div>

        {/* 调试日志 */}
        <div id="settings-debug" className="settings-section">
          <div className="section-title">调试日志</div>

          <div className="setting-item">
            <div className="setting-label">
              <span>远程调试日志</span>
              <span className="setting-desc">开启后前端关键操作信息将发送到服务器</span>
            </div>
            <Switch
              checked={debugEnabled}
              onChange={(checked) => {
                setDebugEnabled(checked);
                setRemoteLogEnabled(checked);
              }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <Space>
              <Button
                onClick={async () => {
                  setDebugLogsLoading(true);
                  try {
                    const data = await getDebugLogs();
                    setDebugLogs(data.logs || []);
                  } catch {
                    message.error('获取日志失败');
                  } finally {
                    setDebugLogsLoading(false);
                  }
                }}
                loading={debugLogsLoading}
              >
                刷新日志
              </Button>
              <Button
                danger
                onClick={async () => {
                  await clearDebugLogs();
                  setDebugLogs([]);
                  message.success('日志已清除');
                }}
              >
                清除日志
              </Button>
            </Space>
          </div>

          <div style={{ marginTop: 12, maxHeight: 400, overflow: 'auto' }}>
            {debugLogs.length === 0 ? (
              <div style={{ color: 'var(--ant-color-text-tertiary)', padding: '16px 0' }}>
                暂无日志{!debugEnabled && '（请先开启远程调试日志）'}
              </div>
            ) : (
              <div style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {debugLogs.slice().reverse().map((log, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '6px 8px',
                      borderBottom: '1px solid var(--ant-color-border-secondary)',
                    }}
                  >
                    <div style={{ color: 'var(--ant-color-text-secondary)' }}>
                      <Tag color="blue" style={{ fontSize: 11 }}>{log.tag}</Tag>
                      {log.timestamp}
                    </div>
                    <pre style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
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
          setImportFile(null);
          setImportFileType(null);
        }}
        onOk={handleImport}
        confirmLoading={importLoading}
        okText="导入"
        cancelText="取消"
        className="import-modal"
      >
        <Upload
          accept=".json,.csv"
          beforeUpload={(file) => {
            const ext = file.name.toLowerCase().split('.').pop();
            
            if (ext === 'csv') {
              // CSV 文件（滴答清单备份）
              setImportFile(file);
              setImportFileType('csv');
              setImportFileData(null);
              message.success(`已选择滴答清单备份: ${file.name}`);
            } else if (ext === 'json') {
              // JSON 文件（TickList 导出）
              const reader = new FileReader();
              reader.onload = (e) => {
                try {
                  const data = JSON.parse(e.target?.result as string);
                  setImportFileData(data);
                  setImportFileType('json');
                  setImportFile(null);
                  message.success(`已选择文件: ${file.name}`);
                } catch {
                  message.error('JSON 文件格式错误');
                }
              };
              reader.readAsText(file);
            } else {
              message.error('不支持的文件格式');
            }
            return false;
          }}
          maxCount={1}
          showUploadList={true}
        >
          <Button icon={<UploadOutlined />}>选择文件</Button>
        </Upload>
        <div className="import-hint">
          <p style={{ marginBottom: 8 }}>支持的文件格式：</p>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ant-color-text-secondary)' }}>
            <li><strong>JSON</strong> - 本应用导出的数据文件</li>
            <li><strong>CSV</strong> - 滴答清单（TickTick/Dida）备份文件</li>
          </ul>
        </div>
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
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <Button
              loading={testingChannelId === MODAL_TEST_KEY}
              onClick={handleTestChannelInModal}
            >
              测试推送
            </Button>
            <CancelBtn />
            <OkBtn />
          </>
        )}
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
