# BL-project-sqlite-opens-and-ro-pool

分组：7. 平台与架构

| 编号 | 事项 | 来源 | 类型 | 为什么还没做 | 依赖 | 优先级 | 负责人 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BL-project-sqlite-opens-and-ro-pool | 消除单次请求剩余的项目库高频开关与 Home 长连接架构债：① 降低 `call-budget` 实测暴露的单次请求 16～35 次项目 SQLite 打开与 `projectPluginReads`（`projectHome` 16、`rightSide` 35、`goalPanes` 22），按目录/插件成员 revision 复用只读快照同时守住每次写入与授权复核；② 将 `packages/storage/src/sqlite-baseline.ts` 的 `heldHomeSqlite` 从进程全局 `Map` 演进为按 Home／账号空间归属的只读（RO）与可写（RW）分槽连接池，避免 `existingOnly: true` 升级为可写长连接，使 `always-on-plugins.ts` 与 `home-plugin-store.ts`（`observedPublishers`）真正复用只读连接并覆盖离线恢复／回滚释放；③ 评估并将 `HomeLine`（`apps/local-host/src/local-host.ts`）的纯只读查询与 `ProjectLine` 的 `runsBesideLine` 并发口径对齐 | [第 103 批](../post-anticorruption-roadmap/reference/batches/103.md)合后独立复核、[对抗审查 N44](../../docs/reviews/adversarial-review-2026-11-01.md)（用户 2026-11-22 拍板要做） | 明确后续做 | 涉及共享核心 `packages/storage` 生命周期重构、项目插件成员缓存一致性及 Home 队列并发语义，需按独立存储与宿主批推进并过全量安全回归 | 无 | 中 | C1／存储、平台（Host） |
