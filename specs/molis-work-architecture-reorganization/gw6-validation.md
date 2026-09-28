# GW6：Goals 新建、升级与导入验收

2026-09-06。对应 accepted revision 1，范围以 `gw6-work-plan.md` 为准。完成等级：本迁移切片功能可用并有真实浏览器、持久化和故障恢复证据；不是全产品可发布。

## gw6-owner

- `modules/goals/src/schema.ts` 保留原 Goals 表、索引、CHECK/FK/default；原有 input/impact schema 继续复用。根 Store 只消费 `GOALS_SCHEMA_SQL`，不再定义这组表。
- `guidance-migrations.ts` 接管原 15/25/26 SQL 与 marker；`revision-migration.ts` 接管 migration 30 的 Goals 部分。Host 保留同连接顺序：Goals 列 → Execution 列 → Evidence 列 → Review 列 → Goals 回填 → marker 30，仍在一个原子事务内。
- V3 importer 的格式/ID/status 映射、Project 控制状态与导入审计保留；覆盖账写入改走 `commands.importLegacyCoverage`，Web 读取改走 `goalQueries.listLegacyCoverage`。SQL、空值、blocking 映射与排序仅由 Goals 维护。
- 导入公共端口验证 board 与 owner Goal 的项目一致性；失败回滚全部导入，不新增外部接口。Governance、Execution、Evidence、共享 events/idempotency 不吸收到 Goals。
- 新代码文件分别 220/99/124/36 行，根 Store 777 行。按内聚职责拆分，不一表一包；根 Store 尚未整体退出。
- `tests/goals-storage-boundaries.test.mjs` 在真实 Store/import/Web 来源上注入旧 DDL、索引和覆盖账 SQL，检查会拒绝；其他 owner 的 boards/events/schema_migrations 允许保留。连同 Query 边界测试 2/2 通过。全包边界 48 packages、517 sources、1598 imports、0 errors。
- Contracts build、Goals build、根 TypeScript noEmit 通过。开发说明已同步 Goals README、模块文档、SSOT Matrix、迁移/huge class 与总 spec。

## gw6-result

- `tests/fixtures/goals-storage-before-gw6.json` 是生产改动前从原初始化结果冻结的 SQLite DDL 基线；新的 schema 不参与生成 expected。新建数据库全部受影响表/索引定义与其逐条相等。
- 真实 V3 导入验证 covered/deferred/out/unresolved、owner Goal、理由、重访条件、blocking、排序、跨项目隔离与原 draft 状态；Web view 与公开 Query 对账。
- 实际 Host 重开独立历史文件后，Goal/criteria、关系、Policy、Risk、Guidance 保留。已接受 Goal 的作者/接受时间以及验收条件与升级前事实一致；旧草稿的 revision 1 继续使用原 migration/创建时间回退。
- `tests/goals-storage-migration.e2e.test.ts` 从真实 V3 导入并关闭数据库开始，再由 Host 打开：Chrome 查看覆盖记录和历史理由 → 刷新 → 编辑原目标 → 保存 → 刷新后再打开编辑 → 新数据库连接确认持久化。原 Goal 仍为 draft，关系和覆盖记录未变。
- 既有真实浏览器 Draft 错误/重试、项目规则及记录导航/分页，与 V1/Web 生命周期回归一并通过。不是仅测 HTML 字符串。

## gw6-recovery

- 15/25/26 在真实成功 marker 写入时注入 SQLite ABORT，验证 schema/数据/marker 一起回滚。解除故障后成功；26 原文、作者、时间和历史记录保留，重复调用不重复历史。
- 30 从冻结旧表结构去掉后加的 revision 列，实际 Host 子进程启动并触发 marker 故障；重新打开文件检查 Goals 与 Execution 列、revision 表及 marker 均未留下部分成功。解除故障、实际 Host 重试和再次重开成功，无重复 revision/覆盖记录。
- V3 的重复覆盖 ID 触发真实 UNIQUE 错误，整个新 Board、覆盖记录和审计事件回滚；跨项目 owner Goal 被拒绝，目标项目无残留写入。
- 原 migration 12/13 的历史 Run/澄清/Active Goal 恢复，以及完成/返工/规则检查的既有回归仍通过。

## 可复现验证与实际结果

```sh
node --import tsx --test --test-concurrency=1 tests/goals-storage-migration.test.ts tests/goals-command-module.test.ts tests/goals-query-module.test.ts tests/v1.test.ts tests/web.test.ts tests/goals-storage-migration.e2e.test.ts tests/goals-project-policy.e2e.test.ts tests/goals-records.e2e.test.ts tests/goals-draft.e2e.test.ts
node --import tsx --test tests/goals-storage-migration.test.ts
node --test tests/goals-storage-boundaries.test.mjs tests/goals-query-boundaries.test.mjs
node node_modules/typescript/bin/tsc -p packages/contracts/tsconfig.json
node node_modules/typescript/bin/tsc -p modules/goals/tsconfig.json
node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit
node scripts/check-package-boundaries.mjs
git diff --check
```

受影响串行回归 **193 passed / 0 failed / 0 skipped，35.76 秒**，日志 `/private/tmp/gw6-acceptance.log`。随后补强同一 Host 历史测试中的已接受目标/Policy/Risk/Guidance 对账，定向 **6/0/0**，日志 `/private/tmp/gw6-storage-final.log`；不把重复运行加成额外 case 数。

开发中修正了机械抽取残留和测试误用 Query 入口；首次新浏览器测试在刷新后未切回概览便点隐藏编辑按钮，修正操作顺序后通过，未放宽产品逻辑。失败日志 `/private/tmp/gw6-browser.log` 保留。

所有测试仅使用临时文件、随机端口与独立 Chrome profile；未操作现用 4173、用户 Home/Applications 或 Runtime/模型配置。未跑本轮全仓发布/E2E，未替代父项全部范围核对、最终 Cutover 和数据保证。DD 待决定与 DV4 GUI 权限保持独立。
