import type { CapacitorConfig } from '@capacitor/cli';

/**
 * TickList Capacitor 配置
 *
 * - appId / appName：与 docs/ipa-build-plan.md 保持一致
 * - webDir：rsbuild build 的输出目录
 * - API 服务器地址不在此处配置，由用户在 app 首次启动的服务器配置页动态填写
 * - cleartext：允许自建 HTTP 后端（如局域网 / 无证书环境）；生产环境建议关闭并强制 HTTPS
 */
const config: CapacitorConfig = {
  appId: 'com.ticklist.app',
  appName: 'TickList',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // 允许 Android WebView 访问非 HTTPS 后端；iOS ATS 需同时在 Info.plist 中配置
    cleartext: true,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    LocalNotifications: {
      // iOS 前台时也展示通知横幅、角标、声音
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#4CAF50',
    },
  },
};

export default config;
