#!/usr/bin/env bash
set -euo pipefail

# Build a styled DMG installer that contains:
# - <App>.app (positioned on the left)
# - /Applications symlink (positioned on the right)
# - Custom background with an arrow between them
#
# The Finder window is configured via AppleScript so the DMG opens with a
# clean, professional look (similar to the Claude desktop app installer).
#
# Usage:
#   scripts/build-dmg-from-app.sh <app_path> <output_dmg>
#
# Env:
#   DMG_VOLUME_NAME   override volume name (defaults to CFBundleName)
#   DMG_MARGIN_MB     extra space added to image size (default: 300)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Background image for the DMG window (lives next to assets/)
BG_IMAGE="$SCRIPT_DIR/../assets/dmg-installer-bg.jpg"
if [[ ! -f "$BG_IMAGE" ]]; then
  echo "Warning: DMG background not found at $BG_IMAGE; building without styling" >&2
fi

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

# ── Style the DMG window ────────────────────────────────────────────────
if [[ -f "$BG_IMAGE" ]]; then
  echo "[atomicbot] build-dmg-from-app: styling DMG window"

  # Mount the read-write image
  MOUNT_OUT="$(hdiutil attach "$RW_DMG" -readwrite -noverify -noautoopen)"
  MOUNT_DIR="$(echo "$MOUNT_OUT" | awk 'END{for(i=3;i<=NF;i++) printf "%s%s",$i,(i<NF?" ":""); print ""}')"

  if [[ -z "$MOUNT_DIR" || ! -d "$MOUNT_DIR" ]]; then
    echo "Warning: could not mount RW DMG; skipping styling" >&2
  else
    # Place background image in a hidden directory on the volume
    mkdir -p "$MOUNT_DIR/.background"
    cp "$BG_IMAGE" "$MOUNT_DIR/.background/background.jpg"

    # Hide the .background folder from Finder (SetFile -a V = invisible)
    if command -v SetFile &>/dev/null; then
      SetFile -a V "$MOUNT_DIR/.background" 2>/dev/null || true
    fi

    # Configure Finder window via AppleScript.
    # Finder is notoriously finicky about persisting .DS_Store changes on DMG
    # volumes. We bring Finder to front, apply settings with delays between
    # each group, and use a retry loop for icon positioning (Finder may not
    # have indexed the volume contents yet → error -10006).
    # Window content size: 640x400 pt (background @2x = 1280x800 px).
    # Styling is non-fatal: if it fails the DMG still gets built (just unstyled).
    echo "[atomicbot] build-dmg-from-app: applying Finder window settings via AppleScript"
    osascript <<APPLESCRIPT || echo "Warning: AppleScript styling failed (non-fatal)" >&2
tell application "Finder"
  activate
  tell disk "$DMG_VOLUME_NAME"
    open
    delay 3

    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 200, 840, 600}
    delay 2

    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 100
    set background picture of viewOptions to file ".background:background.jpg"
    delay 2

    -- Retry icon positioning: Finder needs time to index volume contents.
    -- Error -10006 means the item isn't found yet.
    set positionsSet to false
    repeat 5 times
      try
        set position of item "$APP_NAME.app" of container window to {160, 200}
        set position of item "Applications" of container window to {480, 200}
        set positionsSet to true
        exit repeat
      on error
        delay 3
      end try
    end repeat

    if not positionsSet then
      error "Could not set icon positions after 5 retries"
    end if

    -- First close/open cycle: force Finder to write .DS_Store
    close
    delay 2
    open
    delay 3

    -- Re-apply background (Finder sometimes drops it on first pass)
    set viewOptions to the icon view options of container window
    set background picture of viewOptions to file ".background:background.jpg"
    update without registering applications
    delay 3

    close
  end tell
end tell
APPLESCRIPT

    # Give Finder extra time to flush .DS_Store to disk
    sleep 2
    sync

    hdiutil detach "$MOUNT_DIR" -quiet || hdiutil detach "$MOUNT_DIR" -force
  fi
fi

echo "[atomicbot] build-dmg-from-app: converting to compressed DMG"
hdiutil convert "$RW_DMG" -format UDZO -o "$OUT_DMG" -ov >/dev/null
rm -f "$RW_DMG"

hdiutil verify "$OUT_DMG" >/dev/null
echo "[atomicbot] build-dmg-from-app: ready: $OUT_DMG"

