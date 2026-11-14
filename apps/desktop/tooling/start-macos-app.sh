#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="$(node "$SCRIPT_DIR/../../../tooling/release/profile.mjs" --profile "${MOLIS_WORK_RELEASE_PROFILE:-dev}" --app-name)"

for APP in "${MOLIS_WORK_APP_DIR:-$HOME/Applications}/$APP_NAME.app" "/Applications/$APP_NAME.app"; do
  if [[ -d "$APP" ]]; then
    open "$APP"
    echo "Started Molis Work: $APP"
    exit 0
  fi
done

echo "$APP_NAME.app is not installed. Run pnpm desktop:install:macos or drag it from the DMG into Applications." >&2
exit 1
