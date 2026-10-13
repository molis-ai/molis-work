#!/bin/sh
# Rewrite only the author/committer identity of commits made as "Creamie X <creamiex@CreamiedeMacBook-Pro.local>"
# on ONE unmerged branch, to "jing xu <jing.xu.sandra@gmail.com>" (GitHub account jingxusandra-gif).
# Trees, parents structure, messages and dates are kept; nothing is re-merged. User approved 2026-10-12.
#
#   rewrite-authors.sh <repo-or-worktree-dir> <branch> <base-ref> <push-url>
#     base-ref: origin/main (Molis: refresh it first via SSH fetch; Prologue: git fetch origin)
#     push-url: git@github.com:molis-ai/molis-work.git | git@github.com:molis-ai/prologue.git
#
# Run only when the worktree is clean and nothing (build/test) is running in it.
# Stops without pushing if anything looks off. Leaves refs/original/* as a local backup.
set -eu
dir=$1; branch=$2; base=$3; url=$4
OLD=creamiex@CreamiedeMacBook-Pro.local
g() { git -C "$dir" "$@"; }

holder=$(g worktree list --porcelain | awk -v b="refs/heads/$branch" '/^worktree /{w=substr($0,10)} $0=="branch "b{print w}')
if [ -n "$holder" ]; then
  [ "$(cd "$holder" && pwd -P)" = "$(cd "$dir" && pwd -P)" ] || { echo "ABORT: $branch is checked out in $holder; run it there"; exit 1; }
  [ -z "$(g status --porcelain)" ] || { echo "ABORT: worktree not clean"; exit 1; }
fi
before=$(g rev-parse "$branch"); tree_before=$(g rev-parse "$branch^{tree}")
n=$(g log --format='%ae%n%ce' "$base..$branch" | grep -c "^$OLD$" || true)
[ "$n" -gt 0 ] || { echo "nothing to rewrite on $branch"; exit 0; }
remote_sha=$(git -C "$dir" ls-remote "$url" "refs/heads/$branch" | cut -f1)
[ -n "$remote_sha" ] || { echo "ABORT: $branch not on remote"; exit 1; }
[ "$remote_sha" = "$before" ] || { echo "ABORT: local $branch ($before) != remote ($remote_sha); sync first"; exit 1; }

FILTER_BRANCH_SQUELCH_WARNING=1 g filter-branch -f --env-filter "
if [ \"\$GIT_AUTHOR_EMAIL\" = \"$OLD\" ]; then GIT_AUTHOR_NAME='jing xu'; GIT_AUTHOR_EMAIL='jing.xu.sandra@gmail.com'; fi
if [ \"\$GIT_COMMITTER_EMAIL\" = \"$OLD\" ]; then GIT_COMMITTER_NAME='jing xu'; GIT_COMMITTER_EMAIL='jing.xu.sandra@gmail.com'; fi
" -- "$base..$branch" >/dev/null

after=$(g rev-parse "$branch"); tree_after=$(g rev-parse "$branch^{tree}")
[ "$tree_before" = "$tree_after" ] || { echo "ABORT: tree changed! restore: git -C $dir reset --hard $before"; exit 1; }
left=$(g log --format='%ae%n%ce' "$base..$branch" | grep -c "^$OLD$" || true)
[ "$left" = 0 ] || { echo "ABORT: $left old identities left; restore: git -C $dir reset --hard $before"; exit 1; }
echo "rewrote $branch: $before -> $after (tree identical $tree_after)"
g log --format='%h %an <%ae> | %cn | %s' "$base..$branch" | head -20
echo "next (after secrets check): git -C $dir push --force-with-lease=$branch:$before $url $branch:$branch"
