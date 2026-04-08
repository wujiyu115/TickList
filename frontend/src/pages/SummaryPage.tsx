import React, { useState, useEffect, useMemo } from 'react';
import { Dropdown, Popover, Button, Checkbox, DatePicker } from 'antd';
import {
  DownOutlined,
  CloseOutlined,
  InboxOutlined,
  FolderOutlined,
  MenuOutlined,
  TagOutlined,
  CheckOutlined,
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
  OrderedListOutlined,
  UnorderedListOutlined,
  LinkOutlined,
  CodeOutlined,
  HistoryOutlined,
  AlignLeftOutlined,
  CheckSquareOutlined
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import moment from 'moment';
import { getTasks } from '../api/task';
import { getLists } from '../api/list';
import { getTags } from '../api/tag';
import { Task, TaskList, Tag } from '../types';
import './SummaryPage.less';

// 时间选项类型
type TimeOption = 'today' | 'tomorrow' | 'yesterday' | 'thisWeek' | 'nextWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

// 状态选项类型
type StatusOption = 'all' | 'completed' | 'in_progress' | 'pending';

// 计算时间范围
const getDateRange = (option: TimeOption): { start: string; end: string } | null => {
  const today = moment().startOf('day');
  
  switch (option) {
    case 'today':
      return { start: today.format('YYYY-MM-DD'), end: today.format('YYYY-MM-DD') };
    case 'tomorrow':
      return { start: today.clone().add(1, 'day').format('YYYY-MM-DD'), end: today.clone().add(1, 'day').format('YYYY-MM-DD') };
    case 'yesterday':
      return { start: today.clone().subtract(1, 'day').format('YYYY-MM-DD'), end: today.clone().subtract(1, 'day').format('YYYY-MM-DD') };
    case 'thisWeek':
      return { start: today.clone().startOf('week').format('YYYY-MM-DD'), end: today.clone().endOf('week').format('YYYY-MM-DD') };
    case 'nextWeek':
      return { start: today.clone().add(1, 'week').startOf('week').format('YYYY-MM-DD'), end: today.clone().add(1, 'week').endOf('week').format('YYYY-MM-DD') };
    case 'lastWeek':
      return { start: today.clone().subtract(1, 'week').startOf('week').format('YYYY-MM-DD'), end: today.clone().subtract(1, 'week').endOf('week').format('YYYY-MM-DD') };
    case 'thisMonth':
      return { start: today.clone().startOf('month').format('YYYY-MM-DD'), end: today.clone().endOf('month').format('YYYY-MM-DD') };
    case 'lastMonth':
      return { start: today.clone().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), end: today.clone().subtract(1, 'month').endOf('month').format('YYYY-MM-DD') };
    case 'custom':
      return null;
    default:
      return null;
  }
};

// 时间选项显示文本
const getTimeOptionLabel = (option: TimeOption): string => {
  const today = moment();
  switch (option) {
    case 'today': return '今天';
    case 'tomorrow': return '明天';
    case 'yesterday': return '昨天';
    case 'thisWeek': 
      return `本周 (${today.clone().startOf('week').format('M月D日')} - ${today.clone().endOf('week').format('M月D日')})`;
    case 'nextWeek':
      return `下周 (${today.clone().add(1, 'week').startOf('week').format('M月D日')} - ${today.clone().add(1, 'week').endOf('week').format('M月D日')})`;
    case 'lastWeek':
      return `上周 (${today.clone().subtract(1, 'week').startOf('week').format('M月D日')} - ${today.clone().subtract(1, 'week').endOf('week').format('M月D日')})`;
    case 'thisMonth': return '本月';
    case 'lastMonth': return '上月';
    case 'custom': return '自定义';
    default: return '今天';
  }
};

// 状态选项显示文本
const statusLabels: Record<StatusOption, string> = {
  all: '所有状态',
  completed: '已完成',
  in_progress: '进行中',
  pending: '未完成'
};

