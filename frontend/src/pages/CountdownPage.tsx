import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Input,
  DatePicker,
  Select,
  Switch,
  Tag,
  Empty,
  Space,
  Dropdown,
  message,
  Popconfirm,
  Typography,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  PushpinOutlined,
  PushpinFilled,
  EditOutlined,
  DeleteOutlined,
  MoreOutlined,
  HourglassOutlined,
  SendOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Countdown, CountdownCreateRequest, CountdownUpdateRequest } from '../types';
import {
  getCountdowns,
  createCountdown,
  updateCountdown,
  deleteCountdown,
} from '../api/countdown';
import { scheduleCountdownNotification, cancelCountdownNotification } from '../services/notificationService';
import './CountdownPage.less';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

// 分类配置
const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  birthday: { label: '生日', color: 'pink' },
  anniversary: { label: '纪念日', color: 'red' },
  holiday: { label: '节日', color: 'gold' },
  custom: { label: '自定义', color: 'blue' },
};

// 预设颜色
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

// 计算剩余天数
const calculateDaysLeft = (targetDate: string, repeatAnnually: boolean): number => {
  const target = dayjs(targetDate);
  const today = dayjs().startOf('day');

  if (repeatAnnually) {
    // 每年重复：计算今年或明年的对应日期
    let thisYear = target.year(today.year());
    if (thisYear.isBefore(today)) {
      thisYear = thisYear.add(1, 'year');
    }
    return thisYear.diff(today, 'day');
  }

  return target.startOf('day').diff(today, 'day');
};

// 获取天数显示状态
const getDaysStatus = (days: number): { text: string; className: string } => {
  if (days > 0) {
    return { text: `还有 ${days} 天`, className: 'days-future' };
  } else if (days === 0) {
    return { text: '就是今天！', className: 'days-today' };
  } else {
    return { text: `已过 ${Math.abs(days)} 天`, className: 'days-past' };
  }
};

