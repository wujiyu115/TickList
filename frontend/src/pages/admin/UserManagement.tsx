import React, { useState, useEffect } from 'react';
import { Table, Tag, Button, Modal, Input, Select, Form, message, Space } from 'antd';
import { PlusOutlined, LockOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { User } from '../../types';
import { getUsers, createUser, updateUser, freezeUser, resetUserPassword } from '../../api/admin';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role_group: string;
  is_frozen: boolean;
  created_at: string;
}

interface UserManagementProps {
  currentUser: User;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [resetPwdModalVisible, setResetPwdModalVisible] = useState(false);
  const [resetPwdUserId, setResetPwdUserId] = useState<string | null>(null);
  const [createForm] = Form.useForm();
  const [resetPwdForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);
  const [resetPwdLoading, setResetPwdLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data: any = await getUsers();
      setUsers(data.users || data || []);
    } catch (e) {
      console.error('Failed to load users:', e);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, roleGroup: string) => {
    try {
      await updateUser(userId, { role_group: roleGroup });
      message.success('角色已更新');
      loadUsers();
    } catch (e) {
      message.error('更新角色失败');
    }
  };

  const handleFreeze = async (userId: string) => {
    try {
      await freezeUser(userId);
      message.success('操作成功');
      loadUsers();
    } catch (e) {
      message.error('操作失败');
    }
  };

  const handleCreateUser = async () => {
    try {
      const values = await createForm.validateFields();
      setCreateLoading(true);
      await createUser(values);
      message.success('用户创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      loadUsers();
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('创建用户失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPwdUserId) return;
    try {
      const values = await resetPwdForm.validateFields();
      setResetPwdLoading(true);
      await resetUserPassword(resetPwdUserId, { new_password: values.new_password });
      message.success('密码已重置');
      setResetPwdModalVisible(false);
      resetPwdForm.resetFields();
      setResetPwdUserId(null);
    } catch (e: any) {
      if (e.errorFields) return;
      message.error('重置密码失败');
    } finally {
      setResetPwdLoading(false);
    }
  };

  const openResetPwdModal = (userId: string) => {
    setResetPwdUserId(userId);
    resetPwdForm.resetFields();
    setResetPwdModalVisible(true);
  };

  const columns: ColumnsType<AdminUser> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => email || '-',
    },
    {
      title: '角色',
      dataIndex: 'role_group',
      key: 'role_group',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'blue' : 'default'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      key: 'status',
      render: (_: any, record: AdminUser) => (
        <Tag color={record.is_frozen ? 'red' : 'green'}>
          {record.is_frozen ? '已冻结' : '正常'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => {
        if (!time) return '-';
        const date = new Date(time);
        return date.toLocaleString('zh-CN');
      },
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: AdminUser) => {
        const isSelf = record.id === currentUser.id;
        return (
          <Space size="small">
            <Select
              size="small"
              value={record.role_group}
              onChange={(value) => handleRoleChange(record.id, value)}
              disabled={isSelf}
              style={{ width: 100 }}
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
            <Button
              size="small"
              icon={record.is_frozen ? <CheckCircleOutlined /> : <StopOutlined />}
              danger={!record.is_frozen}
              disabled={isSelf}
              onClick={() => handleFreeze(record.id)}
            >
              {record.is_frozen ? '解冻' : '冻结'}
            </Button>
            <Button
              size="small"
              icon={<LockOutlined />}
              onClick={() => openResetPwdModal(record.id)}
            >
              重置密码
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0, paddingBottom: 0, borderBottom: 'none' }}>用户管理</div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
          新建用户
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
      />

      {/* 新建用户 Modal */}
      <Modal
        title="新建用户"
        open={createModalVisible}
        onOk={handleCreateUser}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        confirmLoading={createLoading}
        okText="创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
          >
            <Input placeholder="请输入邮箱（可选）" />
          </Form.Item>
          <Form.Item
            name="role_group"
            label="角色"
            initialValue="user"
          >
            <Select
              options={[
                { value: 'user', label: '普通用户' },
                { value: 'admin', label: '管理员' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码 Modal */}
      <Modal
        title="重置密码"
        open={resetPwdModalVisible}
        onOk={handleResetPassword}
        onCancel={() => {
          setResetPwdModalVisible(false);
          resetPwdForm.resetFields();
          setResetPwdUserId(null);
        }}
        confirmLoading={resetPwdLoading}
        okText="确认重置"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={resetPwdForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '密码至少6位' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;
