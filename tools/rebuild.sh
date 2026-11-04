#!/bin/sh
# 用 main 上的路线书和 #1743 重新生成 index.html。用法：tools/rebuild.sh <molis-work 检出目录>
# 只 fetch 和读取那个检出，不改它的工作区。
set -eu
TOOLS=$(cd "$(dirname "$0")" && pwd)
REPO=$1
ROAD=specs/post-anticorruption-roadmap
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" fetch -q origin main
git -C "$REPO" archive origin/main "$ROAD" | tar -x -C "$TMP"
COMMIT=$(git -C "$REPO" log -1 --format=%h --abbrev=9 origin/main -- "$ROAD")
gh api repos/molis-ai/molis-work/issues/1743 > "$TMP/issue.json"
python3 -I "$TOOLS/build_data.py" "$TOOLS" "$TMP/$ROAD/reference" "$TMP/data.json"
python3 -I "$TOOLS/build.py" "$TMP/data.json" "$TMP/$ROAD/reference/batches" "$TOOLS/template.html" "$TMP/page.html" "$TMP/issue.json" "$COMMIT"
{
  printf '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{color-scheme:light dark}body{margin:0}[hidden]{display:none!important}</style></head><body>'
  cat "$TMP/page.html"
  echo '</body></html>'
} > "$TOOLS/../index.html"
