#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Molis Work Desktop installation is available only on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE="${1:-}"
APP_DIR="${MOLIS_WORK_APP_DIR:-$HOME/Applications}"
MOUNT_DIR=""

# shellcheck source=retire-legacy-macos-app.sh
. "$SCRIPT_DIR/retire-legacy-macos-app.sh"

cleanup() {
  if [[ -n "$MOUNT_DIR" && -d "$MOUNT_DIR" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -z "$SOURCE" ]]; then
  case "$(uname -m)" in arm64) ARCH="arm64" ;; *) ARCH="x64" ;; esac
  SOURCE="$(find "$REPO_ROOT/release/macos" -maxdepth 1 -type f -name "Molis Work-*-macos-${ARCH}.dmg" -print 2>/dev/null | sort | tail -1)"
fi
if [[ -z "$SOURCE" || ! -e "$SOURCE" ]]; then
  echo "Molis Work App or DMG not found. Build it first with pnpm desktop:build:macos, or pass a path." >&2
  exit 1
fi

if [[ "$SOURCE" == *.dmg ]]; then
  MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/molis-work-dmg.XXXXXX")"
  hdiutil attach "$SOURCE" -nobrowse -readonly -mountpoint "$MOUNT_DIR" -quiet
  SOURCE="$MOUNT_DIR/Molis Work.app"
fi
if [[ ! -d "$SOURCE" || "$SOURCE" != *.app ]]; then
  echo "The selected source is not a Molis Work.app bundle: $SOURCE" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
TARGET="$APP_DIR/Molis Work.app"
if [[ -e "$TARGET" ]]; then
  TRASH_TARGET="$HOME/.Trash/Molis Work.app.$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$HOME/.Trash"
  mv "$TARGET" "$TRASH_TARGET"
  echo "Moved the previous app to $TRASH_TARGET"
fi
ditto "$SOURCE" "$TARGET"
echo "Installed Molis Work to $TARGET"
MOLIS_WORK_RETIRE_SKIP="$TARGET" retire_legacy_macos_apps "$APP_DIR" || true
if [[ "${MOLIS_WORK_SKIP_OPEN:-0}" != "1" ]]; then
  open "$TARGET"
fi
