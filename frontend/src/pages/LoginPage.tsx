import React, { useState, useEffect } from 'react';
import { Card, Typography, Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { User } from '../types';
import { localLogin, getAuthConfig } from '../api/auth';

const { Title, Paragraph } = Typography;

interface LoginPageProps {
  onLogin: (user: User, token: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState(true);

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
