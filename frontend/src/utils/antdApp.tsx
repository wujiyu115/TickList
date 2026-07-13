import React from 'react';
import { App } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import type { HookAPI as ModalHookAPI } from 'antd/es/modal/useModal';
import type { NotificationInstance } from 'antd/es/notification/interface';

// antd 的静态 message.xxx() / Modal.confirm() 在 ConfigProvider 之外渲染，
// 拿不到主题 token → 深色主题下文字仍是浅色算法的黑字，浮在玻璃暗面板上看不清。
// 这里用 <App> 的 useApp() 拿到「带主题上下文」的实例，桥接给全局静态引用，
// 使所有调用（含非组件模块 api/services）都能复用同一套主题化实例。
const staticRef: {
  message?: MessageInstance;
  modal?: ModalHookAPI;
  notification?: NotificationInstance;
} = {};

function bridge<T extends object>(pick: () => T | undefined): T {
  return new Proxy({} as T, {
    get: (_t, key) => (...args: unknown[]) => {
      const inst = pick() as Record<string | symbol, unknown> | undefined;
      const fn = inst?.[key];
      return typeof fn === 'function' ? (fn as (...a: unknown[]) => unknown)(...args) : undefined;
    },
  });
}

// 用法与 antd 完全一致：message.success(...) / modalApi.confirm(...)
export const message = bridge<MessageInstance>(() => staticRef.message);
export const modalApi = bridge<ModalHookAPI>(() => staticRef.modal);
export const notification = bridge<NotificationInstance>(() => staticRef.notification);

// 渲染在 <App> 内部，把主题化实例写入 staticRef 供全局桥接使用。
export const AntdAppBridge: React.FC = () => {
  const app = App.useApp();
  staticRef.message = app.message;
  staticRef.modal = app.modal;
  staticRef.notification = app.notification;
  return null;
};
