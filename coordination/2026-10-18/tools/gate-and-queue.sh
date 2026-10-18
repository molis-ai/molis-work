#!/bin/zsh
[ -n "${ZSH_VERSION:-}" ] || { echo "NOT QUEUED: run this script with zsh, not bash"; exit 2; }
# usage: gate-and-queue.sh <pr> <expected-head-prefix>
# Queues the PR when every check passes, or when the only failures are full-suite shards whose
# failing files (after the retry) are all in KNOWN (pre-existing Linux CI failures, triaged with the anti-corruption line).
cd "${MOLIS_REPO:-$HOME/code/goalboard}"
KNOWN=(tests/todo-draft-recovery.e2e.test.ts tests/agent-action-selection.e2e.test.ts tests/alchemist-client-boundaries.e2e.test.ts)
KNOWN+=(${=EXTRA_KNOWN:-})   # EXTRA_KNOWN: space-separated files known for this run only
pr=$1; want=$2; mode=${3:-}   # mode=merge-only: head only merges main + regenerates gate numbers over a head whose full suite was judged
for i in $(seq 1 150); do
  head=$(gh pr view $pr --json headRefOid --jq .headRefOid 2>/dev/null)
  [[ -z $head ]] && { sleep 60; continue; }   # network blip: try again
  [[ $head != $want* ]] && { echo "head moved to ${head:0:9}; stop"; exit 2; }
  out=$(gh pr checks $pr 2>/dev/null)
  echo "$out" | grep -qE "(pass|fail)" || { sleep 60; continue; }
  echo "$out" | grep -q "pending" || break
  sleep 60
done
echo "$out" | awk -F'\t' '{print $2}' | sort | uniq -c
# After #538 a push no longer reruns the full suite: never queue a head that has no full-suite run of its own.
if [[ $mode != merge-only ]] && ! echo "$out" | grep -q "^Full suite ("; then echo "NOT QUEUED: no full-suite run on this head (add the full-suite label again)"; exit 3; fi
bad=$(echo "$out" | grep -v "pass\|skipping")
if [[ -z $bad ]]; then gh pr merge $pr --squash --auto 2>&1 | grep -v "merge strategy"; echo "QUEUED $pr (all green)"; exit 0; fi
echo "FAILURES:"; echo "$bad"
other=$(echo "$bad" | grep -v "^Full suite" )
if [[ -n $other ]]; then echo "NOT QUEUED: non-full-suite failures"; exit 1; fi
files=(); cancelled=0; broken=()
for url in $(echo "$bad" | grep "^Full suite (" | grep -oE "job/[0-9]+" | cut -d/ -f2); do
  log=$(gh run view --job $url --log 2>/dev/null)
  got=($(echo "$log" | grep -oE "\[retry 1\] FAIL  tests/[^ ]+" | awk '{print $4}'))
  # fail-fast (#716) cancels the other shards once one fails: their files are unverified, so the head is never queued.
  if (( ${#got} == 0 )) && echo "$log" | grep -q "The operation was canceled"; then cancelled=$((cancelled+1)); continue; fi
  # A shard that failed with no retried test file never ran its tests (install, network, runner): its files are unverified.
  (( ${#got} == 0 )) && broken+=($url)
  files+=($got)
done
files=(${(u)files})
if (( cancelled )); then echo "NOT QUEUED: first failure ${files[*]:-none found}${broken:+ (setup or runner failure in job ${broken[*]})}; fail-fast cancelled $cancelled shards"; exit 1; fi
if (( ${#broken} )); then echo "NOT QUEUED: shard job ${broken[*]} failed without a retried test file (setup or runner failure); rerun it"; exit 1; fi
echo "failing files after retry: ${files[*]}"
if (( ${#files} == 0 )); then echo "NOT QUEUED: full-suite failed but no retried file was found in the logs"; exit 1; fi
unknown=()
for f in $files; do (( ${KNOWN[(Ie)$f]} )) || unknown+=($f); done
if (( ${#unknown} )); then echo "NOT QUEUED: unknown failures: ${unknown[*]}"; exit 1; fi
gh pr merge $pr --squash --auto 2>&1 | grep -v "merge strategy"; echo "QUEUED $pr (only known full-suite failures)"
