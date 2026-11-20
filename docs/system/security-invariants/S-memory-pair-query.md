# S-memory-pair-query

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-memory-pair-query | 只读配对查询不得把暂时停用、到期或读不到的正式记忆视为本人已处理配对；故障与取消不写决定。明确resolvePair和已接受遗忘后的原清理才改变决定或清掉配对。 | `horizontal/memory/src/service.ts`（`pairs`、`resolvePair`）、`packages/storage/src/adapters/memory-ledger-retention.ts` | `tests/security-invariants-memory-pair-queries.test.ts`「QEA-58 · read-only pair queries」「QEA-59 · failed and cancelled」：实际HTTP写入与后台形成、只读授权、SDK/ledger、重新启用与召回、故障取消和删除清理 | |
