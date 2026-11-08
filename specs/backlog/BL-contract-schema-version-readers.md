# BL-contract-schema-version-readers

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-contract-schema-version-readers | `contract.*` 38 个描述符的 `schemaVersion` 没有读者，表里 38 个条目也跟着没有含义 | 第 02 批复查（2026-11-07） | 明确后续做 | 删它要动全部 `tooling/gates/api/contracts/modules/*`，要等合同队列空的时候做 | 合同队列空闲 | 低 | 合同维护人（执行会话待分配） |
