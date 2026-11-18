#!/bin/bash
# Usage: ./Start.sh --env dev|test
set -euo pipefail
cd "$(dirname "$0")"
exec node scripts/start-account-environment.mjs "$@"
