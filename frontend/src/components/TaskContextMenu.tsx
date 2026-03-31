import React, { useState, useEffect, useRef } from 'react';
import { Menu, message, Input, Button, Popover, Checkbox, Modal, DatePicker } from 'antd';
import moment from 'moment';
import {
  CalendarOutlined,
  FlagOutlined,
  LinkOutlined,
  PushpinOutlined,
  CloseOutlined,
  FolderOutlined,
  TagOutlined,
  CopyOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  SubnodeOutlined,
  SearchOutlined,
  InboxOutlined,
  RightOutlined,
  UnorderedListOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { useNavigate } from 'react-router-dom';
import { Task, TaskList, Tag } from '../types';
import { useTaskContext } from '../contexts/TaskContext';
import { duplicateTask } from '../api/task';
import { getLists } from '../api/list';
import { getTags } from '../api/tag';

interface TaskContextMenuProps {
  task: Task;
  onClose: () => void;
}

const TaskContextMenu: React.FC<TaskContextMenuProps> = ({ task, onClose }) => {
  const { updateTaskData, deleteTaskData, refreshTasks, addTask, selectTask } = useTaskContext();
  const navigate = useNavigate();
  
  // 清单数据
  const [lists, setLists] = useState<TaskList[]>([]);
  // 标签数据
  const [tags, setTags] = useState<Tag[]>([]);
  
  // "移动到"面板状态
  const [moveToVisible, setMoveToVisible] = useState(false);
  const [moveSearchText, setMoveSearchText] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  // "标签"面板状态
  const [tagPanelVisible, setTagPanelVisible] = useState(false);
  const [tagSearchText, setTagSearchText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(task.tags || []);
  
  // 自定义日期弹窗状态
  const [customDateVisible, setCustomDateVisible] = useState(false);
  const [customDate, setCustomDate] = useState<moment.Moment | null>(null);
  
  // 加载清单和标签
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

  // 处理移动到清单
  const handleMoveToList = async (listId: string | null) => {
    try {
      await updateTaskData(task.id, { list_id: listId });
      message.success(listId ? '已移动到清单' : '已移到收集箱');
      await refreshTasks();
      setMoveToVisible(false);
      onClose();
    } catch (error) {
      console.error('移动失败:', error);
    }
  };

  // 处理保存标签
  const handleSaveTags = async () => {
    try {
      await updateTaskData(task.id, { tags: selectedTags });
      message.success('标签已更新');
      await refreshTasks();
      setTagPanelVisible(false);
      onClose();
    } catch (error) {
      console.error('更新标签失败:', error);
    }
  };

  // 切换文件夹展开状态
  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  // 切换标签选中状态
  const toggleTag = (tagName: string) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter(t => t !== tagName));
    } else {
      setSelectedTags([...selectedTags, tagName]);
    }
  };

  // 构建清单树形结构
  const buildListTree = () => {
    const folders = lists.filter(l => l.type === 'folder');
    const allLists = lists.filter(l => l.type === 'list');
    const rootLists = allLists.filter(l => !l.parent_id);
    
    return { folders, allLists, rootLists };
  };

  // 过滤清单
  const filterLists = (items: TaskList[]) => {
    if (!moveSearchText) return items;
    return items.filter(l => l.name.toLowerCase().includes(moveSearchText.toLowerCase()));
  };

  // 过滤标签
  const filterTags = () => {
    if (!tagSearchText) return tags;
    return tags.filter(t => t.name.toLowerCase().includes(tagSearchText.toLowerCase()));
  };

  // 渲染"移动到"面板内容
  const renderMoveToContent = () => {
    const { folders, allLists, rootLists } = buildListTree();
    
    return (
      <div style={{ width: 220, maxHeight: 350, overflow: 'auto' }}>
        {/* 搜索框 */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="搜索"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={moveSearchText}
            onChange={(e) => setMoveSearchText(e.target.value)}
            size="small"
            allowClear
          />
        </div>
        
        {/* 收集箱 */}
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: !task.list_id ? '#1890ff' : 'inherit',
            background: !task.list_id ? '#e6f7ff' : 'transparent',
          }}
          onClick={() => handleMoveToList(null)}
          onMouseEnter={(e) => { if (task.list_id) e.currentTarget.style.background = '#f5f5f5'; }}
          onMouseLeave={(e) => { if (task.list_id) e.currentTarget.style.background = 'transparent'; }}
        >
          <InboxOutlined />
          <span>收集箱</span>
          {!task.list_id && <CheckOutlined style={{ marginLeft: 'auto' }} />}
        </div>
        
        {/* 根级清单（无父文件夹的清单） */}
        {filterLists(rootLists).map(list => (
          <div
            key={list.id}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: task.list_id === list.id ? '#1890ff' : 'inherit',
              background: task.list_id === list.id ? '#e6f7ff' : 'transparent',
            }}
            onClick={() => handleMoveToList(list.id)}
            onMouseEnter={(e) => { if (task.list_id !== list.id) e.currentTarget.style.background = '#f5f5f5'; }}
            onMouseLeave={(e) => { if (task.list_id !== list.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <UnorderedListOutlined />
            <span>{list.name}</span>
            {task.list_id === list.id && <CheckOutlined style={{ marginLeft: 'auto' }} />}
          </div>
        ))}
        
        {/* 文件夹及其子清单 */}
        {filterLists(folders).map(folder => {
          const childLists = allLists.filter(l => l.parent_id === folder.id);
          const isExpanded = expandedFolders.has(folder.id);
          const hasMatchingChildren = moveSearchText && 
            childLists.some(l => l.name.toLowerCase().includes(moveSearchText.toLowerCase()));
          const shouldShow = !moveSearchText || 
            folder.name.toLowerCase().includes(moveSearchText.toLowerCase()) || 
            hasMatchingChildren;
          
          if (!shouldShow) return null;
          
          return (
            <div key={folder.id}>
              {/* 文件夹项 */}
              <div
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onClick={() => toggleFolder(folder.id)}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <FolderOutlined style={{ color: folder.color || '#faad14' }} />
                <span style={{ flex: 1 }}>{folder.name}</span>
                <RightOutlined 
                  style={{ 
                    fontSize: 10, 
                    color: '#bfbfbf',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s',
                  }} 
                />
              </div>
              
              {/* 子清单 */}
              {(isExpanded || moveSearchText) && childLists.map(list => {
                const matchesSearch = !moveSearchText || 
                  list.name.toLowerCase().includes(moveSearchText.toLowerCase());
                if (!matchesSearch) return null;
                
                return (
                  <div
                    key={list.id}
                    style={{
                      padding: '8px 12px 8px 36px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: task.list_id === list.id ? '#1890ff' : 'inherit',
                      background: task.list_id === list.id ? '#e6f7ff' : 'transparent',
                    }}
                    onClick={() => handleMoveToList(list.id)}
                    onMouseEnter={(e) => { if (task.list_id !== list.id) e.currentTarget.style.background = '#f5f5f5'; }}
                    onMouseLeave={(e) => { if (task.list_id !== list.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <UnorderedListOutlined />
                    <span>{list.name}</span>
                    {task.list_id === list.id && <CheckOutlined style={{ marginLeft: 'auto' }} />}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  // 渲染"标签"面板内容
  const renderTagContent = () => {
    const filteredTags = filterTags();
    
    return (
      <div style={{ width: 220 }}>
        {/* 搜索框 */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <Input
            placeholder="输入标签"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            value={tagSearchText}
            onChange={(e) => setTagSearchText(e.target.value)}
            size="small"
            allowClear
          />
        </div>
        
        {/* 标签列表 */}
        <div style={{ maxHeight: 250, overflow: 'auto', padding: '4px 0' }}>
          {filteredTags.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999' }}>
              暂无标签
            </div>
          ) : (
            filteredTags.map(tag => (
              <div
                key={tag.id}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: selectedTags.includes(tag.name) ? '#e6f7ff' : 'transparent',
                }}
                onClick={() => toggleTag(tag.name)}
                onMouseEnter={(e) => { if (!selectedTags.includes(tag.name)) e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={(e) => { if (!selectedTags.includes(tag.name)) e.currentTarget.style.background = 'transparent'; }}
              >
                <TagOutlined style={{ color: tag.color || '#1890ff' }} />
                <span style={{ flex: 1 }}>{tag.name}</span>
                {selectedTags.includes(tag.name) && (
                  <CheckOutlined style={{ color: '#1890ff' }} />
                )}
              </div>
            ))
          )}
        </div>
        
        {/* 保存/取消按钮 */}
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid #f0f0f0',
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
        }}>
          <Button 
            type="primary" 
            size="small"
            onClick={handleSaveTags}
          >
            保存
          </Button>
          <Button 
            size="small"
            onClick={() => {
              setTagPanelVisible(false);
              setSelectedTags(task.tags || []);
              onClose();
            }}
          >
            取消
          </Button>
        </div>
      </div>
    );
  };

  const handleMenuClick: MenuProps['onClick'] = async ({ key }) => {
    // 特殊处理：移动到和标签由 Popover 处理
    if (key === 'move-to-list' || key === 'tags') {
      return;
    }

    onClose();

    try {
      switch (key) {
        case 'add-subtask':
          const newSubtask = await addTask({ 
            title: '新子任务', 
            parent_task_id: task.id,
            tags: task.tags || [],
            list_id: task.list_id,
          });
          if (newSubtask) {
            selectTask(newSubtask);
          }
          break;

        case 'focus-pomodoro':
          navigate(`/pomodoro?task_id=${task.id}&mode=pomodoro`);
          break;

        case 'focus-stopwatch':
          navigate(`/pomodoro?task_id=${task.id}&mode=stopwatch`);
          break;

        case 'pin':
          await updateTaskData(task.id, { is_pinned: !task.is_pinned });
          message.success(task.is_pinned ? '已取消置顶' : '已置顶');
          break;

        case 'priority-0':
        case 'priority-1':
        case 'priority-2':
        case 'priority-3':
        case 'priority-4':
          const priority = parseInt(key.split('-')[1]);
          await updateTaskData(task.id, { priority });
          message.success('优先级已更新');
          break;

        case 'today':
          await updateTaskData(task.id, { 
            due_date: moment().endOf('day').toISOString()
          });
          message.success('已设置为今天');
          await refreshTasks();
          break;

        case 'tomorrow':
          await updateTaskData(task.id, { 
            due_date: moment().add(1, 'day').endOf('day').toISOString()
          });
          message.success('已设置为明天');
          await refreshTasks();
          break;

        case 'next-week':
          await updateTaskData(task.id, { 
            due_date: moment().add(1, 'week').startOf('week').add(1, 'day').endOf('day').toISOString()
          });
          message.success('已设置为下周一');
          await refreshTasks();
          break;

        case 'custom':
          setCustomDateVisible(true);
          break;

        case 'cancel':
          await updateTaskData(task.id, { status: 'cancelled' });
          message.success('任务已取消');
          break;

        case 'duplicate':
          await duplicateTask(task.id);
          await refreshTasks();
          message.success('任务已复制');
          break;

        case 'copy-link':
          navigator.clipboard.writeText(window.location.origin + '/?task=' + task.id);
          message.success('链接已复制');
          break;

        case 'delete':
          await deleteTaskData(task.id);
          break;
      }
    } catch (error) {
      console.error('操作失败:', error);
    }
  };

  const items: MenuProps['items'] = [
    {
      key: 'add-subtask',
      icon: <SubnodeOutlined />,
      label: '添加子任务',
    },
    { type: 'divider' },
    {
      key: 'date',
      icon: <CalendarOutlined />,
      label: '日期',
      children: [
        { key: 'today', label: '今天' },
        { key: 'tomorrow', label: '明天' },
        { key: 'next-week', label: '下周' },
        { key: 'custom', label: '自定义' },
      ],
    },
    {
      key: 'priority',
      icon: <FlagOutlined />,
      label: '优先级',
      children: [
        { key: 'priority-0', label: '无' },
        { key: 'priority-1', label: <span style={{ color: 'red' }}>红旗</span> },
        { key: 'priority-2', label: <span style={{ color: 'orange' }}>黄旗</span> },
        { key: 'priority-3', label: <span style={{ color: 'blue' }}>蓝旗</span> },
        { key: 'priority-4', label: <span style={{ color: 'gray' }}>灰旗</span> },
      ],
    },
    {
      key: 'move-to-list',
      icon: <FolderOutlined />,
      label: (
        <div onClick={(e) => e.stopPropagation()}>
          <Popover
            content={renderMoveToContent()}
            trigger="click"
            placement="rightTop"
            open={moveToVisible}
            onOpenChange={setMoveToVisible}
            overlayInnerStyle={{ padding: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>移动到</span>
              <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
            </div>
          </Popover>
        </div>
      ),
    },
    {
      key: 'tags',
      icon: <TagOutlined />,
      label: (
        <div onClick={(e) => e.stopPropagation()}>
          <Popover
            content={renderTagContent()}
            trigger="click"
            placement="rightTop"
            open={tagPanelVisible}
            onOpenChange={setTagPanelVisible}
            overlayInnerStyle={{ padding: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span>标签</span>
              <RightOutlined style={{ fontSize: 10, color: '#bfbfbf' }} />
            </div>
          </Popover>
        </div>
      ),
    },
    { type: 'divider' },
    {
      key: 'pin',
      icon: <PushpinOutlined />,
      label: task.is_pinned ? '取消置顶' : '置顶',
    },
    {
      key: 'cancel',
      icon: <CloseOutlined />,
      label: '放弃',
    },
    { type: 'divider' },
    {
      key: 'focus',
      icon: <ClockCircleOutlined />,
      label: '开始专注',
      children: [
        { key: 'focus-pomodoro', label: '开始番茄专注' },
        { key: 'focus-stopwatch', label: '开始正计时' },
      ],
    },
    { type: 'divider' },
    {
      key: 'duplicate',
      icon: <CopyOutlined />,
      label: '创建副本',
    },
    {
      key: 'copy-link',
      icon: <LinkOutlined />,
      label: '复制链接',
    },
    { type: 'divider' },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: '删除',
      danger: true,
    },
  ];

  // 处理自定义日期确认
  const handleCustomDateOk = async () => {
    if (customDate && task) {
      await updateTaskData(task.id, { due_date: customDate.toISOString() });
      message.success('截止日期已设置');
      await refreshTasks();
    }
    setCustomDateVisible(false);
    setCustomDate(null);
  };

  // 处理自定义日期取消
  const handleCustomDateCancel = () => {
    setCustomDateVisible(false);
    setCustomDate(null);
  };

  return (
    <>
      <Menu
        onClick={handleMenuClick}
        items={items}
        style={{ minWidth: 200 }}
      />
      <Modal
        title="设置截止日期"
        open={customDateVisible}
        onOk={handleCustomDateOk}
        onCancel={handleCustomDateCancel}
        okText="确定"
        cancelText="取消"
      >
        <DatePicker
          showTime
          value={customDate}
          onChange={setCustomDate}
          style={{ width: '100%' }}
          placeholder="选择截止日期和时间"
        />
      </Modal>
    </>
  );
};

export default TaskContextMenu;
