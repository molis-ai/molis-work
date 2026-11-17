# S-github-agent-approval

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-github-agent-approval | 只以目标分支当前提交的政策判定，拒绝以 PR 内容、缺失政策、非当前版本或缺权限的账号发出通过结果。发布须逐项核对原 PR 的精确头和父提交链；squash 合并组须在隔离裸仓库核对各成员无自定义合并驱动的三路合并树、入队时间与强推历史，未能证明原头的 squash 保持待核对。组或投票变化、成员不全、原头不符时拒绝写入通过。重算先使本 App 的原通过待核对，发布后观察到变化同样撤回。正式 GitHub App 和分支保护尚待验收。 | `scripts/agent-approval-diagnostic.mjs`、`scripts/agent-approval-publisher.mjs`、`scripts/agent-approval-squash-proof.mjs` | — | `tests/agent-approval-diagnostic.test.ts`「the independent publisher reuses only its own sticky comment」「withdrawn vote cannot publish a stale result」「an active required publisher leaves an unconfigured target without a status」「live PR heads alone cannot prove which version made a squash group」「squash proof refuses swapped PR heads, post-enqueue force-pushes and post-queue commits」「a failed refresh invalidates an existing pass」「withdrawal observed just after publishing clears the queued pass」 |
