#!/bin/bash
set -euo pipefail

for APP in "${MOLIS_WORK_APP_DIR:-$HOME/Applications}/Molis Work.app" "/Applications/Molis Work.app"; do
  if [[ -d "$APP" ]]; then
    open "$APP"
    echo "Started Molis Work: $APP"
    exit 0
  fi
done

echo "Molis Work.app is not installed. Run pnpm desktop:install:macos or drag it from the DMG into Applications." >&2
exit 1
