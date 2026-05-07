import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginLess } from '@rsbuild/plugin-less';

export default defineConfig({
  plugins: [pluginReact(), pluginLess({
    lessLoaderOptions: {
      lessOptions: {
        javascriptEnabled: true,
      },
    },
  })],

  source: {
    entry: {
      index: './src/index.tsx',
    },
  },

  resolve: {
    alias: {
      '@': './src',
    },
  },

  html: {
    template: './src/index.html',
  },

  output: {
    distPath: {
      root: 'dist',
      js: '',
      css: '',
      font: 'fonts',
      svg: 'fonts',
    },
    filename: {
      js: '[name].js',
      css: '[name].css',
    },
    sourceMap: {
      js: process.env.NODE_ENV === 'development' ? 'eval-source-map' : false,
      css: false,
    },
    overrideBrowserslist: ['chrome >= 60', 'safari >= 14', 'ios_saf >= 14'],
  },

  server: {
    port: 3000,
    historyApiFallback: true,
    proxy: [
      {
        context: ['/api'],
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    ],
  },

  performance: {
    chunkSplit: {
      strategy: 'custom',
      splitChunks: {
        chunks: 'all',
        minSize: 20000,
        maxSize: 400000,
        cacheGroups: {
          // React 相关库
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom)[\\/]/,
            name: 'react-vendor',
            chunks: 'all',
            priority: 30,
          },
          // Antd 核心组件
          antdCore: {
            test: /[\\/]node_modules[\\/]antd[\\/]es[\\/](button|input|form|select|table|card|layout)[\\/]/,
            name: 'antd-core',
            chunks: 'all',
            priority: 28,
          },
          // Antd 图标
          antdIcons: {
            test: /[\\/]node_modules[\\/]@ant-design[\\/]icons[\\/]/,
            name: 'antd-icons',
            chunks: 'all',
            priority: 27,
          },
          // Antd 其他组件
          antdOther: {
            test: /[\\/]node_modules[\\/](antd|@ant-design)[\\/]/,
            name: 'antd-other',
            chunks: 'all',
            priority: 25,
          },
          // 工具库
          utils: {
            test: /[\\/]node_modules[\\/](dayjs|axios)[\\/]/,
            name: 'utils-vendor',
            chunks: 'all',
            priority: 20,
          },
          // 其他第三方库
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            chunks: 'all',
            priority: 10,
            enforce: true,
          },
          // 默认分组
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
        },
      },
      override: {
        runtimeChunk: {
          name: 'runtime',
        },
      },
    },
  },
});
