import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Button, Popover, Checkbox, Divider, Tooltip, Popconfirm, Spin, Empty, message, Dropdown, Drawer } from 'antd';
import { 
  UnorderedListOutlined, 
  SortAscendingOutlined, 
  EllipsisOutlined, 
  AppstoreOutlined,
  MenuOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useTaskContext } from '../contexts/TaskContext';
import TaskList from '../components/TaskList';
import KanbanView from '../components/KanbanView';
import CompletedTaskList from '../components/CompletedTaskList';
import TaskEditor from '../components/TaskEditor';
import TaskContextMenu from '../components/TaskContextMenu';
import { useLongPress } from '../hooks/useLongPress';
import { getLists } from '../api/list';
import { getTags } from '../api/tag';
import { getFilters } from '../api/filter';
import { getSettings } from '../api/settings';
import { getTrashTasks, emptyTrash, getTasks } from '../api/task';
import { Task, TaskList as TaskListType, Tag, Filter } from '../types';
import './TaskPage.less';

// 垃圾箱任务项组件（支持长按右键菜单）
interface TrashTaskItemProps {
  task: Task;
  isContextMenuOpen: boolean;
  onContextMenuChange: (open: boolean) => void;
  onClose: () => void;
}

const TrashTaskItem: React.FC<TrashTaskItemProps> = ({ task, isContextMenuOpen, onContextMenuChange, onClose }) => {
  const longPressHandlers = useLongPress({
    onLongPress: () => onContextMenuChange(true),
  });

  return (
    <Dropdown
      open={isContextMenuOpen}
      onOpenChange={onContextMenuChange}
      dropdownRender={() => (
        <TaskContextMenu
          task={task}
          isTrashView={true}
          onClose={onClose}
        />
      )}
      trigger={['contextMenu']}
    >
      <div
        className="trash-task-item"
        style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (longPressHandlers.isLongPress.current) {
            longPressHandlers.isLongPress.current = false;
            return;
          }
        }}
        onTouchStart={longPressHandlers.onTouchStart}
        onTouchMove={longPressHandlers.onTouchMove}
        onTouchEnd={longPressHandlers.onTouchEnd}
      >
        <div className="trash-task-content">
          <div className="trash-task-title">{task.title}</div>
          {task.description && (
            <div className="trash-task-desc">{task.description.split('\n')[0]}</div>
          )}
        </div>
      </div>
    </Dropdown>
  );
};

// 视图类型
type ViewMode = 'list' | 'kanban';

const PAGE_SIZE = 50;

