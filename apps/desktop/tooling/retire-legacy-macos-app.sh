#!/bin/bash
# Retire an owned GoalBoard.app after Molis Work is installed.
# Sourced by install-macos-app.sh, or run directly.

LEGACY_MACOS_APP_BUNDLE_ID="com.adeptify.goalboard"
LEGACY_MACOS_APP_NAME="GoalBoard.app"

macos_app_bundle_id() {
  local plist="$1/Contents/Info.plist"
  [[ -f "$plist" ]] || return 1
  local id=""
  if [[ -x /usr/libexec/PlistBuddy ]]; then
    id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist" 2>/dev/null || true)"
  fi
  if [[ -z "$id" ]]; then
    id="$(plutil -extract CFBundleIdentifier raw "$plist" 2>/dev/null || true)"
  fi
  printf '%s' "$id"
}

trash_macos_app_bundle() {
  local app="$1"
  local trash_dir="${MOLIS_WORK_TRASH_DIR:-$HOME/.Trash}"
  mkdir -p "$trash_dir"
  local base
  base="$(basename "$app")"
  local dest="$trash_dir/$base.$(date +%Y%m%d-%H%M%S)"
  local n=1
  while [[ -e "$dest" ]]; do
    dest="$trash_dir/$base.$(date +%Y%m%d-%H%M%S).$n"
    n=$((n + 1))
  done
  mv "$app" "$dest"
  echo "Moved the previous GoalBoard app to $dest"
}

retire_owned_legacy_macos_app() {
  local app="$1"
  [[ -d "$app" ]] || return 0
  if [[ -n "${MOLIS_WORK_RETIRE_SKIP:-}" ]]; then
    local resolved_app resolved_skip
    resolved_app="$(cd "$app" && pwd)"
    resolved_skip="$(cd "${MOLIS_WORK_RETIRE_SKIP}" 2>/dev/null && pwd || true)"
    if [[ -n "$resolved_skip" && "$resolved_app" == "$resolved_skip" ]]; then
      return 0
    fi
  fi
  local id
  id="$(macos_app_bundle_id "$app" || true)"
  if [[ "$id" != "$LEGACY_MACOS_APP_BUNDLE_ID" ]]; then
    return 0
  fi
  trash_macos_app_bundle "$app"
}

retire_legacy_macos_apps() {
  local app_dir="${1:-${MOLIS_WORK_APP_DIR:-$HOME/Applications}}"
  local system_dir="${MOLIS_WORK_SYSTEM_APP_DIR:-/Applications}"
  local seen="|"
  local app key
  for app in \
    "$app_dir/$LEGACY_MACOS_APP_NAME" \
    "$HOME/Applications/$LEGACY_MACOS_APP_NAME" \
    "$system_dir/$LEGACY_MACOS_APP_NAME"
  do
    [[ -d "$app" ]] || continue
    key="$(cd "$app" && pwd)"
    case "$seen" in
      *"|$key|"*) continue ;;
    esac
    seen="${seen}${key}|"
    retire_owned_legacy_macos_app "$app" || true
  done
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set -euo pipefail
  retire_legacy_macos_apps "${1:-${MOLIS_WORK_APP_DIR:-$HOME/Applications}}"
fi
