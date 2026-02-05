#!/usr/bin/env bash
set -euo pipefail

# Build a simple DMG that contains:
# - <App>.app
# - /Applications symlink
#
# This script intentionally over-allocates the DMG size a bit to avoid "No space left on device"
# errors caused by filesystem overhead or DMG sizing heuristics.
#
# Usage:
#   scripts/build-dmg-from-app.sh <app_path> <output_dmg>
#
# Env:
#   DMG_VOLUME_NAME   override volume name (defaults to CFBundleName)
#   DMG_MARGIN_MB     extra space added to image size (default: 300)

APP_PATH="${1:-}"
OUT_DMG="${2:-}"

if [[ -z "$APP_PATH" || -z "$OUT_DMG" ]]; then
  echo "Usage: $0 <app_path> <output_dmg>" >&2
  exit 1
fi
if [[ ! -d "$APP_PATH" ]]; then
  echo "Error: app bundle not found: $APP_PATH" >&2
  exit 1
fi

APP_NAME=$(/usr/libexec/PlistBuddy -c "Print CFBundleName" "$APP_PATH/Contents/Info.plist" 2>/dev/null || echo "Atomic Bot")
DMG_VOLUME_NAME="${DMG_VOLUME_NAME:-$APP_NAME}"
DMG_MARGIN_MB="${DMG_MARGIN_MB:-300}"

TMP_DIR="$(mktemp -d /tmp/atomicbot-dmg.XXXXXX)"
trap 'rm -rf "$TMP_DIR" 2>/dev/null || true' EXIT

cp -R "$APP_PATH" "$TMP_DIR/"
ln -s /Applications "$TMP_DIR/Applications"

APP_SIZE_MB="$(du -sm "$APP_PATH" | awk '{print $1}')"
DMG_SIZE_MB=$((APP_SIZE_MB + DMG_MARGIN_MB))

RW_DMG="${OUT_DMG%.dmg}-rw.dmg"
rm -f "$RW_DMG" "$OUT_DMG"

echo "[atomicbot] build-dmg-from-app: creating RW image (${DMG_SIZE_MB}m)"
hdiutil create \
  -volname "$DMG_VOLUME_NAME" \
  -srcfolder "$TMP_DIR" \
  -ov \
  -format UDRW \
  -size "${DMG_SIZE_MB}m" \
  "$RW_DMG" >/dev/null

echo "[atomicbot] build-dmg-from-app: converting to compressed DMG"
hdiutil convert "$RW_DMG" -format UDZO -o "$OUT_DMG" -ov >/dev/null
rm -f "$RW_DMG"

hdiutil verify "$OUT_DMG" >/dev/null
echo "[atomicbot] build-dmg-from-app: ready: $OUT_DMG"