const TaskPage: React.FC = () => {
  const { fetchTasks, selectedTask, selectTask } = useTaskContext();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = searchParams.get('filter');
  const listId = searchParams.get('list_id');
  const tagFilter = searchParams.get('tag');
  const filterId = searchParams.get('filter_id');
  const tagsParam = searchParams.get('tags');
  const priorityParam = searchParams.get('priority');
  const keywordParam = searchParams.get('keyword');
  
  // 无任何筛选参数时，恢复上次的筛选状态或默认展示今天的任务
  useEffect(() => {
    if (!filter && !listId && !tagFilter && !filterId && !tagsParam && !priorityParam && !keywordParam) {
      const lastTaskUrl = sessionStorage.getItem('lastTaskViewSearch');
      if (lastTaskUrl) {
        navigate(`/${lastTaskUrl}`, { replace: true });
      } else {
        navigate('/?filter=today', { replace: true });
      }
    }
  }, [filter, listId, tagFilter, filterId, tagsParam, priorityParam, keywordParam, navigate]);

  // 记住当前筛选状态
  useEffect(() => {
    const search = searchParams.toString();
    if (search) {
      sessionStorage.setItem('lastTaskViewSearch', `?${search}`);
    }
  }, [searchParams]);
  
  // 清单、标签和过滤器数据用于显示标题
  const [lists, setLists] = useState<TaskListType[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  // 同步计算 activeFilter，避免与主 useEffect 的时序竞争
  const activeFilter = useMemo(() => {
    if (filterId && filters.length > 0) {
      return filters.find(f => f.id === filterId) || null;
    }
    return null;
  }, [filterId, filters]);

  // 视图模式状态 - 等待用户设置加载后更新
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const userManuallyChangedView = useRef(false); // 标记用户是否已手动切换视图
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sortMode, setSortMode] = useState<string>('custom');
  const [hideCompleted, setHideCompleted] = useState(() => {
    return localStorage.getItem('hideCompleted') === 'true';
  });
  const [hideDetails, setHideDetails] = useState(() => {
    return localStorage.getItem('hideDetails') === 'true';
  });

  // 垃圾箱分页状态
  const [trashTasks, setTrashTasks] = useState<Task[]>([]);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashPage, setTrashPage] = useState(1);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashLoadingMore, setTrashLoadingMore] = useState(false);

  // 已完成分页状态
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [completedLoadingMore, setCompletedLoadingMore] = useState(false);

  // 垃圾箱右键菜单状态
  const [trashContextTaskId, setTrashContextTaskId] = useState<string | null>(null);
  
  // 加载清单、标签、过滤器和用户设置
  useEffect(() => {
    const loadData = async () => {
      try {
        const [listsRes, tagsRes, filtersRes, settingsRes] = await Promise.all([
          getLists(), 
          getTags(), 
          getFilters(),
          getSettings()
        ]);
        setLists(listsRes.lists || []);
        setTags(tagsRes.tags || []);
        setFilters(filtersRes.filters || []);
        
        // 如果用户没有手动切换视图，使用用户设置中的默认任务视图
        if (!userManuallyChangedView.current && settingsRes?.default_task_view) {
          const defaultMode = settingsRes.default_task_view as ViewMode;
          if (defaultMode === 'list' || defaultMode === 'kanban') {
            setViewMode(defaultMode);
          }
        }
      } catch (e) {
        console.error('Failed to load lists/tags/filters:', e);
      }
    };
    loadData();
  }, []);

  // 监听过滤器更新事件，刷新 filters 数据以更新 activeFilter
  useEffect(() => {
    const handleFiltersUpdated = async () => {
      try {
        const filtersRes = await getFilters();
        setFilters(filtersRes.filters || []);
      } catch (e) {
        console.error('Failed to reload filters:', e);
      }
    };
    window.addEventListener('filters-updated', handleFiltersUpdated);
    return () => window.removeEventListener('filters-updated', handleFiltersUpdated);
  }, []);

  // 加载垃圾箱任务
  const loadTrashTasks = useCallback(async (page: number, append: boolean = false) => {
    if (page === 1) {
      setTrashLoading(true);
    } else {
      setTrashLoadingMore(true);
    }
    try {
      const res = await getTrashTasks({ page, page_size: PAGE_SIZE });
      const newTasks = res.tasks || [];
      if (append) {
        setTrashTasks(prev => [...prev, ...newTasks]);
      } else {
        setTrashTasks(newTasks);
      }
      setTrashTotal(res.total || 0);
      setTrashPage(page);
    } catch (error) {
      console.error('Failed to load trash tasks:', error);
    } finally {
      setTrashLoading(false);
      setTrashLoadingMore(false);
    }
  }, []);

  // 加载已完成任务（分页），支持传入视图过滤参数
  const loadCompletedTasks = useCallback(async (page: number, append: boolean = false, filterParams: any = {}) => {
    if (page === 1) {
      setCompletedLoading(true);
    } else {
      setCompletedLoadingMore(true);
    }
    try {
      const res = await getTasks({
        ...filterParams,
        status: 'completed',
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      const newTasks = res.tasks || [];
      if (append) {
        setCompletedTasks(prev => [...prev, ...newTasks]);
      } else {
        setCompletedTasks(newTasks);
      }
      setCompletedTotal(res.total || 0);
      setCompletedPage(page);
    } catch (error) {
      console.error('Failed to load completed tasks:', error);
    } finally {
      setCompletedLoading(false);
      setCompletedLoadingMore(false);
    }
  }, []);

  // 保存当前视图的过滤参数，供"查看更多"和刷新时使用
  const currentViewParamsRef = useRef<any>({});

  // 切换视图模式
  const handleViewModeChange = (mode: ViewMode) => {
    userManuallyChangedView.current = true; // 标记用户已手动切换
    setViewMode(mode);
  };

  // 切换隐藏已完成
  const handleHideCompletedChange = (checked: boolean) => {
    setHideCompleted(checked);
    localStorage.setItem('hideCompleted', String(checked));
  };

  // 切换隐藏详细
  const handleHideDetailsChange = (checked: boolean) => {
    setHideDetails(checked);
    localStorage.setItem('hideDetails', String(checked));
  };

  // 跳转到设置页面
  const handleGoToSettings = () => {
    setViewMenuOpen(false);
    navigate('/settings');
  };

  // 视图切换下拉菜单内容
  const viewMenuContent = (
    <div className="view-menu-content">
      <div className="view-menu-section">
        <div className="section-title">视图</div>
        <div className="view-icons">
          <Tooltip title="列表视图">
            <div 
              className={`view-icon ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('list')}
            >
              <UnorderedListOutlined />
            </div>
          </Tooltip>
          <Tooltip title="看板视图">
            <div 
              className={`view-icon ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('kanban')}
            >
              <AppstoreOutlined />
            </div>
          </Tooltip>
        </div>
      </div>
      <Divider style={{ margin: '12px 0' }} />
      <div className="view-menu-options">
        <div className="menu-option" onClick={() => handleHideCompletedChange(!hideCompleted)}>
          <Checkbox checked={hideCompleted} />
          <span>隐藏已完成</span>
        </div>
        <div className="menu-option" onClick={() => handleHideDetailsChange(!hideDetails)}>
          <MenuOutlined style={{ fontSize: 14, marginRight: 8 }} />
          <span>隐藏详细</span>
        </div>
      </div>
    </div>
  );

  // 当视图切换时，重置分页状态并加载数据
  useEffect(() => {
    // 无任何筛选参数时跳过加载，等待 useEffect 1 导航到默认过滤条件
    if (!filter && !listId && !tagFilter && !filterId && !tagsParam && !priorityParam && !keywordParam) {
      return;
    }

    const isTrashView = filter === 'trash';
    const isCompletedView = filter === 'completed';

    if (isTrashView) {
      // 重置垃圾箱分页状态
      setTrashTasks([]);
      setTrashTotal(0);
      setTrashPage(1);
      selectTask(null); // 垃圾箱中不选中任务
      loadTrashTasks(1);
      return;
    }

    if (isCompletedView) {
      // 重置已完成分页状态
      setCompletedTasks([]);
      setCompletedTotal(0);
      setCompletedPage(1);
      loadCompletedTasks(1);
      return;
    }

    // 其他视图走分离加载逻辑
    const params: any = {};
      
    // 如果有 filter_id，使用过滤器的条件
    if (activeFilter) {
      const conditions = activeFilter.conditions;
        
      // 清单筛选
      if (conditions.list_id) {
        params.list_id = conditions.list_id;
      }
        
      // 标签筛选
      if (conditions.tags && conditions.tags.length > 0) {
        params.tags = conditions.tags.join(',');
      }
        
      // 日期范围筛选（使用 toISOString 保持与数据库 UTC 存储一致）
      if (conditions.date_range) {
        const todayStart = dayjs().startOf('day').toISOString();
        if (conditions.date_range === 'today') {
          params.start_date = todayStart;
          params.end_date = dayjs().add(1, 'day').startOf('day').toISOString();
        } else if (conditions.date_range === 'week') {
          params.start_date = todayStart;
          params.end_date = dayjs().add(7, 'day').startOf('day').toISOString();
        } else if (conditions.date_range === 'month') {
          params.start_date = todayStart;
          params.end_date = dayjs().endOf('month').endOf('day').toISOString();
        }
      }
        
      // 优先级筛选
      if (conditions.priority && conditions.priority.length > 0) {
        params.priority = conditions.priority.join(',');
      }
        
      // 关键词筛选
      if (conditions.keyword) {
        params.keyword = conditions.keyword;
      }
    } else {
      // 原有的筛选逻辑
      if (filter === 'today') {
        params.start_date = dayjs().startOf('day').toISOString();
        params.end_date = dayjs().add(1, 'day').startOf('day').toISOString();
      } else if (filter === 'week') {
        params.start_date = dayjs().startOf('day').toISOString();
        params.end_date = dayjs().add(7, 'day').startOf('day').toISOString();
      }
        
      // 按清单筛选
      if (listId) {
        params.list_id = listId;
      }
        
      // 按标签筛选
      if (tagFilter) {
        params.tags = tagFilter;
      }
        
      // URL 参数中的多标签筛选
      if (tagsParam) {
        params.tags = tagsParam;
      }
        
      // URL 参数中的优先级筛选
      if (priorityParam) {
        params.priority = priorityParam;
      }
        
      // URL 参数中的关键词筛选
      if (keywordParam) {
        params.keyword = keywordParam;
      }
    }

    // 保存当前视图参数，供"查看更多"和刷新时使用
    currentViewParamsRef.current = params;

    // 1. 加载进行中+未完成任务（全量，排除已完成）
    fetchTasks({ ...params, exclude_status: 'completed' });

    // 2. 独立加载已完成任务（分页，第一页）
    setCompletedTasks([]);
    setCompletedTotal(0);
    setCompletedPage(1);
    loadCompletedTasks(1, false, params);
  }, [filter, listId, tagFilter, activeFilter, tagsParam, priorityParam, keywordParam]);

  // 垃圾箱 - 查看更多
  const handleTrashLoadMore = () => {
    loadTrashTasks(trashPage + 1, true);
  };

  // 已完成 - 查看更多
  const handleCompletedLoadMore = () => {
    loadCompletedTasks(completedPage + 1, true, currentViewParamsRef.current);
  };

  // 监听 tasks-refreshed 事件，同步刷新当前视图的已完成任务
  useEffect(() => {
    const isTrashView = filter === 'trash';
    const isCompletedView = filter === 'completed';
    if (isTrashView || isCompletedView) return;

    const handleTasksRefreshed = () => {
      // 刷新时重新加载已完成任务第一页
      loadCompletedTasks(1, false, currentViewParamsRef.current);
    };
    window.addEventListener('tasks-refreshed', handleTasksRefreshed);
    return () => window.removeEventListener('tasks-refreshed', handleTasksRefreshed);
  }, [filter, loadCompletedTasks]);

  // 清空垃圾箱
  const handleEmptyTrash = async () => {
    try {
      await emptyTrash();
      message.success('垃圾箱已清空');
      setTrashTasks([]);
      setTrashTotal(0);
      setTrashPage(1);
    } catch (error) {
      message.error('清空垃圾箱失败');
      console.error('Failed to empty trash:', error);
    }
  };

  // 从垃圾箱列表中移除任务（恢复或永久删除后调用）
  const removeFromTrash = useCallback((taskId: string) => {
    setTrashTasks(prev => prev.filter(t => t.id !== taskId));
    setTrashTotal(prev => Math.max(0, prev - 1));
  }, []);

  const getFilterTitle = () => {
    // 如果有激活的过滤器，显示过滤器名称
    if (activeFilter) {
      return activeFilter.name;
    }
    
    // 优先显示清单名称
    if (listId) {
      // 收集箱是特殊的 list_id
      if (listId === 'inbox') {
        return '收集箱';
      }
      const list = lists.find(l => l.id === listId);
      return list ? list.name : '清单';
    }
    
    // 显示标签名称
    if (tagFilter) {
      return `# ${tagFilter}`;
    }
    
    switch (filter) {
      case 'today':
        return '今天';
      case 'week':
        return '最近7天';
      case 'completed':
        return '已完成';
      case 'trash':
        return '垃圾桶';
      default:
        return '所有任务';
    }
  };

  // 是否是已完成视图
  const isCompletedView = filter === 'completed';
  // 是否是垃圾箱视图
  const isTrashView = filter === 'trash';

  // 渲染主内容区域
  const renderContent = () => {
    // 垃圾箱视图
    if (isTrashView) {
      if (trashLoading && trashTasks.length === 0) {
        return (
          <div className="task-list-loading" style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <Spin size="large" />
          </div>
        );
      }

      if (trashTasks.length === 0 && !trashLoading) {
        return <Empty description="垃圾箱为空" style={{ marginTop: 48 }} />;
      }

      return (
        <div className="trash-task-list" style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
          {trashTasks.map(task => (
            <TrashTaskItem
              key={task.id}
              task={task}
              isContextMenuOpen={trashContextTaskId === task.id}
              onContextMenuChange={(open) => setTrashContextTaskId(open ? task.id : null)}
              onClose={() => {
                setTrashContextTaskId(null);
                loadTrashTasks(1);
              }}
            />
          ))}
          {trashTasks.length < trashTotal && (
            <div className="load-more-container" style={{ textAlign: 'center', padding: '16px 0' }}>
              <Button type="link" loading={trashLoadingMore} onClick={handleTrashLoadMore}>
                查看更多
              </Button>
            </div>
          )}
        </div>
      );
    }

    // 已完成视图 - 使用分页数据
    if (isCompletedView) {
      return (
        <CompletedTaskList
          tasks={completedTasks}
          total={completedTotal}
          loading={completedLoading}
          loadingMore={completedLoadingMore}
          onLoadMore={handleCompletedLoadMore}
        />
      );
    }

    if (viewMode === 'kanban') {
      return (
        <KanbanView
          hideDetails={hideDetails}
          completedTasks={completedTasks}
          completedTotal={completedTotal}
          completedLoadingMore={completedLoadingMore}
          onLoadMoreCompleted={handleCompletedLoadMore}
        />
      );
    }
    // 是否需要显示清单标签（今天/最近7天视图）
    const showListTag = filter === 'today' || filter === 'week';

    return (
      <TaskList
        sortMode={sortMode}
        hideCompleted={hideCompleted}
        hideDetails={hideDetails}
        completedTasks={completedTasks}
        completedTotal={completedTotal}
        completedLoading={completedLoading}
        completedLoadingMore={completedLoadingMore}
        onLoadMoreCompleted={handleCompletedLoadMore}
        lists={showListTag ? lists : undefined}
      />
    );
  };

  return (
    <div className="task-page">
      {/* 左侧列表区域 */}
      <div className="task-page-left">
        {/* 顶部工具栏 */}
        <div className="task-toolbar">
          <div className="toolbar-left">
            <h2 className="page-title">{getFilterTitle()}</h2>
          </div>
          <div className="toolbar-right">
            {isTrashView ? (
              trashTasks.length > 0 && (
                <Popconfirm
                  title="确定清空垃圾箱？"
                  description="所有任务将被永久删除，无法恢复。"
                  onConfirm={handleEmptyTrash}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="text" icon={<DeleteOutlined />} danger>
                    清空垃圾箱
                  </Button>
                </Popconfirm>
              )
            ) : (
              <>
                <Dropdown
                  menu={{
                    items: [
                      { key: 'custom', label: '自定义' },
                      { key: 'time', label: '时间' },
                      { key: 'title', label: '标题' },
                      { key: 'priority', label: '优先级' },
                    ],
                    selectedKeys: [sortMode],
                    onClick: ({ key }) => setSortMode(key),
                  }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button type="text" icon={<SortAscendingOutlined />}>排序</Button>
                </Dropdown>
                <Popover
                  content={viewMenuContent}
                  trigger="click"
                  placement="bottomRight"
                  open={viewMenuOpen}
                  onOpenChange={setViewMenuOpen}
                  overlayClassName="view-menu-popover"
                >
                  <Button type="text" icon={<EllipsisOutlined />} />
                </Popover>
              </>
            )}
          </div>
        </div>
        {renderContent()}
      </div>
      
      {/* 右侧详情区域 - 选中任务时显示（垃圾箱中不显示编辑器） */}
      {selectedTask && !isTrashView && (
        isMobile ? (
          <Drawer
            open={!!selectedTask}
            onClose={() => selectTask(null)}
            placement="bottom"
            height="100%"
            closable={false}
            styles={{ body: { padding: 0 } }}
            className="task-editor-drawer"
          >
            <TaskEditor />
          </Drawer>
        ) : (
          <div className="task-page-right">
            <TaskEditor />
          </div>
        )
      )}
    </div>
  );
};

export default TaskPage;
