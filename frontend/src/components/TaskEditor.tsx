import React, { useEffect, useState } from 'react';
import { Input, Checkbox, Button, Popover, DatePicker, TimePicker, Switch, Segmented } from 'antd';
import { CalendarOutlined, MinusOutlined, CloseOutlined, PlusOutlined, ClockCircleOutlined, CheckOutlined } from '@ant-design/icons';
import { useTaskContext } from '../contexts/TaskContext';
import { Task } from '../types';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
dayjs.locale('zh-cn');


// 简单 Markdown 渲染函数
const simpleMarkdown = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
    .replace(/\n/g, '<br/>');
};

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
    // 如果是整点00:00或23:59，可能是全天模式
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

const TaskEditor: React.FC = () => {
  const { selectedTask, updateTaskData, selectTask, addTask, tasks, refreshTasks } = useTaskContext();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

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
      setIsPreview(false);
      setAddingSubtask(false);
      
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
  const childTasks = (selectedTask.child_ids || [])
    .map(id => tasks.find(t => t.id === id))
    .filter(Boolean) as Task[];

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
    refreshTasks();
  };

  // 子任务状态切换
  const handleSubtaskToggle = (subtask: Task) => {
    const newStatus = subtask.status === 'completed' ? 'pending' : 'completed';
    updateTaskData(subtask.id, { status: newStatus });
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
      </div>

      {/* 描述 - Markdown */}
      <div className="editor-description">
        <div className="desc-header">
          <span className="desc-label">描述</span>
          <Button type="text" size="small" onClick={() => setIsPreview(!isPreview)}>
            {isPreview ? '编辑' : '预览'}
          </Button>
        </div>
        {isPreview ? (
          <div 
            className="desc-preview markdown-body" 
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(description) }} 
          />
        ) : (
          <Input.TextArea
            value={description}
            onChange={e => setDescription(e.target.value)}
            onBlur={handleDescBlur}
            placeholder="添加描述（支持 Markdown）..."
            autoSize={{ minRows: 3, maxRows: 15 }}
            variant="borderless"
            className="desc-textarea"
          />
        )}
      </div>

      {/* 子任务列表 */}
      <div className="editor-subtasks">
        {childTasks.map(subtask => (
          <div key={subtask.id} className={`subtask-item ${subtask.status === 'completed' ? 'completed' : ''}`}>
            <Checkbox
              checked={subtask.status === 'completed'}
              onChange={() => handleSubtaskToggle(subtask)}
            />
            <span className="subtask-title" onClick={() => selectTask(subtask)}>
              {subtask.title}
            </span>
          </div>
        ))}

        {/* 添加子任务 */}
        {addingSubtask ? (
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
        ) : (
          <div className="add-subtask-btn" onClick={() => setAddingSubtask(true)}>
            <PlusOutlined />
            <span>添加子任务</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskEditor;
