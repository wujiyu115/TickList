import React, { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useFocus } from '../../contexts/FocusContext';
import { HOST_CONTROL_HINT } from '../../services/focusHost';
import type { HostState } from '../../services/focusHost';

const phaseLabels: Record<HostState['phase'], string> = {
  idle: '空闲', focusing: '专注中', paused: '已暂停', breaking: '休息中', reviewing: '待复盘',
};

const HostedFocusPanel: React.FC = () => {
  const { hostState, hostReady, hostStarting, linkedTask, handleStart, overview } = useFocus();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const taskId = params.get('task_id');
  const mode = params.get('mode');
  const consumed = useRef<string | null>(null);
  const unsupported = mode !== null && mode !== 'pomodoro';

  useEffect(() => {
    if (!taskId) { consumed.current = null; return; }
    if (!hostReady || !taskId || unsupported) return;
    const intent = `${taskId}:${mode ?? 'pomodoro'}`;
    if (consumed.current === intent) return;
    consumed.current = intent;
    // Consume the navigation intent before starting: idle/refresh ticks, route
    // remounts and StrictMode replay must not resurrect an old task request.
    const next = new URLSearchParams(params);
    next.delete('task_id');
    next.delete('mode');
    setParams(next, { replace: true });
    handleStart(taskId);
  }, [hostReady, taskId, mode, unsupported, params, setParams, handleStart]);

  return <section className="pomodoro-container" aria-label="FocusShield 专注">
    <div className="pomodoro-left">
      <h2>FocusShield 专注</h2>
      <p role="status">{hostStarting ? '正在请求本地开始专注' : hostState ? phaseLabels[hostState.phase] : '正在连接宿主'}</p>
      {linkedTask && <p>{linkedTask.title}</p>}
      {hostState?.remainingSeconds != null && <p>宿主剩余 {hostState.remainingSeconds} 秒</p>}
      {!!hostState?.cooldownSeconds && <p>冷却剩余 {hostState.cooldownSeconds} 秒</p>}
      <p>{HOST_CONTROL_HINT}</p>
      <p>网页不会运行计时器或保存专注记录。</p>
      {(unsupported || (!taskId && !linkedTask)) && <p role="note">宿主模式不支持自由番茄或正计时，请先选择任务并使用任务的「番茄专注」入口。</p>}
      <button type="button" onClick={() => navigate('/')}>返回任务列表选择任务</button>
    </div>
    <div className="pomodoro-right">
      <h3>概览</h3>
      <p>今日番茄：{overview?.today_pomodoro_count ?? 0}</p>
      <p>今日专注时长：{overview?.today_focus_duration ?? 0} 秒</p>
    </div>
  </section>;
};

export default HostedFocusPanel;
