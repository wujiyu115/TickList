import { useLayoutEffect } from 'react';
import { reportTaskListCommit } from '../services/taskListMetrics';

/**
 * 任务列表 commit 探针：dataRevision 变更后，在新列表真正进入 DOM 的同一次
 * React commit 内上报（useLayoutEffect 与 commit 同步执行、先于绘制）。
 * 刻意不使用 ready/FCP/requestAnimationFrame 充当渲染完成信号。
 * 加载中/出错/旧数据不会 bump dataRevision，remount 回放旧数据产生的重复上报
 * 由 taskListMetrics 按周期拦截。
 */
export function useTaskListCommitProbe(dataRevision: number, taskCount: number): void {
  useLayoutEffect(() => {
    if (dataRevision > 0) reportTaskListCommit(dataRevision, taskCount);
  }, [dataRevision, taskCount]);
}
