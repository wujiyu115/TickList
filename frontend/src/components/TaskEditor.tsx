import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Input, Checkbox, Button, Popover, DatePicker, TimePicker, Switch, Segmented, Tooltip, Dropdown, Modal } from 'antd';
import { CalendarOutlined, MinusOutlined, CloseOutlined, PlusOutlined, ClockCircleOutlined, CheckOutlined, SendOutlined, EllipsisOutlined, DeleteOutlined, HolderOutlined, UnorderedListOutlined, FileTextOutlined, ExpandOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import TaskContextMenu from './TaskContextMenu';
import { useTaskContext } from '../contexts/TaskContext';
import { reorderTasks } from '../api/task';
import { Task } from '../types';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');

// hover 能力检测（区分桌面端/移动端）
const supportsHover = window.matchMedia('(hover: hover)').matches;

// 提醒选项类型
type ReminderOption = 'on_time' | '5min' | '30min' | '1hour' | '1day' | 'on_end' | 'custom';

// 提醒选项配置
const reminderOptions: { key: ReminderOption; label: string; disabled?: boolean }[] = [
  { key: 'on_time', label: '准时' },
  { key: '5min', label: '提前 5 分钟' },
  { key: '30min', label: '提前 30 分钟' },
  { key: '1hour', label: '提前 1 小时' },
  { key: '1day', label: '提前 1 天' },
  { key: 'on_end', label: '结束时' },
  { key: 'custom', label: '自定义', disabled: true },
];

// 根据提醒选项计算 reminder_time
const calculateReminderTime = (
  option: ReminderOption,
  startTime: Dayjs | null,
  endTime: Dayjs | null
): Dayjs | null => {
  if (!startTime && option !== 'on_end') return null;
  if (!endTime && option === 'on_end') return null;
  
  switch (option) {
    case 'on_time':
      return startTime?.clone() || null;
    case '5min':
      return startTime?.subtract(5, 'minute') || null;
    case '30min':
      return startTime?.subtract(30, 'minute') || null;
    case '1hour':
      return startTime?.subtract(1, 'hour') || null;
    case '1day':
      return startTime?.subtract(1, 'day') || null;
    case 'on_end':
      return endTime?.clone() || null;
    default:
      return null;
  }
};

// 格式化日期显示
const formatDateDisplay = (startTime?: string, dueDate?: string): string => {
  if (!startTime && !dueDate) return '';
  
  const start = startTime ? dayjs(startTime) : null;
  const end = dueDate ? dayjs(dueDate) : null;
  
  const formatDate = (m: Dayjs) => {
    const dateStr = m.format('M月D日');
    const timeStr = m.format('HH:mm');
    // 如果是整点00:00戶23:59，可能是全天模式
    if (timeStr === '00:00' || timeStr === '23:59') {
      return dateStr;
    }
    return `${dateStr}, ${timeStr}`;
  };
  
  if (start && end) {
    return `📅 ${formatDate(start)} - ${formatDate(end)}`;
  } else if (start) {
    return `📅 ${formatDate(start)}`;
  } else if (end) {
    return `📅 截止: ${formatDate(end)}`;
  }
  return '';
};

// 格式化专注时长
const formatFocusDuration = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h${minutes}m` : `${hours}h`;
  }
};

type ContentItem = { text: string; checked: boolean; completedAt?: string };

function sortContentItems(items: ContentItem[]): ContentItem[] {
  const unchecked = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked).sort((a, b) => {
    const ta = a.completedAt || '';
    const tb = b.completedAt || '';
    return tb.localeCompare(ta);
  });
  return [...unchecked, ...checked];
}

const TaskEditor: React.FC = () => {
  const { selectedTask, updateTaskData, selectTask, addTask, tasks, refreshTasks, deleteTaskData } = useTaskContext();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [moreMenuVisible, setMoreMenuVisible] = useState(false);
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [contentViewMode, setContentViewMode] = useState<'detail' | 'checklist'>('detail');
  const [editingCheckIdx, setEditingCheckIdx] = useState<number | null>(null);
  const [editingCheckText, setEditingCheckText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const subtaskEnterRef = useRef(false);
  const [descFullscreen, setDescFullscreen] = useState(false);
  const [fullscreenDesc, setFullscreenDesc] = useState('');
  const [contentText, setContentText] = useState('');

  // 日期选择相关状态
  const [datePopoverVisible, setDatePopoverVisible] = useState(false);
  const [dateMode, setDateMode] = useState<'date' | 'range'>('range'); // 日期 / 时间段
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [startTime, setStartTime] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [endTime, setEndTime] = useState<Dayjs | null>(null);
  const [isAllDay, setIsAllDay] = useState(false);
  
  // 提醒相关状态
  const [reminderPanelVisible, setReminderPanelVisible] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<ReminderOption>('on_time');
  const [tempReminder, setTempReminder] = useState<ReminderOption>('on_time');

  // 选中任务变化时更新本地状态
  useEffect(() => {
    if (selectedTask) {
      setTitle(selectedTask.title);
      setDescription(selectedTask.description || '');
      setAddingSubtask(false);

      // 解析 content 为 contentItems
      try {
        const parsed = selectedTask.content ? JSON.parse(selectedTask.content) : [];
        if (Array.isArray(parsed)) {
          const sorted = sortContentItems(parsed);
          setContentItems(sorted);
          setContentText(sorted.map((item: {text: string}) => item.text).join('\n'));
        } else {
          setContentItems([]);
          setContentText('');
        }
      } catch {
        setContentItems([]);
        setContentText('');
      }

      // 从 localStorage 恢复视图模式
      const savedMode = localStorage.getItem(`task_view_mode_${selectedTask.id}`);
      if (savedMode === 'checklist' || savedMode === 'detail') {
        setContentViewMode(savedMode);
      } else {
        setContentViewMode('checklist');
      }
      setEditingCheckIdx(null);
      
      // 初始化日期状态
      if (selectedTask.start_time) {
        const st = dayjs(selectedTask.start_time);
        setStartDate(st.startOf('day'));
        setStartTime(st);
      } else {
        setStartDate(null);
        setStartTime(null);
      }
      
      if (selectedTask.due_date) {
        const dt = dayjs(selectedTask.due_date);
        setEndDate(dt.startOf('day'));
        setEndTime(dt);
        setDateMode('range');
      } else {
        setEndDate(null);
        setEndTime(null);
        setDateMode(selectedTask.start_time ? 'date' : 'range');
      }
      
      // 检查是否全天
      if (selectedTask.start_time && selectedTask.due_date) {
        const st = dayjs(selectedTask.start_time);
        const dt = dayjs(selectedTask.due_date);
        if (st.format('HH:mm') === '00:00' && dt.format('HH:mm') === '23:59') {
          setIsAllDay(true);
        } else {
          setIsAllDay(false);
        }
      } else {
        setIsAllDay(false);
      }
      
      setSelectedReminder('on_time');
      setTempReminder('on_time');
    }
  }, [selectedTask?.id]);

  if (!selectedTask) return null;

  // 找到子任务（通过 child_ids 查找）
  const childTasks = ((selectedTask.child_ids || [])
    .map(id => tasks.find(t => t.id === id))
    .filter(Boolean) as Task[])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  // 标题失焦时保存
  const handleTitleBlur = () => {
    if (title !== selectedTask.title) {
      updateTaskData(selectedTask.id, { title });
    }
    setEditingTitle(false);
  };

  // 描述失焦时保存
  const handleDescBlur = () => {
    if (description !== selectedTask.description) {
      updateTaskData(selectedTask.id, { description });
    }
  };

  // 状态切换
  const handleStatusToggle = () => {
    const newStatus = selectedTask.status === 'completed' ? 'pending' : 'completed';
    updateTaskData(selectedTask.id, { status: newStatus });
  };

  // 添加子任务
  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    await addTask({ 
      title: newSubtaskTitle.trim(), 
      parent_task_id: selectedTask.id,
      tags: selectedTask.tags || [],      // 继承父任务标签
      list_id: selectedTask.list_id,       // 继承父任务清单
    });
    setNewSubtaskTitle('');
    setAddingSubtask(false);
  };

  // 子任务状态切换
  const handleSubtaskToggle = (subtask: Task) => {
    const newStatus = subtask.status === 'completed' ? 'pending' : 'completed';
    updateTaskData(subtask.id, { status: newStatus });
  };

  // 子任务内联编辑
  const handleSubtaskEdit = (subtask: Task) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskTitle(subtask.title);
  };

  const handleSubtaskTitleSave = (subtask: Task) => {
    if (subtaskEnterRef.current) return;
    if (editingSubtaskTitle.trim() && editingSubtaskTitle !== subtask.title) {
      updateTaskData(subtask.id, { title: editingSubtaskTitle.trim() });
    }
    setEditingSubtaskId(null);
  };

  // 子任务编辑中回车：保存当前子任务并在下方新增子任务
  const handleSubtaskEnter = async (subtask: Task) => {
    subtaskEnterRef.current = true;
    try {
      if (editingSubtaskTitle.trim() && editingSubtaskTitle !== subtask.title) {
        updateTaskData(subtask.id, { title: editingSubtaskTitle.trim() });
      }
      setEditingSubtaskId(null);
      const result = await addTask({
        title: '',
        parent_task_id: selectedTask.id,
        tags: selectedTask.tags || [],
        list_id: selectedTask.list_id,
      });
      if (result && result.id) {
        // 插入到当前子任务下方而非末尾
        const currentIndex = childTasks.findIndex(c => c.id === subtask.id);
        if (currentIndex !== -1 && currentIndex < childTasks.length - 1) {
          const reorderItems: { id: string; order: number }[] = [];
          let order = 10;
          for (let i = 0; i < childTasks.length; i++) {
            reorderItems.push({ id: childTasks[i].id, order });
            order += 10;
            if (childTasks[i].id === subtask.id) {
              reorderItems.push({ id: result.id, order });
              order += 10;
            }
          }
          await reorderTasks(reorderItems);
          await refreshTasks();
        }
        setEditingSubtaskId(result.id);
        setEditingSubtaskTitle('');
      }
    } finally {
      subtaskEnterRef.current = false;
    }
  };

  // 全天开关切换
  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    if (checked) {
      // 全天模式：时间设为 00:00 和 23:59
      if (startDate) {
        setStartTime(startDate.startOf('day'));
      }
      if (endDate) {
        setEndTime(endDate.hour(23).minute(59));
      } else if (startDate && dateMode === 'range') {
        setEndDate(startDate);
        setEndTime(startDate.hour(23).minute(59));
      }
    }
  };

  // 确定保存日期
  const handleConfirmDate = () => {
    let finalStartTime: string | undefined;
    let finalDueDate: string | undefined;
    let finalReminderTime: string | undefined;

    // 合并日期和时间
    if (startDate) {
      let combined = startDate;
      if (isAllDay) {
        combined = combined.startOf('day');
      } else if (startTime) {
        combined = combined.hour(startTime.hour()).minute(startTime.minute()).second(0);
      }
      finalStartTime = combined.toISOString();
    }

    if (dateMode === 'range' && endDate) {
      let combined = endDate;
      if (isAllDay) {
        combined = combined.hour(23).minute(59).second(59);
      } else if (endTime) {
        combined = combined.hour(endTime.hour()).minute(endTime.minute()).second(0);
      }
      finalDueDate = combined.toISOString();
    }

    // 计算提醒时间
    if (selectedReminder !== 'custom' && (finalStartTime || finalDueDate)) {
      const startMoment = finalStartTime ? dayjs(finalStartTime) : null;
      const endMoment = finalDueDate ? dayjs(finalDueDate) : null;
      const reminderMoment = calculateReminderTime(selectedReminder, startMoment, endMoment);
      if (reminderMoment) {
        finalReminderTime = reminderMoment.toISOString();
      }
    }

    updateTaskData(selectedTask.id, {
      start_time: finalStartTime,
      due_date: finalDueDate,
      reminder_time: finalReminderTime,
    });
    setDatePopoverVisible(false);
  };

  // 清除日期
  const handleClearDate = () => {
    setStartDate(null);
    setStartTime(null);
    setEndDate(null);
    setEndTime(null);
    setIsAllDay(false);
    setSelectedReminder('on_time');
    setTempReminder('on_time');
    updateTaskData(selectedTask.id, {
      start_time: undefined,
      due_date: undefined,
      reminder_time: undefined,
    });
    setDatePopoverVisible(false);
  };

  // 保存提醒选择
  const handleSaveReminder = () => {
    setSelectedReminder(tempReminder);
    setReminderPanelVisible(false);
  };

  // 取消提醒选择
  const handleCancelReminder = () => {
    setTempReminder(selectedReminder);
    setReminderPanelVisible(false);
  };

  // 详情模式失焦保存 content
  const handleContentDetailBlur = () => {
    const lines = contentText.split('\n').filter(line => line.trim() !== '');
    const newItems = lines.map((line, idx) => ({
      text: line,
      checked: idx < contentItems.length ? contentItems[idx].checked : false,
    }));
    setContentItems(newItems);
    const json = JSON.stringify(newItems);
    if (json !== selectedTask.content) {
      updateTaskData(selectedTask.id, { content: json });
    }
  };

  const formatCompletedTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // 检查事项模式切换 checked
  const handleCheckToggle = (index: number) => {
    const toggled = contentItems.map((item, idx) => {
      if (idx !== index) return item;
      const nowChecked = !item.checked;
      return {
        ...item,
        checked: nowChecked,
        completedAt: nowChecked ? new Date().toISOString() : undefined,
      };
    });
    const sorted = sortContentItems(toggled);
    setContentItems(sorted);
    setContentText(sorted.map(item => item.text).join('\n'));
    updateTaskData(selectedTask.id, { content: JSON.stringify(sorted) });
  };

  // 删除检查事项
  const handleDeleteContentItem = (index: number) => {
    const newItems = contentItems.filter((_, idx) => idx !== index);
    setContentItems(newItems);
    setContentText(newItems.map(item => item.text).join('\n'));
    updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
  };

  // 检查事项行内编辑
  const handleCheckTextEdit = (index: number) => {
    setEditingCheckIdx(index);
    setEditingCheckText(contentItems[index].text);
  };

  const handleCheckTextSave = (index: number) => {
    if (editingCheckText.trim() === '') {
      // 空文本则删除该项
      handleDeleteContentItem(index);
    } else if (editingCheckText !== contentItems[index].text) {
      const newItems = contentItems.map((item, idx) =>
        idx === index ? { ...item, text: editingCheckText } : item
      );
      setContentItems(newItems);
      setContentText(newItems.map(item => item.text).join('\n'));
      updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
    }
    setEditingCheckIdx(null);
  };

  // 编辑中回车：保存当前项并在下方插入新项进入编辑
  const handleCheckTextEnter = (index: number) => {
    const currentText = editingCheckText.trim();
    const newItems = [...contentItems];
    // 更新当前项文本
    if (currentText !== '' && currentText !== newItems[index].text) {
      newItems[index] = { ...newItems[index], text: currentText };
    }
    // 在下方插入空项
    newItems.splice(index + 1, 0, { text: '', checked: false });
    setContentItems(newItems);
    setContentText(newItems.map(item => item.text).join('\n'));
    updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
    // 进入新项编辑
    setEditingCheckIdx(index + 1);
    setEditingCheckText('');
  };

  // 拖拽排序（支持桌面端和移动端）
  const dragIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number>(0);
  const touchItemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    dragOverIndexRef.current = index;
  }, []);

  const applyDragReorder = useCallback(() => {
    const from = dragIndexRef.current;
    const to = dragOverIndexRef.current;
    if (from === null || to === null || from === to) {
      dragIndexRef.current = null;
      dragOverIndexRef.current = null;
      return;
    }
    const newItems = [...contentItems];
    const [moved] = newItems.splice(from, 1);
    newItems.splice(to, 0, moved);
    setContentItems(newItems);
    setContentText(newItems.map(item => item.text).join('\n'));
    updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
  }, [contentItems, selectedTask?.id, updateTaskData]);

  const handleTouchStart = useCallback((e: React.TouchEvent, index: number) => {
    dragIndexRef.current = index;
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragIndexRef.current === null) return;
    const touchY = e.touches[0].clientY;
    // 找到当前触摸位置下的目标项
    for (let i = 0; i < touchItemRefs.current.length; i++) {
      const el = touchItemRefs.current[i];
      if (el) {
        const rect = el.getBoundingClientRect();
        if (touchY >= rect.top && touchY <= rect.bottom) {
          dragOverIndexRef.current = i;
          break;
        }
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    applyDragReorder();
  }, [applyDragReorder]);

  // 移动端检查事项上移/下移
  const handleMoveCheckItem = useCallback((index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= contentItems.length) return;
    const newItems = [...contentItems];
    [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];
    setContentItems(newItems);
    setContentText(newItems.map(item => item.text).join('\n'));
    updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
    // 如果当前正在编辑的项被移动，跟随更新编辑索引
    if (editingCheckIdx === index) {
      setEditingCheckIdx(targetIndex);
    } else if (editingCheckIdx === targetIndex) {
      setEditingCheckIdx(index);
    }
  }, [contentItems, selectedTask?.id, updateTaskData, editingCheckIdx]);

  // 子任务拖拽排序
  const subtaskDragIndexRef = useRef<number | null>(null);
  const subtaskDragOverIndexRef = useRef<number | null>(null);

  const handleSubtaskDragStart = useCallback((index: number) => {
    subtaskDragIndexRef.current = index;
  }, []);

  const handleSubtaskDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    subtaskDragOverIndexRef.current = index;
  }, []);

  const handleSubtaskDrop = useCallback(() => {
    const from = subtaskDragIndexRef.current;
    const to = subtaskDragOverIndexRef.current;
    if (from === null || to === null || from === to) {
      subtaskDragIndexRef.current = null;
      subtaskDragOverIndexRef.current = null;
      return;
    }
    const reordered = [...childTasks];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    subtaskDragIndexRef.current = null;
    subtaskDragOverIndexRef.current = null;
    // Update order values
    const items = reordered.map((t, i) => ({ id: t.id, order: (i + 1) * 10 }));
    reorderTasks(items).then(() => refreshTasks());
  }, [childTasks, refreshTasks]);

  const handleSubtaskDragEnd = useCallback(() => {
    subtaskDragIndexRef.current = null;
    subtaskDragOverIndexRef.current = null;
  }, []);

  const handleMoveSubtask = useCallback((index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= childTasks.length) return;
    const reordered = [...childTasks];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const items = reordered.map((t, i) => ({ id: t.id, order: (i + 1) * 10 }));
    reorderTasks(items).then(() => refreshTasks());
  }, [childTasks, refreshTasks]);

  // 切换视图模式
  const handleToggleViewMode = () => {
    let newMode: 'detail' | 'checklist';
    if (contentViewMode === 'detail') {
      // 切换前先保存 detail 模式的编辑
      const lines = contentText.split('\n').filter(line => line.trim() !== '');
      const newItems = lines.map((line, idx) => ({
        text: line,
        checked: idx < contentItems.length ? contentItems[idx].checked : false,
      }));
      setContentItems(newItems);
      const json = JSON.stringify(newItems);
      if (json !== selectedTask.content) {
        updateTaskData(selectedTask.id, { content: json });
      }
      newMode = 'checklist';
    } else {
      newMode = 'detail';
    }
    setContentViewMode(newMode);
    localStorage.setItem(`task_view_mode_${selectedTask.id}`, newMode);
  };

  // 获取提醒选项标签
  const getReminderLabel = () => {
    const option = reminderOptions.find(o => o.key === selectedReminder);
    return option?.label || '准时';
  };

  // 渲染提醒选择面板
  const renderReminderPanel = () => (
    <div style={{ padding: '8px 0' }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 8
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ClockCircleOutlined style={{ color: '#1890ff' }} />
          <span>准时</span>
        </div>
        <CloseOutlined 
          style={{ cursor: 'pointer', color: '#999' }}
          onClick={() => setReminderPanelVisible(false)}
        />
      </div>
      
      {reminderOptions.map(option => (
        <div
          key={option.key}
          onClick={() => !option.disabled && setTempReminder(option.key)}
          style={{
            padding: '10px 16px',
            cursor: option.disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: option.disabled ? '#ccc' : (tempReminder === option.key ? '#1890ff' : '#333'),
            backgroundColor: tempReminder === option.key ? '#e6f7ff' : 'transparent',
          }}
        >
          <span>{option.label}</span>
          {tempReminder === option.key && <CheckOutlined style={{ color: '#1890ff' }} />}
        </div>
      ))}

      <div style={{ 
        display: 'flex', 
        gap: 12, 
        padding: '12px 16px',
        borderTop: '1px solid #f0f0f0',
        marginTop: 8
      }}>
        <Button type="primary" onClick={handleSaveReminder} style={{ flex: 1 }}>
          保存
        </Button>
        <Button onClick={handleCancelReminder} style={{ flex: 1 }}>
          取消
        </Button>
      </div>
    </div>
  );

  // 渲染日期选择弹窗
  const renderDatePopover = () => (
    <div style={{ padding: '12px 0' }}>
      {/* Tab 切换 */}
      <div style={{ padding: '0 12px', marginBottom: 16 }}>
        <Segmented
          value={dateMode}
          onChange={(v) => setDateMode(v as 'date' | 'range')}
          options={[
            { label: '日期', value: 'date' },
            { label: '时间段', value: 'range' },
          ]}
          block
        />
      </div>

      {/* 开始日期时间 */}
      <div style={{ padding: '0 12px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ width: 40 }}>开始</span>
          <DatePicker
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              if (!startTime && date) {
                setStartTime(date.hour(9).minute(0));
              }
              if (isAllDay && date) {
                setStartTime(date.startOf('day'));
              }
            }}
            format="MM/DD"
            placeholder="选择日期"
            style={{ flex: 1 }}
            allowClear
          />
          {!isAllDay && (
            <TimePicker
              value={startTime}
              onChange={setStartTime}
              format="HH:mm"
              placeholder="时间"
              style={{ width: 90 }}
              allowClear={false}
            />
          )}
        </div>
      </div>

      {/* 结束日期时间 - 仅时间段模式显示 */}
      {dateMode === 'range' && (
        <div style={{ padding: '0 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 40 }}>结束</span>
            <DatePicker
              value={endDate}
              onChange={(date) => {
                setEndDate(date);
                if (!endTime && date) {
                  setEndTime(date.hour(18).minute(0));
                }
                if (isAllDay && date) {
                  setEndTime(date.hour(23).minute(59));
                }
              }}
              format="MM/DD"
              placeholder="选择日期"
              style={{ flex: 1 }}
              allowClear
            />
            {!isAllDay && (
              <TimePicker
                value={endTime}
                onChange={setEndTime}
                format="HH:mm"
                placeholder="时间"
                style={{ width: 90 }}
                allowClear={false}
              />
            )}
          </div>
        </div>
      )}

      {/* 全天开关 */}
      <div style={{ 
        padding: '8px 12px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderTop: '1px solid #f0f0f0',
        borderBottom: '1px solid #f0f0f0',
        marginBottom: 8
      }}>
        <span>全天</span>
        <Switch checked={isAllDay} onChange={handleAllDayChange} />
      </div>

      {/* 时区显示 */}
      <div style={{ padding: '8px 12px', color: '#666', fontSize: 13 }}>
        北京, UTC+08:00
      </div>

      {/* 提醒设置 */}
      {reminderPanelVisible ? (
        renderReminderPanel()
      ) : (
        <div 
          style={{ 
            padding: '8px 12px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            cursor: 'pointer',
            borderTop: '1px solid #f0f0f0'
          }}
          onClick={() => {
            setTempReminder(selectedReminder);
            setReminderPanelVisible(true);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined style={{ color: '#1890ff' }} />
            <span>{getReminderLabel()}</span>
          </div>
          <span style={{ color: '#999' }}>&gt;</span>
        </div>
      )}

      {/* 截止推送开关 - 仅时间段模式且有结束日期时显示 */}
      {dateMode === 'range' && !reminderPanelVisible && (
        <div 
          style={{ 
            padding: '8px 12px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            borderTop: '1px solid #f0f0f0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SendOutlined style={{ color: '#52c41a' }} />
            <span>截止推送</span>
          </div>
          <Switch
            size="small"
            checked={selectedTask?.push_due_notify || false}
            onChange={(checked) => {
              updateTaskData(selectedTask.id, { push_due_notify: checked });
            }}
          />
        </div>
      )}

      {/* 确定和清除按钮 */}
      {!reminderPanelVisible && (
        <div style={{ 
          display: 'flex', 
          gap: 12, 
          padding: '12px',
          borderTop: '1px solid #f0f0f0',
          marginTop: 8
        }}>
          <Button type="primary" onClick={handleConfirmDate} style={{ flex: 1 }}>
            确定
          </Button>
          <Button onClick={handleClearDate} style={{ flex: 1 }}>
            清除
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="task-editor-new">
      {/* 顶部操作栏 */}
      <div className="editor-topbar">
        <div className="topbar-left">
          <Checkbox
            checked={selectedTask.status === 'completed'}
            onChange={handleStatusToggle}
          />
          <Popover
            trigger="click"
            open={datePopoverVisible}
            onOpenChange={setDatePopoverVisible}
            placement="bottomLeft"
            content={renderDatePopover()}
            overlayStyle={{ width: 320 }}
          >
            <span className="date-reminder" style={{ cursor: 'pointer' }}>
              {selectedTask.start_time || selectedTask.due_date ? (
                <span style={{ color: '#1890ff' }}>
                  {formatDateDisplay(selectedTask.start_time, selectedTask.due_date)}
                </span>
              ) : (
                <>
                  <CalendarOutlined />
                  <span>日期与提醒</span>
                </>
              )}
            </span>
          </Popover>
          {/* 已专注信息 */}
          {((selectedTask.pomodoro_count && selectedTask.pomodoro_count > 0) || (selectedTask.focus_duration && selectedTask.focus_duration > 0)) && (
            <span className="focus-info" style={{ 
              marginLeft: 12,
              fontSize: 12,
              color: '#999',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}>
              <span>已专注</span>
              {selectedTask.pomodoro_count && selectedTask.pomodoro_count > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  🍅 {selectedTask.pomodoro_count}
                </span>
              )}
              {selectedTask.focus_duration && selectedTask.focus_duration > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                  <ClockCircleOutlined style={{ fontSize: 11 }} /> {formatFocusDuration(selectedTask.focus_duration)}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="topbar-right">
          <Button type="text" icon={<MinusOutlined />} size="small" />
          <Button type="text" icon={<CloseOutlined />} size="small" onClick={() => selectTask(null)} />
        </div>
      </div>

      {/* 标题 */}
      <div className="editor-title">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onPressEnter={handleTitleBlur}
          variant="borderless"
          className="title-input"
          placeholder="任务标题"
        />
        <Tooltip title={contentViewMode === 'detail' ? '切换为检查事项' : '切换为详情'}>
          <span className="content-toggle-icon" onClick={handleToggleViewMode}>
            {contentViewMode === 'detail' ? <UnorderedListOutlined /> : <FileTextOutlined />}
          </span>
        </Tooltip>
      </div>

      {/* 可滚动内容区域：描述 + 子任务 */}
      <div className="editor-scrollable">
      {/* 描述 */}
      <div className="editor-description">
        <div className="desc-wrapper">
          <Input.TextArea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={handleDescBlur}
            placeholder="添加描述..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            variant="borderless"
            className="desc-textarea"
          />
          <Tooltip title="全屏编辑">
            <ExpandOutlined
              className="desc-expand-icon"
              onClick={() => { setFullscreenDesc(description); setDescFullscreen(true); }}
            />
          </Tooltip>
        </div>
      </div>

      {/* 描述全屏编辑 Modal */}
      <Modal
        title="编辑描述"
        open={descFullscreen}
        onOk={() => {
          setDescription(fullscreenDesc);
          if (fullscreenDesc !== selectedTask.description) {
            updateTaskData(selectedTask.id, { description: fullscreenDesc });
          }
          setDescFullscreen(false);
        }}
        onCancel={() => setDescFullscreen(false)}
        okText="保存"
        cancelText="取消"
        width="90%"
        style={{ maxWidth: 800, top: 20 }}
        styles={{ body: { padding: '12px 0' } }}
      >
        <Input.TextArea
          value={fullscreenDesc}
          onChange={e => setFullscreenDesc(e.target.value)}
          autoSize={{ minRows: 15, maxRows: 30 }}
          placeholder="输入描述内容..."
          style={{ fontSize: 14, lineHeight: 1.8 }}
        />
      </Modal>

      <div className="editor-divider" />

      {/* 检查事项 / 详情内容区 */}
      <div className="editor-content">
        {contentViewMode === 'detail' ? (
          <Input.TextArea
            value={contentText}
            onChange={e => setContentText(e.target.value)}
            onBlur={handleContentDetailBlur}
            placeholder="添加检查事项，每行一条..."
            autoSize={{ minRows: 3, maxRows: 20 }}
            variant="borderless"
            className="content-textarea"
          />
        ) : (
          <div className="checklist-view">
            {contentItems.map((item, idx) => (
              <div
                key={idx}
                ref={el => { touchItemRefs.current[idx] = el; }}
                className={`checklist-item ${item.checked ? 'checked' : ''}`}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={applyDragReorder}
              >
                <div className="checklist-item-main">
                <Checkbox
                  checked={item.checked}
                  onChange={() => handleCheckToggle(idx)}
                />
                {editingCheckIdx === idx ? (
                  <Input
                    className="checklist-edit-input"
                    value={editingCheckText}
                    onChange={e => setEditingCheckText(e.target.value)}
                    onBlur={() => { if (editingCheckIdx === idx) handleCheckTextSave(idx); }}
                    onPressEnter={(e) => { e.preventDefault(); handleCheckTextEnter(idx); }}
                    autoFocus
                    variant="borderless"
                  />
                ) : (
                  <span className="checklist-text" onClick={() => handleCheckTextEdit(idx)}>{item.text}</span>
                )}
                {supportsHover ? (
                  <HolderOutlined
                    className="checklist-drag"
                    onTouchStart={(e: any) => handleTouchStart(e, idx)}
                    onTouchMove={handleTouchMove as any}
                    onTouchEnd={handleTouchEnd}
                  />
                ) : (
                  <span className="checklist-move-btns">
                    <ArrowUpOutlined
                      className={`checklist-move-btn ${idx === 0 ? 'disabled' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleMoveCheckItem(idx, 'up'); }}
                    />
                    <ArrowDownOutlined
                      className={`checklist-move-btn ${idx === contentItems.length - 1 ? 'disabled' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleMoveCheckItem(idx, 'down'); }}
                    />
                  </span>
                )}
                <DeleteOutlined
                  className="checklist-delete"
                  onClick={() => handleDeleteContentItem(idx)}
                />
                </div>
                {item.checked && item.completedAt && (
                  <div className="checklist-completed-time">
                    {formatCompletedTime(item.completedAt)}
                  </div>
                )}
              </div>
            ))}
            {contentItems.length === 0 && (
              <div className="checklist-item checklist-placeholder">
                <Checkbox disabled />
                <Input
                  className="checklist-edit-input"
                  placeholder="回车添加下一项"
                  variant="borderless"
                  onFocus={() => {
                    const newItems = [{ text: '', checked: false }];
                    setContentItems(newItems);
                    setContentText('');
                    updateTaskData(selectedTask.id, { content: JSON.stringify(newItems) });
                    setEditingCheckIdx(0);
                    setEditingCheckText('');
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 仅当子任务列表非空时显示分隔线 */}
      {childTasks.length > 0 && <div className="editor-divider" />}

      {/* 子任务列表 */}
      <div className="editor-subtasks">
        {childTasks.map((subtask, idx) => (
          <div
            key={subtask.id}
            className={`subtask-item ${subtask.status === 'completed' ? 'completed' : ''}`}
            style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
            draggable={supportsHover && editingSubtaskId !== subtask.id}
            onDragStart={() => handleSubtaskDragStart(idx)}
            onDragOver={(e) => handleSubtaskDragOver(e, idx)}
            onDrop={handleSubtaskDrop}
            onDragEnd={handleSubtaskDragEnd}
          >
            <Checkbox
              checked={subtask.status === 'completed'}
              onChange={() => handleSubtaskToggle(subtask)}
            />
            {editingSubtaskId === subtask.id ? (
              <Input
                className="subtask-edit-input"
                value={editingSubtaskTitle}
                onChange={e => setEditingSubtaskTitle(e.target.value)}
                onBlur={() => handleSubtaskTitleSave(subtask)}
                onPressEnter={(e) => { e.preventDefault(); handleSubtaskEnter(subtask); }}
                autoFocus
                variant="borderless"
                placeholder="输入子任务标题"
              />
            ) : (
              <span className="subtask-title" onClick={() => handleSubtaskEdit(subtask)}>
                {subtask.title || <span style={{ color: '#bbb' }}>未命名子任务</span>}
              </span>
            )}
            {supportsHover ? (
              <HolderOutlined className="subtask-drag-handle" />
            ) : (
              <span className="subtask-move-btns">
                <ArrowUpOutlined
                  className={`subtask-move-btn ${idx === 0 ? 'disabled' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleMoveSubtask(idx, 'up'); }}
                />
                <ArrowDownOutlined
                  className={`subtask-move-btn ${idx === childTasks.length - 1 ? 'disabled' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleMoveSubtask(idx, 'down'); }}
                />
              </span>
            )}
            <DeleteOutlined
              className="subtask-delete"
              onClick={(e) => { e.stopPropagation(); deleteTaskData(subtask.id); }}
            />
          </div>
        ))}

        {/* 添加子任务 */}
        {addingSubtask && (
          <div 
            className="add-subtask-input"
            onMouseDown={e => e.preventDefault()}
          >
            <Input
              value={newSubtaskTitle}
              onChange={e => setNewSubtaskTitle(e.target.value)}
              onPressEnter={handleAddSubtask}
              onBlur={() => { 
                // 延迟检查，避免与其他事件竞争导致输入框立即关闭
                setTimeout(() => {
                  if (!newSubtaskTitle.trim()) {
                    setAddingSubtask(false);
                  }
                }, 150);
              }}
              placeholder="输入子任务标题，回车创建"
              autoFocus
              variant="borderless"
            />
          </div>
        )}
      </div>
      </div>

      {/* 底部工具栏 */}
      <div className="editor-toolbar">
        <div className="toolbar-actions">
          <div className="toolbar-left">
            <Tooltip title="添加子任务">
              <PlusOutlined className="toolbar-icon" onClick={() => setAddingSubtask(true)} />
            </Tooltip>
          </div>
          <div className="toolbar-right">
            <Dropdown
              dropdownRender={() => (
                <TaskContextMenu task={selectedTask} onClose={() => setMoreMenuVisible(false)} />
              )}
              open={moreMenuVisible}
              onOpenChange={setMoreMenuVisible}
              trigger={['click']}
              placement="topRight"
            >
              <Tooltip title="更多">
                <EllipsisOutlined className="toolbar-icon" />
              </Tooltip>
            </Dropdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskEditor;
