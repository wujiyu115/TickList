import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Checkbox, Dropdown, Input } from 'antd';
import { message } from '../utils/antdApp';
import { CaretDownOutlined, CaretRightOutlined, ClockCircleOutlined, HolderOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { Task, TaskList as TaskListType } from '../types';
import { useTaskContext } from '../contexts/TaskContext';
import { useDragContext } from '../contexts/DragContext';
import { useLongPress } from '../hooks/useLongPress';
import { reorderTasks, moveTask } from '../api/task';
import TaskContextMenu from './TaskContextMenu';
import DragIndicator from './DragIndicator';
import './TaskItem.less';

interface TaskItemProps {
  task: Task;
  allTasks: Task[];
  depth?: number;
  hideDetails?: boolean;
  lists?: TaskListType[];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onEnterAdd?: () => void;
  initialEditing?: boolean;
}

const CHILD_DRAG_THRESHOLD = 30;
const supportsHover = window.matchMedia('(hover: hover)').matches;

const TaskItem: React.FC<TaskItemProps> = ({ task, allTasks, depth = 0, hideDetails, lists, onMoveUp, onMoveDown, canMoveUp, canMoveDown, onEnterAdd, initialEditing }) => {
  const { updateTaskData, selectTask, selectedTask, refreshTasks, addTask } = useTaskContext();
  const { dragSource, dragTarget, dragStartX, setDragSource, setDragTarget, setDragStartX, clearDrag } = useDragContext();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [editing, setEditing] = useState(initialEditing || false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [enterEditChildId, setEnterEditChildId] = useState<string | null>(null);
  const enterAddRef = useRef(false);

  useEffect(() => {
    if (initialEditing) {
      setEditing(true);
      setEditTitle(task.title);
    }
  }, [initialEditing]);

  useEffect(() => {
    if (enterEditChildId) {
      const timer = setTimeout(() => setEnterEditChildId(null), 500);
      return () => clearTimeout(timer);
    }
  }, [enterEditChildId]);

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

  // 找到子任务（通过 child_ids 查找，按 order 排序）
  const children = ((task.child_ids || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter(Boolean) as Task[])
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const completedChildren = children.filter(t => t.status === 'completed');
  const hasChildren = children.length > 0;

  // 子任务排序
  const handleChildReorder = useCallback(async (childIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? childIndex - 1 : childIndex + 1;
    if (targetIndex < 0 || targetIndex >= children.length) return;
    const reordered = [...children];
    [reordered[childIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[childIndex]];
    const items = reordered.map((t, i) => ({ id: t.id, order: (i + 1) * 10 }));
    await reorderTasks(items);
    await refreshTasks();
  }, [children, refreshTasks]);

  const handleChildEnterAdd = useCallback(async (childIndex: number) => {
    const currentChild = children[childIndex];
    if (!currentChild) return;

    const result = await addTask({
      title: '',
      parent_task_id: task.id,
      tags: task.tags || [],
      list_id: task.list_id,
    });

    if (result && result.id) {
      const reorderItems: { id: string; order: number }[] = [];
      let order = 10;
      for (let i = 0; i < children.length; i++) {
        reorderItems.push({ id: children[i].id, order });
        order += 10;
        if (children[i].id === currentChild.id) {
          reorderItems.push({ id: result.id, order });
          order += 10;
        }
      }
      await reorderTasks(reorderItems);
      await refreshTasks();
      setEnterEditChildId(result.id);
    }
  }, [children, task, addTask, refreshTasks]);

  // 任意任务都可拖拽（除已完成任务外）
  const isDraggable = supportsHover && task.status !== 'completed';

  // 查找指定任务的父任务 ID
  const findParentIdOf = useCallback((targetId: string): string | undefined => {
    return allTasks.find(t => (t.child_ids || []).includes(targetId))?.id;
  }, [allTasks]);

  // 获取指定父任务下的同级任务列表（按 order 排序）；parentId 为 undefined 时返回顶级任务
  const getSiblingsOf = useCallback((parentId: string | undefined): Task[] => {
    if (parentId) {
      const parent = allTasks.find(t => t.id === parentId);
      if (!parent) return [];
      return ((parent.child_ids || [])
        .map(id => allTasks.find(t => t.id === id))
        .filter(Boolean) as Task[])
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    // 顶级任务：未被任何任务的 child_ids 引用
    const childIdSet = new Set<string>(
      allTasks.reduce<string[]>((acc, t) => acc.concat(t.child_ids || []), [])
    );
    return allTasks
      .filter(t => !childIdSet.has(t.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [allTasks]);

  const handleSubtaskDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setDragStartX(e.clientX);
    setDragSource({
      taskId: task.id,
      parentId: findParentIdOf(task.id),
      index: 0,
    });
    e.dataTransfer.effectAllowed = 'move';
  }, [task.id, findParentIdOf, setDragSource, setDragStartX]);

  const handleSubtaskDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!dragSource || dragSource.taskId === task.id) {
      setDragTarget(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'above' | 'below' = e.clientY < midY ? 'above' : 'below';

    // 用「鼠标 X 相对目标行内容起点」的偏移来判断 sibling/child，
    // 避免受拖拽起点（手柄位置）影响导致总被判为 child。
    // task-item-new 的 padding-left = depth * 24 + 12，再加上一些缓冲让判断更稳。
    const contentStartX = rect.left + depth * 24 + 12;
    const offsetX = e.clientX - contentStartX;
    const type: 'sibling' | 'child' = offsetX > CHILD_DRAG_THRESHOLD ? 'child' : 'sibling';

    setDragTarget({
      taskId: task.id,
      index: 0,
      position,
      type,
    });
  }, [dragSource, task.id, depth, setDragTarget]);

  const handleSubtaskDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragSource || !dragTarget || dragSource.taskId === dragTarget.taskId) {
      clearDrag();
      return;
    }

    const sourceId = dragSource.taskId;
    const targetId = dragTarget.taskId;
    const { type, position } = dragTarget;

    try {
      if (type === 'child') {
        // child 模式：变为目标任务的子任务（追加到目标任务的子任务列表末尾）
        await moveTask(sourceId, targetId);
        message.success('已移动为子任务');
      } else {
        // sibling 模式：与目标任务同级，根据 position 插入到目标任务的上方或下方
        const targetParentId = findParentIdOf(targetId);
        const sourceParentId = dragSource.parentId;

        // 1. 如果父级不同，先换父
        if (sourceParentId !== targetParentId) {
          await moveTask(sourceId, targetParentId);
        }

        // 2. 计算插入后的新 order：取目标父级下的当前同级列表，重新排列后批量更新
        // 注意：换父后 allTasks 还是旧数据，这里手工模拟换父后的同级列表
        const oldSiblings = getSiblingsOf(targetParentId).filter(t => t.id !== sourceId);
        const targetIdx = oldSiblings.findIndex(t => t.id === targetId);
        if (targetIdx === -1) {
          // 目标不在父级下（理论不应发生），回退仅换父
          await refreshTasks();
          message.success('已移动');
          clearDrag();
          return;
        }

        const insertIdx = position === 'above' ? targetIdx : targetIdx + 1;
        const sourceTask = allTasks.find(t => t.id === sourceId);
        if (!sourceTask) {
          await refreshTasks();
          clearDrag();
          return;
        }
        const newSiblings = [
          ...oldSiblings.slice(0, insertIdx),
          sourceTask,
          ...oldSiblings.slice(insertIdx),
        ];
        const reorderItems = newSiblings.map((t, i) => ({ id: t.id, order: (i + 1) * 10 }));
        await reorderTasks(reorderItems);
        message.success(sourceParentId === targetParentId ? '已重新排序' : '已移动');
      }
      await refreshTasks();
    } catch {
      message.error('移动失败');
      await refreshTasks();
    }

    clearDrag();
  }, [dragSource, dragTarget, allTasks, findParentIdOf, getSiblingsOf, clearDrag, refreshTasks]);

  const handleSubtaskDragEnd = useCallback(() => {
    clearDrag();
  }, [clearDrag]);

  // 当前任务是否正在被拖拽
  const isDraggingThis = dragSource?.taskId === task.id;
  // 当前任务是否是拖拽目标
  const isDragTarget = dragTarget?.taskId === task.id;

  const isSelected = selectedTask?.id === task.id;
  const isCompleted = task.status === 'completed';

  const handleStatusToggle = async () => {
    await updateTaskData(task.id, {
      status: isCompleted ? 'pending' : 'completed'
    });
  };

  const formatCompletedTime = (iso: string) => {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const formatDate = (dateStr: string) => {
    const date = dayjs(dateStr);
    const today = dayjs().startOf('day');
    const tomorrow = dayjs().add(1, 'day').startOf('day');
    
    if (date.isSame(today, 'day')) {
      return '今天';
    }
    if (date.isSame(tomorrow, 'day')) {
      return '明天';
    }
    if (date.year() === today.year()) {
      return date.format('M月D日');
    }
    return date.format('YYYY-M-D');
  };

  const longPressHandlers = useLongPress({
    onLongPress: () => setContextMenuVisible(true),
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuVisible(true);
  };

  const handleSaveTitle = () => {
    if (enterAddRef.current) return;
    setEditing(false);
    const trimmed = editTitle.trim();
    if (trimmed && trimmed !== task.title) {
      updateTaskData(task.id, { title: trimmed });
    } else {
      setEditTitle(task.title); // 恢复原值
    }
  };

  const handleEnterKey = () => {
    if (onEnterAdd) {
      enterAddRef.current = true;
      const trimmed = editTitle.trim();
      if (trimmed && trimmed !== task.title) {
        updateTaskData(task.id, { title: trimmed });
      }
      setEditing(false);
      onEnterAdd();
      setTimeout(() => { enterAddRef.current = false; }, 100);
    } else {
      handleSaveTitle();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setEditing(false);
      setEditTitle(task.title); // 取消编辑，恢复原值
    }
  };

  return (
    <div className={`task-item-wrapper${isDraggingThis ? ' subtask-dragging' : ''}`}>
      {/* 子任务拖拽指示线 - 上方 */}
      {isDragTarget && dragTarget.position === 'above' && (
        <DragIndicator position="top" type={dragTarget.type} depth={depth} />
      )}
      <div
        className="subtask-drag-row"
        draggable={isDraggable}
        onDragStart={isDraggable ? handleSubtaskDragStart : undefined}
        onDragOver={handleSubtaskDragOver}
        onDrop={handleSubtaskDrop}
        onDragEnd={isDraggable ? handleSubtaskDragEnd : undefined}
        style={{ position: 'relative' }}
      >
        {isDraggable && (
          <HolderOutlined className="subtask-drag-handle" />
        )}
      <Dropdown
        open={contextMenuVisible}
        onOpenChange={setContextMenuVisible}
        dropdownRender={() => (
          <TaskContextMenu
            task={task}
            onClose={() => setContextMenuVisible(false)}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
        )}
        trigger={['contextMenu']}
      >
        <div
          className={`task-item-new ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
          style={{ paddingLeft: depth * 24 + 12, userSelect: 'none', WebkitUserSelect: 'none' }}
          onClick={() => {
            if (longPressHandlers.isLongPress.current) {
              longPressHandlers.isLongPress.current = false;
              return;
            }
            selectTask(task);
          }}
          onContextMenu={handleContextMenu}
          onTouchStart={longPressHandlers.onTouchStart}
          onTouchMove={longPressHandlers.onTouchMove}
          onTouchEnd={longPressHandlers.onTouchEnd}
        >
          {/* 展开/折叠箭头 */}
          {hasChildren ? (
            <span
              className="expand-arrow"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </span>
          ) : (
            <span className="expand-placeholder" />
          )}

          {/* 复选框 */}
          <span className={`task-checkbox-wrapper priority-${task.priority || 0}`}>
            <Checkbox
              checked={isCompleted}
              onChange={(e) => {
                e.stopPropagation();
                handleStatusToggle();
              }}
              onClick={(e) => e.stopPropagation()}
              className="task-checkbox"
            />
          </span>

          {/* 任务内容 */}
          <div className="task-content">
            <div className="task-title-row">
              {editing ? (
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onPressEnter={(e) => { e.preventDefault(); handleEnterKey(); }}
                  onBlur={handleSaveTitle}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  size="small"
                  variant="borderless"
                  className="task-title-input"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="task-title"
                  onClick={(e) => {
                    e.stopPropagation(); // 阻止触发行的 selectTask
                    setEditing(true);
                    setEditTitle(task.title);
                  }}
                >
                  {task.title}
                </span>
              )}
            </div>
            {!hideDetails && task.description && (
              <div className="task-desc">{task.description}</div>
            )}
            {isCompleted && task.completed_at && (
              <div className="task-completed-time">
                {formatCompletedTime(task.completed_at)}
              </div>
            )}
            {lists && task.list_id && (() => {
              const list = lists.find(l => l.id === task.list_id);
              if (!list) return null;
              return (
                <span className="task-list-tag" onClick={(e) => { e.stopPropagation(); navigate(`/?list_id=${list.id}`); }}>
                  <span className="task-list-dot" style={{ background: list.color }} />
                  <span style={{ color: list.font_color || undefined }}>{list.name}</span>
                </span>
              );
            })()}
            {/* 专注数据显示 */}
            {(task.pomodoro_count && task.pomodoro_count > 0) || (task.focus_duration && task.focus_duration > 0) ? (
              <div className="task-focus-info">
                {task.pomodoro_count && task.pomodoro_count > 0 && (
                  <span className="focus-pomodoro">🍅 {task.pomodoro_count}</span>
                )}
                {task.focus_duration && task.focus_duration > 0 && (
                  <span className="focus-duration">
                    <ClockCircleOutlined /> {formatFocusDuration(task.focus_duration)}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* 右侧信息 */}
          <div className="task-meta">
            {hasChildren && (
              <span className="children-progress">
                {completedChildren.length}/{children.length}
              </span>
            )}
            {task.due_date && (
              <span className="task-due">{formatDate(task.due_date)}</span>
            )}
          </div>
        </div>
      </Dropdown>
      </div>
      {/* 子任务拖拽指示线 - 下方 */}
      {isDragTarget && dragTarget.position === 'below' && (
        <DragIndicator position="bottom" type={dragTarget.type} depth={depth} />
      )}

      {/* 递归渲染子任务 */}
      {hasChildren && expanded && (
        <div className="task-children">
          {children.map((child, childIdx) => (
            <TaskItem
              key={child.id}
              task={child}
              allTasks={allTasks}
              depth={depth + 1}
              hideDetails={hideDetails}
              lists={lists}
              onMoveUp={() => handleChildReorder(childIdx, 'up')}
              onMoveDown={() => handleChildReorder(childIdx, 'down')}
              canMoveUp={childIdx > 0}
              canMoveDown={childIdx < children.length - 1}
              onEnterAdd={() => handleChildEnterAdd(childIdx)}
              initialEditing={child.id === enterEditChildId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TaskItem;
