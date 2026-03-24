import React from 'react';
import { Popover, List, Tag, Empty, Checkbox } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { Task } from '../../types';

interface TaskPopoverProps {
  tasks: Task[];
  date: Dayjs;
  allTasks?: Task[]; // 全局任务列表，用于查找子任务
  onTaskClick?: (task: Task) => void;
  onToggleComplete?: (task: Task) => void; // 勾选完成回调
  children: React.ReactNode;
}

const TaskPopover: React.FC<TaskPopoverProps> = ({
  tasks,
  date,
  allTasks = [],
  onTaskClick,
  onToggleComplete,
  children,
}) => {
  // 根据子任务 ID 获取子任务对象
  const getChildTasks = (task: Task): Task[] => {
    if (!task.child_ids || task.child_ids.length === 0) return [];
    return task.child_ids
      .map(childId => allTasks.find(t => t.id === childId))
      .filter((t): t is Task => t !== undefined);
  };

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

  // 处理勾选变化
  const handleCheckboxChange = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡，避免触发 onTaskClick
    onToggleComplete?.(task);
  };

  // 渲染单个任务项（支持子任务）
  const renderTaskItem = (task: Task, isSubtask: boolean = false) => {
    const childTasks = getChildTasks(task);
    const isCompleted = task.status === 'completed';

    return (
      <div key={task.id} className={isSubtask ? 'subtask-wrapper' : ''}>
        <div
          className={`task-popover-item ${isSubtask ? 'subtask-item' : ''} ${isCompleted ? 'task-completed' : ''}`}
          onClick={() => onTaskClick?.(task)}
          style={{ cursor: onTaskClick ? 'pointer' : 'default' }}
        >
          <div className="task-popover-row">
            <Checkbox
              checked={isCompleted}
              onClick={(e) => handleCheckboxChange(task, e)}
              className="task-popover-checkbox"
            />
            <div className="task-popover-info">
              <div className="task-popover-title">
                <span className={`task-status-dot task-status-${task.status}`} />
                <span className={isCompleted ? 'task-title-completed' : ''}>{task.title}</span>
              </div>
              <div className="task-popover-meta">
                <Tag color={getStatusColor(task.status)}>
                  {getStatusText(task.status)}
                </Tag>
                {task.priority > 0 && (
                  <Tag color="red">优先级</Tag>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* 渲染子任务 */}
        {childTasks.length > 0 && (
          <div className="subtask-list">
            {childTasks.map(childTask => renderTaskItem(childTask, true))}
          </div>
        )}
      </div>
    );
  };

  // 计算总任务数（包括子任务）
  const countTotalTasks = (taskList: Task[]): number => {
    let count = taskList.length;
    taskList.forEach(task => {
      const children = getChildTasks(task);
      count += children.length;
    });
    return count;
  };

  const content = (
    <div className="task-popover-content">
      {tasks.length > 0 ? (
        tasks.map(task => renderTaskItem(task, false))
      ) : (
        <Empty description="暂无任务" />
      )}
    </div>
  );

  const totalCount = countTotalTasks(tasks);

  return (
    <Popover
      content={content}
      title={`${date.format('M月D日')} 任务 (${totalCount})`}
      trigger="hover"
      placement="right"
      mouseEnterDelay={0.3}
    >
      <div className="task-popover-trigger">{children}</div>
    </Popover>
  );
};

export default TaskPopover;
