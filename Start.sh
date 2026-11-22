#!/bin/bash
# Usage: ./Start.sh --env dev|test [--desktop]
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed or not on PATH. Install Node $(cat .nvmrc) first." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: ./Start.sh --env dev|test [--desktop]" >&2
  echo "  --env dev      Start against local Auth (http://127.0.0.1:8787)" >&2
  echo "  --env test     Start against remote test Auth (https://auth.test.molis.ai)" >&2
  echo "  --desktop      Also launch the Tauri desktop shell" >&2
  exit 2
fi

exec node scripts/start-account-environment.mjs "$@"
