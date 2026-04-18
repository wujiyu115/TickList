import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Space,
  Typography,
  Progress,
  List,
  Tag,
  message,
  Popconfirm,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlusCircleOutlined,
  MinusCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleFilled,
  UndoOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Counter,
  CounterUpdateRequest,
  CounterHistory,
} from '../types';
import {
  getCounter,
  updateCounter,
  deleteCounter,
  incrementCounter,
  decrementCounter,
  completeCounter,
  reopenCounter,
  getCounterHistories,
} from '../api/counter';
import './CounterDetailPage.less';

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

const CounterDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [counter, setCounter] = useState<Counter | null>(null);
  const [histories, setHistories] = useState<CounterHistory[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const fetchCounter = useCallback(async () => {
    if (!id) return;
    try {
      const data = await getCounter(id);
      setCounter(data);
    } catch (error) {
      console.error('Failed to fetch counter:', error);
      message.error('计数器不存在');
      navigate('/counter');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchHistories = useCallback(async (skip = 0, append = false) => {
    if (!id) return;
    setHistoryLoading(true);
    try {
      const response = await getCounterHistories(id, { skip, limit: 20 });
      setHistories(prev => append ? [...prev, ...response.histories] : response.histories);
      setHistoryTotal(response.total);
    } catch (error) {
      console.error('Failed to fetch histories:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCounter();
    fetchHistories();
  }, [fetchCounter, fetchHistories]);

  const handleIncrement = async () => {
    if (!counter) return;
    try {
      const result = await incrementCounter(counter.id);
      if (result.reached_target) {
        Modal.confirm({
          title: '🎉 恭喜达标！',
          content: `「${counter.title}」已达到目标值 ${counter.target_value}！你想要：`,
          okText: '标记为已完成',
          cancelText: '继续计数',
          onOk: async () => {
            await completeCounter(counter.id);
            fetchCounter();
            fetchHistories();
          },
          onCancel: () => {
            fetchCounter();
            fetchHistories();
          },
        });
      } else {
        fetchCounter();
        fetchHistories();
      }
    } catch (error) {
      console.error('Failed to increment:', error);
    }
  };

  const handleDecrement = async () => {
    if (!counter) return;
    try {
      const result = await decrementCounter(counter.id);
      if (result.reached_target) {
        Modal.confirm({
          title: '🎉 恭喜达标！',
          content: `「${counter.title}」已达到目标值 ${counter.target_value}！你想要：`,
          okText: '标记为已完成',
          cancelText: '继续计数',
          onOk: async () => {
            await completeCounter(counter.id);
            fetchCounter();
            fetchHistories();
          },
          onCancel: () => {
            fetchCounter();
            fetchHistories();
          },
        });
      } else {
        fetchCounter();
        fetchHistories();
      }
    } catch (error) {
      console.error('Failed to decrement:', error);
    }
  };

  const handleReopen = async () => {
    if (!counter) return;
    try {
      await reopenCounter(counter.id);
      message.success('已重新打开');
      fetchCounter();
    } catch (error) {
      console.error('Failed to reopen:', error);
    }
  };

  const handleEdit = () => {
    if (!counter) return;
    form.setFieldsValue({
      title: counter.title,
      step: counter.step,
      target_value: counter.target_value,
      is_pinned: counter.is_pinned,
      color: counter.color || '#1890ff',
      note: counter.note,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (!counter) return;
    try {
      const values = await form.validateFields();
      const data: CounterUpdateRequest = {
        title: values.title,
        step: values.step,
        target_value: values.target_value ?? null,
        is_pinned: values.is_pinned,
        color: values.color,
        note: values.note,
      };
      await updateCounter(counter.id, data);
      message.success('更新成功');
      setModalVisible(false);
      fetchCounter();
    } catch (error) {
      console.error('Failed to update:', error);
    }
  };

  const handleDelete = async () => {
    if (!counter) return;
    try {
      await deleteCounter(counter.id);
      message.success('删除成功');
      navigate('/counter');
    } catch (error) {
      console.error('Failed to delete:', error);
    }
  };

  const getProgressPercent = (): number => {
    if (!counter || counter.target_value === null) return 0;
    const isUpward = counter.initial_value <= counter.target_value;
    const totalRange = Math.abs(counter.target_value - counter.initial_value);
    if (totalRange === 0) return 100;
    const currentProgress = isUpward
      ? counter.current_value - counter.initial_value
      : counter.initial_value - counter.current_value;
    return Math.min(100, Math.max(0, Math.round((currentProgress / totalRange) * 100)));
  };

  const loadMoreHistories = () => {
    fetchHistories(histories.length, true);
  };

  if (loading) {
    return (
      <div className="counter-detail-page">
        <Card className="detail-container">
          <div className="loading-state">加载中...</div>
        </Card>
      </div>
    );
  }

  if (!counter) return null;

  const hasTarget = counter.target_value !== null;
  const progressPercent = getProgressPercent();

  return (
    <div className="counter-detail-page">
      <Card className="detail-container">
        <div className="detail-header">
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/counter')}
            className="back-btn"
          >
            返回
          </Button>
          <Title level={4} className="detail-title" style={{ margin: 0 }}>
            {counter.title}
          </Title>
          <Space>
            <Button icon={<EditOutlined />} onClick={handleEdit}>
              编辑
            </Button>
            <Popconfirm
              title="确定删除这个计数器吗？"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
            >
              <Button danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        </div>

        <div className="detail-body">
          <div className="counter-section">
            <div className={`value-area ${counter.is_completed ? 'value-completed' : ''}`}>
              <span className="big-value">{counter.current_value}</span>
              {hasTarget && (
                <span className="big-target">/ {counter.target_value}</span>
              )}
            </div>

            {hasTarget && (
              <div className="progress-area">
                <Progress
                  percent={progressPercent}
                  status={counter.is_completed ? 'success' : progressPercent >= 100 ? 'success' : 'active'}
                  strokeWidth={12}
                  style={{ maxWidth: 400, margin: '0 auto' }}
                />
                <Text type="secondary" className="progress-text">{progressPercent}%</Text>
              </div>
            )}

            {!counter.is_completed ? (
              <div className="action-area">
                <Tooltip title={counter.current_value <= 0 ? '已为最小值' : `减少 ${counter.step}`}>
                  <Button
                    size="large"
                    icon={<MinusCircleOutlined />}
                    onClick={handleDecrement}
                    disabled={counter.current_value <= 0}
                    className="decrement-btn"
                  >
                    -{counter.step}
                  </Button>
                </Tooltip>
                <Tooltip title={`增加 ${counter.step}`}>
                  <Button
                    size="large"
                    type="primary"
                    icon={<PlusCircleOutlined />}
                    onClick={handleIncrement}
                    className="increment-btn"
                  >
                    +{counter.step}
                  </Button>
                </Tooltip>
              </div>
            ) : (
              <div className="completed-area">
                <div className="completed-text">
                  <CheckCircleFilled style={{ color: '#52c41a', fontSize: 24 }} />
                  <Text style={{ fontSize: 16, marginLeft: 8 }}>已完成</Text>
                </div>
                <Button icon={<UndoOutlined />} onClick={handleReopen}>
                  重新打开
                </Button>
              </div>
            )}

            <div className="info-area">
              <div className="info-item">
                <Text type="secondary">初始值</Text>
                <Text strong>{counter.initial_value}</Text>
              </div>
              <div className="info-item">
                <Text type="secondary">步长</Text>
                <Text strong>{counter.step}</Text>
              </div>
              <div className="info-item">
                <Text type="secondary">目标</Text>
                <Text strong>{hasTarget ? counter.target_value : '无'}</Text>
              </div>
            </div>

            {counter.note && (
              <div className="note-area">
                <Text type="secondary">备注：{counter.note}</Text>
              </div>
            )}
          </div>

          <div className="history-section">
            <Title level={5} style={{ marginBottom: 16 }}>
              📋 操作历史
            </Title>
            <List
              loading={historyLoading}
              dataSource={histories}
              locale={{ emptyText: '暂无操作记录' }}
              renderItem={(item: CounterHistory) => (
                <List.Item className="history-item">
                  <div className="history-content">
                    <div className="history-left">
                      <Tag color={item.action === 'increment' ? 'green' : 'red'}>
                        {item.action === 'increment' ? '+' : '-'}{item.change_value}
                      </Tag>
                      <Text>
                        {item.before_value} → {item.after_value}
                      </Text>
                    </div>
                    <Text type="secondary" className="history-time">
                      {dayjs(item.created_at).format('YYYY-MM-DD HH:mm')}
                    </Text>
                  </div>
                </List.Item>
              )}
            />
            {histories.length < historyTotal && (
              <div className="load-more">
                <Button
                  type="link"
                  onClick={loadMoreHistories}
                  loading={historyLoading}
                >
                  加载更多
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Modal
        title="编辑计数器"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText="保存"
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

          <Form.Item
            name="step"
            label="步长"
            rules={[{ required: true, message: '请输入步长' }]}
          >
            <InputNumber style={{ width: '100%' }} min={1} />
          </Form.Item>

          <Form.Item name="target_value" label="目标值">
            <InputNumber style={{ width: '100%' }} placeholder="可留空" />
          </Form.Item>

          <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item name="color" label="颜色">
            <div className="color-picker">
              {PRESET_COLORS.map((color) => (
                <div
                  key={color}
                  className={`color-option ${
                    form.getFieldValue('color') === color ? 'selected' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => form.setFieldsValue({ color })}
                />
              ))}
            </div>
          </Form.Item>

          <Form.Item name="note" label="备注">
            <TextArea rows={3} placeholder="添加备注（可选）" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CounterDetailPage;
