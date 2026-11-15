# BL-memory-p2-scale

分组：3. 助理、记忆与动态交互

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-memory-p2-scale | 规模与查询下推（V0 已采用的索引之外的部分）。**触发条件**：P0 的性能门在真实数据量上仍不过，或记忆条数超过已验证的 1000 条。**算数**：同机同日配对测量达到冻结的阈值，授权、字节校验、遗忘检查一项不减 | [prologue-memory-strategy §9.1、§3.2](../prologue-memory-strategy/spec.md)；[决定 36](../post-anticorruption-roadmap/reference/decisions.md#decision-36) | 明确后续做 | 没触发；性能门见 BL-1072。2026-11-14 补（[prologue-memory-strategy §15](../prologue-memory-strategy/spec.md)）：SDK 候选按 scope 顺序收，大个人库可能挤掉小项目库，公平收进 62 的上游清单；另据用户材料，2,000 条规模下显式召回每次仍列约 1,500 条可见记录，下推与索引按测到的瓶颈选 | [P0 收尾](../prologue-memory-strategy/spec.md#p0-收尾与验收边界2026-11-13)（#2020 分支的 BL-1072） | 低 | C2／Memory |