const SummaryPage: React.FC = () => {
  // 筛选状态
  const [timeOption, setTimeOption] = useState<TimeOption>('today');
  const [customDateRange, setCustomDateRange] = useState<[string, string] | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>(['all']); // 'all' 表示所有清单
  const [selectedTags, setSelectedTags] = useState<string[]>(['all']); // 'all' 表示所有标签
  const [selectedStatus, setSelectedStatus] = useState<StatusOption>('all');
  
  // Popover 显示状态
  const [listPopoverOpen, setListPopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  
  // 临时选择状态（用于 Popover 中确定前的临时状态）
  const [tempSelectedListIds, setTempSelectedListIds] = useState<string[]>(['all']);
  const [tempSelectedTags, setTempSelectedTags] = useState<string[]>(['all']);
  const [tempSelectedStatus, setTempSelectedStatus] = useState<StatusOption>('all');
  
  // 数据状态
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 清单展开状态
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // 加载清单和标签数据
  useEffect(() => {
    const loadData = async () => {
      try {
        const [listsRes, tagsRes] = await Promise.all([getLists(), getTags()]);
        setLists(listsRes.lists || []);
        setTags(tagsRes.tags || []);
      } catch (e) {
        console.error('Failed to load data:', e);
      }
    };
    loadData();
  }, []);

  // 根据筛选条件获取任务
  useEffect(() => {
    const fetchTasksData = async () => {
      setLoading(true);
      try {
        const params: any = {};
        
        // 时间范围
        const dateRange = timeOption === 'custom' && customDateRange
          ? { start: customDateRange[0], end: customDateRange[1] }
          : getDateRange(timeOption);
        
        if (dateRange) {
          params.start_date = dateRange.start;
          params.end_date = dateRange.end;
        }
        
        // 清单筛选
        if (!selectedListIds.includes('all') && selectedListIds.length > 0) {
          // 如果选择了 inbox，后端需要 list_id=inbox
          if (selectedListIds.includes('inbox')) {
            params.list_id = 'inbox';
          } else {
            params.list_id = selectedListIds[0]; // API 目前只支持单个 list_id
          }
        }
        
        // 标签筛选
        if (!selectedTags.includes('all') && selectedTags.length > 0) {
          if (selectedTags.includes('no-tag')) {
            // 无标签暂不支持
          } else {
            params.tags = selectedTags.join(',');
          }
        }
        
        // 状态筛选
        if (selectedStatus !== 'all') {
          params.status = selectedStatus;
        }
        
        const response = await getTasks(params);
        setTasks(response.tasks || []);
      } catch (e) {
        console.error('Failed to fetch tasks:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTasksData();
  }, [timeOption, customDateRange, selectedListIds, selectedTags, selectedStatus]);

  // 时间选项菜单
  const timeMenuItems: MenuProps['items'] = [
    { key: 'today', label: <span className={timeOption === 'today' ? 'selected-option' : ''}>今天 {timeOption === 'today' && <CheckOutlined />}</span> },
    { key: 'tomorrow', label: <span className={timeOption === 'tomorrow' ? 'selected-option' : ''}>明天 {timeOption === 'tomorrow' && <CheckOutlined />}</span> },
    { key: 'yesterday', label: <span className={timeOption === 'yesterday' ? 'selected-option' : ''}>昨天 {timeOption === 'yesterday' && <CheckOutlined />}</span> },
    { key: 'thisWeek', label: <span className={timeOption === 'thisWeek' ? 'selected-option' : ''}>本周 ({moment().startOf('week').format('M月D日')} - {moment().endOf('week').format('M月D日')}) {timeOption === 'thisWeek' && <CheckOutlined />}</span> },
    { key: 'nextWeek', label: <span className={timeOption === 'nextWeek' ? 'selected-option' : ''}>下周 ({moment().add(1, 'week').startOf('week').format('M月D日')} - {moment().add(1, 'week').endOf('week').format('M月D日')}) {timeOption === 'nextWeek' && <CheckOutlined />}</span> },
    { key: 'lastWeek', label: <span className={timeOption === 'lastWeek' ? 'selected-option' : ''}>上周 ({moment().subtract(1, 'week').startOf('week').format('M月D日')} - {moment().subtract(1, 'week').endOf('week').format('M月D日')}) {timeOption === 'lastWeek' && <CheckOutlined />}</span> },
    { key: 'thisMonth', label: <span className={timeOption === 'thisMonth' ? 'selected-option' : ''}>本月 {timeOption === 'thisMonth' && <CheckOutlined />}</span> },
    { key: 'lastMonth', label: <span className={timeOption === 'lastMonth' ? 'selected-option' : ''}>上月 {timeOption === 'lastMonth' && <CheckOutlined />}</span> },
    { key: 'custom', label: <span className={timeOption === 'custom' ? 'selected-option' : ''}>自定义 {timeOption === 'custom' && <CheckOutlined />}</span> },
  ];

  // 清单 Popover 内容
  const renderListPopoverContent = () => {
    const topLevelLists = lists.filter(l => !l.parent_id && !l.is_archived);
    
    const toggleFolder = (folderId: string) => {
      setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    };
    
    const handleListSelect = (listId: string) => {
      if (listId === 'all') {
        setTempSelectedListIds(['all']);
      } else {
        const newSelection = tempSelectedListIds.filter(id => id !== 'all');
        if (newSelection.includes(listId)) {
          const filtered = newSelection.filter(id => id !== listId);
          setTempSelectedListIds(filtered.length === 0 ? ['all'] : filtered);
        } else {
          setTempSelectedListIds([...newSelection, listId]);
        }
      }
    };
    
    const renderListItem = (item: TaskList, level = 0) => {
      const children = lists.filter(l => l.parent_id === item.id && !l.is_archived);
      const isFolder = item.type === 'folder';
      const isExpanded = expandedFolders[item.id];
      const isSelected = tempSelectedListIds.includes(item.id);
      
      return (
        <div key={item.id}>
          <div 
            className={`list-option ${isSelected ? 'selected' : ''}`}
            style={{ paddingLeft: 12 + level * 20 }}
            onClick={() => {
              if (isFolder) {
                toggleFolder(item.id);
              } else {
                handleListSelect(item.id);
              }
            }}
          >
            {isFolder ? (
              <>
                {isExpanded ? <DownOutlined style={{ fontSize: 10, marginRight: 8 }} /> : <span style={{ marginRight: 8 }}>›</span>}
                <FolderOutlined style={{ marginRight: 8 }} />
              </>
            ) : (
              <MenuOutlined style={{ marginRight: 8, marginLeft: level > 0 ? 18 : 0 }} />
            )}
            <span>{item.name}</span>
            {isSelected && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
          </div>
          {isFolder && isExpanded && children.map(child => renderListItem(child, level + 1))}
        </div>
      );
    };
    
    return (
      <div className="filter-popover-content">
        <div className="popover-title">所有</div>
        <div className="popover-list">
          <div 
            className={`list-option ${tempSelectedListIds.includes('all') ? 'selected' : ''}`}
            onClick={() => handleListSelect('all')}
          >
            <TagOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            <span style={{ color: '#1677ff' }}>所有清单</span>
            {tempSelectedListIds.includes('all') && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
          </div>
          <div 
            className={`list-option ${tempSelectedListIds.includes('inbox') ? 'selected' : ''}`}
            onClick={() => handleListSelect('inbox')}
          >
            <InboxOutlined style={{ marginRight: 8 }} />
            <span>收集箱</span>
            {tempSelectedListIds.includes('inbox') && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
          </div>
          {topLevelLists.map(item => renderListItem(item))}
        </div>
        <div className="popover-footer">
          <Button type="primary" size="small" onClick={() => {
            setSelectedListIds(tempSelectedListIds);
            setListPopoverOpen(false);
          }}>确定</Button>
          <Button size="small" onClick={() => {
            setTempSelectedListIds(selectedListIds);
            setListPopoverOpen(false);
          }}>取消</Button>
        </div>
      </div>
    );
  };

  // 标签 Popover 内容
  const renderTagPopoverContent = () => {
    const handleTagSelect = (tagName: string) => {
      if (tagName === 'all') {
        setTempSelectedTags(['all']);
      } else {
        const newSelection = tempSelectedTags.filter(t => t !== 'all');
        if (newSelection.includes(tagName)) {
          const filtered = newSelection.filter(t => t !== tagName);
          setTempSelectedTags(filtered.length === 0 ? ['all'] : filtered);
        } else {
          setTempSelectedTags([...newSelection, tagName]);
        }
      }
    };
    
    return (
      <div className="filter-popover-content">
        <div className="popover-list">
          <div 
            className={`list-option ${tempSelectedTags.includes('all') ? 'selected' : ''}`}
            onClick={() => handleTagSelect('all')}
          >
            <TagOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            <span style={{ color: '#1677ff' }}>所有标签</span>
            {tempSelectedTags.includes('all') && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
          </div>
          <div 
            className={`list-option ${tempSelectedTags.includes('no-tag') ? 'selected' : ''}`}
            onClick={() => handleTagSelect('no-tag')}
          >
            <TagOutlined style={{ marginRight: 8 }} />
            <span>无标签</span>
            {tempSelectedTags.includes('no-tag') && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
          </div>
          {tags.map(tag => (
            <div 
              key={tag.id}
              className={`list-option ${tempSelectedTags.includes(tag.name) ? 'selected' : ''}`}
              onClick={() => handleTagSelect(tag.name)}
            >
              <TagOutlined style={{ marginRight: 8 }} />
              <span>{tag.name}</span>
              {tempSelectedTags.includes(tag.name) && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
            </div>
          ))}
        </div>
        <div className="popover-footer">
          <Button type="primary" size="small" onClick={() => {
            setSelectedTags(tempSelectedTags);
            setTagPopoverOpen(false);
          }}>确定</Button>
          <Button size="small" onClick={() => {
            setTempSelectedTags(selectedTags);
            setTagPopoverOpen(false);
          }}>取消</Button>
        </div>
      </div>
    );
  };

  // 状态 Popover 内容
  const renderStatusPopoverContent = () => {
    const statusOptions: StatusOption[] = ['all', 'completed', 'in_progress', 'pending'];
    
    return (
      <div className="filter-popover-content">
        <div className="popover-list">
          {statusOptions.map(status => (
            <div 
              key={status}
              className={`list-option ${tempSelectedStatus === status ? 'selected' : ''}`}
              onClick={() => setTempSelectedStatus(status)}
            >
              <span style={status === 'all' && tempSelectedStatus === status ? { color: '#1677ff' } : undefined}>
                {statusLabels[status]}
              </span>
              {tempSelectedStatus === status && <CheckOutlined style={{ marginLeft: 'auto', color: '#1677ff' }} />}
            </div>
          ))}
        </div>
        <div className="popover-footer">
          <Button type="primary" size="small" onClick={() => {
            setSelectedStatus(tempSelectedStatus);
            setStatusPopoverOpen(false);
          }}>确定</Button>
          <Button size="small" onClick={() => {
            setTempSelectedStatus(selectedStatus);
            setStatusPopoverOpen(false);
          }}>取消</Button>
        </div>
      </div>
    );
  };

  // 清除所有筛选条件
  const handleClearFilters = () => {
    setTimeOption('today');
    setCustomDateRange(null);
    setSelectedListIds(['all']);
    setSelectedTags(['all']);
    setSelectedStatus('all');
    setTempSelectedListIds(['all']);
    setTempSelectedTags(['all']);
    setTempSelectedStatus('all');
  };

  // 获取显示文本
  const getListButtonText = () => {
    if (selectedListIds.includes('all')) return '所有清单';
    if (selectedListIds.includes('inbox')) return '收集箱';
    if (selectedListIds.length === 1) {
      const list = lists.find(l => l.id === selectedListIds[0]);
      return list?.name || '所有清单';
    }
    return `${selectedListIds.length}个清单`;
  };

  const getTagButtonText = () => {
    if (selectedTags.includes('all')) return '所有标签';
    if (selectedTags.includes('no-tag')) return '无标签';
    if (selectedTags.length === 1) return selectedTags[0];
    return `${selectedTags.length}个标签`;
  };

  const getTimeButtonText = () => {
    if (timeOption === 'today') return '今天';
    if (timeOption === 'tomorrow') return '明天';
    if (timeOption === 'yesterday') return '昨天';
    if (timeOption === 'thisWeek') return '本周';
    if (timeOption === 'nextWeek') return '下周';
    if (timeOption === 'lastWeek') return '上周';
    if (timeOption === 'thisMonth') return '本月';
    if (timeOption === 'lastMonth') return '上月';
    if (timeOption === 'custom' && customDateRange) {
      return `${customDateRange[0]} - ${customDateRange[1]}`;
    }
    return '今天';
  };

  // 按日期和状态分组任务
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Record<string, Task[]>> = {};
    
    tasks.forEach(task => {
      // 使用 completed_at 或 start_time 的日期作为分组依据
      const dateStr = task.completed_at 
        ? moment(task.completed_at).format('M月D日')
        : task.start_time 
          ? moment(task.start_time).format('M月D日')
          : moment(task.created_at).format('M月D日');
      
      if (!groups[dateStr]) {
        groups[dateStr] = {};
      }
      
      const statusKey = task.status;
      if (!groups[dateStr][statusKey]) {
        groups[dateStr][statusKey] = [];
      }
      
      groups[dateStr][statusKey].push(task);
    });
    
    return groups;
  }, [tasks]);

  // 计算子任务完成百分比
  const getChildProgress = (task: Task): string => {
    if (!task.children || task.children.length === 0) {
      if (task.child_ids && task.child_ids.length > 0) {
        // 从已加载的任务中查找子任务
        const childTasks = tasks.filter(t => task.child_ids.includes(t.id));
        if (childTasks.length === 0) return '';
        const completedCount = childTasks.filter(t => t.status === 'completed').length;
        return `${Math.round((completedCount / childTasks.length) * 100)}%`;
      }
      return '';
    }
    const completedCount = task.children.filter(t => t.status === 'completed').length;
    return `${Math.round((completedCount / task.children.length) * 100)}%`;
  };

  // 状态显示文本映射
  const statusDisplayLabels: Record<string, string> = {
    completed: '已完成',
    in_progress: '进行中',
    pending: '未完成'
  };

  // 渲染任务项
  const renderTaskItem = (task: Task, isChild = false) => {
    const dateLabel = task.completed_at 
      ? moment(task.completed_at).format('M月D日')
      : task.start_time 
        ? moment(task.start_time).format('M月D日')
        : '';
    
    const progress = task.status === 'in_progress' ? getChildProgress(task) : '';
    
    return (
      <div key={task.id} className={`summary-task-item ${isChild ? 'child-task' : ''}`}>
        <span className="task-bullet">•</span>
        {task.status === 'completed' && dateLabel && (
          <span className="task-date">[{dateLabel}]</span>
        )}
        {task.status === 'in_progress' && progress && (
          <span className="task-progress">[{progress}]</span>
        )}
        <span className="task-title">{task.title}</span>
      </div>
    );
  };

  return (
    <div className="summary-page">
      {/* 页面标题 */}
      <div className="summary-header">
        <h1 className="page-title">摘要</h1>
      </div>

      {/* 筛选条件栏 */}
      <div className="filter-bar">
        {/* 时间筛选 */}
        <Dropdown
          menu={{
            items: timeMenuItems,
            onClick: ({ key }) => setTimeOption(key as TimeOption)
          }}
          trigger={['click']}
        >
          <Button className="filter-btn">
            {getTimeButtonText()} <DownOutlined />
          </Button>
        </Dropdown>

        {/* 清单筛选 */}
        <Popover
          content={renderListPopoverContent()}
          trigger="click"
          open={listPopoverOpen}
          onOpenChange={(open) => {
            setListPopoverOpen(open);
            if (open) {
              setTempSelectedListIds(selectedListIds);
            }
          }}
          placement="bottomLeft"
        >
          <Button className="filter-btn">
            {getListButtonText()} <DownOutlined />
          </Button>
        </Popover>

        {/* 标签筛选 */}
        <Popover
          content={renderTagPopoverContent()}
          trigger="click"
          open={tagPopoverOpen}
          onOpenChange={(open) => {
            setTagPopoverOpen(open);
            if (open) {
              setTempSelectedTags(selectedTags);
            }
          }}
          placement="bottomLeft"
        >
          <Button className="filter-btn">
            {getTagButtonText()} <DownOutlined />
          </Button>
        </Popover>

        {/* 状态筛选 */}
        <Popover
          content={renderStatusPopoverContent()}
          trigger="click"
          open={statusPopoverOpen}
          onOpenChange={(open) => {
            setStatusPopoverOpen(open);
            if (open) {
              setTempSelectedStatus(selectedStatus);
            }
          }}
          placement="bottomLeft"
        >
          <Button className="filter-btn">
            {statusLabels[selectedStatus]} <DownOutlined />
          </Button>
        </Popover>

        {/* 更多按钮 */}
        <Button className="filter-btn">
          更多 <DownOutlined />
        </Button>

        {/* 清除按钮 */}
        <Button
          type="text"
          icon={<CloseOutlined />}
          className="clear-btn"
          onClick={handleClearFilters}
        />
      </div>

      {/* 富文本工具栏（视觉效果） */}
      <div className="toolbar">
        <div className="toolbar-group">
          <span className="toolbar-item">H</span>
          <span className="toolbar-item"><BoldOutlined /></span>
          <span className="toolbar-item highlight">A</span>
          <span className="toolbar-divider">|</span>
          <span className="toolbar-item"><CheckSquareOutlined /></span>
          <span className="toolbar-item"><UnorderedListOutlined /></span>
          <span className="toolbar-item"><OrderedListOutlined /></span>
          <span className="toolbar-item"><UnorderedListOutlined /></span>
          <span className="toolbar-divider">|</span>
          <span className="toolbar-item"><ItalicOutlined /></span>
          <span className="toolbar-item"><UnderlineOutlined /></span>
          <span className="toolbar-item"><StrikethroughOutlined /></span>
          <span className="toolbar-item"><AlignLeftOutlined /></span>
          <span className="toolbar-item"><HistoryOutlined /></span>
          <span className="toolbar-divider">|</span>
          <span className="toolbar-item"><LinkOutlined /></span>
          <span className="toolbar-item"><CodeOutlined /></span>
          <span className="toolbar-item">"</span>
        </div>
      </div>

      {/* 摘要内容区域 */}
      <div className="summary-content">
        {loading ? (
          <div className="loading-placeholder">加载中...</div>
        ) : Object.keys(groupedTasks).length === 0 ? (
          <div className="empty-placeholder">暂无任务数据</div>
        ) : (
          Object.entries(groupedTasks).map(([dateStr, statusGroups]) => (
            <div key={dateStr} className="date-group">
              <h2 className="date-title">{dateStr}</h2>
              
              {/* 按状态顺序显示：已完成、进行中、未完成 */}
              {['completed', 'in_progress', 'pending'].map(status => {
                const tasksInStatus = statusGroups[status];
                if (!tasksInStatus || tasksInStatus.length === 0) return null;
                
                return (
                  <div key={status} className="status-group">
                    <h3 className="status-title">{statusDisplayLabels[status]}</h3>
                    <div className="task-list">
                      {tasksInStatus.map(task => (
                        <React.Fragment key={task.id}>
                          {renderTaskItem(task)}
                          {/* 渲染子任务 */}
                          {task.children && task.children.map(child => renderTaskItem(child, true))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SummaryPage;
