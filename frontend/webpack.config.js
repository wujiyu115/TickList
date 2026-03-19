const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  mode: isDev ? 'development' : 'production',
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isDev ? '[name].js' : '[name].[contenthash].js',
    chunkFilename: isDev ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
    publicPath: '/',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 300000, // 减小最大chunk大小
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
        // Monaco Editor
        monaco: {
          test: /[\\/]node_modules[\\/](@monaco-editor|monaco-editor)[\\/]/,
          name: 'monaco-vendor',
          chunks: 'all',
          priority: 25,
        },
        // 工具库
        utils: {
          test: /[\\/]node_modules[\\/](lodash|moment|dayjs|axios)[\\/]/,
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
    runtimeChunk: {
      name: 'runtime',
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                ['@babel/preset-env', {
                  targets: {
                    browsers: ['chrome >= 60']
                  },
                  modules: false,
                }],
                '@babel/preset-react',
                '@babel/preset-typescript',
              ],
              plugins: [
                '@babel/plugin-proposal-class-properties',
              ],
            },
          },
        ],
        exclude: /node_modules/,
      },
      {
        test: /\.less$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
          {
            loader: 'less-loader',
            options: {
              lessOptions: {
                javascriptEnabled: true,
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
    ],
  },
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      filename: 'index.html',
      minify: !isDev ? {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true,
      } : false,
    }),
    !isDev && new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
      chunkFilename: '[name].[contenthash].css',
    }),
  ].filter(Boolean),
  // 性能配置 - 调整为更合理的值
  performance: {
    hints: isDev ? false : 'warning',
    maxAssetSize: 400000, // 400kb
    maxEntrypointSize: 1200000, // 1.2MB - 调整为当前实际大小
  },
  devServer: {
    port: 3000,
    hot: true,
    historyApiFallback: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  devtool: isDev ? 'eval-source-map' : false,
};