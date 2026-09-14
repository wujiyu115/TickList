import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusContextValue } from './FocusContext';
import type { UseTimerReturn } from '../hooks/useTimer';
import type { Task } from '../types';
import { getCurrentUser } from '../api/auth';
import { getTaskById } from '../api/task';
import { getFocusOverview, getFocusSessions } from '../api/focus';
import type { FocusOverview, FocusSession } from '../api/focus';
import { message } from '../utils/antdApp';
import { getFocusHostState, readyFocusHost, startHostFocus, subscribeFocusHost, HOST_CONTROL_HINT, HOST_TASKS_REFRESH_EVENT } from '../services/focusHost';
import type { HostState } from '../services/focusHost';

export function useHostedFocus(currentUserId: string | null): FocusContextValue {
  const [hostState, setHostState] = useState<HostState | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);
  const [hostStarting, setHostStarting] = useState(false);
  const [linkedTaskId, setTaskId] = useState<string | null>(null);
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const [overview, setOverview] = useState<FocusOverview | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const startedAtRef = useRef('');
  const taskIdRef = useRef<string | null>(null);
  const alive = useRef(false);
  const starting = useRef(false);
  const authorized = useRef(false);
  const stopwatchRequested = useRef(false);
  const identity = useRef(currentUserId);
  identity.current = currentUserId;
  const overviewRequest = useRef(0);
  const sessionsRequest = useRef(0);
  const taskRequest = useRef(0);
  const stateVersion = useRef(0);
  const revision = useRef(-1);
  const isCurrent = useCallback(() => alive.current && identity.current === currentUserId, [currentUserId]);

  const fail = useCallback((error: unknown) => {
    if (!isCurrent()) return;
    setHostError(error instanceof Error ? error.message : 'FocusShield 不可用，请返回本地重新打开页面');
  }, [isCurrent]);

  const applyState = useCallback((state: HostState) => {
    if (!isCurrent() || state.refreshRevision < revision.current) return;
    revision.current = state.refreshRevision;
    stateVersion.current += 1;
    setHostState(state);
  }, [isCurrent]);

  useEffect(() => {
    alive.current = true;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    authorized.current = false;
    setHostReady(false);
    const invalidateAccount = (event: StorageEvent) => {
      if (event.key !== 'token' && event.key !== null) return;
      alive.current = false;
      authorized.current = false;
      setHostReady(false);
    };
    window.addEventListener('storage', invalidateAccount);
    const initialize = async () => {
      try {
        const initial = await readyFocusHost();
        if (!active || !isCurrent()) return;
        applyState(initial);
        unsubscribe = subscribeFocusHost(applyState, error => {
          authorized.current = false;
          setHostReady(false);
          fail(error);
        });
        if (!currentUserId) return;
        const version = stateVersion.current;
        const state = await getFocusHostState(currentUserId);
        if (!active || !isCurrent()) return;
        if (version === stateVersion.current) applyState(state);
        authorized.current = true;
        setHostReady(true);
      } catch (error) { if (active) fail(error); }
    };
    void initialize();
    return () => {
      active = false;
      alive.current = false;
      authorized.current = false;
      window.removeEventListener('storage', invalidateAccount);
      try { unsubscribe?.(); } catch { /* A detached native view may already be gone. */ }
    };
  }, [currentUserId, isCurrent, applyState, fail]);

  const setLinkedTaskId = useCallback((id: string | null) => {
    taskIdRef.current = id;
    setTaskId(id);
  }, []);

  const loadOverview = useCallback(async () => {
    if (!currentUserId || !isCurrent()) return;
    const request = ++overviewRequest.current;
    try {
      const data = await getFocusOverview();
      if (isCurrent() && request === overviewRequest.current) setOverview(data);
    } catch { /* A failed read never changes timer ownership. */ }
  }, [currentUserId, isCurrent]);

  const loadSessions = useCallback(async () => {
    if (!currentUserId || !isCurrent()) return;
    const request = ++sessionsRequest.current;
    try {
      const data = await getFocusSessions({ page: 1, page_size: 100 });
      if (isCurrent() && request === sessionsRequest.current) setSessions(data.sessions || []);
    } catch { /* Existing records can be refreshed on the next host revision. */ }
  }, [currentUserId, isCurrent]);

  // Countdown ticks do not cause API traffic. Only lifecycle/revision changes do.
  useEffect(() => {
    if (!currentUserId || !hostReady) return;
    void loadOverview();
    void loadSessions();
    window.dispatchEvent(new Event(HOST_TASKS_REFRESH_EVENT));
  }, [currentUserId, hostReady, hostState?.phase, hostState?.refreshRevision, loadOverview, loadSessions]);

  useEffect(() => {
    const request = ++taskRequest.current;
    setLinkedTask(null);
    if (!linkedTaskId || !currentUserId) return;
    getTaskById(linkedTaskId).then(task => {
      if (isCurrent() && request === taskRequest.current) setLinkedTask(task);
    }).catch(() => { /* Deleted or inaccessible tasks are rejected by the host at start. */ });
    return () => { taskRequest.current += 1; };
  }, [linkedTaskId, currentUserId, hostState?.phase, hostState?.refreshRevision, isCurrent]);

  const localControlOnly = useCallback(() => { message.info(HOST_CONTROL_HINT); }, []);
  const handleStart = useCallback(async (explicitTaskId?: string) => {
    if (!isCurrent()) return;
    if (!explicitTaskId && stopwatchRequested.current) { setHostError('宿主模式不支持正计时，请先选择任务'); return; }
    const taskId = explicitTaskId ?? taskIdRef.current;
    if (!currentUserId || !taskId) { setHostError('请先登录并选择任务；宿主模式不支持自由番茄或正计时'); return; }
    if (!authorized.current) { setHostError('FocusShield 尚未就绪或账号验证失败，请返回本地检查连接'); return; }
    if (starting.current) return;
    if (!hostState?.canStart) { setHostError('FocusShield 正忙或处于冷却中，请回到本地 HUD'); return; }
    starting.current = true;
    setHostStarting(true);
    setHostError(null);
    try {
      // Do not trust a task link or a stale render's account identity. JWT auth
      // supplies the current web user; Rust independently verifies its PAT user.
      const user = await getCurrentUser();
      if (!isCurrent()) return;
      if (user.id !== currentUserId) throw new Error('TickList 登录账号已变更，请重新登录后再开始专注');
      setLinkedTaskId(taskId);
      const version = stateVersion.current;
      const state = await startHostFocus(user.id, taskId);
      if (isCurrent() && version === stateVersion.current) applyState(state);
    } catch (error) { fail(error); }
    finally {
      starting.current = false;
      if (isCurrent()) setHostStarting(false);
    }
  }, [currentUserId, hostState?.canStart, isCurrent, applyState, fail, setLinkedTaskId]);

  // Compatibility facade is inert: even a forgotten keyboard/control consumer
  // cannot instantiate, recover, advance, pause or save a webpage timer.
  const timer = useMemo<UseTimerReturn>(() => ({
    phase: hostState?.phase === 'breaking' ? 'break' : hostState?.phase === 'idle' || !hostState ? 'idle' : 'work',
    timeLeft: hostState?.remainingSeconds ?? 0,
    isRunning: hostState?.phase === 'focusing' || hostState?.phase === 'breaking',
    isPaused: hostState?.phase === 'paused',
    elapsedTime: 0,
    pomodoroCount: 0,
    start: localControlOnly, pause: localControlOnly, reset: localControlOnly,
    skip: localControlOnly, setTimeLeft: localControlOnly,
  }), [hostState, localControlOnly]);

  return {
    isHosted: true, hostState, hostError, hostReady, hostStarting,
    hostRefreshRevision: hostState?.refreshRevision ?? 0,
    timer, timerMode: 'pomodoro', setTimerMode: mode => {
      stopwatchRequested.current = mode === 'stopwatch';
      if (stopwatchRequested.current) setHostError('宿主模式不支持自由番茄或正计时，请先选择任务');
    },
    linkedTaskId, linkedTask, setLinkedTaskId, setLinkedTask,
    handleStart, handleEnd: localControlOnly, handleStopStopwatch: localControlOnly,
    overview, sessions, loadOverview, loadSessions,
    settings: null, settingsLoaded: hostReady, startedAtRef, workDuration: 0, breakDuration: 0,
  };
}
