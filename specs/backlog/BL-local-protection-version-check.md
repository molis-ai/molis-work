# BL-local-protection-version-check

分组：9. 平台小项与工程流程

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-local-protection-version-check | `modules/sync-replication/src/local-protection.ts:24-28` 的 `hasProtectedSyncPayloads` 直接读 `PRAGMA user_version` 与 `SYNC_STORE_BASELINE.version` 比，不符就抛自己的 `sync.invalid`「同步库版本不符，原数据已保留」：不经 U1 的统一分类（`checkSqliteBaselineVersion`/`sqliteVersionRefusal`），不区分低版本与高版本、也不发 `upgrade_pending` 信号；打开用的是普通只读连接 `openReadOnlyHomeSqlite`，可能给同步库留下 `-wal/-shm`。它有真实调用方（`apps/local-host/src/personal-catalog-sync.ts:18`），不能删，应改走统一接口与升级存储的只读打开 | [#1979](https://github.com/molis-ai/molis-work/pull/1979) 第 05 批独立审计（U1 分册 B1）；代码来源 `35f808286`（Personal #1877） | 已知缺口 | U1 设计 §2.5 的 10 处清单没收这一处；只有降级或文件坏了才走到，不挡 U1 | U1 统一版本检查（#1908/#1958 已合入）；同步片/U4 开工 | 中 | modules/sync-replication（执行会话待分配） |
