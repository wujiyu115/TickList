import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Input, Button, Space, Typography, Alert } from 'antd';
import { message } from '../utils/antdApp';
import { CheckCircleOutlined, CloseCircleOutlined, ApiOutlined } from '@ant-design/icons';
import {
  getApiBaseUrl,
  setApiBaseUrl,
  clearApiBaseUrl,
  testApiHealth,
  isNativePlatform,
  normalizeApiUrl,
} from '../utils/platform';

const { Title, Paragraph, Text } = Typography;

type TestResult = 'ok' | 'fail' | null;

/**
 * 移动端服务器地址配置页。
 *
 * - 首次启动：用户必须填写 HTTPS/HTTP 服务器绝对地址才能进入登录页
 * - /server-config?mode=edit：设置页跳转而来的修改模式，保存后清除 token 要求重新登录
 * - Web 端访问该路由：直接重定向回 /
 */
const ServerConfigPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const isEditMode = queryParams.get('mode') === 'edit';
  const missingReason = queryParams.get('reason') === 'missing';

  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);

  // Web 端不需要配置页
  useEffect(() => {
    if (!isNativePlatform()) {
      navigate('/', { replace: true });
      return;
    }
    // 预填当前值
    const current = getApiBaseUrl();
    if (current) setUrl(current);
  }, [navigate]);

  const handleTest = async () => {
    const normalized = normalizeApiUrl(url);
    if (!normalized) {
      message.warning('请输入服务器地址');
      return;
    }
    if (!/^https?:\/\//i.test(normalized)) {
      message.warning('请输入包含 http:// 或 https:// 的完整地址');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await testApiHealth(normalized);
      setTestResult(ok ? 'ok' : 'fail');
      if (ok) {
        message.success('连接成功');
      } else {
        message.error('连接失败，请检查地址与网络');
      }
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    const normalized = normalizeApiUrl(url);
    if (!normalized) {
      message.warning('请输入服务器地址');
      return;
    }
    if (!/^https?:\/\//i.test(normalized)) {
      message.warning('请输入包含 http:// 或 https:// 的完整地址');
      return;
    }
    setSaving(true);
    try {
      // 先强制验证一次连通性，避免保存后陷入登录失败循环
      const ok = await testApiHealth(normalized);
      if (!ok) {
        message.error('无法连接到该服务器，请先测试并确认地址可用');
        setTestResult('fail');
        return;
      }
      setApiBaseUrl(normalized);
      // 修改模式：等同切换账号体系，清 token 重登
      if (isEditMode) {
        localStorage.removeItem('token');
        message.success('服务器已更新，请重新登录');
      } else {
        message.success('服务器配置成功');
      }
      navigate('/login', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = () => {
    clearApiBaseUrl();
    setUrl('');
    setTestResult(null);
    message.info('已清除服务器地址');
  };

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        background: 'var(--ant-color-bg-layout)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 480 }} bordered>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <ApiOutlined style={{ fontSize: 36, color: 'var(--ant-color-primary)' }} />
            <Title level={3} style={{ marginTop: 12, marginBottom: 4 }}>
              {isEditMode ? '修改服务器地址' : '配置服务器地址'}
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              请输入 TickList 后端服务的完整 API 地址，例如
              <Text code>https://your-domain.com/api</Text>
            </Paragraph>
          </div>

          {missingReason && !isEditMode && (
            <Alert type="warning" showIcon message="尚未配置服务器地址，请先完成配置。" />
          )}

          {isEditMode && (
            <Alert
              type="info"
              showIcon
              message="修改服务器后会自动退出当前登录并要求重新认证。"
            />
          )}

          <Input
            placeholder="https://your-domain.com/api"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setTestResult(null);
            }}
            allowClear
            size="large"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
          />

          {testResult === 'ok' && (
            <Alert
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              message="连接成功"
            />
          )}
          {testResult === 'fail' && (
            <Alert
              type="error"
              showIcon
              icon={<CloseCircleOutlined />}
              message="无法连接到该服务器"
            />
          )}

          <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
            <Button onClick={handleTest} loading={testing}>
              测试连接
            </Button>
            <Space>
              {isEditMode && (
                <Button onClick={handleClear} danger>
                  清除
                </Button>
              )}
              <Button type="primary" onClick={handleSave} loading={saving}>
                保存
              </Button>
            </Space>
          </Space>
        </Space>
      </Card>
    </div>
  );
};

export default ServerConfigPage;
