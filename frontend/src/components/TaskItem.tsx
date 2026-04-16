import React, { useState } from 'react';
import { Checkbox, Dropdown, Input } from 'antd';
import { CaretDownOutlined, CaretRightOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Task } from '../types';
import { useTaskContext } from '../contexts/TaskContext';
import { useLongPress } from '../hooks/useLongPress';
import TaskContextMenu from './TaskContextMenu';
import './TaskItem.less';

interface TaskItemProps {
  task: Task;
  allTasks: Task[];
  depth?: number;
  hideDetails?: boolean;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, allTasks, depth = 0, hideDetails }) => {
  const { updateTaskData, selectTask, selectedTask } = useTaskContext();
  const [expanded, setExpanded] = useState(true);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);

  // 格式化专注时长
  const formatFocusDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
    }
  };

  // 找到子任务（通过 child_ids 查找）
  const children = (task.child_ids || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean) as Task[];
  const completedChildren = children.filter(t => t.status === 'completed');
  const hasChildren = children.length > 0;

  const isSelected = selectedTask?.id === task.id;
  const isCompleted = task.status === 'completed';

  const handleStatusToggle = async () => {
    await updateTaskData(task.id, {
      status: isCompleted ? 'pending' : 'completed'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = dayjs(dateStr);
    const today = dayjs().startOf('day');
    const tomorrow = dayjs().add(1, 'day').startOf('day');
    
    if (date.isSame(today, 'day')) {
      return '今天';
    }
    if (date.isSame(tomorrow, 'day')) {
      return '明天';
    }
    if (date.year() === today.year()) {
      return date.format('M月D日');
    }
    return date.format('YYYY-M-D');
  };

  const longPressHandlers = useLongPress({
    onLongPress: () => setContextMenuVisible(true),
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuVisible(true);
  };

  const handleSaveTitle = () => {
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      updateTaskData(task.id, { title: trimmed });
    } else {
      setEditTitle(task.title); // 恢复原值
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setEditing(false);
      setEditTitle(task.title); // 取消编辑，恢复原值
    }
  };

  return (
    <div className="task-item-wrapper">
      <Dropdown
        open={contextMenuVisible}
        onOpenChange={setContextMenuVisible}
        dropdownRender={() => (
          <TaskContextMenu
            task={task}
            onClose={() => setContextMenuVisible(false)}
          />
        )}
        trigger={['contextMenu']}
      >
        <div
          className={`task-item-new ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
          style={{ paddingLeft: depth * 24 + 12, userSelect: 'none', WebkitUserSelect: 'none' }}
          onClick={() => {
            if (longPressHandlers.isLongPress.current) {
              longPressHandlers.isLongPress.current = false;
              return;
            }
            selectTask(task);
          }}
          onContextMenu={handleContextMenu}
          onTouchStart={longPressHandlers.onTouchStart}
          onTouchMove={longPressHandlers.onTouchMove}
          onTouchEnd={longPressHandlers.onTouchEnd}
        >
          {/* 展开/折叠箭头 */}
          {hasChildren ? (
            <span
              className="expand-arrow"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </span>
          ) : (
            <span className="expand-placeholder" />
          )}

          {/* 复选框 */}
          <span className={`task-checkbox-wrapper priority-${task.priority || 0}`}>
            <Checkbox
              checked={isCompleted}
              onChange={(e) => {
                e.stopPropagation();
                handleStatusToggle();
              }}
              onClick={(e) => e.stopPropagation()}
              className="task-checkbox"
            />
          </span>

          {/* 任务内容 */}
          <div className="task-content">
            <div className="task-title-row">
              {editing ? (
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onPressEnter={handleSaveTitle}
                  onBlur={handleSaveTitle}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  size="small"
                  variant="borderless"
                  className="task-title-input"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="task-title"
                  onClick={(e) => {
                    e.stopPropagation(); // 阻止触发行的 selectTask
                    setEditing(true);
                    setEditTitle(task.title);
                  }}
                >
                  {task.title}
                </span>
              )}
            </div>
            {!hideDetails && task.description && (
              <div className="task-desc">{task.description}</div>
            )}
            {/* 专注数据显示 */}
            {(task.pomodoro_count && task.pomodoro_count > 0) || (task.focus_duration && task.focus_duration > 0) ? (
              <div className="task-focus-info">
                {task.pomodoro_count && task.pomodoro_count > 0 && (
                  <span className="focus-pomodoro">🍅 {task.pomodoro_count}</span>
                )}
                {task.focus_duration && task.focus_duration > 0 && (
                  <span className="focus-duration">
                    <ClockCircleOutlined /> {formatFocusDuration(task.focus_duration)}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* 右侧信息 */}
          <div className="task-meta">
            {hasChildren && (
              <span className="children-progress">
                {completedChildren.length}/{children.length}
              </span>
            )}
            {task.due_date && (
              <span className="task-due">{formatDate(task.due_date)}</span>
            )}
          </div>
        </div>
      </Dropdown>

      {/* 递归渲染子任务 */}
      {hasChildren && expanded && (
        <div className="task-children">
          {children.map((child) => (
            <TaskItem key={child.id} task={child} allTasks={allTasks} depth={depth + 1} hideDetails={hideDetails} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskItem;
