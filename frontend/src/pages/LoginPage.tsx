import React, { useState, useEffect } from 'react';
import { Card, Typography, Form, Input, Button, Divider, message } from 'antd';
import { UserOutlined, LockOutlined, KeyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { User } from '../types';
import { localLogin, getAuthConfig, getPasskeyLoginOptions, verifyPasskeyLogin } from '../api/auth';

const { Title, Paragraph } = Typography;

interface LoginPageProps {
  onLogin: (user: User, token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState(true);
  const [webauthnSupported] = useState(() => browserSupportsWebAuthn());

  useEffect(() => {
    getAuthConfig()
      .then((res: any) => {
        const enabled = res.register_enabled ?? res.data?.register_enabled ?? true;
        setRegisterEnabled(enabled);
      })
      .catch(() => {
        setRegisterEnabled(true);
      });
  }, []);

  const handleLocalLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await localLogin(values);
      if (response.success && response.token && response.user) {
        onLogin(response.user as User, response.token);
      } else {
        message.error(response.message || '登录失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || '登录失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const optionsRes = await getPasskeyLoginOptions();
      const options = (optionsRes as any).data ?? optionsRes;
      const credential = await startAuthentication({ optionsJSON: options });
      const verifyRes = await verifyPasskeyLogin(credential);
      const result = (verifyRes as any).data ?? verifyRes;
      if (result.token && result.user) {
        onLogin(result.user as User, result.token);
      } else {
        message.error('Passkey 登录失败');
      }
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        message.info('已取消 Passkey 验证');
      } else {
        message.error(error.response?.data?.detail || 'Passkey 登录失败');
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: '90vw', maxWidth: 400, textAlign: 'center' }}>
        <Title level={2}>TickList</Title>
        <Paragraph>任务管理系统</Paragraph>
        
        <Form
          name="login"
          onFinish={handleLocalLogin}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名" 
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="密码" 
              size="large"
            />
          </Form.Item>
          
          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
              size="large"
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        {webauthnSupported && (
          <>
            <Divider style={{ margin: '16px 0', color: '#999', fontSize: 12 }}>或</Divider>
            <Button
              block
              icon={<KeyOutlined />}
              onClick={handlePasskeyLogin}
              loading={passkeyLoading}
              style={{ marginBottom: 16 }}
            >
              使用 Passkey 登录
            </Button>
          </>
        )}
        
        {registerEnabled && (
        <div style={{ marginTop: 16 }}>
          <Link to="/register">没有账号？注册</Link>
        </div>
        )}
      </Card>
    </div>
  );
};

export default LoginPage;
