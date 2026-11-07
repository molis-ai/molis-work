# BL-structure-mismatch-path

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-structure-mismatch-path | `storage.schema_structure_mismatch` 的消息带库的绝对路径（`packages/storage/src/sqlite-baseline.ts` 的 `structureMismatch`），它是 `ActionError`，消息原样给调用方。U1-a（#1908）的版本拒绝只写 Home 相对路径，理由对这个码同样成立。改法：给这几处 `structureMismatch` 传 Home，并改 `characters-schema` 的断言。`LocalProjectDatabase` 没有 Home，项目库要等 U1-d | [#1908](https://github.com/molis-ai/molis-work/pull/1908) 评审台 | 已知缺口 | U1 设计 §2.1、§9.1 写的是这个码不变，U1-a 没动它是对的，所以单独记 | #1908（`sqliteStoreLabel`）；项目库等 U1-d | 低 | 平台包维护（执行会话待分配） |
