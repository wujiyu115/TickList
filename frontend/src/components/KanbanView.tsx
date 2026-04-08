import React, { useState, useMemo } from 'react';
import { Checkbox, Dropdown, Button } from 'antd';
import { PlusOutlined, EllipsisOutlined, CaretDownOutlined, CaretRightOutlined, BellOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import moment from 'moment';
import { Task } from '../types';
import { useTaskContext } from '../contexts/TaskContext';
import TaskContextMenu from './TaskContextMenu';
import './KanbanView.less';

// 列配置
const COLUMNS = [
  { key: 'pending', title: '未完成', status: 'pending' },
  { key: 'in_progress', title: '进行中', status: 'in_progress' },
  { key: 'completed', title: '已完成', status: 'completed' },
];

// 每列默认显示数量
const DEFAULT_VISIBLE_COUNT = 5;

// 单个任务卡片组件
interface KanbanCardProps {
  task: Task;
  allTasks: Task[];
  hideDetails?: boolean;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ task, allTasks, hideDetails }) => {
  const { updateTaskData, selectTask, selectedTask } = useTaskContext();
  const [expanded, setExpanded] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  const isCompleted = task.status === 'completed';
  const isSelected = selectedTask?.id === task.id;

  // 获取子任务
  const children = (task.child_ids || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean) as Task[];
  const hasChildren = children.length > 0;
  const completedChildren = children.filter(t => t.status === 'completed');

  const handleStatusToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await updateTaskData(task.id, {
      status: isCompleted ? 'pending' : 'completed'
    });
  };

  const formatDate = (dateStr: string) => {
    const date = moment(dateStr);
    const today = moment().startOf('day');
    const tomorrow = moment().add(1, 'day').startOf('day');
    
    if (date.isSame(today, 'day')) return '今天';
    if (date.isSame(tomorrow, 'day')) return '明天';
    if (date.year() === today.year()) return date.format('M月D日');
    return date.format('YYYY-M-D');
  };

  const formatTime = (timeStr: string) => {
    return moment(timeStr).format('HH:mm');
  };

  // 获取描述摘要（第一行，以"-"开头）
  const getDescriptionSummary = () => {
    if (!task.description) return null;
    const firstLine = task.description.split('\n')[0].trim();
    if (!firstLine) return null;
    return firstLine.startsWith('-') ? firstLine : `- ${firstLine}`;
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuVisible(true);
  };

  return (
    <div className="kanban-card-wrapper">
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
          className={`kanban-card ${isCompleted ? 'completed' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => selectTask(task)}
          onContextMenu={handleContextMenu}
        >
          {/* 左侧蓝色竖条 */}
          <div className="card-left-bar" />
          
          {/* 卡片内容 */}
          <div className="card-content">
            {/* 第一行：展开箭头 + checkbox + 标题 */}
            <div className="card-header">
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
              
              <span className={`card-checkbox-wrapper priority-${task.priority || 0}`}>
                <Checkbox
                  checked={isCompleted}
                  onClick={handleStatusToggle}
                  className="card-checkbox"
                />
              </span>
              
              <span className="card-title">{task.title}</span>
              
              {hasChildren && (
                <span className="children-count">{task.child_ids?.length}</span>
              )}
            </div>

            {/* 第二行：描述摘要 */}
            {!hideDetails && task.description && (
              <div className="card-description">
                {getDescriptionSummary()}
              </div>
            )}

            {/* 第三行：日期、时间、提醒、优先级等标签 */}
            {!hideDetails && (
              <div className="card-meta">
                {task.due_date && (
                  <span className={`meta-tag date-tag ${moment(task.due_date).isSame(moment(), 'day') ? 'today' : ''}`}>
                    {formatDate(task.due_date)}
                  </span>
                )}
                {task.start_time && (
                  <span className="meta-tag time-tag">
                    {formatTime(task.start_time)}
                  </span>
                )}
                {task.reminder_time && (
                  <span className="meta-tag reminder-tag">
                    <BellOutlined />
                  </span>
                )}
                {task.priority && task.priority > 0 && (
                  <span className={`priority-dot priority-${task.priority}`} />
                )}
              </div>
            )}

            {/* 子任务列表 */}
            {hasChildren && expanded && (
              <div className="card-children">
                {children.map(child => (
                  <KanbanCard
                    key={child.id}
                    task={child}
                    allTasks={allTasks}
                    hideDetails={hideDetails}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </Dropdown>
    </div>
  );
};

// 看板列组件
interface KanbanColumnProps {
  title: string;
  status: string;
  tasks: Task[];
  allTasks: Task[];
  hideDetails?: boolean;
  onAddTask?: () => void;
  // 已完成列的分页加载支持
  totalCount?: number;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  title, 
  status, 
  tasks, 
  allTasks,
  hideDetails,
  onAddTask,
  totalCount,
  loadingMore,
  onLoadMore,
}) => {
  const [showAll, setShowAll] = useState(false);
  
  const visibleTasks = showAll ? tasks : tasks.slice(0, DEFAULT_VISIBLE_COUNT);
  const hasMore = tasks.length > DEFAULT_VISIBLE_COUNT;
  // 是否还有更多远程数据可加载（已完成列分页）
  const hasRemoteMore = totalCount !== undefined && tasks.length < totalCount;

  return (
    <div className="kanban-column">
      {/* 列标题栏 */}
      <div className="column-header">
        <div className="column-title">
          <span className="title-text">{title}</span>
          <span className="task-count">{totalCount !== undefined ? totalCount : tasks.length}</span>
        </div>
        <div className="column-actions">
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={onAddTask}
          />
          <Button
            type="text"
            size="small"
            icon={<EllipsisOutlined />}
          />
        </div>
      </div>

      {/* 任务卡片列表 */}
      <div className="column-content">
        {visibleTasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            allTasks={allTasks}
            hideDetails={hideDetails}
          />
        ))}
        
        {/* 本地查看更多/收起 */}
        {hasMore && !showAll && (
          <div className="show-more" onClick={() => setShowAll(true)}>
            查看更多
          </div>
        )}
        {hasMore && showAll && !hasRemoteMore && (
          <div className="show-more" onClick={() => setShowAll(false)}>
            收起
          </div>
        )}

        {/* 远程分页加载更多（已完成列） */}
        {showAll && hasRemoteMore && onLoadMore && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <Button
              type="link"
              loading={loadingMore}
              onClick={onLoadMore}
            >
              查看更多 ({tasks.length}/{totalCount})
            </Button>
          </div>
        )}
        
        {tasks.length === 0 && (
          <div className="empty-column">暂无任务</div>
        )}
      </div>
    </div>
  );
};

// 主组件
interface KanbanViewProps {
  hideDetails?: boolean;
  completedTasks?: Task[];
  completedTotal?: number;
  completedLoadingMore?: boolean;
  onLoadMoreCompleted?: () => void;
}

const KanbanView: React.FC<KanbanViewProps> = ({
  hideDetails,
  completedTasks = [],
  completedTotal = 0,
  completedLoadingMore = false,
  onLoadMoreCompleted,
}) => {
  const { tasks, addTask } = useTaskContext();
  const [searchParams] = useSearchParams();
  const currentListId = searchParams.get('list_id');
  const currentTag = searchParams.get('tag');

  // 合并未完成任务和已完成任务
  const allTasks = useMemo(() => {
    const taskIds = new Set(tasks.map(t => t.id));
    const uniqueCompleted = completedTasks.filter(t => !taskIds.has(t.id));
    return [...tasks, ...uniqueCompleted];
  }, [tasks, completedTasks]);

  // 构建任务树（只取顶级任务）
  const childIdSet = new Set<string>(
    allTasks.reduce<string[]>((acc, t) => acc.concat(t.child_ids || []), [])
  );
  const topLevelTasks = allTasks.filter(t => !childIdSet.has(t.id));

  // 按状态分组
  const tasksByStatus = {
    pending: topLevelTasks.filter(t => t.status === 'pending'),
    in_progress: topLevelTasks.filter(t => t.status === 'in_progress'),
    completed: topLevelTasks.filter(t => t.status === 'completed'),
  };

  // 添加任务到指定状态列
  const handleAddTask = async (status: string) => {
    await addTask({
      title: '新任务',
      status,
      list_id: currentListId || undefined,
      tags: currentTag ? [currentTag] : [],
    });
  };

  return (
    <div className="kanban-view">
      {COLUMNS.map(column => (
        <KanbanColumn
          key={column.key}
          title={column.title}
          status={column.status}
          tasks={tasksByStatus[column.key as keyof typeof tasksByStatus] || []}
          allTasks={allTasks}
          hideDetails={hideDetails}
          onAddTask={() => handleAddTask(column.status)}
          {...(column.key === 'completed' ? {
            totalCount: completedTotal,
            loadingMore: completedLoadingMore,
            onLoadMore: onLoadMoreCompleted,
          } : {})}
        />
      ))}
    </div>
  );
};

export default KanbanView;
