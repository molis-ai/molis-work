#!/bin/bash
# 甲: 8 rounds; in round r each version runs S1–S4 once, the three versions taking turns at the front. One run at a time.
# Usage: MINIMAX_API_KEY=… drive-a.sh <out.jsonl> [first-round] [last-round]
E=$(cd "$(dirname "$0")" && pwd); OUT=$1; FIRST=${2:-1}; LAST=${3:-8}
BEFORE=$E/../wt-bl163-before; AFTER=/Users/yijunwang/code/goalboard/.claude/worktrees/ai-handbook-a82ae7
VERSIONS=("A0 before $BEFORE" "A0 after $AFTER" "A1 after $AFTER")
for r in $(seq "$FIRST" "$LAST"); do
  for k in 0 1 2; do
    read -r ARM SIDE WT <<< "${VERSIONS[$(( (k + r - 1) % 3 ))]}"
    for s in S1 S2 S3 S4; do
      before=$(wc -l < "$OUT" 2>/dev/null || echo 0)
      (cd "$E" && WT=$WT SIDE=$SIDE ARM=$ARM OUT=$OUT timeout 480 node run-a.mjs "$s" "$r" 2>&1 | grep -v -i warning)
      after=$(wc -l < "$OUT" 2>/dev/null || echo 0)
      [ "$after" -gt "$before" ] || echo "{\"part\":\"甲\",\"arm\":\"$ARM\",\"side\":\"$SIDE\",\"supplement\":\"$s\",\"run\":$r,\"valid\":null,\"error\":\"harness wrote no row (killed or crashed)\"}" >> "$OUT"
    done
  done
done
echo "drive-a done"
