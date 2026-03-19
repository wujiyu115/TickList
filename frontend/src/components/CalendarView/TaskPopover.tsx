import React from 'react';
import { Popover, List, Tag, Empty } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Task } from '../../types';

interface TaskPopoverProps {
  tasks: Task[];
  date: Dayjs;
  onTaskClick?: (task: Task) => void;
  children: React.ReactNode;
}

const TaskPopover: React.FC<TaskPopoverProps> = ({
  tasks,
  date,
  onTaskClick,
  children,
}) => {
  // 获取任务状态标签颜色
  const getStatusColor = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'processing';
      case 'pending':
        return 'warning';
      case 'cancelled':
        return 'default';
      default:
        return 'default';
    }
  };

  // 获取任务状态文本
  const getStatusText = (status: Task['status']) => {
    switch (status) {
      case 'completed':
        return '已完成';
      case 'in_progress':
        return '进行中';
      case 'pending':
        return '待处理';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  };

  const content = (
    <div className="task-popover-content">
      <List
        dataSource={tasks}
        renderItem={(task) => (
          <List.Item
            className="task-popover-item"
            onClick={() => onTaskClick?.(task)}
            style={{ cursor: onTaskClick ? 'pointer' : 'default' }}
          >
            <List.Item.Meta
              title={
                <div className="task-popover-title">
                  <span className={`task-status-dot task-status-${task.status}`} />
                  <span>{task.title}</span>
                </div>
              }
              description={
                <div className="task-popover-meta">
                  <Tag color={getStatusColor(task.status)}>
                    {getStatusText(task.status)}
                  </Tag>
                  {task.priority > 0 && (
                    <Tag color="red">优先级</Tag>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
        locale={{
          emptyText: <Empty description="暂无任务" />,
        }}
      />
    </div>
  );

  return (
    <Popover
      content={content}
      title={`${date.format('M月D日')} 任务 (${tasks.length})`}
      trigger="hover"
      placement="right"
      mouseEnterDelay={0.3}
    >
      <div className="task-popover-trigger">{children}</div>
    </Popover>
  );
};

export default TaskPopover;
