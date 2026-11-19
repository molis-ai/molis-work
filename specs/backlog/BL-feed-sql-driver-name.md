# BL-feed-sql-driver-name

分组：9. 平台小项与工程流程 / 工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-feed-sql-driver-name | Feed 的 `fromBetterSqlite`（`plugins/native/feed/src/store/sql.ts`，从项目连接造 `FeedSql`）还用着旧驱动的名字，项目库已经不在 `better-sqlite3` 上了。改成说它做什么的名字（比如 `fromProjectConnection`），连同调用处一起改：20 个文件、约 76 行（`apps/local-host/src/demo-feed-library.ts`、`plugins/native/feed`、`apps/sync-worker` 两个测试和 `tests/` 下的几份），只改名，不改行为 | [SQLite 第二步](../sqlite-driver-switch/spec.md)；#1959 评审 | 明确后续做 | 纯机械改名，放进切换驱动的 PR 只会把评审面拉大；Feed 归别的线，单独一个小 PR 更好对 | 无。执行批次 [95-1](../post-anticorruption-roadmap/reference/batches/95.md#batch-95-item-1)。 | 低 | Feed（`plugins/native/feed`），执行会话待分配 |

本项验收（2026-11-18）：把 Feed 的旧 SQLite 驱动函数名换成描述项目连接作用的名字，同步所有调用方。
