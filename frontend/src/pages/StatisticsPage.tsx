import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Spin } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, SyncOutlined } from '@ant-design/icons';
import { getStatisticsOverview } from '../api/statistics';
import { TaskStatistics } from '../types';

const StatisticsPage: React.FC = () => {
  const [statistics, setStatistics] = useState<TaskStatistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const data = await getStatisticsOverview();
      setStatistics(data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!statistics) {
    return <div>暂无统计数据</div>;
  }

  return (
    <div>
      <Row gutter={16}>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="总任务数"
              value={statistics.total_tasks}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="已完成"
              value={statistics.completed_tasks}
              valueStyle={{ color: '#3f8600' }}
              prefix={<CheckCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="进行中"
              value={statistics.in_progress_tasks}
              valueStyle={{ color: '#1890ff' }}
              prefix={<SyncOutlined spin />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card>
            <Statistic
              title="待处理"
              value={statistics.pending_tasks}
              valueStyle={{ color: '#faad14' }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="完成率">
            <Statistic
              value={statistics.completion_rate}
              precision={2}
              suffix="%"
              valueStyle={{ fontSize: 32 }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StatisticsPage;
