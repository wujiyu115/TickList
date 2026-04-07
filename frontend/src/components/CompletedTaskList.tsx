import React, { useState, useEffect, useMemo } from 'react';
import { Button, Dropdown, Checkbox, Spin, Empty } from 'antd';
import { DownOutlined, CaretDownOutlined, CaretRightOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import moment from 'moment';
import { useTaskContext } from '../contexts/TaskContext';
import { Task, TaskList as TaskListType } from '../types';
import { getLists } from '../api/list';
import './CompletedTaskList.less';

// 日期筛选选项
const DATE_OPTIONS = [
  { key: 'all', label: '所有日期' },
  { key: 'today', label: '今天' },
  { key: 'yesterday', label: '昨天' },
  { key: 'this_week', label: '本周' },
  { key: 'last_week', label: '上周' },
  { key: 'this_month', label: '本月' },
  { key: 'last_month', label: '上月' },
];

interface CompletedTaskGroupProps {
  dateKey: string;
  dateLabel: string;
  tasks: Task[];
  lists: TaskListType[];
  collapsed: boolean;
  onToggle: () => void;
  onTaskSelect: (task: Task) => void;
  onTaskStatusToggle: (taskId: string, currentStatus: string) => void;
  selectedTaskId?: string;
  allTasks: Task[];
}

const CompletedTaskGroup: React.FC<CompletedTaskGroupProps> = ({
  dateKey,
  dateLabel,
  tasks,
  lists,
  collapsed,
  onToggle,
  onTaskSelect,
  onTaskStatusToggle,
  selectedTaskId,
  allTasks,
}) => {
  const getListInfo = (listId?: string) => {
    if (!listId) return null;
    if (listId === 'inbox') return { name: '收集箱', color: '#8c8c8c' };
    const list = lists.find(l => l.id === listId);
    return list ? { name: list.name, color: list.color } : null;
  };

  // 格式化子任务进度
  const getChildrenProgress = (task: Task) => {
    const children = (task.child_ids || [])
      .map(id => allTasks.find(t => t.id === id))
      .filter(Boolean) as Task[];
    if (children.length === 0) return null;
    const completedCount = children.filter(t => t.status === 'completed').length;
    return {
      completed: completedCount,
      total: children.length,
      dueDate: task.due_date,
    };
  };

  return (
    <div className="completed-group">
      <div className="completed-group-header" onClick={onToggle}>
        <span className="expand-icon">
          {collapsed ? <CaretRightOutlined /> : <CaretDownOutlined />}
        </span>
        <span className="group-date">{dateLabel}</span>
        <span className="group-count">{tasks.length}</span>
      </div>
      {!collapsed && (
        <div className="completed-group-content">
          {tasks.map(task => {
            const listInfo = getListInfo(task.list_id);
            const progress = getChildrenProgress(task);
            const isSelected = selectedTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`completed-task-item ${isSelected ? 'selected' : ''}`}
                onClick={() => onTaskSelect(task)}
              >
                <span className="task-checkbox-wrapper completed">
                  <Checkbox
                    checked={true}
                    onChange={(e) => {
                      e.stopPropagation();
                      onTaskStatusToggle(task.id, task.status);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="task-checkbox"
                  />
                </span>
                <div className="task-content">
                  <div className="task-title">{task.title}</div>
                  {task.description && (
                    <div className="task-desc">- {task.description.split('\n')[0]}</div>
                  )}
                  {listInfo && (
                    <div className="task-list-tag">
                      <span className="list-dot" style={{ backgroundColor: listInfo.color }} />
                      <span className="list-name">{listInfo.name}</span>
                    </div>
                  )}
                </div>
                <div className="task-meta">
                  {progress && (
                    <span className="children-progress">
                      <ClockCircleOutlined />
                      <span>{progress.completed}/{progress.total}</span>
                      {progress.dueDate && (
                        <span className="due-date">{moment(progress.dueDate).format('M月D日')}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface CompletedTaskListProps {
  tasks: Task[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

const CompletedTaskList: React.FC<CompletedTaskListProps> = ({
  tasks,
  total,
  loading,
  loadingMore,
  onLoadMore,
}) => {
  const { updateTaskData, selectTask, selectedTask } = useTaskContext();
  const [lists, setLists] = useState<TaskListType[]>([]);
  const [dateFilter, setDateFilter] = useState('all');
  const [listFilter, setListFilter] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // 加载清单数据
  useEffect(() => {
    const loadLists = async () => {
      try {
        const res = await getLists();
        setLists(res.lists || []);
      } catch (e) {
        console.error('Failed to load lists:', e);
      }
    };
    loadLists();
  }, []);

  // 获取当前日期筛选的标签
  const currentDateLabel = DATE_OPTIONS.find(o => o.key === dateFilter)?.label || '所有日期';

  // 获取当前清单筛选的标签
  const currentListLabel = useMemo(() => {
    if (!listFilter) return '所有清单';
    if (listFilter === 'inbox') return '收集箱';
    const list = lists.find(l => l.id === listFilter);
    return list ? list.name : '所有清单';
  }, [listFilter, lists]);

  // 筛选任务（props 传入的已经是已完成任务，只做日期和清单筛选）
  const filteredTasks = useMemo(() => {
    let result = tasks;

    // 日期筛选
    if (dateFilter !== 'all') {
      const now = moment();
      const today = moment().startOf('day');
      const yesterday = moment().subtract(1, 'day').startOf('day');
      const thisWeekStart = moment().startOf('week');
      const lastWeekStart = moment().subtract(1, 'week').startOf('week');
      const lastWeekEnd = moment().subtract(1, 'week').endOf('week');
      const thisMonthStart = moment().startOf('month');
      const lastMonthStart = moment().subtract(1, 'month').startOf('month');
      const lastMonthEnd = moment().subtract(1, 'month').endOf('month');

      result = result.filter(task => {
        if (!task.completed_at) return false;
        const completedAt = moment(task.completed_at);
        
        switch (dateFilter) {
          case 'today':
            return completedAt.isSame(today, 'day');
          case 'yesterday':
            return completedAt.isSame(yesterday, 'day');
          case 'this_week':
            return completedAt.isSameOrAfter(thisWeekStart);
          case 'last_week':
            return completedAt.isBetween(lastWeekStart, lastWeekEnd, 'day', '[]');
          case 'this_month':
            return completedAt.isSameOrAfter(thisMonthStart);
          case 'last_month':
            return completedAt.isBetween(lastMonthStart, lastMonthEnd, 'day', '[]');
          default:
            return true;
        }
      });
    }

    // 清单筛选
    if (listFilter) {
      if (listFilter === 'inbox') {
        result = result.filter(t => t.list_id === 'inbox' || !t.list_id);
      } else {
        result = result.filter(t => t.list_id === listFilter);
      }
    }

    return result;
  }, [tasks, dateFilter, listFilter]);

  // 按完成日期分组
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    
    filteredTasks.forEach(task => {
      const completedAt = task.completed_at ? moment(task.completed_at) : moment();
      const dateKey = completedAt.format('YYYY-MM-DD');
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(task);
    });

    // 按日期降序排序
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map(key => ({
      dateKey: key,
      tasks: groups[key],
    }));
  }, [filteredTasks]);

  // 格式化日期标签
  const formatDateLabel = (dateKey: string) => {
    const date = moment(dateKey);
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const weekday = weekdays[date.day()];
    return `${date.format('M月D日')} ${weekday}`;
  };

  // 日期筛选菜单
  const dateMenuItems: MenuProps['items'] = DATE_OPTIONS.map(opt => ({
    key: opt.key,
    label: opt.label,
    onClick: () => setDateFilter(opt.key),
  }));

  // 清单筛选菜单
  const listMenuItems: MenuProps['items'] = [
    { key: 'all', label: '所有清单', onClick: () => setListFilter(null) },
    { key: 'inbox', label: '收集箱', onClick: () => setListFilter('inbox') },
    { type: 'divider' },
    ...lists.filter(l => l.type === 'list').map(l => ({
      key: l.id,
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: l.color }} />
          {l.name}
        </span>
      ),
      onClick: () => setListFilter(l.id),
    })),
  ];

  // 切换分组折叠
  const toggleGroup = (dateKey: string) => {
    setCollapsedGroups(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  // 切换任务状态
  const handleTaskStatusToggle = async (taskId: string, currentStatus: string) => {
    await updateTaskData(taskId, {
      status: currentStatus === 'completed' ? 'pending' : 'completed',
    });
  };

  if (loading && tasks.length === 0) {
    return (
      <div className="completed-task-list-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="completed-task-list">
      {/* 筛选栏 */}
      <div className="filter-bar">
        <Dropdown menu={{ items: dateMenuItems }} trigger={['click']}>
          <Button className="filter-btn">
            {currentDateLabel} <DownOutlined />
          </Button>
        </Dropdown>
        <Dropdown menu={{ items: listMenuItems }} trigger={['click']}>
          <Button className="filter-btn">
            {currentListLabel} <DownOutlined />
          </Button>
        </Dropdown>
      </div>

      {/* 分组列表 */}
      <div className="completed-groups">
        {groupedTasks.map(group => (
          <CompletedTaskGroup
            key={group.dateKey}
            dateKey={group.dateKey}
            dateLabel={formatDateLabel(group.dateKey)}
            tasks={group.tasks}
            lists={lists}
            collapsed={!!collapsedGroups[group.dateKey]}
            onToggle={() => toggleGroup(group.dateKey)}
            onTaskSelect={selectTask}
            onTaskStatusToggle={handleTaskStatusToggle}
            selectedTaskId={selectedTask?.id}
            allTasks={tasks}
          />
        ))}
      </div>

      {filteredTasks.length === 0 && !loading && (
        <Empty description="暂无已完成的任务" className="empty-state" />
      )}

      {tasks.length < total && (
        <div className="load-more-container" style={{ textAlign: 'center', padding: '16px 0' }}>
          <Button type="link" loading={loadingMore} onClick={onLoadMore}>
            查看更多
          </Button>
        </div>
      )}
    </div>
  );
};

export default CompletedTaskList;
