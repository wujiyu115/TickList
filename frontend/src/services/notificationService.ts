import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativePlatform } from '../utils/platform';
import { Task, Countdown } from '../types';

function hashStringToId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) || 1;
}

function taskNotificationId(taskId: string): number {
  return hashStringToId(`task-${taskId}`);
}

function countdownNotificationId(countdownId: string): number {
  return hashStringToId(`cd-${countdownId}`);
}

export async function initNotifications(): Promise<boolean> {
  if (!isNativePlatform()) return false;

  const perm = await LocalNotifications.checkPermissions();
  if (perm.display === 'granted') return true;

  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

export function addNotificationListeners(): void {
  if (!isNativePlatform()) return;

  LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
    console.log('Notification tapped:', notification.notification.id);
  });
}

export async function scheduleTaskNotification(task: Task): Promise<void> {
  if (!isNativePlatform()) return;
  if (!task.reminder_time) return;

  const id = taskNotificationId(task.id);
  const at = new Date(task.reminder_time);
  if (at.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* may not exist */ }

  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: '任务提醒',
      body: task.title,
      schedule: { at },
      extra: { type: 'task', taskId: task.id },
    }],
  });
}

export async function cancelTaskNotification(taskId: string): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: taskNotificationId(taskId) }],
    });
  } catch { /* ignore */ }
}

export async function scheduleCountdownNotification(countdown: Countdown): Promise<void> {
  if (!isNativePlatform()) return;
  if (!countdown.push_due_notify) return;

  const id = countdownNotificationId(countdown.id);

  let targetDate = new Date(countdown.target_date);
  if (countdown.repeat_annually) {
    const now = new Date();
    targetDate.setFullYear(now.getFullYear());
    if (targetDate.getTime() < now.getTime() - 86400000) {
      targetDate.setFullYear(now.getFullYear() + 1);
    }
  }

  const at = new Date(targetDate);
  at.setHours(9, 0, 0, 0);
  if (at.getTime() <= Date.now()) return;

  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* may not exist */ }

  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: '倒数日提醒',
      body: `${countdown.title} — 就是今天！`,
      schedule: { at },
      extra: { type: 'countdown', countdownId: countdown.id },
    }],
  });
}

export async function cancelCountdownNotification(countdownId: string): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    await LocalNotifications.cancel({
      notifications: [{ id: countdownNotificationId(countdownId) }],
    });
  } catch { /* ignore */ }
}

export async function syncAllTaskNotifications(tasks: Task[]): Promise<void> {
  if (!isNativePlatform()) return;

  const pending = await LocalNotifications.getPending();
  const taskIds = pending.notifications
    .filter(n => n.extra?.type === 'task')
    .map(n => ({ id: n.id }));
  if (taskIds.length > 0) {
    await LocalNotifications.cancel({ notifications: taskIds });
  }

  const now = Date.now();
  const toSchedule = tasks.filter(
    t => t.reminder_time
      && new Date(t.reminder_time).getTime() > now
      && t.status !== 'completed',
  );

  for (const task of toSchedule) {
    await scheduleTaskNotification(task);
  }
}

export async function syncAllCountdownNotifications(countdowns: Countdown[]): Promise<void> {
  if (!isNativePlatform()) return;

  const pending = await LocalNotifications.getPending();
  const cdIds = pending.notifications
    .filter(n => n.extra?.type === 'countdown')
    .map(n => ({ id: n.id }));
  if (cdIds.length > 0) {
    await LocalNotifications.cancel({ notifications: cdIds });
  }

  const toSchedule = countdowns.filter(c => c.push_due_notify);
  for (const cd of toSchedule) {
    await scheduleCountdownNotification(cd);
  }
}
