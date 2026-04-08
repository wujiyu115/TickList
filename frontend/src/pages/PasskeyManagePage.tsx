import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, message, Modal, List, Empty, Result, Spin } from 'antd';
import { ArrowLeftOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { getPasskeyRegisterOptions, verifyPasskeyRegister, getPasskeyCredentials, deletePasskeyCredential } from '../api/auth';

const { Title } = Typography;

const PasskeyManagePage: React.FC = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState<any[]>([]);
  const [credLoading, setCredLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const webauthnSupported = browserSupportsWebAuthn();

  useEffect(() => {
    if (webauthnSupported) {
      loadCredentials();
    }
  }, []);

  const loadCredentials = async () => {
    setCredLoading(true);
    try {
      const res = await getPasskeyCredentials();
      setCredentials((res as any).credentials || []);
    } catch (e) {
      message.error('加载凭证失败');
    } finally {
      setCredLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setRegisterLoading(true);
    try {
      const optionsRes = await getPasskeyRegisterOptions();
      const options = optionsRes as any;
      const credential = await startRegistration(options);
      await verifyPasskeyRegister(credential, 'My Passkey');
      message.success('Passkey 注册成功');
      loadCredentials();
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        message.info('已取消注册');
      } else {
        message.error(error.response?.data?.detail || '注册失败');
      }
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleDeleteCredential = (id: string, name: string) => {
    Modal.confirm({
      title: '删除 Passkey',
      content: `确定删除「${name}」吗？删除后将无法使用此设备免密登录。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deletePasskeyCredential(id);
          message.success('已删除');
          loadCredentials();
        } catch (e) {
          message.error('删除失败');
        }
      }
    });
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: '90vw', maxWidth: 520, position: 'relative' }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ position: 'absolute', top: 16, left: 16, color: '#666' }}
        >
          返回
        </Button>

        <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
          <Title level={3}>Passkey 管理</Title>
        </div>

        {!webauthnSupported ? (
          <Result
            status="warning"
            title="浏览器不支持"
            subTitle="当前浏览器不支持 WebAuthn，无法使用 Passkey 功能"
          />
        ) : (
          <div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: 16 
            }}>
              <span style={{ color: '#666', fontSize: 14 }}>
                绑定 Passkey 后可使用指纹、面容或安全密钥免密登录
              </span>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleRegisterPasskey}
                loading={registerLoading}
              >
                注册新 Passkey
              </Button>
            </div>

            {credLoading ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <Spin />
              </div>
            ) : credentials.length === 0 ? (
              <Empty description="暂未绑定任何 Passkey" />
            ) : (
              <List
                dataSource={credentials}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        danger
                        size="small"
                        onClick={() => handleDeleteCredential(item.id, item.device_name)}
                      >
                        删除
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      avatar={<KeyOutlined style={{ fontSize: 24, color: 'var(--ant-color-primary)' }} />}
                      title={item.device_name || 'Passkey'}
                      description={`创建时间: ${item.created_at || '-'} | 最后使用: ${item.last_used_at || '未使用'}`}
                    />
                  </List.Item>
                )}
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PasskeyManagePage;
