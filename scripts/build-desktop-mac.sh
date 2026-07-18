#!/usr/bin/env bash
# Build the TickList macOS desktop app (.app + .dmg) via Tauri.
# Frontend build runs automatically (tauri.conf.json beforeBuildCommand).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/frontend"

# Rust toolchain (Tauri needs cargo/rustc)
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust not found. Install with:"
  echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
  exit 1
fi

# JS deps (ensure Tauri CLI is present, not just node_modules dir)
[ -x node_modules/.bin/tauri ] || bun install

# Build only the .app. Tauri's own DMG step (bundle_dmg.sh) drives Finder via
# osascript to style the window and fails in a non-GUI/headless shell, so we
# pack the DMG ourselves below with hdiutil. Extra args pass through,
# e.g. --target aarch64-apple-darwin
bunx tauri build --bundles app "$@"

APP="$(find src-tauri/target -path '*/release/bundle/macos/*.app' -maxdepth 7 -print 2>/dev/null | head -1)"
[ -n "$APP" ] || { echo "No .app produced" >&2; exit 1; }

# Pack a plain compressed DMG with an Applications drag-target.
VERSION="$(python3 -c "import json;print(json.load(open('src-tauri/tauri.conf.json'))['version'])")"
DMG="$(dirname "$APP")/TickList_${VERSION}.dmg"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
rm -f "$DMG"
hdiutil create -volname TickList -srcfolder "$STAGE" -ov -format UDZO "$DMG" >/dev/null
rm -rf "$STAGE"

echo
echo "Artifacts:"
ls -lh "$APP" "$DMG"
