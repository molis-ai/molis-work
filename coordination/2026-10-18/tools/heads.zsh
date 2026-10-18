#!/bin/zsh
# Prints a line whenever an open PR's head, draft state or mergeability changes, or a PR opens.
cd "${MOLIS_REPO:-$HOME/code/goalboard}"
S=${0:A:h}
seen=$S/heads-seen.txt; touch $seen
first=1; [[ -s $seen ]] && first=0
while true; do
  out=$(gh pr list --state open --limit 40 --json number,headRefOid,isDraft,title --jq '.[]|"PR \(.number) \(.headRefOid[0:9]) draft=\(.isDraft) \(.title[0:60])"' 2>/dev/null) || { sleep 60; continue; }
  while IFS= read -r l; do [[ -z $l ]] && continue; grep -qxF -- "$l" $seen && continue; echo "$l" >> $seen; (( first )) || echo "$l"; done <<< "$out"
  first=0
  sleep 90
done
