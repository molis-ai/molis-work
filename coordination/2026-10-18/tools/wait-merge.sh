#!/bin/zsh
[ -n "${ZSH_VERSION:-}" ] || { echo "run this script with zsh, not bash"; exit 2; }
# usage: wait-merge.sh <pr>  — exits 0 when merged, 1 when it leaves the queue unmerged (prints the reason)
cd "${MOLIS_REPO:-$HOME/code/goalboard}"
pr=$1
for i in $(seq 1 180); do
  r=$(gh api graphql -f query="{repository(owner:\"molis-ai\",name:\"molis-work\"){pullRequest(number:$pr){state mergeCommit{oid} inQueue:mergeQueueEntry{state} autoMergeRequest{enabledAt}}}}" --jq '.data.repository.pullRequest|"\(.state) \(.mergeCommit.oid // "-") \(.inQueue != null) \(.autoMergeRequest != null)"' 2>/dev/null)
  [[ -z $r ]] && { sleep 60; continue; }
  set -- ${=r}
  [[ $1 == MERGED ]] && { echo "MERGED $pr ${2:0:9}"; exit 0; }
  if [[ $1 == OPEN && $3 == false && $4 == false ]]; then
    echo "LEFT QUEUE $pr"; gh api graphql -f query="{repository(owner:\"molis-ai\",name:\"molis-work\"){pullRequest(number:$pr){mergeStateStatus timelineItems(last:1,itemTypes:[REMOVED_FROM_MERGE_QUEUE_EVENT]){nodes{... on RemovedFromMergeQueueEvent{createdAt reason}}}}}}" --jq '.data.repository.pullRequest'; exit 1
  fi
  sleep 60
done
echo "still waiting $pr"
