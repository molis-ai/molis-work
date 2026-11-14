# S-github-agent-approval

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-github-agent-approval | 只以目标分支当前提交的政策判定，拒绝以 PR 内容、缺失政策、非当前版本、来源不符的凭据或缺权限的账号发出通过结果。对当前 squash 合并组按 GitHub 原条目和真实父提交链核对组内全部原 PR，队列或投票变化、成员不全、原头不符时拒绝写入通过。范围为本地发布器，正式 GitHub App 和分支保护接入见审批需求的验收记录。 | `scripts/agent-approval-diagnostic.mjs`、`scripts/agent-approval-publisher.mjs` | — | `tests/agent-approval-diagnostic.test.ts`「the independent publisher reuses only its own sticky comment」「withdrawn vote cannot publish a stale result」「an active required publisher leaves an unconfigured target without a status」「disappeared or incomplete groups and changed votes or members never publish a group pass」 |
