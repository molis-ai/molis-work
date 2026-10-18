#!/bin/zsh
# Prints each new state once: full-suite runs, PR merges 611–760, and the last line of each gate log.
cd "${MOLIS_REPO:-$HOME/code/goalboard}"
S=${0:A:h}
seen=$S/monitor-seen.txt; touch $seen
emit() { while IFS= read -r l; do [[ -z $l ]] && continue; grep -qxF -- "$l" $seen || { echo "$l"; echo "$l" >> $seen; }; done }
while true; do
  fs=$(gh run list --workflow "Full suite" --limit 8 --json headBranch,status,conclusion,attempt --jq '.[]|"FS \(.headBranch) a\(.attempt) \(.status) \(.conclusion)"' 2>/dev/null) && print -r -- "$fs" | emit
  mg=$(gh pr list --state merged --limit 30 --json number --jq '.[]|select(.number>=611 and .number<=760)|"MERGED \(.number)"' 2>/dev/null) && print -r -- "$mg" | emit
  for f in $S/gate-6[1-9]?.log(N) $S/gate-7??.log(N); do l=$(tail -1 $f 2>/dev/null); [[ -n $l ]] && print -r -- "LOG ${f:t}: $l" | emit; done
  sleep 60
done
