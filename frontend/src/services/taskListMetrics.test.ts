import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TODO_RENDER_COMPLETE, TODO_REQUEST_COMPLETE,
  beginTaskListFetch, getTaskListMetricSnapshot, reportTaskListCommit, reportTaskListFetch,
} from './taskListMetrics';

const flags = vi.hoisted(() => ({ hosted: true }));
vi.mock('./focusHost', () => ({ isFocusShieldHost: () => flags.hosted }));

interface FakeEntry {
  name: string;
  entryType: 'mark' | 'measure';
  startTime: number;
  duration: number;
}

// User Timing 替身：L2 名称引用重载；起点 mark 缺失时像真实浏览器一样抛错，用于验证降级
const installFakePerformance = () => {
  const entries: FakeEntry[] = [];
  let clock = 1000;
  const findMark = (name: string): FakeEntry => {
    const mark = [...entries].reverse().find(entry => entry.entryType === 'mark' && entry.name === name);
    if (!mark) throw new Error(`start mark not found: ${name}`);
    return mark;
  };
  const perf = {
    now: () => clock,
    mark: (name: string) => {
      entries.push({ name, entryType: 'mark', startTime: clock, duration: 0 });
    },
    measure: (name: string, startMark: string) => {
      const startTime = findMark(startMark).startTime;
      entries.push({ name, entryType: 'measure', startTime, duration: clock - startTime });
    },
    clearMarks: (name?: string) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'mark' && (!name || entries[i].name === name)) entries.splice(i, 1);
      }
    },
    clearMeasures: (name?: string) => {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'measure' && (!name || entries[i].name === name)) entries.splice(i, 1);
      }
    },
  };
  vi.stubGlobal('performance', perf);
  return { perf, entries, advance: (ms: number) => { clock += ms; } };
};

const measuresOf = (entries: FakeEntry[], name: string) =>
  entries.filter(entry => entry.entryType === 'measure' && entry.name === name);
const marksOf = (entries: FakeEntry[]) => entries.filter(entry => entry.entryType === 'mark');

