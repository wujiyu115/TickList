import React, { useState } from 'react';
import { Input, Spin, Empty } from 'antd';
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
}

const TaskGroup: React.FC<TaskGroupProps> = ({ 
  title, 
  count, 
  collapsed, 
  onToggle, 
  tasks,
  allTasks 
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
              <TaskItem key={task.id} task={task} allTasks={allTasks} depth={0} />
            ))
          ) : (
            <div className="empty-group">暂无任务</div>
          )}
        </div>
      )}
    </div>
  );
};

const TaskList: React.FC = () => {
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
  const completedTasks = topLevelTasks.filter(t => t.status === 'completed');

  // 内联添加任务
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    
    setIsAddingTask(true);
    try {
      await addTask({
        title: newTaskTitle.trim(),
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
          allTasks={tasks}
        />

        {/* 进行中 */}
        <TaskGroup 
          title="进行中"
          count={inProgressTasks.length}
          collapsed={!!collapsedGroups['in_progress']}
          onToggle={() => toggleGroup('in_progress')}
          tasks={inProgressTasks}
          allTasks={tasks}
        />

        {/* 已完成 */}
        <TaskGroup
          title="已完成"
          count={completedTasks.length}
          collapsed={!!collapsedGroups['completed']}
          onToggle={() => toggleGroup('completed')}
          tasks={completedTasks}
          allTasks={tasks}
        />
      </div>

      {tasks.length === 0 && !loading && (
        <Empty description="暂无任务" className="empty-state" />
      )}
    </div>
  );
};

export default TaskList;
