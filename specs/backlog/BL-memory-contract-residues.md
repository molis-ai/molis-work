# BL-memory-contract-residues

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-contract-residues | Memory 的旧字段残留：`packages/contracts/src/services/agent-host-memory.ts:24`、`:93`，`packages/contracts/src/services/memory.ts:119`、`:663`，`assistant-memory-bridge.ts:130`，以及 `state:"used"`；另第 02 批审计复核（2026-11-08）补：`horizontal/memory/src/facts.ts:82`（`null for older entries`）、`prefs.ts:25`（`possibly partial or older`）、`formation.ts:39`（`Unclassified memories remain readable`）——旧记录口径，未修，也未随 N39 台账删行算完成 | 第 02 批复查（2026-11-07）＋第 02 批审计复核（2026-11-08） | 明确后续做 | Memory 暂停的决定还没解除，解除时一起清 | Memory 解除暂停 | 低 | Memory 维护人（执行会话待分配） |
