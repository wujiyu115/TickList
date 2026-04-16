import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckSquareOutlined, 
  CalendarOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  HourglassOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  MenuOutlined,
  HolderOutlined,
  TagOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  InboxOutlined,
  RightOutlined,
  DownOutlined,
  MoreOutlined,
  SettingOutlined,
  FilterOutlined,
  FileTextOutlined,
  InboxOutlined as ArchiveOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Dropdown, Modal, Input, Select, message, Button, Radio, Checkbox, Tabs } from 'antd';
import type { MenuProps, RadioChangeEvent } from 'antd';
import { User, TaskList, Tag, Filter, FilterConditions } from '../types';
import { getLists, createList, deleteList, updateList, reorderLists } from '../api/list';
import { getTags, createTag, updateTag, deleteTag } from '../api/tag';
import { getFilters, createFilter, updateFilter, deleteFilter } from '../api/filter';

interface AppSiderProps {
  user: User;
  onNavigate?: () => void;
  panelCollapsed?: boolean;
  onTogglePanel?: () => void;
}

// 预定义颜色选项（清单用）
const colorOptions = [
  { value: '#ff4d4f', label: '红色' },
  { value: '#faad14', label: '橙色' },
  { value: '#52c41a', label: '绿色' },
  { value: '#1677ff', label: '蓝色' },
  { value: '#722ed1', label: '紫色' },
  { value: '#eb2f96', label: '粉色' },
  { value: '#13c2c2', label: '青色' },
  { value: '#8c8c8c', label: '灰色' },
];

// 标签预定义颜色（圆形色块）
const TAG_COLORS = [
  '#f5f5f5',  // 无色/默认
  '#ff4d4f',  // 红
  '#ff7a45',  // 橙
  '#ffa940',  // 深黄
  '#ffec3d',  // 黄
  '#95de64',  // 绿
  '#69b1ff',  // 蓝
  '#b37feb',  // 紫
  '#ff85c0',  // 粉
];

// 图标栏导航项
const navItems = [
  { key: 'tasks', icon: CheckSquareOutlined, path: '/', tooltip: '任务' },
  { key: 'calendar', icon: CalendarOutlined, path: '/calendar', tooltip: '日历' },
  { key: 'pomodoro', icon: ClockCircleOutlined, path: '/pomodoro', tooltip: '番茄时钟' },
  { key: 'countdown', icon: HourglassOutlined, path: '/countdown', tooltip: '倒数日' },
  { key: 'statistics', icon: BarChartOutlined, path: '/statistics', tooltip: '统计' },
];

