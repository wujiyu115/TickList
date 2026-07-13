import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Empty,
  Space,
  Dropdown,
  Popconfirm,
  Typography,
  Tooltip,
  Progress,
} from 'antd';
import { message, modalApi } from '../utils/antdApp';
import {
  PlusOutlined,
  PushpinOutlined,
  PushpinFilled,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  NumberOutlined,
  CheckCircleFilled,
  UndoOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Counter, CounterCreateRequest, CounterUpdateRequest } from '../types';
import {
  getCounters,
  createCounter,
  updateCounter,
  deleteCounter,
  incrementCounter,
  decrementCounter,
  completeCounter,
  reopenCounter,
} from '../api/counter';
import './CounterPage.less';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PRESET_COLORS = [
  '#1890ff',
  '#52c41a',
  '#faad14',
  '#f5222d',
  '#722ed1',
  '#eb2f96',
  '#13c2c2',
  '#fa8c16',
];

const CounterPage: React.FC = () => {
  const navigate = useNavigate();
  const [counters, setCounters] = useState<Counter[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCounter, setEditingCounter] = useState<Counter | null>(null);
  const [selectedColor, setSelectedColor] = useState('#1890ff');
  const [form] = Form.useForm();

  const fetchCounters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getCounters();
      setCounters(response.counters);
    } catch (error) {
      console.error('Failed to fetch counters:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCounters();
  }, [fetchCounters]);

  const handleCreate = () => {
    setEditingCounter(null);
    form.resetFields();
    form.setFieldsValue({
      initial_value: 0,
      step: 1,
      is_pinned: false,
      color: '#1890ff',
    });
    setSelectedColor('#1890ff');
    setModalVisible(true);
  };

  const handleEdit = (counter: Counter, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingCounter(counter);
    const color = counter.color || '#1890ff';
    form.setFieldsValue({
      title: counter.title,
      initial_value: counter.initial_value,
      step: counter.step,
      target_value: counter.target_value,
      is_pinned: counter.is_pinned,
      color,
      note: counter.note,
    });
    setSelectedColor(color);
    setModalVisible(true);
  };

  const handleDelete = async (id: string, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await deleteCounter(id);
      message.success('删除成功');
      fetchCounters();
    } catch (error) {
      console.error('Failed to delete counter:', error);
    }
  };

  const handleTogglePin = async (counter: Counter, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await updateCounter(counter.id, { is_pinned: !counter.is_pinned });
      message.success(counter.is_pinned ? '已取消置顶' : '已置顶');
      fetchCounters();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const handleIncrement = async (counter: Counter, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const result = await incrementCounter(counter.id);
      if (result.reached_target) {
        modalApi.confirm({
          title: '🎉 恭喜达标！',
          content: `「${counter.title}」已达到目标值 ${counter.target_value}！你想要：`,
          okText: '标记为已完成',
          cancelText: '继续计数',
          onOk: async () => {
            await completeCounter(counter.id);
            fetchCounters();
          },
          onCancel: () => {
            fetchCounters();
          },
        });
      } else {
        fetchCounters();
      }
    } catch (error) {
      console.error('Failed to increment:', error);
    }
  };

  const handleDecrement = async (counter: Counter, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const result = await decrementCounter(counter.id);
      if (result.reached_target) {
        modalApi.confirm({
          title: '🎉 恭喜达标！',
          content: `「${counter.title}」已达到目标值 ${counter.target_value}！你想要：`,
          okText: '标记为已完成',
          cancelText: '继续计数',
          onOk: async () => {
            await completeCounter(counter.id);
            fetchCounters();
          },
          onCancel: () => {
            fetchCounters();
          },
        });
      } else {
        fetchCounters();
      }
    } catch (error) {
      console.error('Failed to decrement:', error);
    }
  };

  const handleReopen = async (counter: Counter, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      await reopenCounter(counter.id);
      message.success('已重新打开');
      fetchCounters();
    } catch (error) {
      console.error('Failed to reopen:', error);
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data: CounterCreateRequest | CounterUpdateRequest = {
        title: values.title,
        step: values.step,
        target_value: values.target_value ?? null,
        is_pinned: values.is_pinned,
        color: values.color,
        note: values.note,
      };

      if (editingCounter) {
        await updateCounter(editingCounter.id, data);
        message.success('更新成功');
      } else {
        await createCounter({
          ...data,
          initial_value: values.initial_value,
        } as CounterCreateRequest);
        message.success('创建成功');
      }

      setModalVisible(false);
      fetchCounters();
    } catch (error) {
      console.error('Failed to submit:', error);
    }
  };

  const getProgressPercent = (counter: Counter): number => {
    if (counter.target_value === null) return 0;
    const isUpward = counter.initial_value <= counter.target_value;
    const totalRange = Math.abs(counter.target_value - counter.initial_value);
    if (totalRange === 0) return 100;
    const currentProgress = isUpward
      ? counter.current_value - counter.initial_value
      : counter.initial_value - counter.current_value;
    return Math.min(100, Math.max(0, Math.round((currentProgress / totalRange) * 100)));
  };

  const renderCounterCard = (counter: Counter) => {
    const hasTarget = counter.target_value !== null;
    const progressPercent = getProgressPercent(counter);

    const dropdownItems = [
      {
        key: 'edit',
        label: '编辑',
        icon: <EditOutlined />,
        onClick: (info: { domEvent: React.MouseEvent }) => handleEdit(counter, info.domEvent),
      },
      {
        key: 'pin',
        label: counter.is_pinned ? '取消置顶' : '置顶',
        icon: counter.is_pinned ? <PushpinOutlined /> : <PushpinFilled />,
        onClick: (info: { domEvent: React.MouseEvent }) => handleTogglePin(counter, info.domEvent),
      },
      ...(counter.is_completed
        ? [
            {
              key: 'reopen',
              label: '重新打开',
              icon: <UndoOutlined />,
              onClick: (info: { domEvent: React.MouseEvent }) => handleReopen(counter, info.domEvent),
            },
          ]
        : []),
      { type: 'divider' as const },
      {
        key: 'delete',
        label: (
          <Popconfirm
            title="确定删除这个计数器吗？"
            onConfirm={(e) => {
              e?.stopPropagation();
              handleDelete(counter.id, e as unknown as React.MouseEvent);
            }}
            onCancel={(e) => e?.stopPropagation()}
            okText="确定"
            cancelText="取消"
          >
            <span
              style={{ color: '#ff4d4f' }}
              onClick={(e) => e.stopPropagation()}
            >
              删除
            </span>
          </Popconfirm>
        ),
        icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
        onClick: (info: any) => info.domEvent?.stopPropagation(),
      },
    ];

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={counter.id}>
        <Card
          className={`counter-card ${counter.is_pinned ? 'pinned' : ''} ${counter.is_completed ? 'completed' : ''}`}
          style={{ borderLeftColor: counter.color || '#1890ff' }}
          hoverable
          onClick={() => navigate(`/counter/${counter.id}`)}
        >
          {counter.is_pinned && (
            <div className="pin-badge">
              <PushpinFilled />
            </div>
          )}

          {counter.is_completed && (
            <div className="completed-badge">
              <CheckCircleFilled />
            </div>
          )}

          <div className="card-header">
            <Tooltip title={counter.title}>
              <Title level={5} className="card-title" ellipsis>
                {counter.title}
              </Title>
            </Tooltip>
            <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
              <Button
                type="text"
                icon={<MoreOutlined />}
                size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>

          <div className={`value-display ${counter.is_completed ? 'value-completed' : ''}`}>
            <span className="current-value">{counter.current_value}</span>
            {hasTarget && (
              <span className="target-value">/ {counter.target_value}</span>
            )}
          </div>

          {hasTarget && (
            <Progress
              percent={progressPercent}
              size="small"
              status={counter.is_completed ? 'success' : progressPercent >= 100 ? 'success' : 'active'}
              showInfo={false}
              className="counter-progress"
            />
          )}

          {!hasTarget && (
            <div className="no-target-hint">
              <Text type="secondary">无目标</Text>
            </div>
          )}

          {!counter.is_completed && (
            <div className="card-actions">
              <Button
                type="text"
                icon={<MinusCircleOutlined />}
                onClick={(e) => handleDecrement(counter, e)}
                disabled={counter.current_value <= 0}
                className="action-btn decrement-btn"
              />
              <Text type="secondary" className="step-hint">
                步长 {counter.step}
              </Text>
              <Button
                type="text"
                icon={<PlusCircleOutlined />}
                onClick={(e) => handleIncrement(counter, e)}
                className="action-btn increment-btn"
              />
            </div>
          )}

          {counter.is_completed && (
            <div className="completed-hint">
              <Text type="success">🎉 已完成</Text>
            </div>
          )}
        </Card>
      </Col>
    );
  };

  return (
    <div className="counter-page">
      <Card className="counter-container">
        <div className="page-header">
          <div className="header-left">
            <NumberOutlined className="page-icon" />
            <Title level={4} style={{ margin: 0 }}>
              计数器
            </Title>
          </div>
          <div className="header-right">
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                新建
              </Button>
            </Space>
          </div>
        </div>

        <div className="counter-content">
          {loading ? (
            <div className="loading-state">加载中...</div>
          ) : counters.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无计数器"
            >
              <Button type="primary" onClick={handleCreate}>
                创建第一个计数器
              </Button>
            </Empty>
          ) : (
            <Row gutter={[16, 16]}>{counters.map(renderCounterCard)}</Row>
          )}
        </div>
      </Card>

      <Modal
        title={editingCounter ? '编辑计数器' : '新建计数器'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText={editingCounter ? '保存' : '创建'}
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入计数器名称" maxLength={50} />
          </Form.Item>

          {!editingCounter && (
            <Form.Item name="initial_value" label="初始值">
              <InputNumber style={{ width: '100%' }} min={0} placeholder="默认为 0" />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="step"
                label="步长"
                rules={[{ required: true, message: '请输入步长' }]}
              >
                <InputNumber style={{ width: '100%' }} min={1} placeholder="每次增减的值" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="target_value" label="目标值">
                <InputNumber style={{ width: '100%' }} placeholder="可留空" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="color" label="颜色">
            <Input type="hidden" />
          </Form.Item>
          <div className="color-picker" style={{ marginTop: -16, marginBottom: 24 }}>
            {PRESET_COLORS.map((c) => (
              <span
                key={c}
                className={`color-option ${selectedColor === c ? 'selected' : ''}`}
                style={{
                  display: 'inline-block',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: c,
                  cursor: 'pointer',
                  marginRight: 8,
                  border: selectedColor === c ? '2px solid var(--ant-color-text)' : '2px solid transparent',
                  boxShadow: selectedColor === c ? '0 0 0 2px rgba(0,0,0,0.1)' : 'none',
                  transition: 'all 0.2s ease',
                }}
                onClick={() => {
                  setSelectedColor(c);
                  form.setFieldsValue({ color: c });
                }}
              />
            ))}
          </div>

          <Form.Item name="note" label="备注">
            <TextArea rows={3} placeholder="添加备注（可选）" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CounterPage;
