import React, { useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { Input, Button, Spin, Empty, message } from 'antd';
import { PlusOutlined, CaretDownOutlined, CaretRightOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import { useTaskContext } from '../contexts/TaskContext';
import { DragProvider } from '../contexts/DragContext';
import { Task, TaskList as TaskListType } from '../types';
import { reorderTasks, moveTask } from '../api/task';
import TaskItem from './TaskItem';
import './TaskList.less';

const supportsHover = window.matchMedia('(hover: hover)').matches;

// 分组组件
interface TaskGroupProps {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  tasks: Task[];
  allTasks: Task[];
  hideDetails?: boolean;
  lists?: TaskListType[];
  onReorder?: (tasks: Task[]) => void;
}

const TaskGroup: React.FC<TaskGroupProps> = ({
  title,
  count,
  collapsed,
  onToggle,
  tasks,
  allTasks,
  hideDetails,
  lists,
  onReorder,
}) => {
  if (tasks.length === 0 && title !== '进行中') {
    return null;
  }

  const isReorderable = supportsHover && title !== '已完成';

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
            tasks.map((task, index) => (
              <TaskItem
                key={task.id}
                task={task}
                allTasks={allTasks}
                depth={0}
                hideDetails={hideDetails}
                lists={lists}
                onMoveUp={isReorderable ? () => {
                  if (index === 0) return;
                  const newTasks = [...tasks];
                  [newTasks[index - 1], newTasks[index]] = [newTasks[index], newTasks[index - 1]];
                  onReorder?.(newTasks);
                } : undefined}
                onMoveDown={isReorderable ? () => {
                  if (index === tasks.length - 1) return;
                  const newTasks = [...tasks];
                  [newTasks[index], newTasks[index + 1]] = [newTasks[index + 1], newTasks[index]];
                  onReorder?.(newTasks);
                } : undefined}
                canMoveUp={index > 0}
                canMoveDown={index < tasks.length - 1}
              />
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
  sortMode?: string;
  hideCompleted?: boolean;
  hideDetails?: boolean;
  completedTasks?: Task[];
  completedTotal?: number;
  completedLoading?: boolean;
  completedLoadingMore?: boolean;
  onLoadMoreCompleted?: () => void;
  lists?: TaskListType[];
}

const sortTasks = (taskList: Task[], mode: string): Task[] => {
  if (mode === 'custom') return taskList;

  return [...taskList].sort((a, b) => {
    switch (mode) {
      case 'time': {
        const timeA = a.due_date || a.start_time || '';
        const timeB = b.due_date || b.start_time || '';
        if (!timeA && !timeB) return 0;
        if (!timeA) return 1;
        if (!timeB) return -1;
        return timeA.localeCompare(timeB);
      }
      case 'title':
        return (a.title || '').localeCompare(b.title || '', 'zh-CN');
      case 'priority': {
        const priorityOrder = (p: number) => (p === 0 ? 5 : p);
        return priorityOrder(a.priority) - priorityOrder(b.priority);
      }
      default:
        return 0;
    }
  });
};

const TaskList: React.FC<TaskListProps> = ({
  sortMode,
  hideCompleted,
  hideDetails,
  completedTasks: externalCompletedTasks,
  completedTotal = 0,
  completedLoading = false,
  completedLoadingMore = false,
  onLoadMoreCompleted,
  lists,
}) => {
  const { tasks, loading, addTask, refreshTasks } = useTaskContext();
  const [searchParams] = useSearchParams();
  const currentListId = searchParams.get('list_id');
  const currentTag = searchParams.get('tag');
  
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [isAddingTask, setIsAddingTask] = useState(false);

  // 拖拽排序处理：分离置顶/非置顶，分别计算 order
  const handleReorder = useCallback(async (reorderedTasks: Task[]) => {
    // 分离置顶和非置顶任务
    const pinnedTasks = reorderedTasks.filter(t => t.is_pinned);
    const unpinnedTasks = reorderedTasks.filter(t => !t.is_pinned);
    // 计算新的 order 值（间隔 10）
    const items: { id: string; order: number }[] = [];
    pinnedTasks.forEach((t, i) => items.push({ id: t.id, order: (i + 1) * 10 }));
    unpinnedTasks.forEach((t, i) => items.push({ id: t.id, order: (i + 1) * 10 }));
    try {
      await reorderTasks(items);
      await refreshTasks();
    } catch {
      message.error('排序失败');
      await refreshTasks();
    }
  }, [refreshTasks]);

  // 将任务移动为另一个任务的子任务，targetTaskId 为空时脱离父任务变为独立任务
  const handleMoveToChild = useCallback(async (sourceTaskId: string, targetTaskId: string) => {
    try {
      await moveTask(sourceTaskId, targetTaskId || undefined);
      await refreshTasks();
      message.success(targetTaskId ? '已移动为子任务' : '已移动为独立任务');
    } catch {
      message.error('移动失败');
      await refreshTasks();
    }
  }, [refreshTasks]);

  // 已完成任务：优先使用外部独立加载的分页数据，否则从 tasks 中过滤
  const hasExternalCompleted = externalCompletedTasks !== undefined;

  // 合并 allTasks 供子任务查找（包括外部已完成任务）
  const allTasksForLookup = hasExternalCompleted
    ? [...tasks, ...externalCompletedTasks]
    : tasks;

  // 构建任务树（只取顶级任务：不被任何其他任务的 child_ids 引用的任务）
  // 使用 allTasksForLookup 而非 tasks，确保已完成主任务的 child_ids 也被收录
  const childIdSet = new Set<string>(
    allTasksForLookup.reduce<string[]>((acc, t) => acc.concat(t.child_ids || []), [])
  );
  const topLevelTasks = allTasksForLookup.filter(t => !childIdSet.has(t.id));

  // 按状态分组并应用排序（pending/inProgress 只从 tasks 取，不含外部已完成）
  const pendingTasks = sortTasks(tasks.filter(t => !childIdSet.has(t.id) && t.status === 'pending'), sortMode || 'custom');
  const inProgressTasks = sortTasks(tasks.filter(t => !childIdSet.has(t.id) && t.status === 'in_progress'), sortMode || 'custom');

  const completedTasks = hideCompleted
    ? []
    : hasExternalCompleted
      ? (() => {
          // 构建外部已完成任务自身的 childIdSet
          const externalChildIdSet = new Set<string>(
            externalCompletedTasks.reduce<string[]>((acc, t) => acc.concat(t.child_ids || []), [])
          );
          // 排除：已在 context tasks 中作为子任务，或在外部已完成任务中作为子任务
          return externalCompletedTasks.filter(t => !childIdSet.has(t.id) && !externalChildIdSet.has(t.id));
        })()
      : topLevelTasks.filter(t => t.status === 'completed');

  // 内联添加任务
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    
    const filter = searchParams.get('filter');
    const taskData: Record<string, unknown> = {
      title: newTaskTitle.trim(),
      list_id: currentListId || undefined,
      tags: currentTag ? [currentTag] : [],
    };

    // 在 today/week 视图中自动设置截止日期，确保任务出现在过滤结果中
    if (filter === 'today' || filter === 'week') {
      taskData.due_date = dayjs().endOf('day').toISOString();
    }

    setIsAddingTask(true);
    try {
      await addTask(taskData);
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
    <DragProvider>
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
          lists={lists}
          onReorder={handleReorder}
          onMoveToChild={handleMoveToChild}
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
          lists={lists}
          onReorder={handleReorder}
          onMoveToChild={handleMoveToChild}
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
              lists={lists}
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
    </DragProvider>
  );
};

export default TaskList;
