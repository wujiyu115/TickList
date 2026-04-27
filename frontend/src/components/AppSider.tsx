import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CheckSquareOutlined,
  CalendarOutlined,
  BarChartOutlined,
  ClockCircleOutlined,
  HourglassOutlined,
  NumberOutlined,
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
  ArrowUpOutlined,
  ArrowDownOutlined,
  InboxOutlined as ArchiveOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Dropdown, Modal, Input, Select, message, Button, Radio, Checkbox, Tabs } from 'antd';
import type { MenuProps, RadioChangeEvent } from 'antd';
import { User, TaskList, Tag, Filter, FilterConditions, NoteFolder, Note } from '../types';
import { getLists, createList, deleteList, updateList, reorderLists } from '../api/list';
import DeleteListConfirmModal from './DeleteListConfirmModal';
import { useTaskContext } from '../contexts/TaskContext';
import { getTags, createTag, updateTag, deleteTag } from '../api/tag';
import { getFilters, createFilter, updateFilter, deleteFilter } from '../api/filter';
import { getNoteFolders, createNoteFolder, deleteNoteFolder, updateNoteFolder } from '../api/note';
import { getNotes, createNote } from '../api/note';

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

import { useLongPress } from '../hooks/useLongPress';

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
  { key: 'counter', icon: NumberOutlined, path: '/counter', tooltip: '计数器' },
  { key: 'notes', icon: FileTextOutlined, path: '/notes', tooltip: '笔记' },
  { key: 'statistics', icon: BarChartOutlined, path: '/statistics', tooltip: '统计' },
];

