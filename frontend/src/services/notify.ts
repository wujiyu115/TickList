import { message } from '../utils/antdApp';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativePlatform } from '../utils/platform';
import { remoteLog } from './remoteLog';

export interface NotifyOptions {
  title: string;
  body: string;
  id?: number;
  schedule?: Date;
  extra?: Record<string, unknown>;
}

export async function notify(options: NotifyOptions): Promise<void> {
  const native = isNativePlatform();
  const cap = (window as any)?.Capacitor;
  remoteLog('notification', {
    isNative: native,
    capacitorExists: !!cap,
    platform: cap?.getPlatform?.(),
    pluginRegistered: !!cap?.Plugins?.LocalNotifications,
    action: native ? 'schedule_local' : 'fallback_toast',
    title: options.title,
  });

  if (native) {
    await LocalNotifications.schedule({
      notifications: [{
        id: options.id ?? Date.now(),
        title: options.title,
        body: options.body,
        extra: options.extra,
      }],
    });
  } else {
    message.info(options.body);
  }
}

export async function scheduleNotify(options: NotifyOptions & { schedule: Date }): Promise<void> {
  if (!isNativePlatform()) return;
  if (options.schedule.getTime() <= Date.now()) return;

  const id = options.id ?? Date.now();
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* may not exist */ }

  await LocalNotifications.schedule({
    notifications: [{
      id,
      title: options.title,
      body: options.body,
      schedule: { at: options.schedule },
      extra: options.extra,
    }],
  });
}

export async function cancelNotify(id: number): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch { /* may not exist */ }
}