const AppSider: React.FC<AppSiderProps> = ({ user, onNavigate, panelCollapsed = false, onTogglePanel }) => {
  const navigate = useNavigate();
  // 缓存 hover 能力检测，避免移动端触摸触发 mouseenter 导致重渲染吞掉 click
  const supportsHover = window.matchMedia('(hover: hover)').matches;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // 清单和标签数据
  const [lists, setLists] = useState<TaskList[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);
  
  // 新建清单 Modal 状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createType, setCreateType] = useState<'folder' | 'list'>('list');
  const [newListName, setNewListName] = useState('');
  const [newListColor, setNewListColor] = useState('#1677ff');
  const [createLoading, setCreateLoading] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null); // 用于在文件夹下创建子清单
  const [hoveredFolderId, setHoveredFolderId] = useState<string | null>(null); // hover 的文件夹 id
  const [hoveredListId, setHoveredListId] = useState<string | null>(null); // hover 的清单项 id
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null); // hover 的标签项 id
  
  // 拖拽排序相关 refs
  const dragItemRef = useRef<{ id: string; parent_id: string | null; index: number } | null>(null);
  const dragOverItemRef = useRef<{ id: string; index: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  
  // 标签显示模式: 'all' | 'non-empty' | 'hidden'
  const [tagDisplayMode, setTagDisplayMode] = useState<'all' | 'non-empty' | 'hidden'>('all');
  
  // 标签编辑 Modal 状态
  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagModalMode, setTagModalMode] = useState<'create' | 'edit'>('create');
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState('#1677ff');
  const [tagLoading, setTagLoading] = useState(false);

  // 过滤器状态
  const [filters, setFilters] = useState<Filter[]>([]);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterModalMode, setFilterModalMode] = useState<'create' | 'edit'>('create');
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null);
  const [filterName, setFilterName] = useState('');
  const [filterConditions, setFilterConditions] = useState<FilterConditions>({});
  const [filterLoading, setFilterLoading] = useState(false);
  const [hoveredFilterId, setHoveredFilterId] = useState<string | null>(null);
  const [prioritySelectAll, setPrioritySelectAll] = useState(true);

  // 加载清单、标签和过滤器数据
  useEffect(() => {
    loadLists();
    loadTags();
    loadFilters();
  }, []);

  const loadLists = async () => {
    try {
      const data = await getLists();
      setLists(data.lists || []);
    } catch (e) {
      console.error('Failed to load lists:', e);
    }
  };

  const loadTags = async () => {
    try {
      const data = await getTags();
      setTags(data.tags || []);
    } catch (e) {
      console.error('Failed to load tags:', e);
    }
  };

  const loadFilters = async () => {
    try {
      const data = await getFilters();
      setFilters(data.filters || []);
    } catch (e) {
      console.error('Failed to load filters:', e);
    }
  };

  // 判断是否是任务视图
  const isTaskView = location.pathname === '/';

  // 获取当前高亮的图标
  const getActiveIcon = () => {
    if (location.pathname === '/') return 'tasks';
    if (location.pathname === '/calendar') return 'calendar';
    if (location.pathname === '/pomodoro') return 'pomodoro';
    if (location.pathname === '/countdown') return 'countdown';
    if (location.pathname === '/statistics') return 'statistics';
    return '';
  };

  // 获取当前选中的筛选/清单/标签
  const getSelectedKey = () => {
    const filter = searchParams.get('filter');
    const listId = searchParams.get('list_id');
    const tag = searchParams.get('tag');
    
    if (filter) return `filter-${filter}`;
    if (listId) return `list-${listId}`;
    if (tag) return `tag-${tag}`;
    return 'filter-today'; // 默认选中今天
  };

  // 切换文件夹展开/折叠
  const toggleFolder = (folderId: string) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderId]: !prev[folderId]
    }));
  };

  // 打开在文件夹下创建清单的弹窗
  const openCreateInFolder = (folderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreateType('list');
    setNewListName('');
    setNewListColor('#1677ff');
    setCreateParentId(folderId);
    setCreateModalVisible(true);
  };

  // 文件夹右键菜单
  const getFolderContextMenuItems = (folderId: string): MenuProps['items'] => [
    {
      key: 'add-list',
      icon: <MenuOutlined />,
      label: '新建清单',
      onClick: () => {
        setCreateType('list');
        setNewListName('');
        setNewListColor('#1677ff');
        setCreateParentId(folderId);
        setCreateModalVisible(true);
      }
    }
  ];

  // 处理归档/取消归档
  const handleArchiveList = async (listId: string, archive: boolean) => {
    try {
      // 归档/取消归档当前项
      await updateList(listId, { is_archived: archive });
      // 如果是文件夹，联动归档/取消归档所有子清单
      const item = lists.find(l => l.id === listId);
      if (item && item.type === 'folder') {
        const children = lists.filter(l => l.parent_id === listId);
        await Promise.all(children.map(child => updateList(child.id, { is_archived: archive })));
      }
      message.success(archive ? '清单已归档' : '清单已取消归档');
      loadLists();
    } catch (e) {
      message.error(archive ? '归档失败' : '取消归档失败');
    }
  };

  // 文件夹"..."菜单项
  const getFolderMoreMenuItems = (folder: TaskList): MenuProps['items'] => {
    const childrenCount = lists.filter(l => l.parent_id === folder.id).length;
    return [
      {
        key: 'add-list',
        icon: <PlusOutlined />,
        label: '添加清单',
        onClick: () => {
          setCreateType('list');
          setNewListName('');
          setNewListColor('#1677ff');
          setCreateParentId(folder.id);
          setCreateModalVisible(true);
        }
      },
      {
        key: 'archive',
        icon: <ArchiveOutlined />,
        label: '归档',
        onClick: () => handleArchiveList(folder.id, true)
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => {
          const content = childrenCount > 0 
            ? `该文件夹下有 ${childrenCount} 个清单，删除后子清单也将被删除。确定删除文件夹「${folder.name}」吗？`
            : `确定删除文件夹「${folder.name}」吗？`;
          Modal.confirm({
            title: '删除文件夹',
            content,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              try {
                await deleteList(folder.id);
                message.success('文件夹已删除');
                loadLists();
              } catch (e) {
                message.error('删除失败');
              }
            }
          });
        }
      }
    ];
  };

  // 清单"..."菜单项
  const getListMoreMenuItems = (list: TaskList, isArchived = false): MenuProps['items'] => {
    if (isArchived) {
      return [
        {
          key: 'unarchive',
          icon: <ArchiveOutlined />,
          label: '取消归档',
          onClick: () => handleArchiveList(list.id, false)
        },
        {
          key: 'delete',
          icon: <DeleteOutlined />,
          label: '删除',
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: '删除清单',
              content: `确定删除清单「${list.name}」吗？`,
              okText: '删除',
              okType: 'danger',
              cancelText: '取消',
              onOk: async () => {
                try {
                  await deleteList(list.id);
                  message.success('清单已删除');
                  loadLists();
                } catch (e) {
                  message.error('删除失败');
                }
              }
            });
          }
        }
      ];
    }
    return [
      {
        key: 'archive',
        icon: <ArchiveOutlined />,
        label: '归档',
        onClick: () => handleArchiveList(list.id, true)
      },
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => {
          Modal.confirm({
            title: '删除清单',
            content: `确定删除清单「${list.name}」吗？`,
            okText: '删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
              try {
                await deleteList(list.id);
                message.success('清单已删除');
                loadLists();
              } catch (e) {
                message.error('删除失败');
              }
            }
          });
        }
      }
    ];
  };

  // 标签区域头部"..."菜单项
  const tagSectionMenuItems: MenuProps['items'] = [
    {
      key: 'non-empty',
      label: '显示 (非空标签)',
      style: tagDisplayMode === 'non-empty' ? { fontWeight: 600 } : undefined,
      onClick: () => setTagDisplayMode('non-empty')
    },
    {
      key: 'all',
      label: (
        <span>
          显示
          {tagDisplayMode === 'all' && <span style={{ marginLeft: 8 }}>✓</span>}
        </span>
      ),
      onClick: () => setTagDisplayMode('all')
    },
    {
      key: 'hidden',
      label: '隐藏',
      onClick: () => setTagDisplayMode('hidden')
    }
  ];

  // 标签项"..."菜单项
  const getTagMoreMenuItems = (tag: Tag): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      onClick: () => openEditTagModal(tag)
    },
    {
      key: 'pin',
      label: '置顶',
      onClick: () => message.info('功能开发中')
    },
    {
      key: 'add-child',
      label: '添加子标签',
      onClick: () => message.info('功能开发中')
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => {
        Modal.confirm({
          title: '删除标签',
          content: `确定删除标签「${tag.name}」吗？`,
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: async () => {
            try {
              await deleteTag(tag.id);
              message.success('标签已删除');
              loadTags();
            } catch (error: any) {
              if (error.response?.status === 400) {
                message.error(error.response.data.detail || '该标签被引用，无法删除');
              } else {
                message.error('删除失败');
              }
            }
          }
        });
      }
    }
  ];

  // 打开新建标签 Modal
  const openCreateTagModal = () => {
    setTagModalMode('create');
    setEditingTag(null);
    setTagName('');
    setTagColor('#1677ff');
    setTagModalVisible(true);
  };

  // 打开编辑标签 Modal
  const openEditTagModal = (tag: Tag) => {
    setTagModalMode('edit');
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color || '#1677ff');
    setTagModalVisible(true);
  };

  // 保存标签（新建或编辑）
  const handleSaveTag = async () => {
    if (!tagName.trim()) {
      message.warning('请输入标签名');
      return;
    }
    setTagLoading(true);
    try {
      if (tagModalMode === 'create') {
        await createTag({ name: tagName.trim(), color: tagColor });
        message.success('标签创建成功');
      } else if (editingTag) {
        await updateTag(editingTag.id, { name: tagName.trim(), color: tagColor });
        message.success('标签更新成功');
      }
      setTagModalVisible(false);
      loadTags();
    } catch (e) {
      message.error(tagModalMode === 'create' ? '创建失败' : '更新失败');
    } finally {
      setTagLoading(false);
    }
  };

  // 打开新建过滤器 Modal
  const openCreateFilterModal = () => {
    setFilterModalMode('create');
    setEditingFilter(null);
    setFilterName('');
    setFilterConditions({});
    setPrioritySelectAll(true);
    setFilterModalVisible(true);
  };

  // 打开编辑过滤器 Modal
  const openEditFilterModal = (filter: Filter) => {
    setFilterModalMode('edit');
    setEditingFilter(filter);
    setFilterName(filter.name);
    setFilterConditions(filter.conditions || {});
    setPrioritySelectAll(!filter.conditions?.priority || filter.conditions.priority.length === 0);
    setFilterModalVisible(true);
  };

  // 保存过滤器（新建或编辑）
  const handleSaveFilter = async () => {
    if (!filterName.trim()) {
      message.warning('请输入过滤器名称');
      return;
    }
    setFilterLoading(true);
    try {
      // 清理空值
      const cleanConditions: FilterConditions = {};
      if (filterConditions.list_id) cleanConditions.list_id = filterConditions.list_id;
      if (filterConditions.tags && filterConditions.tags.length > 0) cleanConditions.tags = filterConditions.tags;
      if (filterConditions.date_range) cleanConditions.date_range = filterConditions.date_range;
      if (filterConditions.priority && filterConditions.priority.length > 0 && !prioritySelectAll) {
        cleanConditions.priority = filterConditions.priority;
      }
      if (filterConditions.keyword) cleanConditions.keyword = filterConditions.keyword;

      if (filterModalMode === 'create') {
        await createFilter({ name: filterName.trim(), conditions: cleanConditions });
        message.success('过滤器创建成功');
      } else if (editingFilter) {
        await updateFilter(editingFilter.id, { name: filterName.trim(), conditions: cleanConditions });
        message.success('过滤器更新成功');
      }
      setFilterModalVisible(false);
      loadFilters();
      // 通知 TaskPage 刷新过滤器数据
      window.dispatchEvent(new CustomEvent('filters-updated'));
    } catch (e) {
      message.error(filterModalMode === 'create' ? '创建失败' : '更新失败');
    } finally {
      setFilterLoading(false);
    }
  };

  // 删除过滤器
  const handleDeleteFilter = (filter: Filter) => {
    Modal.confirm({
      title: '删除过滤器',
      content: `确定删除过滤器「${filter.name}」吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteFilter(filter.id);
          message.success('过滤器已删除');
          loadFilters();
        } catch (e) {
          message.error('删除失败');
        }
      }
    });
  };

  // 应用过滤器
  const applyFilter = (filter: Filter) => {
    navigate(`/?filter_id=${filter.id}`);
    onNavigate?.();
  };

  // 过滤器项更多菜单
  const getFilterMoreMenuItems = (filter: Filter): MenuProps['items'] => [
    {
      key: 'edit',
      label: '编辑',
      onClick: () => openEditFilterModal(filter)
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => handleDeleteFilter(filter)
    }
  ];

  // 优先级改变处理
  const handlePriorityChange = (checked: boolean, priority: number) => {
    const currentPriorities = filterConditions.priority || [];
    let newPriorities: number[];
    if (checked) {
      newPriorities = [...currentPriorities, priority];
      // 选择具体优先级时，自动取消"所有"选中状态
      setPrioritySelectAll(false);
    } else {
      newPriorities = currentPriorities.filter(p => p !== priority);
      // 如果所有具体优先级都被取消，自动恢复"所有"选中状态
      if (newPriorities.length === 0) {
        setPrioritySelectAll(true);
      }
    }
    setFilterConditions({ ...filterConditions, priority: newPriorities });
  };

  // 优先级全选处理
  const handlePrioritySelectAll = (e: RadioChangeEvent) => {
    const selectAll = e.target.value === 'all';
    setPrioritySelectAll(selectAll);
    if (selectAll) {
      setFilterConditions({ ...filterConditions, priority: [] });
    }
  };

  // 处理拖拽排序
  const handleDragStart = (e: React.DragEvent, item: TaskList, index: number, parentId: string | null) => {
    // 已归档清单不参与拖拽
    if (item.is_archived) {
      e.preventDefault();
      return;
    }
    setDraggingId(item.id);
    dragItemRef.current = { id: item.id, parent_id: parentId, index };
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽图像（可选）
    const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
    dragImage.style.opacity = '0.8';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-9999px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 20);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  };

  const handleDragOver = (e: React.DragEvent, item: TaskList, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!dragItemRef.current || item.is_archived) return;
    
    // 只允许同层级拖拽
    const sourceParentId = dragItemRef.current.parent_id;
    const targetParentId = item.parent_id || null;
    
    if (sourceParentId !== targetParentId) return;
    
    dragOverItemRef.current = { id: item.id, index };
  };

  const handleDrop = async (e: React.DragEvent, targetItem: TaskList, targetIndex: number) => {
    e.preventDefault();
    setDraggingId(null);
    
    if (!dragItemRef.current) return;
    
    const sourceId = dragItemRef.current.id;
    const sourceParentId = dragItemRef.current.parent_id;
    const sourceIndex = dragItemRef.current.index;
    const targetParentId = targetItem.parent_id || null;
    
    // 只允许同层级拖拽
    if (sourceParentId !== targetParentId) {
      dragItemRef.current = null;
      dragOverItemRef.current = null;
      return;
    }
    
    // 同一位置不处理
    if (sourceId === targetItem.id || sourceIndex === targetIndex) {
      dragItemRef.current = null;
      dragOverItemRef.current = null;
      return;
    }
    
    // 获取同层级的所有清单（不包括已归档）
    const siblings = lists.filter(l => 
      (l.parent_id || null) === sourceParentId && !l.is_archived
    ).sort((a, b) => a.order - b.order);
    
    // 重新排序
    const draggedItem = siblings.find(l => l.id === sourceId);
    if (!draggedItem) {
      dragItemRef.current = null;
      dragOverItemRef.current = null;
      return;
    }
    
    // 从原位置移除
    const newSiblings = siblings.filter(l => l.id !== sourceId);
    // 找到目标项在新数组中的位置
    const targetInNewArr = newSiblings.findIndex(l => l.id === targetItem.id);
    const insertIndex = targetInNewArr >= 0 ? targetInNewArr : newSiblings.length;
    newSiblings.splice(insertIndex, 0, draggedItem);
    
    // 构建批量更新数据
    const reorderItems = newSiblings.map((list, idx) => ({
      id: list.id,
      order: idx * 10 // 间隔为10，方便后续插入
    }));
    
    // 乐观更新本地状态
    setLists(prev => prev.map(list => {
      const updated = reorderItems.find(item => item.id === list.id);
      if (updated) {
        return { ...list, order: updated.order };
      }
      return list;
    }));
    
    // 调用 API 批量更新
    try {
      await reorderLists(reorderItems);
      loadLists();
    } catch (e) {
      message.error('排序更新失败');
      loadLists();
    }
    
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    dragItemRef.current = null;
    dragOverItemRef.current = null;
  };

  // 渲染清单项
  const renderListItem = (item: TaskList, level = 0, index = 0, parentId: string | null = null, isArchivedList = false) => {
    const children = lists.filter(l => l.parent_id === item.id && !l.is_archived);
    const isFolder = item.type === 'folder';
    const isCollapsed = collapsedFolders[item.id];
    const isSelected = getSelectedKey() === `list-${item.id}`;
    const isFolderHovered = hoveredFolderId === item.id;
    const isListHovered = hoveredListId === item.id;
    const isHovered = isFolder ? isFolderHovered : isListHovered;
    const isDragging = draggingId === item.id;

    // 已归档清单不参与拖拽
    const isDraggable = !item.is_archived;

    const listItemContent = (
      <div 
        className={`list-item ${isSelected ? 'active' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{ 
          paddingLeft: level > 0 ? 12 + level * 16 : 12,
          opacity: isDragging ? 0.5 : 1,
          cursor: isDraggable ? 'move' : 'pointer'
        }}
        draggable={isDraggable}
        onDragStart={(e) => handleDragStart(e, item, index, parentId)}
        onDragOver={(e) => handleDragOver(e, item, index)}
        onDrop={(e) => handleDrop(e, item, index)}
        onDragEnd={handleDragEnd}
        onMouseEnter={() => {
          if (supportsHover) {
            if (isFolder) {
              setHoveredFolderId(item.id);
            } else {
              setHoveredListId(item.id);
            }
          }
        }}
        onMouseLeave={() => {
          if (supportsHover) {
            if (isFolder) {
              setHoveredFolderId(null);
            } else {
              setHoveredListId(null);
            }
          }
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (isFolder) {
            toggleFolder(item.id);
          } else {
            navigate(`/?list_id=${item.id}`);
            onNavigate?.();
          }
        }}
      >
        {/* 拖拽手柄 */}
        {isDraggable && (
          <span 
            className="drag-handle"
            style={{ 
              marginRight: 4, 
              cursor: 'grab',
              opacity: 0.5,
              display: 'inline-flex',
              alignItems: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <HolderOutlined style={{ fontSize: 10 }} />
          </span>
        )}
        {isFolder ? (
          <>
            {isCollapsed ? <RightOutlined style={{ fontSize: 10, marginRight: 4 }} /> : <DownOutlined style={{ fontSize: 10, marginRight: 4 }} />}
            {isCollapsed ? <FolderOutlined /> : <FolderOpenOutlined />}
          </>
        ) : null}
        <span className="list-name">{item.name}</span>
        {/* 文件夹 hover 操作按钮 - 只保留 "..." 菜单 */}
        {isFolder && isFolderHovered && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Dropdown 
              menu={{ items: getFolderMoreMenuItems(item) }} 
              trigger={['click']}
            >
              <MoreOutlined
                style={{ 
                  fontSize: 14,
                  color: 'var(--ant-color-text-tertiary)',
                  cursor: 'pointer',
                  marginRight: 4
                }}
                className="list-more-btn"
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          </div>
        )}
        {/* 清单 hover 操作按钮 */}
        {!isFolder && isListHovered && (
          <Dropdown 
            menu={{ items: getListMoreMenuItems(item, isArchivedList) }} 
            trigger={['click']}
          >
            <MoreOutlined
              style={{ 
                marginLeft: 'auto',
                fontSize: 14,
                color: 'var(--ant-color-text-tertiary)',
                cursor: 'pointer',
                marginRight: 4
              }}
              className="list-more-btn"
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>
        )}
        {!isHovered && <span className="list-dot" style={{ background: item.color, marginLeft: isHovered ? 0 : 'auto' }} />}
      </div>
    );

    return (
      <div key={item.id}>
        {isFolder ? (
          <Dropdown menu={{ items: getFolderContextMenuItems(item.id) }} trigger={['contextMenu']}>
            {listItemContent}
          </Dropdown>
        ) : (
          listItemContent
        )}
        {isFolder && !isCollapsed && !isArchivedList && children.length > 0 && (
          <div className="list-children">
            {children.map((child, idx) => renderListItem(child, level + 1, idx, item.id, isArchivedList))}
          </div>
        )}
      </div>
    );
  };

  // 新建清单下拉菜单（顶层）
  const createMenuItems: MenuProps['items'] = [
    {
      key: 'folder',
      icon: <FolderOutlined />,
      label: '新建文件夹',
      onClick: () => {
        setCreateType('folder');
        setNewListName('');
        setNewListColor('#1677ff');
        setCreateParentId(null); // 顶层
        setCreateModalVisible(true);
      }
    },
    {
      key: 'list',
      icon: <MenuOutlined />,
      label: '新建清单',
      onClick: () => {
        setCreateType('list');
        setNewListName('');
        setNewListColor('#1677ff');
        setCreateParentId(null); // 顶层
        setCreateModalVisible(true);
      }
    }
  ];

  // 创建清单
  const handleCreateList = async () => {
    if (!newListName.trim()) {
      message.warning('请输入名称');
      return;
    }
    setCreateLoading(true);
    try {
      await createList({
        name: newListName.trim(),
        type: createType,
        color: newListColor,
        parent_id: createParentId || undefined // 如果有 parent_id 则传递
      });
      const parentFolder = createParentId ? lists.find(l => l.id === createParentId) : null;
      const successMsg = parentFolder 
        ? `清单创建成功，已添加到「${parentFolder.name}」` 
        : `${createType === 'folder' ? '文件夹' : '清单'}创建成功`;
      message.success(successMsg);
      setCreateModalVisible(false);
      setCreateParentId(null);
      // 如果在文件夹下创建，确保文件夹展开
      if (createParentId) {
        setCollapsedFolders(prev => ({ ...prev, [createParentId]: false }));
      }
      loadLists();
    } catch (e) {
      message.error('创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  // 分类清单
  const topLevelLists = lists.filter(l => !l.parent_id && !l.is_archived);
  const archivedLists = lists.filter(l => l.is_archived);

  const activeIcon = getActiveIcon();
  const selectedKey = getSelectedKey();

  return (
    <div className="app-sider">
      {/* 图标栏 */}
      <div className="icon-bar">
        <div className="icon-bar-top">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeIcon === item.key;
            return (
              <div
                key={item.key}
                className={`icon-item ${isActive ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.key === 'tasks' && isActive && isTaskView) {
                    onTogglePanel?.();
                  } else {
                    navigate(item.path);
                    onNavigate?.();
                  }
                }}
                title={item.tooltip}
              >
                <Icon />
              </div>
            );
          })}
        </div>
        <div className="icon-bar-bottom">
          <div 
            className={`icon-item ${location.pathname === '/settings' ? 'active' : ''}`} 
            title="设置"
            onClick={(e) => { e.stopPropagation(); navigate('/settings'); onNavigate?.(); }}
          >
            <SettingOutlined />
          </div>
        </div>
      </div>

      {/* 内容面板 - 仅在任务视图显示 */}
      {isTaskView && (
        <div className={`secondary-panel ${panelCollapsed ? 'collapsed' : ''}`}>
          <div className="panel-title">任务</div>
          
          {/* 快速筛选 */}
          <div 
            className={`filter-item ${selectedKey === 'filter-today' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); navigate('/?filter=today'); onNavigate?.(); }}
          >
            <CalendarOutlined style={{ color: 'var(--ant-color-primary)' }} />
            <span>今天</span>
          </div>
          <div 
            className={`filter-item ${selectedKey === 'filter-week' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); navigate('/?filter=week'); onNavigate?.(); }}
          >
            <CalendarOutlined style={{ color: '#52c41a' }} />
            <span>最近7天</span>
          </div>
          <div 
            className={`filter-item ${selectedKey === 'list-inbox' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); navigate('/?list_id=inbox'); onNavigate?.(); }}
          >
            <InboxOutlined />
            <span>收集箱</span>
          </div>
          <div 
            className={`filter-item ${location.pathname === '/summary' ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); navigate('/summary'); onNavigate?.(); }}
          >
            <FileTextOutlined />
            <span>摘要</span>
          </div>

          {/* 清单区域 */}
          <div className="section-header">
            <span onClick={() => setCollapsedFolders(prev => ({ ...prev, '_lists_': !prev['_lists_'] }))}>
              {collapsedFolders['_lists_'] ? <RightOutlined style={{ fontSize: 10, marginRight: 4 }} /> : <DownOutlined style={{ fontSize: 10, marginRight: 4 }} />}
              清单
            </span>
            <Dropdown menu={{ items: createMenuItems }} trigger={['click']}>
              <PlusOutlined style={{ cursor: 'pointer' }} />
            </Dropdown>
          </div>
          
          {!collapsedFolders['_lists_'] && (
            <div className="lists-container">
              {topLevelLists
                .sort((a, b) => a.order - b.order)
                .map((item, index) => renderListItem(item, 0, index, null, false))}
            </div>
          )}

          {/* 已归档清单 - 始终显示 */}
          <div 
            className="archived-header"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? <DownOutlined style={{ fontSize: 10, marginRight: 4 }} /> : <RightOutlined style={{ fontSize: 10, marginRight: 4 }} />}
            <FolderOutlined style={{ marginRight: 4 }} />
            已归档的清单
          </div>
          {showArchived && (
            <div className="lists-container">
              {archivedLists.length > 0 ? (
                archivedLists
                  .sort((a, b) => a.order - b.order)
                  .map((item, index) => renderListItem(item, 0, index, null, true))
              ) : (
                <div style={{ padding: '8px 16px', color: 'var(--ant-color-text-quaternary)', fontSize: 13 }}>暂无归档清单</div>
              )}
            </div>
          )}

          {/* 标签区域 */}
          <div className="section-header">
            <span onClick={() => {
              if (tagDisplayMode === 'hidden') {
                setTagDisplayMode('all');
              }
            }}>
              {tagDisplayMode === 'hidden' 
                ? <RightOutlined style={{ fontSize: 10, marginRight: 4 }} /> 
                : <DownOutlined style={{ fontSize: 10, marginRight: 4 }} />
              }
              标签
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Dropdown menu={{ items: tagSectionMenuItems }} trigger={['click']}>
                <MoreOutlined style={{ cursor: 'pointer' }} onClick={(e) => e.stopPropagation()} />
              </Dropdown>
              <PlusOutlined 
                style={{ cursor: 'pointer' }} 
                onClick={(e) => {
                  e.stopPropagation();
                  openCreateTagModal();
                }} 
              />
            </div>
          </div>
          {tagDisplayMode !== 'hidden' && (
            <div className="tags-container">
              {tags
                .filter(tag => {
                  // 如果是 'non-empty' 模式，这里应该过滤只显示有任务关联的标签
                  // 由于目前没有标签关联任务数的数据，暂时显示所有标签
                  return true;
                })
                .map(tag => {
                  const isTagHovered = hoveredTagId === tag.id;
                  return (
                    <div 
                      key={tag.id}
                      className={`tag-item ${selectedKey === `tag-${tag.name}` ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); navigate(`/?tag=${tag.name}`); onNavigate?.(); }}
                      onMouseEnter={() => { if (supportsHover) setHoveredTagId(tag.id); }}
                      onMouseLeave={() => { if (supportsHover) setHoveredTagId(null); }}
                    >
                      <TagOutlined />
                      <span>{tag.name}</span>
                      {isTagHovered ? (
                        <Dropdown 
                          menu={{ items: getTagMoreMenuItems(tag) }} 
                          trigger={['click']}
                        >
                          <MoreOutlined
                            style={{ 
                              marginLeft: 'auto',
                              fontSize: 14,
                              color: 'var(--ant-color-text-tertiary)',
                              cursor: 'pointer'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </Dropdown>
                      ) : (
                        <span className="tag-dot" style={{ background: tag.color }} />
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* 过滤器区域 */}
          <div className="section-header">
            <span>过滤器</span>
            <PlusOutlined style={{ cursor: 'pointer' }} onClick={openCreateFilterModal} />
          </div>
          
          {filters.length === 0 ? (
            <div className="filter-hint">
              根据清单、时间、优先级、标签等过滤出特定的任务
            </div>
          ) : (
            <div className="filters-container">
              {filters.map(filter => {
                const filterId = searchParams.get('filter_id');
                const isFilterHovered = hoveredFilterId === filter.id;
                const isActive = filterId === filter.id;
                return (
                  <div 
                    key={filter.id}
                    className={`filter-item ${isActive ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); applyFilter(filter); }}
                    onMouseEnter={() => { if (supportsHover) setHoveredFilterId(filter.id); }}
                    onMouseLeave={() => { if (supportsHover) setHoveredFilterId(null); }}
                  >
                    <FilterOutlined />
                    <span>{filter.name}</span>
                    {isFilterHovered && (
                      <Dropdown 
                        menu={{ items: getFilterMoreMenuItems(filter) }} 
                        trigger={['click']}
                      >
                        <MoreOutlined
                          style={{ 
                            marginLeft: 'auto',
                            fontSize: 14,
                            color: 'var(--ant-color-text-tertiary)',
                            cursor: 'pointer'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </Dropdown>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 底部固定项 */}
          <div className="bottom-items">
            <div 
              className={`filter-item ${selectedKey === 'filter-completed' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); navigate('/?filter=completed'); onNavigate?.(); }}
            >
              <CheckCircleOutlined />
              <span>已完成</span>
            </div>
            <div 
              className={`filter-item ${selectedKey === 'filter-trash' ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); navigate('/?filter=trash'); onNavigate?.(); }}
            >
              <DeleteOutlined />
              <span>垃圾桶</span>
            </div>
          </div>
        </div>
      )}

      {/* 新建清单/文件夹 Modal */}
      <Modal
        title={
          createParentId 
            ? `在「${lists.find(l => l.id === createParentId)?.name}」下新建清单`
            : (createType === 'folder' ? '新建文件夹' : '新建清单')
        }
        open={createModalVisible}
        onOk={handleCreateList}
        onCancel={() => {
          setCreateModalVisible(false);
          setCreateParentId(null);
        }}
        confirmLoading={createLoading}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>名称</div>
          <Input 
            placeholder={`请输入${createType === 'folder' ? '文件夹' : '清单'}名称`}
            value={newListName}
            onChange={e => setNewListName(e.target.value)}
            onPressEnter={handleCreateList}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>颜色</div>
          <Select
            value={newListColor}
            onChange={setNewListColor}
            style={{ width: '100%' }}
            options={colorOptions}
            optionRender={(option) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ 
                  width: 16, 
                  height: 16, 
                  borderRadius: 4, 
                  background: option.value as string 
                }} />
                {option.label}
              </div>
            )}
          />
        </div>
      </Modal>

      {/* 新建/编辑标签 Modal */}
      <Modal
        title={tagModalMode === 'create' ? '新建标签' : '编辑标签'}
        open={tagModalVisible}
        onOk={handleSaveTag}
        onCancel={() => setTagModalVisible(false)}
        confirmLoading={tagLoading}
        okText="保存"
        cancelText="取消"
        className="tag-edit-modal"
      >
        <div style={{ marginBottom: 16 }}>
          <Input 
            placeholder="请输入标签名"
            value={tagName}
            onChange={e => setTagName(e.target.value)}
            onPressEnter={handleSaveTag}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8, color: 'var(--ant-color-text-secondary)' }}>颜色</div>
          <div className="color-picker">
            {TAG_COLORS.map((color, index) => (
              <div
                key={color}
                className={`color-dot ${tagColor === color ? 'selected' : ''}`}
                style={{ 
                  background: color,
                  border: index === 0 ? '1px solid var(--ant-color-border-secondary)' : undefined,
                  position: 'relative'
                }}
                onClick={() => setTagColor(color)}
              >
                {/* 第一个色块显示斜线表示无色 */}
                {index === 0 && (
                  <div style={{
                    position: 'absolute',
                    width: '100%',
                    height: '1px',
                    background: '#ff4d4f',
                    top: '50%',
                    left: 0,
                    transform: 'rotate(-45deg)'
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{ marginBottom: 8, color: 'var(--ant-color-text-secondary)' }}>上级标签</div>
          <Select
            value={undefined}
            placeholder="无"
            style={{ width: '100%' }}
            allowClear
            options={[
              { value: '', label: '无' },
              ...tags.filter(t => t.id !== editingTag?.id).map(t => ({ value: t.id, label: t.name }))
            ]}
            disabled // 目前标签没有 parent_id，暂时禁用
          />
        </div>
      </Modal>

      {/* 新建/编辑过滤器 Modal */}
      <Modal
        title={filterModalMode === 'create' ? '添加过滤器' : '编辑过滤器'}
        open={filterModalVisible}
        onCancel={() => setFilterModalVisible(false)}
        footer={null}
        width={600}
        className="filter-edit-modal"
      >
        <Tabs
          defaultActiveKey="normal"
          items={[
            { key: 'normal', label: '普通' },
            { key: 'advanced', label: '高级', disabled: true }
          ]}
          centered
        />

        {/* 名称输入 */}
        <div className="filter-field" style={{ marginBottom: 16 }}>
          <Input 
            prefix={<FilterOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="名称" 
            value={filterName} 
            onChange={e => setFilterName(e.target.value)}
            style={{ borderRadius: 8 }}
          />
        </div>

        {/* 清单选择 */}
        <div className="filter-field">
          <label>清单</label>
          <Select
            placeholder="所有"
            value={filterConditions.list_id || undefined}
            onChange={v => setFilterConditions({ ...filterConditions, list_id: v || undefined })}
            style={{ width: '100%' }}
            allowClear
          >
            {lists.filter(l => l.type === 'list').map(l => (
              <Select.Option key={l.id} value={l.id}>{l.name}</Select.Option>
            ))}
          </Select>
        </div>

        {/* 标签选择 */}
        <div className="filter-field">
          <label>标签</label>
          <Select
            mode="multiple"
            placeholder="所有"
            value={filterConditions.tags || []}
            onChange={v => setFilterConditions({ ...filterConditions, tags: v.length > 0 ? v : undefined })}
            style={{ width: '100%' }}
            allowClear
          >
            {tags.map(t => (
              <Select.Option key={t.name} value={t.name}>{t.name}</Select.Option>
            ))}
          </Select>
        </div>

        {/* 日期选择 */}
        <div className="filter-field">
          <label>日期</label>
          <Select
            placeholder="所有"
            value={filterConditions.date_range || undefined}
            onChange={v => setFilterConditions({ ...filterConditions, date_range: v || undefined })}
            style={{ width: '100%' }}
            allowClear
          >
            <Select.Option value="today">今天</Select.Option>
            <Select.Option value="week">最近7天</Select.Option>
            <Select.Option value="month">本月</Select.Option>
          </Select>
        </div>

        {/* 优先级 */}
        <div className="filter-field">
          <label>优先级</label>
          <div className="priority-selector">
            <Radio.Group value={prioritySelectAll ? 'all' : 'custom'} onChange={handlePrioritySelectAll}>
              <Radio value="all">所有</Radio>
            </Radio.Group>
            <Checkbox 
              checked={filterConditions.priority?.includes(1)}
              onChange={e => handlePriorityChange(e.target.checked, 1)}
            >高</Checkbox>
            <Checkbox 
              checked={filterConditions.priority?.includes(2)}
              onChange={e => handlePriorityChange(e.target.checked, 2)}
            >中</Checkbox>
            <Checkbox 
              checked={filterConditions.priority?.includes(3)}
              onChange={e => handlePriorityChange(e.target.checked, 3)}
            >低</Checkbox>
            <Checkbox 
              checked={filterConditions.priority?.includes(0)}
              onChange={e => handlePriorityChange(e.target.checked, 0)}
            >无</Checkbox>
          </div>
        </div>

        {/* 内容包含 */}
        <div className="filter-field">
          <label>内容包含</label>
          <Input 
            placeholder="输入任务关键词" 
            value={filterConditions.keyword || ''}
            onChange={e => setFilterConditions({ ...filterConditions, keyword: e.target.value || undefined })}
          />
        </div>

        {/* 底部按钮 */}
        <div className="filter-modal-footer">
          <Button type="primary" onClick={handleSaveFilter} loading={filterLoading}>保存</Button>
          <Button onClick={() => setFilterModalVisible(false)}>取消</Button>
        </div>
      </Modal>
    </div>
  );
};

export default AppSider;
