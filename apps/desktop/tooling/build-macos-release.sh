#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Molis Work macOS releases must be built on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VERSION="$(node -p 'require(process.argv[1]).version' "$REPO_ROOT/package.json")"
PROFILE="${MOLIS_WORK_RELEASE_PROFILE:-dev}"
PROFILE_READER="$REPO_ROOT/tooling/release/profile.mjs"
APP_NAME="$(node "$PROFILE_READER" --profile "$PROFILE" --app-name)"
TAURI_SETTINGS="$(node "$PROFILE_READER" --profile "$PROFILE" --tauri)"
SIGNING_IDENTITY="$(node "$PROFILE_READER" --profile "$PROFILE" --signing-identity)"
node "$REPO_ROOT/scripts/verify-release-versions.mjs"

case "$(uname -m)" in
  arm64) RELEASE_ARCH="arm64" ;;
  x86_64) RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

export MOLIS_WORK_MACOS_ARCH="$RELEASE_ARCH"
# Do not let Tauri auto-select an unrelated local development certificate.
# A caller-supplied release identity is preserved; local builds are explicitly ad-hoc.
export MOLIS_WORK_RELEASE_PROFILE="$PROFILE"
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-$SIGNING_IDENTITY}"
pnpm --dir "$REPO_ROOT" build
bash "$SCRIPT_DIR/prepare-macos-runtime.sh"

BUNDLE_ROOT="$REPO_ROOT/apps/desktop/src-tauri/target/release/bundle"
rm -rf "$BUNDLE_ROOT/dmg" "$BUNDLE_ROOT/macos/$APP_NAME.app"

(cd "$REPO_ROOT/apps/desktop" && "$REPO_ROOT/node_modules/.bin/tauri" build --bundles app,dmg --ci --config "$TAURI_SETTINGS")

APP_PATH="$BUNDLE_ROOT/macos/$APP_NAME.app"
case "$RELEASE_ARCH" in
  arm64) TAURI_DMG_ARCH="aarch64" ;;
  x64) TAURI_DMG_ARCH="x64" ;;
esac
DMG_PATH="$BUNDLE_ROOT/dmg/${APP_NAME}_${VERSION}_${TAURI_DMG_ARCH}.dmg"
if [[ ! -f "$DMG_PATH" ]]; then
  DMG_MATCHES=()
  if [[ -d "$BUNDLE_ROOT/dmg" ]]; then
    while IFS= read -r match; do
      DMG_MATCHES+=("$match")
    done < <(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name "${APP_NAME}_${VERSION}_*.dmg" -print)
  fi
  if [[ "${#DMG_MATCHES[@]}" -eq 1 ]]; then
    DMG_PATH="${DMG_MATCHES[0]}"
  else
    DMG_PATH=""
  fi
fi
if [[ ! -d "$APP_PATH" || -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "Tauri did not produce the expected $APP_NAME.app and DMG." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

OUTPUT_DIR="$REPO_ROOT/release/macos"
mkdir -p "$OUTPUT_DIR"
OUTPUT_DMG="$OUTPUT_DIR/$APP_NAME-${VERSION}-macos-${RELEASE_ARCH}.dmg"
OUTPUT_ZIP="$OUTPUT_DIR/$APP_NAME-${VERSION}-macos-${RELEASE_ARCH}.app.zip"
STAGE_DIR="$(mktemp -d "$OUTPUT_DIR/.molis-release-stage.XXXXXX")"
cleanup() { rm -rf "$STAGE_DIR"; }
trap cleanup EXIT INT TERM
STAGED_DMG="$STAGE_DIR/$(basename "$OUTPUT_DMG")"
STAGED_ZIP="$STAGE_DIR/$(basename "$OUTPUT_ZIP")"
cp "$DMG_PATH" "$STAGED_DMG"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$STAGED_ZIP"
(cd "$STAGE_DIR" && shasum -a 256 "$(basename "$OUTPUT_DMG")" > "$(basename "$OUTPUT_DMG").sha256")
(cd "$STAGE_DIR" && shasum -a 256 "$(basename "$OUTPUT_ZIP")" > "$(basename "$OUTPUT_ZIP").sha256")
rm -f "$OUTPUT_DMG" "$OUTPUT_ZIP" "$OUTPUT_DMG.sha256" "$OUTPUT_ZIP.sha256"
mv "$STAGED_DMG" "$OUTPUT_DMG"
mv "$STAGED_ZIP" "$OUTPUT_ZIP"
mv "$STAGED_DMG.sha256" "$OUTPUT_DMG.sha256"
mv "$STAGED_ZIP.sha256" "$OUTPUT_ZIP.sha256"

echo "Built Molis Work macOS release:"
echo "  $OUTPUT_DMG"
echo "  $OUTPUT_ZIP"
echo "Actual App signature (signature validity is not notarization or Gatekeeper approval):"
codesign -dv --verbose=2 "$APP_PATH" 2>&1
