# BL-memory-p2-decay

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-p2-decay | 衰减与容量维护：长期不用的自动条目逐步退出召回。**触发条件**：旧条目反复被注入却没被用上，或注入预算经常被旧条目占满。**算数**：无效注入下降；只动已授权策略下的自动条目 | [prologue-memory-strategy §9.1、§3.2](../prologue-memory-strategy/spec.md)；[决定 36](../post-anticorruption-roadmap/reference/decisions.md#decision-36) | 明确后续做 | 2026-11-14 由 [63A-2](../post-anticorruption-roadmap/reference/batches/63a.md#batch-63a-item-2) 的整理承接（[决定 46](../post-anticorruption-roadmap/reference/decisions.md#decision-46)，2026-11-18 确认）：现行 90 天没「使用」就停用，「使用」只是请求收到响应；推荐改为退出自动召回、仍可显式查（[prologue-memory-strategy §15](../prologue-memory-strategy/spec.md) §15.9 ①，要用户定），用户反馈与任务结果只影响整理先后（MEM-70） | [P0 收尾](../prologue-memory-strategy/spec.md#p0-收尾与验收边界2026-11-13)（#2020 分支的 BL-1073） | 低 | C2／Memory |