const AppSider: React.FC<AppSiderProps> = ({ user, onNavigate, panelCollapsed = false, onTogglePanel }) => {
  const navigate = useNavigate();
  const { refreshTasks } = useTaskContext();
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
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteItem, setDeleteItem] = useState<TaskList | null>(null);
  const [mobileMenuKey, setMobileMenuKey] = useState<string | null>(null); // 移动端长按触发的菜单
  
  // 拖拽排序相关 refs
  const dragItemRef = useRef<{ id: string; parent_id: string | null; index: number } | null>(null);
  const dragOverItemRef = useRef<{ id: string; index: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // 移动端长按菜单
  const [mobileMenuListId, setMobileMenuListId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  
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

  // 笔记相关数据
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [noteCollapsedFolders, setNoteCollapsedFolders] = useState<Record<string, boolean>>({});
  const [createNoteFolderModalVisible, setCreateNoteFolderModalVisible] = useState(false);
  const [newNoteFolderName, setNewNoteFolderName] = useState('');
  const [newNoteFolderColor, setNewNoteFolderColor] = useState('#1677ff');
  const [createNoteFolderLoading, setCreateNoteFolderLoading] = useState(false);
  const [hoveredNoteFolderId, setHoveredNoteFolderId] = useState<string | null>(null);

  // 判断是否是笔记视图
  const isNoteView = location.pathname === '/notes';

  // 加载清单、标签和过滤器数据
  useEffect(() => {
    loadLists();
    loadTags();
    loadFilters();
  }, []);
  
  // 加载笔记数据（仅在笔记视图时）
  useEffect(() => {
    if (isNoteView) {
      loadNoteFolders();
      loadNotes();
    }
  }, [isNoteView]);

  // 监听笔记数据刷新事件
  useEffect(() => {
    const handler = () => {
      loadNoteFolders();
      loadNotes();
    };
    window.addEventListener('notes-refreshed', handler);
    return () => window.removeEventListener('notes-refreshed', handler);
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

  const loadNoteFolders = async () => {
    try {
      const data = await getNoteFolders();
      setNoteFolders(data.folders || []);
    } catch (e) {
      console.error('Failed to load note folders:', e);
    }
  };

  const loadNotes = async () => {
    try {
      const data = await getNotes({ limit: 200 });
      setNotes(data.notes || []);
    } catch (e) {
      console.error('Failed to load notes:', e);
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
    if (location.pathname === '/counter') return 'counter';
    if (location.pathname === '/notes') return 'notes';
    if (location.pathname === '/statistics') return 'statistics';
    return '';
  };
  
  // 创建笔记
  const handleCreateNote = async () => {
    try {
      const folderId = searchParams.get('folder_id');
      const newNote = await createNote({
        title: '新建笔记',
        content: '',
        folder_id: folderId || null,
        is_pinned: false,
      });
      message.success('笔记创建成功');
      loadNotes();
      navigate(`/notes?note_id=${newNote.id}`);
      onNavigate?.();
    } catch (e) {
      message.error('创建笔记失败');
    }
  };
  
  // 创建笔记文件夹
  const handleCreateNoteFolder = async () => {
    if (!newNoteFolderName.trim()) {
      message.warning('请输入文件夹名称');
      return;
    }
    setCreateNoteFolderLoading(true);
    try {
      await createNoteFolder({
        name: newNoteFolderName.trim(),
        color: newNoteFolderColor,
        parent_id: null,
        order: 0
      });
      message.success('文件夹创建成功');
      setCreateNoteFolderModalVisible(false);
      setNewNoteFolderName('');
      setNewNoteFolderColor('#1677ff');
      loadNoteFolders();
    } catch (e) {
      message.error('创建文件夹失败');
    } finally {
      setCreateNoteFolderLoading(false);
    }
  };
  
  // 删除笔记文件夹
  const handleDeleteNoteFolder = async (folderId: string) => {
    Modal.confirm({
      title: '删除文件夹',
      content: '确定删除该文件夹吗？文件夹下的笔记不会被删除。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteNoteFolder(folderId);
          message.success('文件夹已删除');
          loadNoteFolders();
          // 如果当前选中的是被删除的文件夹，则清空选择
          const currentFolderId = searchParams.get('folder_id');
          if (currentFolderId === folderId) {
            navigate('/notes');
            onNavigate?.();
          }
        } catch (e) {
          message.error('删除失败');
        }
      }
    });
  };
  
  // 重命名笔记文件夹
  const handleRenameNoteFolder = async (folder: NoteFolder) => {
    Modal.confirm({
      title: '重命名文件夹',
      content: (
        <Input
          defaultValue={folder.name}
          placeholder="请输入文件夹名称"
          autoFocus
          onPressEnter={(e) => {
            const input = e.target as HTMLInputElement;
            if (input.value.trim()) {
              updateNoteFolder(folder.id, { name: input.value.trim() })
                .then(() => {
                  message.success('重命名成功');
                  loadNoteFolders();
                })
                .catch(() => {
                  message.error('重命名失败');
                });
            }
          }}
        />
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        // 这里由于 Modal.confirm 的 content 是 Input，实际操作在 onPressEnter 中处理
      }
    });
  };
  
  // 在指定文件夹下创建笔记
  const handleCreateNoteInFolder = async (folderId: string) => {
    try {
      const newNote = await createNote({
        title: '新建笔记',
        content: '',
        folder_id: folderId,
        is_pinned: false,
      });
      message.success('笔记创建成功');
      loadNotes();
      navigate(`/notes?note_id=${newNote.id}`);
      onNavigate?.();
    } catch (e) {
      message.error('创建笔记失败');
    }
  };

  // 笔记文件夹右键菜单
  const getNoteFolderContextMenuItems = (folder: NoteFolder): MenuProps['items'] => [
    {
      key: 'create-note',
      label: '新建笔记',
      onClick: () => handleCreateNoteInFolder(folder.id)
    },
    {
      key: 'rename',
      label: '重命名',
      onClick: () => handleRenameNoteFolder(folder)
    },
    {
      key: 'delete',
      label: '删除',
      danger: true,
      onClick: () => handleDeleteNoteFolder(folder.id)
    }
  ];

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
          setDeleteItem(folder);
          setDeleteModalVisible(true);
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
            setDeleteItem(list);
            setDeleteModalVisible(true);
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
          setDeleteItem(list);
          setDeleteModalVisible(true);
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

  // 移动端长按处理 - 直接设置 mobileMenuKey 触发 Dropdown
  const handleItemTouchStart = useCallback((menuKey: string) => {
    longPressTriggeredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMobileMenuKey(menuKey);
    }, 500);
  }, []);

  const handleListTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleListTouchEnd = useCallback((e: React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressTriggeredRef.current) {
      e.preventDefault();
    }
  }, []);

  // 清单上移/下移
  const handleMoveList = async (listId: string, direction: 'up' | 'down') => {
    const item = lists.find(l => l.id === listId);
    if (!item) return;
    
    const parentId = item.parent_id || null;
    const siblings = lists.filter(l =>
      (l.parent_id || null) === parentId && !l.is_archived
    ).sort((a, b) => a.order - b.order);
    
    const currentIndex = siblings.findIndex(l => l.id === listId);
    if (currentIndex < 0) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    
    // 交换位置
    const newSiblings = [...siblings];
    [newSiblings[currentIndex], newSiblings[targetIndex]] = [newSiblings[targetIndex], newSiblings[currentIndex]];
    
    const reorderItems = newSiblings.map((list, idx) => ({
      id: list.id,
      order: idx * 10
    }));
    
    setLists(prev => prev.map(list => {
      const updated = reorderItems.find(r => r.id === list.id);
      return updated ? { ...list, order: updated.order } : list;
    }));
    
    try {
      await reorderLists(reorderItems);
      loadLists();
    } catch (e) {
      message.error('排序更新失败');
      loadLists();
    }
  };

  // 获取移动端长按菜单项
  const getMobileMenuItems = (item: TaskList, isArchived = false): MenuProps['items'] => {
    const parentId = item.parent_id || null;
    const siblings = lists.filter(l =>
      (l.parent_id || null) === parentId && !l.is_archived
    ).sort((a, b) => a.order - b.order);
    const currentIndex = siblings.findIndex(l => l.id === item.id);
    const isFirst = currentIndex <= 0;
    const isLast = currentIndex >= siblings.length - 1;
    const isFolder = item.type === 'folder';

    const moveItems: MenuProps['items'] = !isArchived ? [
      {
        key: 'move-up',
        icon: <ArrowUpOutlined />,
        label: '上移',
        disabled: isFirst,
        onClick: () => handleMoveList(item.id, 'up')
      },
      {
        key: 'move-down',
        icon: <ArrowDownOutlined />,
        label: '下移',
        disabled: isLast,
        onClick: () => handleMoveList(item.id, 'down')
      },
      { type: 'divider' as const },
    ] : [];

    const folderItems: MenuProps['items'] = isFolder && !isArchived ? [
      {
        key: 'add-list',
        icon: <PlusOutlined />,
        label: '添加清单',
        onClick: () => {
          setCreateType('list');
          setNewListName('');
          setNewListColor('#1677ff');
          setCreateParentId(item.id);
          setCreateModalVisible(true);
        }
      },
    ] : [];

    const archiveItem = isArchived ? {
      key: 'unarchive',
      icon: <ArchiveOutlined />,
      label: '取消归档',
      onClick: () => handleArchiveList(item.id, false)
    } : {
      key: 'archive',
      icon: <ArchiveOutlined />,
      label: '归档',
      onClick: () => handleArchiveList(item.id, true)
    };

    return [
      ...moveItems,
      ...folderItems,
      archiveItem,
      {
        key: 'delete',
        icon: <DeleteOutlined />,
        label: '删除',
        danger: true,
        onClick: () => {
          setDeleteItem(item);
          setDeleteModalVisible(true);
        }
      }
    ];
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
          cursor: isDraggable && supportsHover ? 'move' : 'pointer'
        }}
        draggable={isDraggable && supportsHover}
        onDragStart={(e) => handleDragStart(e, item, index, parentId)}
        onDragOver={(e) => handleDragOver(e, item, index)}
        onDrop={(e) => handleDrop(e, item, index)}
        onDragEnd={handleDragEnd}
        onTouchStart={() => handleItemTouchStart(isFolder ? `folder-${item.id}` : `list-${item.id}`)}
        onTouchMove={handleListTouchMove}
        onTouchEnd={handleListTouchEnd}
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
        onContextMenu={(e) => {
          e.preventDefault();
          setMobileMenuKey(isFolder ? `folder-${item.id}` : `list-${item.id}`);
        }}
      >
        {/* 拖拽手柄（仅桌面端显示） */}
        {isDraggable && supportsHover && (
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
        {isFolder && (isFolderHovered || mobileMenuKey === `folder-${item.id}`) && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Dropdown
              menu={{ items: getFolderMoreMenuItems(item) }}
              trigger={['click']}
              open={mobileMenuKey === `folder-${item.id}` ? true : undefined}
              onOpenChange={(visible) => { if (!visible) setMobileMenuKey(null); }}
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
        {!isFolder && (isListHovered || mobileMenuKey === `list-${item.id}`) && (
          <Dropdown
            menu={{ items: getListMoreMenuItems(item, isArchivedList) }}
            trigger={['click']}
            open={mobileMenuKey === `list-${item.id}` ? true : undefined}
            onOpenChange={(visible) => { if (!visible) setMobileMenuKey(null); }}
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
        {!supportsHover ? (
          <Dropdown 
            menu={{ items: getMobileMenuItems(item, isArchivedList) }} 
            trigger={['contextMenu']}
          >
            {listItemContent}
          </Dropdown>
        ) : isFolder ? (
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
                ? <span style={{ fontSize: 10, marginRight: 4 }}>·</span>
                : <span style={{ fontSize: 10, marginRight: 4 }}>◦</span>
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
                      onContextMenu={(e) => { e.preventDefault(); setMobileMenuKey(`tag-${tag.id}`); }}
                      onTouchStart={() => handleItemTouchStart(`tag-${tag.id}`)}
                      onTouchMove={handleListTouchMove}
                      onTouchEnd={handleListTouchEnd}
                      onMouseEnter={() => { if (supportsHover) setHoveredTagId(tag.id); }}
                      onMouseLeave={() => { if (supportsHover) setHoveredTagId(null); }}
                    >
                      <TagOutlined />
                      <span>{tag.name}</span>
                      {(isTagHovered || mobileMenuKey === `tag-${tag.id}`) ? (
                        <Dropdown
                          menu={{ items: getTagMoreMenuItems(tag) }}
                          trigger={['click']}
                          open={mobileMenuKey === `tag-${tag.id}` ? true : undefined}
                          onOpenChange={(visible) => { if (!visible) setMobileMenuKey(null); }}
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

      {/* 笔记视图面板 */}
      {isNoteView && (
        <div className="secondary-panel">
          <div className="panel-title">笔记</div>

          {/* 文件夹区域 - 树形结构 */}
          <div className="section-header">
            <span>文件夹</span>
            <PlusOutlined style={{ cursor: 'pointer' }} onClick={() => setCreateNoteFolderModalVisible(true)} />
          </div>

          <div className="lists-container">
            {noteFolders.length > 0 ? (
              noteFolders
                .sort((a, b) => a.order - b.order)
                .map(folder => {
                  const isSelected = searchParams.get('folder_id') === folder.id;
                  const isHovered = hoveredNoteFolderId === folder.id;
                  const isExpanded = !noteCollapsedFolders[folder.id];
                  const folderNotes = notes.filter(n => n.folder_id === folder.id).sort((a, b) => a.order - b.order);
                  return (
                    <div key={folder.id}>
                      <div
                        className={`list-item ${isSelected ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setNoteCollapsedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] })); onNavigate?.(); }}
                        onContextMenu={(e) => { e.preventDefault(); setMobileMenuKey(`noteFolder-${folder.id}`); }}
                        onTouchStart={() => handleItemTouchStart(`noteFolder-${folder.id}`)}
                        onTouchMove={handleListTouchMove}
                        onTouchEnd={handleListTouchEnd}
                        onMouseEnter={() => { if (supportsHover) setHoveredNoteFolderId(folder.id); }}
                        onMouseLeave={() => { if (supportsHover) setHoveredNoteFolderId(null); }}
                      >
                        {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                        <FolderOutlined />
                        <span className="list-name">{folder.name}</span>
                        {(isHovered || mobileMenuKey === `noteFolder-${folder.id}`) ? (
                          <Dropdown
                            menu={{ items: getNoteFolderContextMenuItems(folder) }}
                            trigger={['click']}
                            open={mobileMenuKey === `noteFolder-${folder.id}` ? true : undefined}
                            onOpenChange={(visible) => { if (!visible) setMobileMenuKey(null); }}
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
                          <span className="list-dot" style={{ background: folder.color }} />
                        )}
                      </div>
                      {/* 文件夹下的笔记 */}
                      {isExpanded && folderNotes.map(note => {
                        const noteSelected = searchParams.get('note_id') === note.id;
                        return (
                          <div
                            key={note.id}
                            className={`list-item note-child-item ${noteSelected ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); navigate(`/notes?note_id=${note.id}`); onNavigate?.(); }}
                          >
                            <FileTextOutlined style={{ fontSize: 12 }} />
                            <span className="list-name">{note.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
            ) : (
              <div style={{ padding: '8px 16px', color: 'var(--ant-color-text-quaternary)', fontSize: 13 }}>暂无文件夹</div>
            )}
          </div>

          {/* 未分类笔记 */}
          {(() => {
            const uncategorized = notes.filter(n => !n.folder_id).sort((a, b) => a.order - b.order);
            if (uncategorized.length === 0) return null;
            const isExpanded = !noteCollapsedFolders['_uncategorized_'];
            return (
              <div>
                <div
                  className="section-header"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setNoteCollapsedFolders(prev => ({ ...prev, '_uncategorized_': !prev['_uncategorized_'] }))}
                >
                  <span>
                    {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                    未分类
                  </span>
                </div>
                {isExpanded && (
                  <div className="lists-container">
                    {uncategorized.map(note => {
                      const noteSelected = searchParams.get('note_id') === note.id;
                      return (
                        <div
                          key={note.id}
                          className={`list-item note-child-item ${noteSelected ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); navigate(`/notes?note_id=${note.id}`); onNavigate?.(); }}
                        >
                          <FileTextOutlined style={{ fontSize: 12 }} />
                          <span className="list-name">{note.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* 标签区域 */}
          <div className="section-header">
            <span onClick={() => {
              if (tagDisplayMode === 'hidden') {
                setTagDisplayMode('all');
              } else {
                const allCollapsed = tags.length > 0 && tags.every(t => noteCollapsedFolders[`tag-${t.id}`]);
                setNoteCollapsedFolders(prev => {
                  const next = { ...prev };
                  tags.forEach(t => { next[`tag-${t.id}`] = !allCollapsed; });
                  return next;
                });
              }
            }}>
              {(() => {
                  const allCollapsed = tags.length > 0 && tags.every(t => noteCollapsedFolders[`tag-${t.id}`]);
                  return allCollapsed
                    ? <RightOutlined style={{ fontSize: 10, marginRight: 4 }} />
                    : <DownOutlined style={{ fontSize: 10, marginRight: 4 }} />;
                })()}
              标签
            </span>
            <PlusOutlined
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                openCreateTagModal();
              }}
            />
          </div>
          {tagDisplayMode !== 'hidden' && (
            <div className="tags-container">
              {tags.map(tag => {
                const isExpanded = !noteCollapsedFolders[`tag-${tag.id}`];
                const tagNotes = notes.filter(n => n.tags && n.tags.includes(tag.id)).sort((a, b) => a.order - b.order);
                return (
                  <div key={tag.id}>
                    <div
                      className={`tag-item ${searchParams.get('tag') === tag.id ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); setNoteCollapsedFolders(prev => ({ ...prev, [`tag-${tag.id}`]: !prev[`tag-${tag.id}`] })); }}
                      onContextMenu={(e) => { e.preventDefault(); setMobileMenuKey(`noteTag-${tag.id}`); }}
                      onTouchStart={() => handleItemTouchStart(`noteTag-${tag.id}`)}
                      onTouchMove={handleListTouchMove}
                      onTouchEnd={handleListTouchEnd}
                      onMouseEnter={() => { if (supportsHover) setHoveredTagId(tag.id); }}
                      onMouseLeave={() => { if (supportsHover) setHoveredTagId(null); }}
                    >
                      {isExpanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
                      <TagOutlined style={{ color: tag.color }} />
                      <span>{tag.name}</span>
                      {(hoveredTagId === tag.id || mobileMenuKey === `noteTag-${tag.id}`) ? (
                        <Dropdown
                          menu={{ items: getTagMoreMenuItems(tag) }}
                          trigger={['click']}
                          open={mobileMenuKey === `noteTag-${tag.id}` ? true : undefined}
                          onOpenChange={(visible) => { if (!visible) setMobileMenuKey(null); }}
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
                    {/* 标签下的笔记 */}
                    {isExpanded && tagNotes.map(note => {
                      const noteSelected = searchParams.get('note_id') === note.id;
                      return (
                        <div
                          key={note.id}
                          className={`list-item note-child-item ${noteSelected ? 'active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); navigate(`/notes?note_id=${note.id}`); onNavigate?.(); }}
                        >
                          <FileTextOutlined style={{ fontSize: 12 }} />
                          <span className="list-name">{note.title}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* 新建笔记按钮 */}
          <div className="bottom-items">
            <div
              className="filter-item"
              onClick={(e) => { e.stopPropagation(); handleCreateNote(); }}
            >
              <PlusOutlined />
              <span>新建笔记</span>
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

      {/* 删除清单确认 Modal */}
      <DeleteListConfirmModal
        visible={deleteModalVisible}
        item={deleteItem}
        lists={lists}
        onCancel={() => setDeleteModalVisible(false)}
        onSuccess={() => {
          setDeleteModalVisible(false);
          setDeleteItem(null);
          loadLists();
          refreshTasks();
          // 如果当前正在查看被删除的清单或其子清单，导航到收集箱
          const currentListId = searchParams.get('list_id');
          if (deleteItem && currentListId === deleteItem.id) {
            navigate('/?list_id=inbox');
            onNavigate?.();
          } else if (deleteItem && deleteItem.type === 'folder') {
            const sublists = lists.filter(l => l.parent_id === deleteItem!.id);
            if (sublists.some(s => s.id === currentListId)) {
              navigate('/?list_id=inbox');
              onNavigate?.();
            }
          }
        }}
      />

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

      {/* 新建笔记文件夹 Modal */}
      <Modal
        title="新建文件夹"
        open={createNoteFolderModalVisible}
        onOk={handleCreateNoteFolder}
        onCancel={() => {
          setCreateNoteFolderModalVisible(false);
          setNewNoteFolderName('');
          setNewNoteFolderColor('#1677ff');
        }}
        confirmLoading={createNoteFolderLoading}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}>名称</div>
          <Input 
            placeholder="请输入文件夹名称"
            value={newNoteFolderName}
            onChange={e => setNewNoteFolderName(e.target.value)}
            onPressEnter={handleCreateNoteFolder}
          />
        </div>
        <div>
          <div style={{ marginBottom: 8 }}>颜色</div>
          <Select
            value={newNoteFolderColor}
            onChange={setNewNoteFolderColor}
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