beforeEach(() => {
  flags.hosted = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('task list metrics contract', () => {
  it('stays completely inert outside the FocusShield host', () => {
    flags.hosted = false;
    const fake = installFakePerformance();
    beginTaskListFetch(1);
    reportTaskListFetch(1, 'success', 3);
    reportTaskListCommit(1, 3);
    expect(fake.entries).toEqual([]);
    expect(getTaskListMetricSnapshot().phase).toBe('idle');
  });

  it('emits request/render measures with real startTime/duration and no payload', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(7);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'loading', revision: 7 });
    const fetchStart = getTaskListMetricSnapshot().startedAt;
    fake.advance(120);
    reportTaskListFetch(7, 'success', 3);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'applied', count: 3 });
    fake.advance(30);
    reportTaskListCommit(7, 3);
    const committed = getTaskListMetricSnapshot();
    expect(committed).toMatchObject({ phase: 'committed', revision: 7, count: 3 });
    const requestMeasure = measuresOf(fake.entries, TODO_REQUEST_COMPLETE)[0];
    const renderMeasure = measuresOf(fake.entries, TODO_RENDER_COMPLETE)[0];
    // request_complete：startTime = 真实请求发起时刻，duration = 发起 → 响应落地（非 0 伪造）
    expect(requestMeasure.startTime).toBe(fetchStart);
    expect(requestMeasure.duration).toBe(120);
    // render_complete：startTime = apply 时刻，startTime + duration 恰为列表真正 commit 的时刻
    expect(renderMeasure.startTime).toBe(requestMeasure.startTime + requestMeasure.duration);
    expect(renderMeasure.duration).toBe(30);
    expect(renderMeasure.startTime + renderMeasure.duration).toBe(committed.committedAt);
    // detail 不带 payload：条目仅含 name/entryType/startTime/duration
    expect(Object.keys(requestMeasure).sort()).toEqual(['duration', 'entryType', 'name', 'startTime']);
    expect(Object.keys(renderMeasure).sort()).toEqual(['duration', 'entryType', 'name', 'startTime']);
    // 消费过的中间 mark 已清理，buffer 只剩两条 measure
    expect(marksOf(fake.entries)).toEqual([]);
  });

  it('counts a successful empty list as a render commit', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(8);
    reportTaskListFetch(8, 'success', 0);
    reportTaskListCommit(8, 0);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', count: 0 });
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
  });

  it('never reports while loading or after failure', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(9);
    reportTaskListCommit(9, 0); // 加载中不可 commit
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    expect(getTaskListMetricSnapshot().phase).toBe('loading');
    fake.advance(50);
    reportTaskListFetch(9, 'error');
    expect(getTaskListMetricSnapshot().phase).toBe('error');
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(0); // 失败不发 request_complete
    reportTaskListCommit(9, 0); // 出错后不可 commit
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    expect(marksOf(fake.entries)).toEqual([]); // 起点已清理，无残留
  });

  it('emits nothing for a stale completion and keeps the newer cycle authoritative', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(11);
    fake.advance(80);
    beginTaskListFetch(12); // 新 trace context：清掉上一周期 measure，记录新起点
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(0);
    fake.advance(200);
    reportTaskListFetch(11, 'stale'); // 旧请求在新周期内完成：不发 request_complete
    expect(fake.entries.filter(entry => entry.entryType === 'measure')).toEqual([]);
    // 快照不被旧周期污染，仍处于新周期 loading
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'loading', revision: 12 });
    reportTaskListCommit(11, 0); // 旧周期不可 commit
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    fake.advance(60);
    reportTaskListFetch(12, 'success', 2);
    reportTaskListCommit(12, 2);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', revision: 12 });
    // 仅 success 落地产生 request_complete，且 startTime 是它自己的真实发起时刻
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(1);
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
  });

  it('references only the current cycle start mark when cycles overlap', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(31);
    fake.advance(40);
    beginTaskListFetch(32);
    fake.advance(200);
    reportTaskListFetch(32, 'success', 1);
    const requestMeasure = measuresOf(fake.entries, TODO_REQUEST_COMPLETE)[0];
    // 若共用一个 mark 名会量到旧周期起点；作用域化后必须是当前周期自己的发起时刻
    expect(requestMeasure.startTime).toBe(getTaskListMetricSnapshot().startedAt);
  });

  it('rejects duplicate or outdated commit reports', () => {
    const fake = installFakePerformance();
    beginTaskListFetch(13);
    reportTaskListFetch(13, 'success', 1);
    reportTaskListCommit(13, 1);
    reportTaskListCommit(13, 1); // 列表 remount 回放旧数据的重复上报
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
    beginTaskListFetch(14); // 新周期 begin 清掉上一周期 measure
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
    reportTaskListCommit(13, 1); // 旧周期上报被拒，不得新增条目
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(0);
  });

  it('keeps performance entries bounded across cycles', () => {
    const fake = installFakePerformance();
    for (let revision = 21; revision <= 25; revision += 1) {
      beginTaskListFetch(revision);
      reportTaskListFetch(revision, 'success', 1);
      reportTaskListCommit(revision, 1);
    }
    // 每个新周期 begin 都清掉上一周期 measure，任何时刻 buffer 中至多一个完整周期
    expect(measuresOf(fake.entries, TODO_REQUEST_COMPLETE)).toHaveLength(1);
    expect(measuresOf(fake.entries, TODO_RENDER_COMPLETE)).toHaveLength(1);
    // 只触碰本契约的名字，从不影响宿主其它条目
    expect(fake.entries.every(entry => entry.name.startsWith('focusshield.'))).toBe(true);
  });

  it('degrades silently when the Performance API is unavailable', () => {
    vi.stubGlobal('performance', { now: () => 5 });
    beginTaskListFetch(41);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'loading', revision: 41 });
    reportTaskListFetch(41, 'success', 2);
    reportTaskListCommit(41, 2);
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed', count: 2 });
  });

  it('degrades silently when performance entries throw', () => {
    vi.stubGlobal('performance', {
      now: () => 1,
      mark: () => { throw new Error('buffer full'); },
      measure: () => { throw new Error('buffer full'); },
      clearMarks: () => { throw new Error('boom'); },
      clearMeasures: () => { throw new Error('boom'); },
    });
    expect(() => {
      beginTaskListFetch(42);
      reportTaskListFetch(42, 'success', 1);
      reportTaskListCommit(42, 1);
    }).not.toThrow();
    expect(getTaskListMetricSnapshot()).toMatchObject({ phase: 'committed' });
  });
});
