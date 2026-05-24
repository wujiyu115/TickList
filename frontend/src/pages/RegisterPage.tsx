import React, { useState, useEffect } from 'react';
import { Card, Typography, Form, Input, Button, message, Result, Spin } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { register, getAuthConfig } from '../api/auth';

const { Title, Paragraph } = Typography;

interface RegisterFormValues {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
}

const RegisterPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [registerEnabled, setRegisterEnabled] = useState<boolean | null>(null);
  const navigate = useNavigate();

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

  const handleRegister = async (values: RegisterFormValues) => {
    setLoading(true);
    try {
      const response = await register({
        username: values.username,
        password: values.password,
        email: values.email
      });
      
      if (response.success) {
        message.success(response.message || '注册成功，请登录');
        navigate('/login');
      } else {
        message.error(response.message || '注册失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100dvh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      {registerEnabled === null ? (
        <Spin size="large" />
      ) : !registerEnabled ? (
        <Card style={{ width: '90vw', maxWidth: 400, textAlign: 'center' }}>
          <Result
            status="warning"
            title="注册功能已关闭"
            subTitle="管理员已关闭注册功能，请联系管理员获取账号"
            extra={<Link to="/login"><Button type="primary">返回登录</Button></Link>}
          />
        </Card>
      ) : (
      <Card style={{ width: '90vw', maxWidth: 400, textAlign: 'center' }}>
        <Title level={2}>注册</Title>
        <Paragraph>创建您的 TickList 账号</Paragraph>
        
        <Form
          name="register"
          onFinish={handleRegister}
          style={{ marginTop: 24 }}
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 20, message: '用户名最多20个字符' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="用户名（3-20字符）" 
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="密码（至少6字符）" 
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="确认密码" 
              size="large"
            />
          </Form.Item>
          
          <Form.Item
            name="email"
            rules={[
              { type: 'email', message: '请输入有效的邮箱地址' }
            ]}
          >
            <Input 
              prefix={<MailOutlined />} 
              placeholder="邮箱（可选）" 
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
              注册
            </Button>
          </Form.Item>
        </Form>
        
        <div style={{ marginTop: 16 }}>
          <Link to="/login">已有账号？登录</Link>
        </div>
      </Card>
      )}
    </div>
  );
};

export default RegisterPage;
