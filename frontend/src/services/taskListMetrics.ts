import { isFocusShieldHost } from './focusHost';

// 任务列表加载观测 —— FocusShield 宿主共享 Contract 的 measure 部分。
//
// 固定契约名（不得改动）：
//   focusshield.todo_request_complete —— 任务列表请求成功落地（仅 success；stale/error 不发）
//   focusshield.todo_render_complete  —— 新任务数据被任务列表真正 commit
//
// 注入脚本用 entry.startTime 把条目归属到对应 trace，因此 startTime/duration 必须是真实时间线：
//   request_complete：startTime = 请求发起，duration = 发起 → 响应落地；
//   render_complete：startTime = 数据应用(apply)，startTime + duration = 列表真正 commit 时刻。
// 绝不允许"完成时才 mark 再 measure 出 0 时长"；detail 不带 payload（无 revision/count/outcome）。
//
// 清理与降级：
//   - 只显式清理本契约名字，永不全局清空，不影响宿主其它条目（window 恢复/resource proxy）；
//   - 新周期 begin 清掉上一周期 measure：buffer 清理不撤回已派发给 PerformanceObserver 的
//     通知，也不约束宿主刷新时序；getEntries 类采集以 startTime 过滤归属；
//   - 中间 mark 按周期作用域命名、消费后即清、超窗（保留 4 个）裁剪，本契约条目数恒有界；
//   - performance 不可用/抛错时静默放弃该次观测，快照照常推进，请求路径与界面不受影响；
//     gating 沿用 focusHost 既有的 isFocusShieldHost 判定，standalone 全部 no-op。
//
// 快照（本地诊断，不进入契约条目）严格区分：loading 请求在途 / error 失败（旧数据保留）/
// stale 响应被丢弃 / committed 新数据已被列表真正渲染。

export const TODO_REQUEST_COMPLETE = 'focusshield.todo_request_complete';
export const TODO_RENDER_COMPLETE = 'focusshield.todo_render_complete';

export type TaskListMetricPhase = 'idle' | 'loading' | 'applied' | 'committed' | 'error' | 'stale';

export interface TaskListMetricSnapshot {
  phase: TaskListMetricPhase;
  revision: number;
  startedAt: number | null;
  appliedAt: number | null;
  committedAt: number | null;
  count: number | null;
}

export type TaskListFetchOutcome = 'success' | 'error' | 'stale';

// 中间 mark 按周期作用域命名：不同周期的同名请求不会互相误引用，
// 当前周期 measure 量到的一定是它自己的发起/应用时刻。
const requestStartMark = (revision: number): string => `${TODO_REQUEST_COMPLETE}:start#${revision}`;
const appliedMark = (revision: number): string => `${TODO_RENDER_COMPLETE}:apply#${revision}`;
const MAX_RETAINED_MARKS = 4;

let currentRevision = 0;
let retainedMarks: string[] = [];
let snapshot: TaskListMetricSnapshot = {
  phase: 'idle', revision: 0, startedAt: null, appliedAt: null, committedAt: null, count: null,
};

function getPerformance(): Performance | null {
  try {
    const perf = globalThis.performance;
    if (perf && typeof perf.now === 'function' && typeof perf.mark === 'function' && typeof perf.measure === 'function') {
      return perf;
    }
  } catch { /* ignore */ }
  return null;
}

function nowOrNull(): number | null {
  const perf = getPerformance();
  if (!perf) return null;
  try { return perf.now(); } catch { return null; }
}

function markOnce(name: string): void {
  const perf = getPerformance();
  if (!perf) return;
  try { perf.mark(name); } catch { /* 放弃本次观测 */ }
}

// L2 名称引用：startTime/duration 取自真实事件时刻的 mark，跨 WebView 行为一致
function measureOnce(name: string, startMark: string): void {
  const perf = getPerformance();
  if (!perf) return;
  try { perf.measure(name, startMark); } catch { /* 放弃本次观测 */ }
}

function clearMark(name: string): void {
  const perf = getPerformance();
  if (!perf) return;
  try { perf.clearMarks(name); } catch { /* ignore */ }
}

function clearMeasure(name: string): void {
  const perf = getPerformance();
  if (!perf) return;
  try { perf.clearMeasures(name); } catch { /* ignore */ }
}

function retainMark(name: string): void {
  // revision 会被 provider 重挂复用而重名：先去掉历史同名记录，避免裁剪队首时误清新 mark
  retainedMarks = retainedMarks.filter(mark => mark !== name);
  retainedMarks.push(name);
  while (retainedMarks.length > MAX_RETAINED_MARKS) {
    const oldest = retainedMarks.shift();
    if (oldest) clearMark(oldest);
  }
}

export function getTaskListMetricSnapshot(): TaskListMetricSnapshot {
  return { ...snapshot };
}

// 请求发起：记录真实起点
export function beginTaskListFetch(revision: number): void {
  if (!isFocusShieldHost()) return;
  currentRevision = revision;
  snapshot = {
    phase: 'loading', revision, startedAt: null, appliedAt: null, committedAt: null, count: null,
  };
  clearMeasure(TODO_REQUEST_COMPLETE);
  clearMeasure(TODO_RENDER_COMPLETE);
  snapshot = { ...snapshot, startedAt: nowOrNull() };
  // revision 复用时先清历史同名 mark，保证 measure 引用的是本次发起时刻
  clearMark(requestStartMark(revision));
  markOnce(requestStartMark(revision));
  retainMark(requestStartMark(revision));
}

export function reportTaskListFetch(revision: number, outcome: TaskListFetchOutcome, count?: number): void {
  if (!isFocusShieldHost()) return;
  const isCurrent = revision === currentRevision;
  if (outcome === 'success') {
    // apply mark：数据写入 React 状态的真实时刻，也是 render_complete 的起点（先清历史同名）
    clearMark(appliedMark(revision));
    markOnce(appliedMark(revision));
    retainMark(appliedMark(revision));
    // request_complete：startTime = 请求发起，duration = 发起 → 响应落地（真实区间）
    measureOnce(TODO_REQUEST_COMPLETE, requestStartMark(revision));
    clearMark(requestStartMark(revision));
    if (isCurrent) {
      snapshot = { ...snapshot, phase: 'applied', revision, appliedAt: nowOrNull(), count: count ?? null };
    }
    return;
  }
  // stale / error：不产生契约条目（仅 success 可发 request_complete），
  // 清理该周期起点并按需推进快照。
  clearMark(requestStartMark(revision));
  if (isCurrent) snapshot = { ...snapshot, phase: outcome === 'stale' ? 'stale' : 'error' };
}

export function reportTaskListCommit(revision: number, count: number): void {
  if (!isFocusShieldHost()) return;
  // 只认"当前周期且已 applied"的 commit：加载中/出错/旧数据（新周期已开始）不算；
  // 同一周期重复上报（列表 remount 回放旧数据）也被 phase 拦截。
  if (revision !== currentRevision || snapshot.phase !== 'applied') return;
  // render_complete：startTime = apply，startTime + duration = 列表真正 commit 的时刻（真实区间，非 0 伪造）
  measureOnce(TODO_RENDER_COMPLETE, appliedMark(revision));
  clearMark(appliedMark(revision));
  snapshot = { ...snapshot, phase: 'committed', committedAt: nowOrNull(), count };
}
