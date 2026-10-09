#!/bin/bash
# Builds "Molis Work Computer Helper.app" (specs/computer-use) for this Mac's architecture.
#
# macOS keeps Screen Recording, Accessibility and Input Monitoring grants against the app's code signature. An ad-hoc
# signature changes with every build, so every rebuild would lose the grants; a stable certificate keeps them.
# MOLIS_HELPER_SIGNING_IDENTITY picks the certificate (a release passes its Developer ID here, BL-021); unset, the
# local development certificate is used when this Mac has one, else ad-hoc with a warning.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The computer helper is macOS only." >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${1:-$HERE/build}"
APP="$OUT_DIR/Molis Work Computer Helper.app"
BUNDLE_ID="com.molis.work.computer-helper"
VERSION="$(node -p "require('$HERE/../../../../package.json').version" 2>/dev/null || echo 0.0.0)"
ARCH="$(uname -m)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -O -swift-version 5 -target "$ARCH-apple-macos14.0" \
  -framework Cocoa -framework ApplicationServices -framework ScreenCaptureKit -framework Carbon \
  "$HERE"/Sources/*.swift -o "$APP/Contents/MacOS/computer-helper"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleName</key><string>Molis Work Computer Helper</string>
  <key>CFBundleDisplayName</key><string>Molis Work Computer Helper</string>
  <key>CFBundleExecutable</key><string>computer-helper</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

IDENTITY="${MOLIS_HELPER_SIGNING_IDENTITY:-}"
if [[ -z "$IDENTITY" ]]; then
  if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Tauri Local Development"'; then
    IDENTITY="Tauri Local Development"
  else
    IDENTITY="-"
    echo "warning: no stable signing certificate; ad-hoc signed, so macOS will ask for the permissions again after every rebuild." >&2
  fi
fi
codesign --force --sign "$IDENTITY" --identifier "$BUNDLE_ID" --timestamp=none "$APP"
codesign --verify --strict "$APP"
echo "$APP"
