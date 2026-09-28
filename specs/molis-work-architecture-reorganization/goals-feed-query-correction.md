# Goals Query：Feed 关联目标校验补齐

2026-09-06。复用原查询 Goal `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` revision 1，不修改 Contract、不新增 Goal。

父项跨源审查发现 `src/feed/store.ts` 的 Attention `exists` callback 仍直接 `SELECT 1 FROM goals WHERE board_id = ? AND goal_id = ?`。生产 Web 的 `feed-native-plugin-http.ts` 实例化这个 facade，所以之前只扫描 root Web/Coordinator/MCP/CLI 的 caller 证据不能证明完整查询边界。原 Policy/Risk/Relation 修复与行为证据仍成立，但作为全部 caller 已迁移的结论需要补齐；保留历史，使用正式 Evidence correction 与同一 Goal 的 revalidation。

范围：该 Goal 存在性读取改用公开 `GoalsQueryApi.getGoal` 的项目隔离语义；复用公开 Goals Repository/Query 在旧 Host facade 装配。不搬 Feed/Attention 事实，不改变 archive/trash、跨项目、缺失目标或错误行为，不重做 GW6 schema/升级/导入。

调用链：Web Feed API → 兼容 FeedStore → Attention subject 校验 → Goals public Query。允许修改 `src/feed/store.ts`、实际 caller 边界检查及对应测试，沿用已有 Query 文档与本文件。

验收：存在的同项目 Goal 可关联，缺失/跨项目 Goal 被拒绝且无残留 Inbox/事件；archived/trashed Goal 保持原存在性含义；真实 Web Feed/原 Feed 集成与 Query 回归通过；边界反例拒绝重新插入这条 SQL。无 UI/schema/授权行为变更。测试只用隔离临时数据，不操作现用4173。

## 验证结果

生产 callback 已改用 `GoalsQueryService(new GoalsRepository(db)).getGoal` 的返回结果，装配发生在原 Host facade，不给 Feed/Attention 包新增跨模块实现依赖。原缺失/跨项目错误仍为 `feed_invalid_transition`，并检查 Inbox、Attention 事件和兼容审计事件均无写入。真实归档 CORE、回收站 AUTO-CONNECT 仍可关联，相同关联不重复创建；Goal 状态没有被读取改写。

`tests/feed-goal-query.test.ts` 对应上述行为；`tests/goals-query-boundaries.test.mjs` 与生产检查器增加真实 FeedStore caller，故意恢复原 SELECT 会失败。没有把 Feed 当成 CLI/MCP 传输端，仍走其原 Host 装配。

```sh
node --import tsx --test --test-concurrency=1 tests/feed-goal-query.test.ts tests/feed-contract.test.ts tests/feed.test.ts tests/feed-native-plugin.test.ts tests/goals-query-module.test.ts tests/goals-query-facts.test.ts tests/goals-query-boundaries.test.mjs tests/web.test.ts
node scripts/check-package-boundaries.mjs
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
git diff --check
```

最终 **78 passed / 0 failed / 0 skipped，19.34 秒**，`/private/tmp/query-feed-acceptance.log`。包含生产 Feed/Web HTTP 与 Query 读取，不宣称新增浏览器页面测试；原 GW6 193/0/0 中的真实浏览器结果保留。包边界、根类型检查、diff check 通过。首次新增测试误用了不存在的 `feed_events` 表，改为实际 Attention 与兼容事件表后通过；失败日志保留，未改生产错误语义。

原 Policy/Risk/Relation Query 的实现及兼容证明仍见 `goals-query-correction-validation.md`，其较窄事实继续成立；该 Evidence 作为完整 caller 结论已用 `evidence-correction-6645c811-397b-44d7-8c73-35ad1b8ce159` 撤回。本文件与原记录共同作为当前完整 Query 的新证据，不重做或改写历史测试。父项另补 Planning/跨入口 17/0/0，日志 `/private/tmp/gw-parent-contract-acceptance.log`。