const CountdownPage: React.FC = () => {
  const [countdowns, setCountdowns] = useState<Countdown[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCountdown, setEditingCountdown] = useState<Countdown | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [form] = Form.useForm();

  // 获取倒数日列表
  const fetchCountdowns = useCallback(async () => {
    setLoading(true);
    try {
      const params: { category?: string } = {};
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      const response = await getCountdowns(params);
      // 排序：置顶在前，然后按剩余天数升序
      const sorted = [...response.countdowns].sort((a, b) => {
        if (a.is_pinned !== b.is_pinned) {
          return a.is_pinned ? -1 : 1;
        }
        const daysA = calculateDaysLeft(a.target_date, a.repeat_annually);
        const daysB = calculateDaysLeft(b.target_date, b.repeat_annually);
        return daysA - daysB;
      });
      setCountdowns(sorted);
    } catch (error) {
      console.error('Failed to fetch countdowns:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    fetchCountdowns();
  }, [fetchCountdowns]);

  // 打开新建弹窗
  const handleCreate = () => {
    setEditingCountdown(null);
    form.resetFields();
    form.setFieldsValue({
      category: 'custom',
      repeat_annually: false,
      is_pinned: false,
      color: '#1890ff',
      push_due_notify: false,
    });
    setModalVisible(true);
  };

  // 打开编辑弹窗
  const handleEdit = (countdown: Countdown) => {
    setEditingCountdown(countdown);
    form.setFieldsValue({
      title: countdown.title,
      target_date: dayjs(countdown.target_date),
      category: countdown.category,
      repeat_annually: countdown.repeat_annually,
      is_pinned: countdown.is_pinned,
      color: countdown.color || '#1890ff',
      note: countdown.note,
      push_due_notify: countdown.push_due_notify || false,
    });
    setModalVisible(true);
  };

  // 删除倒数日
  const handleDelete = async (id: string) => {
    try {
      await deleteCountdown(id);
      message.success('删除成功');
      cancelCountdownNotification(id).catch(console.error);
      fetchCountdowns();
    } catch (error) {
      console.error('Failed to delete countdown:', error);
    }
  };

  // 切换置顶
  const handleTogglePin = async (countdown: Countdown) => {
    try {
      await updateCountdown(countdown.id, { is_pinned: !countdown.is_pinned });
      message.success(countdown.is_pinned ? '已取消置顶' : '已置顶');
      fetchCountdowns();
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const data: CountdownCreateRequest | CountdownUpdateRequest = {
        title: values.title,
        target_date: values.target_date.format('YYYY-MM-DD'),
        category: values.category,
        repeat_annually: values.repeat_annually,
        is_pinned: values.is_pinned,
        color: values.color,
        note: values.note,
        push_due_notify: values.push_due_notify,
      };

      if (editingCountdown) {
        await updateCountdown(editingCountdown.id, data);
        message.success('更新成功');
        if (data.push_due_notify) {
          scheduleCountdownNotification({ ...editingCountdown, ...data, target_date: values.target_date.format('YYYY-MM-DD') } as Countdown).catch(console.error);
        } else {
          cancelCountdownNotification(editingCountdown.id).catch(console.error);
        }
      } else {
        const created = await createCountdown(data as CountdownCreateRequest);
        message.success('创建成功');
        if (data.push_due_notify) {
          scheduleCountdownNotification(created).catch(console.error);
        }
      }

      setModalVisible(false);
      fetchCountdowns();
    } catch (error) {
      console.error('Failed to submit:', error);
    }
  };

  // 渲染单个卡片
  const renderCountdownCard = (countdown: Countdown) => {
    const daysLeft = calculateDaysLeft(countdown.target_date, countdown.repeat_annually);
    const { text, className } = getDaysStatus(daysLeft);
    const categoryConfig = CATEGORY_CONFIG[countdown.category] || CATEGORY_CONFIG.custom;

    const dropdownItems = [
      {
        key: 'edit',
        label: '编辑',
        icon: <EditOutlined />,
        onClick: () => handleEdit(countdown),
      },
      {
        key: 'pin',
        label: countdown.is_pinned ? '取消置顶' : '置顶',
        icon: countdown.is_pinned ? <PushpinOutlined /> : <PushpinFilled />,
        onClick: () => handleTogglePin(countdown),
      },
      {
        type: 'divider' as const,
      },
      {
        key: 'delete',
        label: (
          <Popconfirm
            title="确定删除这个倒数日吗？"
            onConfirm={() => handleDelete(countdown.id)}
            okText="确定"
            cancelText="取消"
          >
            <span style={{ color: '#ff4d4f' }}>删除</span>
          </Popconfirm>
        ),
        icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
      },
    ];

    return (
      <Col xs={24} sm={12} md={8} lg={6} key={countdown.id}>
        <Card
          className={`countdown-card ${countdown.is_pinned ? 'pinned' : ''}`}
          style={{ borderLeftColor: countdown.color || '#1890ff' }}
          hoverable
        >
          {countdown.is_pinned && (
            <div className="pin-badge">
              <PushpinFilled />
            </div>
          )}

          <div className="card-header">
            <Tooltip title={countdown.title}>
              <Title level={5} className="card-title" ellipsis>
                {countdown.title}
              </Title>
            </Tooltip>
            <Dropdown menu={{ items: dropdownItems }} trigger={['click']}>
              <Button type="text" icon={<MoreOutlined />} size="small" />
            </Dropdown>
          </div>

          <div className={`days-display ${className}`}>
            <span className="days-number">
              {daysLeft === 0 ? '🎉' : Math.abs(daysLeft)}
            </span>
            <span className="days-text">{text}</span>
          </div>

          <div className="card-footer">
            <Text type="secondary" className="target-date">
              {dayjs(countdown.target_date).format('YYYY年MM月DD日')}
              {countdown.repeat_annually && ' (每年)'}
            </Text>
            <Tag color={categoryConfig.color}>{categoryConfig.label}</Tag>
          </div>

          {countdown.note && (
            <div className="card-note">
              <Text type="secondary" ellipsis>
                {countdown.note}
              </Text>
            </div>
          )}
        </Card>
      </Col>
    );
  };

  return (
    <div className="countdown-page">
      <Card className="countdown-container">
        <div className="page-header">
          <div className="header-left">
            <HourglassOutlined className="page-icon" />
            <Title level={4} style={{ margin: 0 }}>
              倒数日
            </Title>
          </div>
          <div className="header-right">
            <Space>
              <Select
                value={selectedCategory}
                onChange={setSelectedCategory}
                style={{ width: 120 }}
              >
                <Option value="all">全部</Option>
                <Option value="birthday">生日</Option>
                <Option value="anniversary">纪念日</Option>
                <Option value="holiday">节日</Option>
                <Option value="custom">自定义</Option>
              </Select>
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                新建
              </Button>
            </Space>
          </div>
        </div>

        <div className="countdown-content">
          {loading ? (
            <div className="loading-state">加载中...</div>
          ) : countdowns.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无倒数日"
            >
              <Button type="primary" onClick={handleCreate}>
                创建第一个倒数日
              </Button>
            </Empty>
          ) : (
            <Row gutter={[16, 16]}>{countdowns.map(renderCountdownCard)}</Row>
          )}
        </div>
      </Card>

      <Modal
        title={editingCountdown ? '编辑倒数日' : '新建倒数日'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        okText={editingCountdown ? '保存' : '创建'}
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="请输入事件标题" maxLength={50} />
          </Form.Item>

          <Form.Item
            name="target_date"
            label="目标日期"
            rules={[{ required: true, message: '请选择目标日期' }]}
          >
            <DatePicker style={{ width: '100%' }} placeholder="选择日期" />
          </Form.Item>

          <Form.Item name="category" label="分类">
            <Select placeholder="选择分类">
              <Option value="birthday">生日</Option>
              <Option value="anniversary">纪念日</Option>
              <Option value="holiday">节日</Option>
              <Option value="custom">自定义</Option>
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="repeat_annually" label="每年重复" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_pinned" label="置顶" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item 
            name="push_due_notify" 
            label={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SendOutlined style={{ color: '#52c41a' }} />
                到期推送
              </span>
            }
            valuePropName="checked"
            extra="开启后，到期当天会收到推送通知"
          >
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

export default CountdownPage;
