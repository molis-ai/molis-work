#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Molis Work macOS releases must be built on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version")"
node "$REPO_ROOT/scripts/verify-release-versions.mjs"

case "$(uname -m)" in
  arm64) RELEASE_ARCH="arm64" ;;
  x86_64) RELEASE_ARCH="x64" ;;
  *) echo "Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

export MOLIS_WORK_MACOS_ARCH="$RELEASE_ARCH"
# Do not let Tauri auto-select an unrelated local development certificate.
# A caller-supplied release identity is preserved; local builds are explicitly ad-hoc.
export APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}"

# A Developer ID build is a release candidate: it must also be notarized, or it is not something to give a person
# (docs/releases/POLICY.md). Notarization credentials are read by name from the environment only (the release workflow
# passes them); this script never prints or stores them. Tauri notarizes the .app; the DMG is notarized below.
RELEASE_SIGNING=0
if [[ "$APPLE_SIGNING_IDENTITY" != "-" ]]; then
  RELEASE_SIGNING=1
  if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
    NOTARY_AUTH=(--key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER")
  elif [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" && -n "${APPLE_TEAM_ID:-}" ]]; then
    NOTARY_AUTH=(--apple-id "$APPLE_ID" --password "$APPLE_PASSWORD" --team-id "$APPLE_TEAM_ID")
  else
    echo "APPLE_SIGNING_IDENTITY is set, but notarization credentials are missing." >&2
    echo "Provide APPLE_API_KEY, APPLE_API_ISSUER and APPLE_API_KEY_PATH, or APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID." >&2
    exit 1
  fi
fi

pnpm --dir "$REPO_ROOT" build
bash "$SCRIPT_DIR/prepare-macos-runtime.sh"

# Tauri signs the App and the code in its standard places, not the runtime under Contents/Resources. Sign that first,
# with the same identity (ad-hoc for a local build), so what Tauri copies in is already signed the release way.
RUNTIME_DIR="$REPO_ROOT/apps/desktop/src-tauri/resources/molis-work-runtime"
node "$SCRIPT_DIR/sign-macos-runtime.mjs" "$RUNTIME_DIR" "$APPLE_SIGNING_IDENTITY"

(cd "$REPO_ROOT/apps/desktop" && "$REPO_ROOT/node_modules/.bin/tauri" build --bundles app,dmg --ci)

BUNDLE_ROOT="$REPO_ROOT/apps/desktop/src-tauri/target/release/bundle"
APP_PATH="$BUNDLE_ROOT/macos/Molis Work.app"
DMG_PATH="$(find "$BUNDLE_ROOT/dmg" -maxdepth 1 -type f -name '*.dmg' -print -quit)"
if [[ ! -d "$APP_PATH" || -z "$DMG_PATH" || ! -f "$DMG_PATH" ]]; then
  echo "Tauri did not produce the expected Molis Work.app and DMG." >&2
  exit 1
fi
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
# Every piece of code: valid, hardened runtime, no get-task-allow, Node with its JIT entitlement; for a release also
# Developer ID, a secure timestamp and one Team ID.
if [[ "$RELEASE_SIGNING" == 1 ]]; then
  node "$SCRIPT_DIR/verify-macos-signatures.mjs" "$APP_PATH" --release
else
  node "$SCRIPT_DIR/verify-macos-signatures.mjs" "$APP_PATH"
fi

if [[ "$RELEASE_SIGNING" == 1 ]]; then
  # Tauri has notarized and stapled the App. The DMG is what people download and may first open offline, so it gets
  # its own signature, notarization and stapled ticket. Each check below failing means the package is not releasable.
  xcrun stapler validate "$APP_PATH"
  codesign --force --sign "$APPLE_SIGNING_IDENTITY" --timestamp "$DMG_PATH"
  xcrun notarytool submit "$DMG_PATH" "${NOTARY_AUTH[@]}" --wait
  xcrun stapler staple "$DMG_PATH"
  xcrun stapler validate "$DMG_PATH"
  spctl --assess --type execute --verbose=4 "$APP_PATH"
  spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG_PATH"
fi

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
if [[ "$RELEASE_SIGNING" == 1 ]]; then
  echo "Actual App signature (notarized, stapled and accepted by Gatekeeper above):"
else
  echo "Actual App signature (ad-hoc: signature validity is not notarization or Gatekeeper approval):"
fi
codesign -dv --verbose=2 "$APP_PATH" 2>&1
