#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Molis Work macOS releases must be built on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
node "$SCRIPT_DIR/verify-release-versions.mjs"

case "$(uname -m)" in
  arm64) RELEASE_ARCH="arm64" ;;
  x86_64) RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

export MOLIS_WORK_MACOS_ARCH="$RELEASE_ARCH"
# Do not let Tauri auto-select an unrelated local development certificate.
# A caller-supplied release identity is preserved; local builds are explicitly ad-hoc.
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"
pnpm --dir "$REPO_ROOT" build
bash "$SCRIPT_DIR/prepare-macos-runtime.sh"

(cd "$REPO_ROOT/apps/desktop" && "$REPO_ROOT/node_modules/.bin/tauri" build --bundles app,dmg --ci)

BUNDLE_ROOT="$REPO_ROOT/apps/desktop/src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_ROOT/macos/Molis Work.app"
DMG_PATH="$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
if [[ ! -d "$APP_PATH" || -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "Tauri did not produce the expected Molis Work.app and DMG." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

OUTPUT_DIR="$REPO_ROOT/release/macos"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DMG="$OUTPUT_DIR/Molis Work-${VERSION}-macos-${RELEASE_ARCH}.dmg"
OUTPUT_ZIP="$OUTPUT_DIR/Molis Work-${VERSION}-macos-${RELEASE_ARCH}.app.zip"
rm -f "$OUTPUT_DMG" "$OUTPUT_ZIP" "$OUTPUT_DMG.sha256" "$OUTPUT_ZIP.sha256"
cp "$DMG_PATH" "$OUTPUT_DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$OUTPUT_ZIP"
(cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$OUTPUT_DMG")" > "$(basename "$OUTPUT_DMG").sha256")
(cd "$OUTPUT_DIR" && shasum -a 256 "$(basename "$OUTPUT_ZIP")" > "$(basename "$OUTPUT_ZIP").sha256")

echo "Built Molis Work macOS release:"
echo "  $OUTPUT_DMG"
echo "  $OUTPUT_ZIP"
echo "Actual App signature (signature validity is not notarization or Gatekeeper approval):"
codesign -dv --verbose=2 "$APP_PATH" 2>&1
