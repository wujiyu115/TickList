import React, { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';
import { Task } from '../types';
import { getTasks, createTask, updateTask, deleteTask as deleteTaskApi, restoreTask as restoreTaskApi, permanentDeleteTask as permanentDeleteTaskApi } from '../api/task';
import { message } from '../utils/antdApp';
import { scheduleTaskNotification, cancelTaskNotification } from '../services/notificationService';
import { HOST_TASKS_REFRESH_EVENT, isFocusShieldHost } from '../services/focusHost';
import { beginTaskListFetch, reportTaskListFetch } from '../services/taskListMetrics';

interface TaskContextType {
  tasks: Task[];
  loading: boolean;
  // 最近一次成功应用到 tasks 的请求序号；由 TaskList 的 commit 探针消费（0 = 尚无新数据 commit）
  dataRevision: number;
  selectedTask: Task | null;
  fetchTasks: (params?: any) => Promise<void>;
  addTask: (task: any) => Promise<Task | undefined>;
  updateTaskData: (taskId: string, data: any) => Promise<void>;
  deleteTaskData: (taskId: string) => Promise<void>;
  restoreTaskData: (taskId: string) => Promise<void>;
  permanentDeleteTaskData: (taskId: string) => Promise<void>;
  selectTask: (task: Task | null) => void;
  refreshTasks: () => Promise<void>;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within TaskProvider');
  }
  return context;
};

interface TaskProviderProps {
  children: ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  // 已应用的请求序号，与 taskListMetrics 快照严格同步推进
  const [dataRevision, setDataRevision] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [lastParams, setLastParams] = useState<any>({});
  const mounted = useRef(true);
  const fetchRevision = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; fetchRevision.current += 1; };
  }, []);

  const fetchTasks = useCallback(async (params: any = {}) => {
    const revision = ++fetchRevision.current;
    beginTaskListFetch(revision);
    setLoading(true);
    try {
      const response = await getTasks(params);
      if (isFocusShieldHost() && (!mounted.current || revision !== fetchRevision.current)) {
        reportTaskListFetch(revision, 'stale');
        return;
      }
      reportTaskListFetch(revision, 'success', response.tasks.length);
      setDataRevision(revision);
      setTasks(response.tasks);
      setLastParams(params);
      // 同步更新 selectedTask，确保编辑器显示最新数据
      setSelectedTask(prev => {
        if (prev) {
          const updatedTask = response.tasks.find(t => t.id === prev.id);
          return updatedTask || prev;
        }
        return null;
      });
    } catch (error) {
      if (isFocusShieldHost() && (!mounted.current || revision !== fetchRevision.current)) {
        reportTaskListFetch(revision, 'error');
        return;
      }
      reportTaskListFetch(revision, 'error');
      message.error('获取任务列表失败');
      console.error('Failed to fetch tasks:', error);
    } finally {
      if (!isFocusShieldHost() || (mounted.current && revision === fetchRevision.current)) setLoading(false);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    await fetchTasks(lastParams);
    // 通知 TaskPage 等组件同步刷新已完成任务
    if (!isFocusShieldHost() || mounted.current) window.dispatchEvent(new CustomEvent('tasks-refreshed'));
  }, [fetchTasks, lastParams]);

  const hostRefresh = useRef(refreshTasks);
  hostRefresh.current = refreshTasks;
  useEffect(() => {
    if (!isFocusShieldHost()) return;
    let active = true;
    let running = false;
    let pending = false;
    const refresh = async () => {
      if (running) { pending = true; return; }
      running = true;
      do {
        pending = false;
        await hostRefresh.current();
      } while (active && pending);
      running = false;
    };
    window.addEventListener(HOST_TASKS_REFRESH_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(HOST_TASKS_REFRESH_EVENT, refresh);
    };
  }, []);

  const addTask = useCallback(async (taskData: any): Promise<Task | undefined> => {
    try {
      const newTask = await createTask(taskData);
      message.success('任务创建成功');
      scheduleTaskNotification(newTask).catch(console.error);
      await refreshTasks();
      return newTask;
    } catch (error: any) {
      const detail = error.response?.data?.detail;
      message.error(detail || '创建任务失败');
      console.error('Failed to create task:', error);
      throw error;
    }
  }, [refreshTasks]);

  const updateTaskData = useCallback(async (taskId: string, data: any) => {
    try {
      await updateTask(taskId, data);
      message.success('任务更新成功');
      if (data.status === 'completed') {
        cancelTaskNotification(taskId).catch(console.error);
      } else if (data.reminder_time !== undefined) {
        const existing = tasks.find(t => t.id === taskId);
        if (existing) {
          scheduleTaskNotification({ ...existing, ...data }).catch(console.error);
        }
      }
      await refreshTasks();
    } catch (error) {
      message.error('更新任务失败');
      console.error('Failed to update task:', error);
      throw error;
    }
  }, [refreshTasks]);

  const deleteTaskData = useCallback(async (taskId: string) => {
    try {
      await deleteTaskApi(taskId);
      message.success('任务已删除');
      cancelTaskNotification(taskId).catch(console.error);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      await refreshTasks();
    } catch (error) {
      message.error('删除任务失败');
      console.error('Failed to delete task:', error);
      throw error;
    }
  }, [refreshTasks, selectedTask]);

  const restoreTaskData = useCallback(async (taskId: string) => {
    try {
      await restoreTaskApi(taskId);
      message.success('任务已恢复');
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      await refreshTasks();
    } catch (error) {
      message.error('恢复任务失败');
      console.error('Failed to restore task:', error);
      throw error;
    }
  }, [refreshTasks, selectedTask]);

  const permanentDeleteTaskData = useCallback(async (taskId: string) => {
    try {
      await permanentDeleteTaskApi(taskId);
      message.success('任务已永久删除');
      cancelTaskNotification(taskId).catch(console.error);
      if (selectedTask?.id === taskId) {
        setSelectedTask(null);
      }
      await refreshTasks();
    } catch (error) {
      message.error('永久删除任务失败');
      console.error('Failed to permanently delete task:', error);
      throw error;
    }
  }, [refreshTasks, selectedTask]);

  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task);
  }, []);

  const value: TaskContextType = {
    tasks,
    loading,
    dataRevision,
    selectedTask,
    fetchTasks,
    addTask,
    updateTaskData,
    deleteTaskData,
    restoreTaskData,
    permanentDeleteTaskData,
    selectTask,
    refreshTasks,
  };

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};
