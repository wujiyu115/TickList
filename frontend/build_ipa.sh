#!/bin/bash
set -e

# TickList iOS 未签名 IPA 构建脚本
# 用法: ./build_ipa.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/ios/App"
SCHEME="App"
BUILD_DIR="$SCRIPT_DIR/build/ios"
ARCHIVE_PATH="$BUILD_DIR/TickList.xcarchive"
IPA_DIR="$BUILD_DIR/ipa"
EXPORT_OPTIONS="$BUILD_DIR/ExportOptions.plist"

echo "=== TickList iOS IPA 构建 ==="
echo ""

# Step 1: 前端构建
echo "[1/5] 构建前端..."
cd "$SCRIPT_DIR"
npx rsbuild build
echo "  ✅ 前端构建完成"

# Step 2: Capacitor sync
echo "[2/5] Capacitor sync..."
npx cap sync ios
echo "  ✅ Capacitor sync 完成"

# Step 3: 清理旧构建
echo "[3/5] 清理旧构建..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$IPA_DIR"
echo "  ✅ 清理完成"

# Step 4: Archive（无签名）
echo "[4/5] Xcode Archive（无签名）..."
cd "$PROJECT_DIR"
xcodebuild archive \
  -scheme "$SCHEME" \
  -configuration Release \
  -archivePath "$ARCHIVE_PATH" \
  -destination "generic/platform=iOS" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGN_ENTITLEMENTS="" \
  | grep -E "^(Archive|Build|Signing|error:|warning:|\*\*)" || true

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "  ❌ Archive 失败，请检查 Xcode 错误信息"
  exit 1
fi
echo "  ✅ Archive 完成: $ARCHIVE_PATH"

# Step 5: 从 archive 手动打包 IPA（绕过签名导出）
echo "[5/5] 打包未签名 IPA..."

APP_PATH="$ARCHIVE_PATH/Products/Applications/App.app"
if [ ! -d "$APP_PATH" ]; then
  # 有时路径可能不同，尝试查找
  APP_PATH=$(find "$ARCHIVE_PATH" -name "*.app" -type d | head -1)
fi

if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
  echo "  ❌ 找不到 .app 文件"
  echo "  Archive 内容:"
  find "$ARCHIVE_PATH" -maxdepth 4 -type d
  exit 1
fi

# 创建 Payload 目录结构并打包为 IPA
PAYLOAD_DIR="$IPA_DIR/Payload"
mkdir -p "$PAYLOAD_DIR"
cp -R "$APP_PATH" "$PAYLOAD_DIR/"

cd "$IPA_DIR"
zip -r -q "$BUILD_DIR/TickList-unsigned.ipa" Payload/
rm -rf "$PAYLOAD_DIR"

echo "  ✅ IPA 打包完成"
echo ""
echo "=== 构建成功 ==="
echo "📦 IPA 文件: $BUILD_DIR/TickList-unsigned.ipa"
echo ""
echo "⚠️  这是未签名的 IPA，安装方式："
echo "  1. 使用 AltStore / Sideloadly 签名后安装到真机"
echo "  2. 使用 TrollStore（免越狱永久签名）"
echo "  3. 使用企业证书重签名分发"
