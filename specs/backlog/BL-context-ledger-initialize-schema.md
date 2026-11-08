# BL-context-ledger-initialize-schema

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-context-ledger-initialize-schema | `modules/context-ledger/src/repository.ts` 的 `initializeSchema` 默认建表：新建 Home 目录时 `context_edges` 只由它建（`apps/local-host/src/project-catalog.ts:285-286`），`catalog-schema.ts:69` 传 true 拼期望结构，`artifact-actions.ts:39`、`demo-feed-library.ts:91` 走默认，`plugin-attention-service.ts:172` 传 false。做法：两条生产路径显式调 `createContextLedgerSchema(db)`，再删选项。顺手改正 `project-database-schema.ts:23`「owner 打开时仍会建表」的注释 | 第 02 批复查（2026-11-07） | 明确后续做 | 约 32 个测试要改成显式建表，`apps/sync-worker` 的 `feed.test.mjs` 本机跑不了，适合单开 PR | 无 | 中 | 存储维护人（执行会话待分配） |
