#!/bin/zsh
# Run one command while holding a machine-wide slot (AGENTS.md: one build at a time; browser batches limited too).
#   build-lock.sh <label> <command...>     e.g. build-lock.sh fix-x pnpm build
# Builds: one slot ($S/build-slot.lock; build.lock was the old name, still held by a long full-suite run of another session on 10-11). Browser batches (LOCK_DIR=…/browser.lock): BROWSER_SLOTS slots, default 3 (user 2026-10-11:
# 「可以提高并发到 2-3 个」), named browser.lock, browser.lock.2, browser.lock.3. Waits for a free slot; a slot whose holder pid is
# gone is taken over. The holder and the time are in <slot>/info.
S=/private/tmp/claude-501/-Users-yijunwang-code-goalboard/f09f1cf5-06fd-4140-bead-c6dba6a4d675/scratchpad
L=${LOCK_DIR:-$S/build-slot.lock}
label=$1; shift
slots=($L)
if [[ "$L" == */browser.lock ]]; then n=${BROWSER_SLOTS:-3}; for i in $(seq 2 $n); do slots+=("$L.$i"); done; fi
held=""
while [[ -z "$held" ]]; do
  for d in $slots; do
    if mkdir $d 2>/dev/null; then held=$d; break; fi
    pid=$(cat $d/pid 2>/dev/null)
    if [[ -n "$pid" ]] && ! kill -0 $pid 2>/dev/null; then rm -rf $d; if mkdir $d 2>/dev/null; then held=$d; break; fi; fi
  done
  [[ -n "$held" ]] || sleep 15
done
echo $$ > $held/pid; echo "$label $(date +%H:%M:%S) $PWD" > $held/info
trap 'rm -rf $held' EXIT INT TERM
"$@"
