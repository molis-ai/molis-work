#!/bin/zsh
[ -n "${ZSH_VERSION:-}" ] || { echo "run with zsh"; exit 2; }
S=${0:A:h}
# args: pr:head pr:head ...  label each when a slot frees (one at a time), then gate it in the background into gate-<pr>.log
for pair in "$@"; do
  pr=${pair%%:*}; head=${pair##*:}
  zsh $S/label-when-free2.zsh $pr || { echo "SKIPPED $pr (not labeled)"; continue; }
  ( sleep 120; zsh $S/gate-and-queue.sh $pr $head && zsh $S/wait-merge.sh $pr ) > $S/gate-$pr.log 2>&1 &
  sleep 90
done
wait
for pair in "$@"; do pr=${pair%%:*}; echo "== $pr"; tail -3 $S/gate-$pr.log; done
