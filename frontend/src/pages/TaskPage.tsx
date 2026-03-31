import React, { useEffect, useState, useRef } from 'react';
import { Button, Popover, Checkbox, Divider, Tooltip } from 'antd';
import { 
  UnorderedListOutlined, 
  SortAscendingOutlined, 
  EllipsisOutlined, 
  FilterOutlined, 
  CheckCircleOutlined,
  AppstoreOutlined,
  ProjectOutlined,
  SettingOutlined,
  MenuOutlined
} from '@ant-design/icons';
import { useSearchParams, useNavigate } from 'react-router-dom';
import moment from 'moment';
import { useTaskContext } from '../contexts/TaskContext';
import TaskList from '../components/TaskList';
import KanbanView from '../components/KanbanView';
import CompletedTaskList from '../components/CompletedTaskList';
import TaskEditor from '../components/TaskEditor';
import { getLists } from '../api/list';
import { getTags } from '../api/tag';
import { getFilters } from '../api/filter';
import { getSettings } from '../api/settings';
import { TaskList as TaskListType, Tag, Filter } from '../types';
import './TaskPage.less';

// 视图类型
type ViewMode = 'list' | 'kanban';

const TaskPage: React.FC = () => {
  const { fetchTasks, selectedTask } = useTaskContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const filter = searchParams.get('filter');
  const listId = searchParams.get('list_id');
  const tagFilter = searchParams.get('tag');
  const filterId = searchParams.get('filter_id');
  const tagsParam = searchParams.get('tags');
  const priorityParam = searchParams.get('priority');
  const keywordParam = searchParams.get('keyword');
  
  // 清单、标签和过滤器数据用于显示标题
  const [lists, setLists] = useState<TaskListType[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [activeFilter, setActiveFilter] = useState<Filter | null>(null);

  // 视图模式状态 - 等待用户设置加载后更新
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const userManuallyChangedView = useRef(false); // 标记用户是否已手动切换视图
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(() => {
    return localStorage.getItem('hideCompleted') === 'true';
  });
  const [hideDetails, setHideDetails] = useState(() => {
    return localStorage.getItem('hideDetails') === 'true';
  });
  
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
        <div className="menu-option" onClick={handleGoToSettings}>
          <SettingOutlined style={{ fontSize: 14, marginRight: 8 }} />
          <span>显示设置</span>
        </div>
      </div>
    </div>
  );

  // 当 filter_id 变化时，查找对应的过滤器
  useEffect(() => {
    if (filterId && filters.length > 0) {
      const found = filters.find(f => f.id === filterId);
      setActiveFilter(found || null);
    } else {
      setActiveFilter(null);
    }
  }, [filterId, filters]);
  
  useEffect(() => {
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
        
      // 日期范围筛选
      if (conditions.date_range) {
        const today = moment().format('YYYY-MM-DD');
        if (conditions.date_range === 'today') {
          params.start_date = today;
          params.end_date = moment().add(1, 'day').format('YYYY-MM-DD');
        } else if (conditions.date_range === 'week') {
          params.start_date = today;
          params.end_date = moment().add(7, 'days').format('YYYY-MM-DD');
        } else if (conditions.date_range === 'month') {
          params.start_date = today;
          params.end_date = moment().endOf('month').format('YYYY-MM-DD');
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
        const today = moment().format('YYYY-MM-DD');
        params.start_date = today;
        params.end_date = moment().add(1, 'day').format('YYYY-MM-DD');
      } else if (filter === 'week') {
        const today = moment().format('YYYY-MM-DD');
        const weekLater = moment().add(7, 'days').format('YYYY-MM-DD');
        params.start_date = today;
        params.end_date = weekLater;
      } else if (filter === 'completed') {
        params.status = 'completed';
      } else if (filter === 'trash') {
        params.status = 'cancelled';
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
      
    fetchTasks(params);
  }, [filter, listId, tagFilter, activeFilter, tagsParam, priorityParam, keywordParam]);

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

  // 获取工具栏图标
  const getToolbarIcon = () => {
    if (activeFilter) {
      return <FilterOutlined className="toolbar-icon" />;
    }
    if (filter === 'completed') {
      return <CheckCircleOutlined className="toolbar-icon" />;
    }
    return <UnorderedListOutlined className="toolbar-icon" />;
  };

  // 是否是已完成视图
  const isCompletedView = filter === 'completed';

  // 渲染主内容区域
  const renderContent = () => {
    if (isCompletedView) {
      return <CompletedTaskList />;
    }
    if (viewMode === 'kanban') {
      return <KanbanView hideDetails={hideDetails} />;
    }
    return <TaskList hideCompleted={hideCompleted} hideDetails={hideDetails} />;
  };

  return (
    <div className="task-page">
      {/* 左侧列表区域 */}
      <div className="task-page-left">
        {/* 顶部工具栏 */}
        <div className="task-toolbar">
          <div className="toolbar-left">
            {getToolbarIcon()}
            <h2 className="page-title">{getFilterTitle()}</h2>
          </div>
          <div className="toolbar-right">
            <Button type="text" icon={<SortAscendingOutlined />} />
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
          </div>
        </div>
        {renderContent()}
      </div>
      
      {/* 右侧详情区域 - 选中任务时显示 */}
      {selectedTask && (
        <div className="task-page-right">
          <TaskEditor />
        </div>
      )}
    </div>
  );
};

export default TaskPage;
