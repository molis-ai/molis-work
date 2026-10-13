#!/bin/sh
# Machine-wide build / browser slot for the coordinated Molis sessions.
# docs/system/PARALLEL-DEVELOPMENT.md §5: at most one build and one browser-test batch at a time.
#
#   slot.sh try <build|browser> <owner>   exit 0 = acquired; exit 1 = busy (prints holder / foreign processes)
#   slot.sh release <build|browser> <owner>
#   slot.sh status
#
# "build" covers: pnpm build / workspace:build / single-package builds, full regressions, health gates that build.
# "browser" covers: any run-tests batch containing *.e2e.test.ts, and headless Chrome screenshot runs.
# Never sleep-poll: if busy, do other work, or wait with the Monitor tool on `slot.sh try ...`.
set -u
DIR=$(cd "$(dirname "$0")" && pwd)
cmd=${1:-status}; kind=${2:-}; owner=${3:-}

foreign() {
  # Heavy processes not started under a held slot (e.g. sessions that do not use this lock).
  # Only real workers count: anything run directly by a shell (`sh -c '…'`, `sh wrapper.sh … pnpm build` wait loops
  # whose text mentions build/run-tests) is a wrapper; the real build/test is its node child process.
  # the Claude `disclaimer --` wrapper and grep/ps/awk themselves are skipped.
  case "$1" in
    quiet|lane) return 0 ;;
    build)   pat='pnpm[^ ]*( [^ ]+)* (run )?(build|workspace:build)( |$)|tsc (-b|--build)( |$)|turbo run build' ;;
    browser) pat='run-tests\.mjs .*e2e|[Cc]hrom(e|ium).*--headless' ;;
  esac
  ps -Ao pid=,command= | PAT="$pat" awk '
    { cmd = $0; sub(/^ *[0-9]+ /, "", cmd) }
    cmd ~ /^((zsh|bash|sh|dash)|[^ ]*\/(zsh|bash|sh|dash))( |$)/ { next }
    cmd ~ /disclaimer -- / { next }
    cmd ~ /^((p?grep|awk|ps)|[^ ]*\/(p?grep|awk|ps))( |$)/ { next }
    cmd ~ ENVIRON["PAT"] { print }'
}

case "$cmd" in
  try)
    [ -n "$kind" ] && [ -n "$owner" ] || { echo "usage: slot.sh try <build|browser> <owner>"; exit 2; }
    if mkdir "$DIR/$kind.lock" 2>/dev/null; then
      f=$(foreign "$kind")
      if [ -n "$f" ]; then
        rmdir "$DIR/$kind.lock"
        echo "BUSY: $kind slot free but foreign processes are running:"; echo "$f"; exit 1
      fi
      printf '%s\n%s\n' "$owner" "$(date -u +%FT%TZ)" > "$DIR/$kind.lock/owner"
      echo "ACQUIRED $kind by $owner"; exit 0
    fi
    echo "BUSY: $kind held by $(tr '\n' ' ' < "$DIR/$kind.lock/owner" 2>/dev/null)"; exit 1 ;;
  release)
    [ -f "$DIR/$kind.lock/owner" ] || { echo "not held"; exit 0; }
    holder=$(head -1 "$DIR/$kind.lock/owner")
    [ "$holder" = "$owner" ] || { echo "REFUSED: $kind held by $holder, not $owner"; exit 1; }
    rm -f "$DIR/$kind.lock/owner"; rmdir "$DIR/$kind.lock"; echo "RELEASED $kind"; exit 0 ;;
  status)
    for k in quiet lane build browser; do
      if [ -d "$DIR/$k.lock" ]; then echo "$k: held by $(tr '\n' ' ' < "$DIR/$k.lock/owner" 2>/dev/null)"; else echo "$k: free"; fi
      f=$(foreign "$k"); if [ -n "$f" ]; then echo "  running:"; echo "$f" | sed "s/^/    /"; fi
    done; exit 0 ;;
  *) echo "usage: slot.sh try|release|status"; exit 2 ;;
esac
