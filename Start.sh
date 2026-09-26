#!/bin/bash
# Molis Work 一键启动：进入启动向导（等同 pnpm start）。
# 用法: ./Start.sh [选项]，选项见 node scripts/start.mjs --help
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node > /dev/null 2>&1; then
  echo "✗ 未找到 node（需要 Node.js 24+），请先安装并加入 PATH" >&2
  exit 1
fi

exec node scripts/start.mjs "$@"
