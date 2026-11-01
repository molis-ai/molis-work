# T384 Queue 原件核验｜验证线5

**队列CI与Verify成功，PR已merged；采用SHA及主线回读见下。**

本轮15个jobs：10个实际执行success、5个条件skipped，无失败或取消。终态[原始快照](/private/tmp/t384-verify/ci/queue-terminal.json)包含run、全部jobs、PR合入状态、采用后main ref及所读日志索引。

- 实际[队列CI 41275704618](https://github.com/molis-ai/molis-work/actions/runs/41275704618)：event merge_group、attempt1、head `15ad4f397018241c8b31625aff8014b89259f239`，状态completed/success。预期queue SHA `15ad4f397018241c8b31625aff8014b89259f239`。
- 原候选H `4404e142662cbd7895f46c1c6df6e5efe5e6e135`；根提供前序base `820d9a0f59a2f61fde908eae2558c599e26a3a5c`（T388）。根独立核Git对象及与H差集；本线不代签其结果。
- [PR #1712](https://github.com/molis-ai/molis-work/pull/1712)：state=closed、merged=true、merged_at=2026-11-01T05:13:51Z、head `4404e142662cbd7895f46c1c6df6e5efe5e6e135`、merge_commit_sha `15ad4f397018241c8b31625aff8014b89259f239`。未merged时该字段不是采用证明。
- 采用后main ref回读：`15ad4f397018241c8b31625aff8014b89259f239`；只报告实际ref，不把更晚main强行改署为queue SHA。

| job | 终态/现态 | 实际运行步骤 |
| --- | --- | --- |
| [Package boundaries](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335526) | completed/success | — |
| [Health gate rules (1/2)](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335681) | completed/success | — |
| [Shell and Python checks](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335687) | completed/success | — |
| [Gates](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335722) | completed/success | — |
| [Action and plugin contracts (2/2)](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335724) | completed/success | — |
| [Health gate rules (2/2)](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335736) | completed/success | — |
| [Action and plugin contracts (1/2)](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335752) | completed/success | — |
| [Secret scan](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335756) | completed/success | — |
| [Rust and Swift checks](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757335771) | completed/success | — |
| [Verified in the merge queue](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757336176) | completed/skipped | — |
| [Linux probe ${{ matrix.shard }}/6 (not required)](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757336494) | completed/skipped | — |
| [Product subset (not required yet, ${{ matrix.shard }}/${{ strategy.job-total }})](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757336652) | completed/skipped | — |
| [Security invariants (not required yet) (${{ matrix.shard }}/${{ strategy.job-total }})](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757356485) | completed/skipped | — |
| [PR test selection](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124757366883) | completed/skipped | — |
| [Verify](https://github.com/molis-ai/molis-work/actions/runs/41275704618/job/124758429598) | completed/success | — |

## 已读原件

- Package boundaries：checkout原文SHA `15ad4f397018241c8b31625aff8014b89259f239`；[完整job日志](/private/tmp/t384-verify/ci/queue-124757335526.log)。
- Gates：checkout原文SHA `15ad4f397018241c8b31625aff8014b89259f239`；[完整job日志](/private/tmp/t384-verify/ci/queue-124757335722.log)。
- Verify：checkout原文SHA 无checkout（按原件）；[完整job日志](/private/tmp/t384-verify/ci/queue-124758429598.log)。

Verify原文实际输出`Compared with 820d9a0f59a2f61fde908eae2558c599e26a3a5c.`；Gates、health gate rules、package boundaries、action contracts、secret scan、native checks、shell checks的结果环境值均为success，随后逐项断言并输出验证通过。它未走push事件的队列复用分支（QUEUE_CHECK_RESULT=skipped），此轮必要门禁确实执行。

Verify 124758429598 completed/success。本轮Product、SI、PR选择、定时Linux probe及merge-queue复用共5个job实际skipped，明确未执行；队列不构成新增Full或Mac覆盖。普通CI及Full原计数、首败/retry-only和UNKNOWN均沿原报告，不因队列绿改写。

快照及原件在ci/queue-*；第4次观察。本线仅GitHub GET及证据目录写入，无GH/源/清树、本机执行、新增Full、触发/重跑/取消。初次展示jobs时因skipped job的steps为null出现读取TypeError，随后按可空值读取恢复；这是观察器控制错误，不是CI首败。

