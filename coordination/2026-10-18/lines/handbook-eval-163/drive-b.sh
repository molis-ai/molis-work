#!/bin/bash
# 乙: B0 and B1 take turns, 8 counted runs each; a voided run (no question in the first 3 model calls) is listed and redone, at most 3 extra per version.
# Usage: MINIMAX_API_KEY=… drive-b.sh <out.jsonl>
E=$(cd "$(dirname "$0")" && pwd); OUT=$1; WT=/Users/yijunwang/code/goalboard/.claude/worktrees/ai-handbook-a82ae7
C_B0=0; C_B1=0; X_B0=0; X_B1=0; n=0
while [ $C_B0 -lt 8 ] || [ $C_B1 -lt 8 ]; do
  for ARM in B0 B1; do
    eval "c=\$C_$ARM; x=\$X_$ARM"
    [ "$c" -lt 8 ] || continue
    if [ "$x" -gt 3 ]; then eval "C_$ARM=8"; continue; fi
    n=$((n + 1))
    before=$(wc -l < "$OUT" 2>/dev/null || echo 0)
    (cd "$E" && WT=$WT ARM=$ARM OUT=$OUT timeout 420 node "${RUNNER:-run-b.mjs}" "$n" 2>&1 | grep -v -i warning)
    after=$(wc -l < "$OUT" 2>/dev/null || echo 0)
    if [ "$after" -gt "$before" ]; then
      if tail -1 "$OUT" | grep -q '"voided":"'; then eval "X_$ARM=$((x + 1))"; else eval "C_$ARM=$((c + 1))"; fi
    else
      echo "{\"part\":\"乙\",\"arm\":\"$ARM\",\"run\":$n,\"error\":\"harness wrote no row (killed or crashed)\"}" >> "$OUT"; eval "C_$ARM=$((c + 1))"
    fi
  done
done
echo "drive-b done"
