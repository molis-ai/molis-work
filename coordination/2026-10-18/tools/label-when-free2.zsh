#!/bin/zsh
# usage: label-when-free.zsh <pr> — adds the full-suite label once fewer than two full-suite runs are in progress or queued,
# and only after GitHub's merge commit for the PR contains the current origin/main (a stale merge ref tests an old main).
[ -n "${ZSH_VERSION:-}" ] || { echo "run with zsh"; exit 2; }
pr=$1
while true; do
  n=$(gh run list --workflow full-suite.yml --limit 20 --json status -q '[.[] | select(.status=="in_progress" or .status=="queued")] | length' 2>/dev/null)
  [[ -n $n && $n -lt 2 ]] && break
  sleep 120
done
cd "${MOLIS_REPO:-$HOME/code/goalboard}"
for i in {1..20}; do
  st=$(gh pr view $pr --json mergeable -q .mergeable 2>/dev/null)
  [[ $st == CONFLICTING ]] && { echo "CONFLICTING $pr with main; not labeling"; exit 4; }
  git fetch -q origin main 2>/dev/null
  gh pr view $pr --json mergeable,mergeStateStatus >/dev/null 2>&1  # asking for mergeability makes GitHub rebuild the merge ref on the current base
  m=$(gh api repos/molis-ai/molis-work/pulls/$pr --jq '.merge_commit_sha // empty' 2>/dev/null)
  if [[ -n $m ]] && git fetch -q origin "+refs/pull/$pr/merge:refs/remotes/prmerge/$pr" 2>/dev/null && [[ $(git rev-parse refs/remotes/prmerge/$pr) == $m ]] && git merge-base --is-ancestor origin/main $m; then
    echo "MERGE REF FRESH $pr ${m:0:9}"; break
  fi
  if [[ $i == 20 ]]; then
    # GitHub did not rebuild the merge ref. Label anyway only when nothing main gained since the ref's base touches the PR's files.
    base=$(git rev-parse --verify -q "refs/remotes/prmerge/$pr^1" 2>/dev/null)
    files=$(gh pr view $pr --json files --jq '.files[].path' 2>/dev/null)
    [[ -z $base || -z $files ]] && { echo "MERGE REF STALE $pr after 10 min; cannot check overlap; not labeling"; exit 4; }
    changed=$(git diff --name-only $base origin/main) || { echo "MERGE REF STALE $pr; cannot diff ${base:0:9}..origin/main; not labeling"; exit 4; }
    overlap=$(comm -12 <(print -r -- "$files" | sort -u) <(print -r -- "$changed" | sort -u))
    [[ -n $overlap ]] && { echo "MERGE REF STALE $pr after 10 min; main since ${base:0:9} touches: ${overlap//$'\n'/ }; not labeling"; exit 4; }
    echo "MERGE REF STALE $pr (base ${base:0:9}); main since then touches none of its files: labeling"
    gh pr comment $pr --body "统筹：GitHub 的合并预览停在 ${base:0:9}，没有按 main $(git rev-parse --short=9 origin/main) 重算。之后 main 改到的文件和本 PR 不重叠，所以照常加 full-suite；合并队列会在真正的合并结果上再测一次。" >/dev/null 2>&1
    break
  fi
  sleep 30
done
# Remove a stale label only now, when the slot is ours: removing it earlier would strip a label whose run is still going.
gh pr edit $pr --remove-label full-suite >/dev/null 2>&1
gh pr edit $pr --add-label full-suite >/dev/null && echo "LABELED $pr"
