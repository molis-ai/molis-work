#!/bin/bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Molis Work Desktop installation is available only on macOS." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
APP_NAME="$(node "$REPO_ROOT/tooling/release/profile.mjs" --profile "${MOLIS_WORK_RELEASE_PROFILE:-dev}" --app-name)"
SOURCE="${1:-}"
APP_DIR="${MOLIS_WORK_APP_DIR:-$HOME/Applications}"
MOUNT_DIR=""
STAGE_DIR=""
BACKUP_DIR=""
BACKUP_APP=""
TARGET=""
SWAP_DONE="0"

cleanup() {
  if [[ "$SWAP_DONE" != "1" && -n "$BACKUP_APP" && -e "$BACKUP_APP" && -n "$TARGET" && ! -e "$TARGET" ]]; then
    mv "$BACKUP_APP" "$TARGET" || true
  fi
  if [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]]; then
    rm -rf "$STAGE_DIR"
  fi
  if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
    rm -rf "$BACKUP_DIR"
  fi
  if [[ -n "$MOUNT_DIR" && -d "$MOUNT_DIR" ]]; then
    hdiutil detach "$MOUNT_DIR" -quiet || true
    rmdir "$MOUNT_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

if [[ -z "$SOURCE" ]]; then
  case "$(uname -m)" in arm64) ARCH="arm64" ;; *) ARCH="x64" ;; esac
  SOURCE="$(find "$REPO_ROOT/release/macos" -maxdepth 1 -type f -name "$APP_NAME-*-macos-${ARCH}.dmg" -print 2>/dev/null | sort | tail -1)"
fi
if [[ -z "$SOURCE" || ! -e "$SOURCE" ]]; then
  echo "Molis Work App or DMG not found. Build it first with pnpm desktop:build:macos, or pass a path." >&2
  exit 1
fi

if [[ "$SOURCE" == *.dmg ]]; then
  MOUNT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/molis-work-dmg.XXXXXX")"
  hdiutil attach "$SOURCE" -nobrowse -readonly -mountpoint "$MOUNT_DIR" -quiet
  SOURCE="$MOUNT_DIR/$APP_NAME.app"
fi
if [[ ! -d "$SOURCE" || "$SOURCE" != *.app ]]; then
  echo "The selected source is not a $APP_NAME.app bundle: $SOURCE" >&2
  exit 1
fi

mkdir -p "$APP_DIR"
TARGET="$APP_DIR/$APP_NAME.app"
STAGE_DIR="$(mktemp -d "$APP_DIR/.molis-work-install.XXXXXX")"
STAGED_APP="$STAGE_DIR/$APP_NAME.app"
ditto "$SOURCE" "$STAGED_APP"

if [[ -e "$TARGET" ]]; then
  BACKUP_DIR="$(mktemp -d "$APP_DIR/.molis-work-backup.XXXXXX")"
  BACKUP_APP="$BACKUP_DIR/$APP_NAME.app"
  mv "$TARGET" "$BACKUP_APP"
fi

if ! mv "$STAGED_APP" "$TARGET"; then
  if [[ -n "$BACKUP_APP" && -e "$BACKUP_APP" && ! -e "$TARGET" ]]; then
    mv "$BACKUP_APP" "$TARGET" || true
  fi
  echo "Failed to install $APP_NAME.app; restored the previous installation." >&2
  exit 1
fi
SWAP_DONE="1"

if [[ -n "$BACKUP_APP" && -e "$BACKUP_APP" ]]; then
  mkdir -p "$HOME/.Trash"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  TRASH_TARGET="$HOME/.Trash/$APP_NAME.app.${STAMP}.$$"
  SUFFIX=0
  while [[ -e "$TRASH_TARGET" ]]; do
    SUFFIX=$((SUFFIX + 1))
    TRASH_TARGET="$HOME/.Trash/$APP_NAME.app.${STAMP}.$$.${SUFFIX}"
  done
  if mv "$BACKUP_APP" "$TRASH_TARGET" 2>/dev/null; then
    echo "Moved the previous app to $TRASH_TARGET"
  else
    rm -rf "$BACKUP_APP"
  fi
fi

echo "Installed Molis Work to $TARGET"
if [[ "${MOLIS_WORK_SKIP_OPEN:-0}" != "1" ]]; then
  open "$TARGET"
fi
