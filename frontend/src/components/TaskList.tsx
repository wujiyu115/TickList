import React, { useState } from 'react';
import { Input, Button, Spin, Empty } from 'antd';
import { PlusOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useTaskContext } from '../contexts/TaskContext';
import { Task } from '../types';
import TaskItem from './TaskItem';
import './TaskList.less';

// 分组组件
interface TaskGroupProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  tasks: Task[];
  allTasks: Task[];
  hideDetails?: boolean;
}

const TaskGroup: React.FC<TaskGroupProps> = ({ 
  title, 
  count, 
  collapsed, 
  onToggle, 
  tasks,
  allTasks,
  hideDetails
}) => {
  if (tasks.length === 0 && title !== '进行中') {
    return null;
  }

  return (
    <div className="task-group">
      <div className="task-group-header" onClick={onToggle}>
        <span className="expand-icon">
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </span>
        <span className="group-title">{title}</span>
        <span className="group-count">{count}</span>
      </div>
      {!collapsed && (
        <div className="task-group-content">
          {tasks.length > 0 ? (
            tasks.map(task => (
              <TaskItem key={task.id} task={task} allTasks={allTasks} depth={0} hideDetails={hideDetails} />
            ))
          ) : (
            <div className="empty-group">暂无任务</div>
          )}
        </div>
      )}
    </div>
  );
};

interface TaskListProps {
  hideCompleted?: boolean;
  hideDetails?: boolean;
  completedTasks?: Task[];
  completedTotal?: number;
  completedLoading?: boolean;
  completedLoadingMore?: boolean;
  onLoadMoreCompleted?: () => void;
}

const TaskList: React.FC<TaskListProps> = ({
  hideCompleted,
  hideDetails,
  completedTasks: externalCompletedTasks,
  completedTotal = 0,
  completedLoading = false,
  completedLoadingMore = false,
  onLoadMoreCompleted,
}) => {
  const { tasks, loading, addTask } = useTaskContext();
  const [searchParams] = useSearchParams();
  const currentListId = searchParams.get('list_id');
  const currentTag = searchParams.get('tag');
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isAddingTask, setIsAddingTask] = useState(false);

  // 构建任务树（只取顶级任务：不被任何其他任务的 child_ids 引用的任务）
  const childIdSet = new Set<string>(
    tasks.reduce<string[]>((acc, t) => acc.concat(t.child_ids || []), [])
  );
  const topLevelTasks = tasks.filter(t => !childIdSet.has(t.id));

  // 按状态分组
  const pendingTasks = topLevelTasks.filter(t => t.status === 'pending');
  const inProgressTasks = topLevelTasks.filter(t => t.status === 'in_progress');

  // 已完成任务：优先使用外部独立加载的分页数据，否则从 tasks 中过滤
  const hasExternalCompleted = externalCompletedTasks !== undefined;
  const completedTasks = hideCompleted
    ? []
    : hasExternalCompleted
      ? externalCompletedTasks
      : topLevelTasks.filter(t => t.status === 'completed');

  // 合并 allTasks 供子任务查找（包括外部已完成任务）
  const allTasksForLookup = hasExternalCompleted
    ? [...tasks, ...externalCompletedTasks]
    : tasks;

  // 内联添加任务
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    
    setIsAddingTask(true);
    try {
      await addTask({
        title: newTaskTitle.trim(),
        // 如果在收集箱中创建任务，设置 list_id 为 'inbox'
        list_id: currentListId || undefined,
        tags: currentTag ? [currentTag] : [],
      });
      setNewTaskTitle('');
    } finally {
      setIsAddingTask(false);
    }
  };

  // 分组折叠/展开
  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="task-list-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="task-list-new">
      {/* 内联添加任务 */}
      <div className="add-task-inline">
        <PlusOutlined className="add-icon" />
        <Input
          placeholder="添加任务"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          onPressEnter={handleAddTask}
          variant="borderless"
          disabled={isAddingTask}
          className="add-input"
        />
      </div>

      {/* 任务分组列表 */}
      <div className="task-groups">
        {/* 未完成 */}
        <TaskGroup 
          title="未完成" 
          count={pendingTasks.length}
          collapsed={!!collapsedGroups['pending']}
          onToggle={() => toggleGroup('pending')}
          tasks={pendingTasks}
          allTasks={allTasksForLookup}
          hideDetails={hideDetails}
        />

        {/* 进行中 */}
        <TaskGroup 
          title="进行中"
          count={inProgressTasks.length}
          collapsed={!!collapsedGroups['in_progress']}
          onToggle={() => toggleGroup('in_progress')}
          tasks={inProgressTasks}
          allTasks={allTasksForLookup}
          hideDetails={hideDetails}
        />

        {/* 已完成 */}
        {!hideCompleted && (
          <>
            <TaskGroup
              title="已完成"
              count={hasExternalCompleted ? completedTotal : completedTasks.length}
              collapsed={!!collapsedGroups['completed']}
              onToggle={() => toggleGroup('completed')}
              tasks={completedTasks}
              allTasks={allTasksForLookup}
              hideDetails={hideDetails}
            />
            {hasExternalCompleted && !collapsedGroups['completed'] && completedTasks.length < completedTotal && (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <Button
                  type="link"
                  loading={completedLoadingMore}
                  onClick={onLoadMoreCompleted}
                >
                  查看更多已完成任务 ({completedTasks.length}/{completedTotal})
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {tasks.length === 0 && !loading && (
        <Empty description="暂无任务" className="empty-state" />
      )}
    </div>
  );
};

export default TaskList;
