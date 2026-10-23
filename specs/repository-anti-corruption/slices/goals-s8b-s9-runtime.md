# Goals S8 另一半与 S9：项目库身份归项目，Goals 上 Plugin Runtime（PG094-10 余项、PG094-11）

状态：草稿（2026-10-24，迁移线 ac-sc3；只读 main `27bb3c212` 和在途 PR 写成，没有改代码、没有跑构建或测试）。第 6 节的问题等统筹裁定后才能开工；标「推断」的地方是读代码得出、没有运行验证的。

## 1. 目标

PG-094 的最后两步：

- **S8 另一半（PG094-10 余项，PG-021）**：项目库的身份是 `project_root`，不再是 Goals 的看板。宿主建库、验库、开发门不再因为 Goals 才能做。
- **S9（PG094-11，含 BL-386）**：Goals 以 `createGoalsPlugin`、`kind:"app"` 由 Plugin Runtime 监督器启动；宿主不再替它装配；页面操作经 Runtime 分发。之后 Goals 和别的插件待遇一样（用户 2026-10-18 定）。

## 2. 现状（main 对账）

| 片 | 状态 | 证据 |
| --- | --- | --- |
| S1 内置调用者名单 | 已做 | #812 |
| S4 宿主不碰协调器 | #1146 待合 | 余下持有者冻结在 `tests/goals-host-no-direct-reads.test.ts`，每条写了由哪一片删 |
| S5 内部类收进包内工厂 | 已做（10-22） | `createGoalsApplication` |
| S6 决定提醒对账 | 已做（10-23） | PG-033 第一步 |
| S7 请求助手、31 条路由进 Manifest | 已做（10-23） | `goalsRoutes`；宿主 `web-request.ts` 的 `goals` 条目按旧地址改写分发（BL-386） |
| S8 表那一半 | 已做 | #881：31 张表由 Goals 的 Manifest 声明，基线 v8 不再带；`boards` 没有 `title`、外键指 `project_root` |
| 平台 X-5 L1/L2/L3 | 已做 | #867、#881、#903（`services.project_database`） |
| 先例 | Coding C1、C2 已做 | #932、`5d8e4f643`：会话库走 `services.project_database`，宿主不再递原始库句柄 |
| PG-029 可信 `user_action` | 平台一半在途 | #1117；Goals 转接里手写的 web 与管理出处随 S9 删，受保护入口的幂等消息身份和整份确认依据仍归 S9 |
| PG-087 attention、context-ledger 服务 | 未做 | `PluginHostServices` 没有这两项 |
| PG-012 双实例 | 平台一半已做（#891、#893、#1050） | Goals 一半未做：`registration.ts` 没有 `runtime`，个人规划两个 home 动作在 Manifest 已声明、实现仍走 `personal-planning-actions.ts` 的私路 |
| W5-06 / PG-060 | 在途 | #1098、#1107、#1112；PG-094 一行把它列为迁 Goals 的前提，原计划却把「删手写舞台」放在 S11 |
| T1（动 `project-plugins.ts` 与装配门禁的冻结） | 无书面解冻记录 | #840 之后两处又被改过多次，事实上能改（推断） |

## 3. S8 另一半

**要改什么**（四个文件，加一个测试清单项）：

| 位置 | 现在 | 改成 |
| --- | --- | --- |
| `managed-project-database.ts` `initializeProjectDatabase` | 建库时调 `GoalProjectApplication.initializeBoard`：同一事务里写根行和看板 | 只写根行（`modules/projects` 的 `writeProjectRoot`），不建看板 |
| 同文件 `validateManagedBoard` / `readManagedBoard` | 要求恰好一个看板、根行与它同 id、再读 Goals 的快照 | 只认根行：恰好一行、与记录的 `project_id` 相同、完整性检查通过；不读 Goals 的表（名字随 GLOSSARY R-A1 的 Board 改名一起定） |
| `local-plugin-development.ts` | 开发门起库先 `initializeBoard` | 不建看板；开发插件需要 Goals 的事实时经动作 |
| `demo-plugin-seed.ts` | 先问「演示项目的看板在不在」 | 问根行在不在 |
| `project-database.ts` | `LocalProjectDatabase` 带 `goalsQuery` 和 `snapshot()` | 留到 S9（第 4 节），本片不动 |

**看板由谁建**：Goals 打开项目时自己建（幂等，键固定）。S9 之前是宿主的 Goals 装配（`goalsActionProvider`，已经在这里调 `projectOpened`），之后是 Goals 的 `start()`。**依据**：`goals.board.initialize` 已是 v2，输入只有 `idempotency_key`；建库发生在项目登记之前的暂存目录里，那时没有项目运行时，调不了动作，所以不能让宿主改调动作，只能把「建看板」从建库挪到打开。

**为什么先于 S9 单做**：S9 要把看板的创建、读取全部交给 Goals，库的身份先不依赖它，两步才不互相卡住。另一个理由（推断）：`managed-project-files.ts` 在建项目重试、领养已有的稳定 id 库时，和样例项目的生命周期（`demo-project-lifecycle.ts`）对已有的库调 `validateManagedBoard`，它读 Goals 的表；Goals 的库被拒（PLIB-14：只停 Goals，库和别的插件照常开）时表可能读不到，这些路径就因为 Goals 的状态失败。单做这一片能让 PLIB-14 对建库、验库也成立。

**验收（草稿，等配号）**：

- S8b-1：新建项目后库里恰好一行根记录，没有看板；打开项目后 Goals 建出看板且重复打开不再写。
- S8b-2：Goals 的库被拒（缺表）时，`validateManagedProject` 仍通过，项目照常打开，Goals 页说明原因。
- S8b-3：`demo-plugin-seed`、开发门、`managed-project-database` 不再名 `goalsQuery`、`initializeBoard`；`tests/goals-host-no-direct-reads.test.ts` 里对应条目删掉（清单只许减少）。
- S8b-4：已有项目（已有看板）打开后行为不变，看板没有重复。

## 4. S9

**做什么**（六块，顺序见第 5 节）：

1. **Goals 的存储搬进插件**：`modules/goals`（顶层约 9,400 行）和 `modules/governance-collaboration`（约 970 行）里读写那 31 张表的 SQL 改走 `services.project_database`（逐句检查，写只在 `transaction` 里），搬进 `plugins/native/goals`，两个模块包删除。`tooling/gates/table-owners.json` 里 Goals 表的 `shared` 条目同时删（`events`、`idempotency_records` 的 Goals 与 Governance 使用者也删，见第 6 节第 3 问）。`createGoalReadServices`、`readMolisWorkSnapshot` 的宿主使用者（Feed、`LocalProjectDatabase`、`project-catalog`）改读动作。
2. **`createGoalsPlugin`**：`kind:"app"`，`start()` 里拿服务；项目级加监督器条目（`apps/local-host/src/project-plugins.ts`）；个人规划的 Home 一半按双实例（`registration.runtime`）装配；`manifest.ts` 的 `native` 与注释改掉。
3. **路由走 Runtime**：删 `web-request.ts` 的 `goals` 条目里的改写；客户端改打 `/api/plugins/io.molis.work.goals/…`；声明了权限的路由对照安装授权（现在传空，一律拒）；执行由平台给；通用分发函数没有别的使用者时一起删；`scripts/check-package-boundaries.mjs` 的 goals-command-owner 规则改认新的挂载点（BL-386）。短路径 `/api/goals…` 同时删，不留兼容层（D2；已核：CLI 与 MCP 管理入口走动作客户端，不走这条 HTTP，仍在用它的是工作台与成果库插件自己的页面脚本，`apps/workbench/src/goal-inputs-html.ts`、`scripts/client/placement.ts`、`terminal/client-prompt.ts` 和 `plugins/native/artifacts/src/goal-input-client.ts` 要一起改）。
4. **删宿主私路**：`goals-actions.ts` 整个删；`web-request.ts` 里 Goals 的行删；`project-host.ts` 的协调器、`goal-project-application.ts`、`demo-seed.ts` 的直接写（样例项目改经动作）、第 2 节冻结清单里剩下的持有者删到零。CLI 与 MCP 管理入口的绑定（`bindGoalsManagementActions`、`readProjectGuidance`）挪出被删的文件：钉死 `GOALS_PLUGIN_ID` 是 2026-10-10 选 (a) 后认可的内置规则，Runtime 里的 Goals 同样成立，所以不必等 BL-501；通用化归 BL-501。
5. **身份与出处**：Goals 转接里手写的 web、管理 `user_action` 删，改由入口给（#1117）；旧语义里的**幂等消息身份**（重试用同一键）和**整份确认依据**（`whole_confirmation_prompted`）不能在替换中丢，要在 S9 里写成入口上下文的一部分并有拒绝测试。
6. **登记**：`tests/builtin-plugin-assembly-gate.test.ts` 冻结名单去掉 `goals`；以插件命名的宿主文件减一（`goals-actions.ts`）；`node scripts/gates/package-inventory.mjs --table` 重生包清单；privileges.md 的 PG-004、PG-012、PG-020、PG-021、PG-029、PG-031、PG-058、PG-094 状态更新；删 BL-386。

**验收（草稿，等配号）**：Goals 在 Runtime 监督器下运行，被停用或被拒时只停自己；`goals-actions.ts`、`web-request.ts` 的 Goals 行、COORDINATOR_HOLDERS 与 TABLE_READERS 清单为空；31 张表的读写都过 `services.project_database`；旧短路径 404；管理入口、网页入口的 `user_action` 都由入口给，伪造的被拒；Goals 页输出与迁移前逐项相同。

## 5. 顺序

```
平台前置（归 ac-platform / ac-kernel，不在本线）：
  #1117 PG-029 ─┐
  journal 端口 ─┼─▶ S9 第 1 块（存储搬迁）─▶ 第 2、3、4 块 ─▶ 第 5、6 块
  PG-087 服务 ──┘
迁移线：S4(#1146) ─▶ S8b ─▶ （等前置）─▶ S9
```

S8b 不依赖平台前置，可以现在做。S9 第 1 块最大，建议按表组拆（Goal 树与关系、事件与治理、输入与成果绑定）每组一个 PR，每个 PR 内 Goals 仍由宿主装配、只把该组的 SQL 换成 `services.project_database`，最后一个 PR 才切到 Runtime。这样每片都能独立回滚（推断，拆法要读完 `modules/goals` 的依赖才能定）。

## 6. 要统筹裁定的（每问后面是迁移线的建议，裁定写回这里）

1. **S8b 单做，且「建看板」从建库挪到打开项目？**建议：是。S8b 不依赖任何平台前置，现在就能做；S9 之前由宿主的 Goals 装配在打开时建，之后是 `start()`。
2. **T1 对 S9 解冻吗？**S9 要改 `project-plugins.ts`（加监督器条目）和 `tests/builtin-plugin-assembly-gate.test.ts`（删 `goals`），main 上没有书面解冻。建议：只对 Goals 这一条解冻，① 在 privileges.md 的 T1 行写一句。
3. **日志与幂等记录（`events`、`idempotency_records`）怎么给 Goals？**Goals 与 Governance 在和业务变更同一个事务里写这两张表（`tooling/gates/table-owners.json` 写着后续改成注入的 journal 端口）；`services.project_database` 只放行插件自己的表和 `project_root`，所以 Goals 上 Runtime 后写不了它们。这是 S9 第 1 块的硬前置，归 ② 定做法。建议：把 journal 做成事务句柄上的方法（`append`、`getIdempotency`、`putIdempotency`，表仍归 `packages/storage`），保证和插件自己的写在同一事务里。没有它 S9 无法开工。
4. **S9 第 1 块（存储搬迁）按表组拆几个 PR？**建议：三个（Goal 树与关系、事件与治理、输入与成果绑定），每个 PR 内 Goals 仍由宿主装配，最后一个 PR 才切 Runtime；拆法读完 `modules/goals` 的依赖后再定，需要 RAC 号段约 25 个。
5. **S9 要不要等 BL-501（钉死提供方）？**建议：不等。2026-10-10 选 (a) 后内置插件 `provider_id == plugin_id`，Runtime 里的 Goals 同样成立；S9 把管理入口的绑定挪到一个不点名 Goals 的宿主文件，通用化仍归 BL-501。
6. **个人规划（PG-012 的 Goals 一半）是否放进 S9？**平台一半和 U3（服务按实例区分，#1050）都已合。建议：放进，否则 Manifest 声明了两个 home 动作、实现却在宿主，违反 D5。需要 ② 确认 `registration.runtime.dual_instance` 对 Goals 的写法，并要 Home 数据（Catalog 库里的 `personal_planning_method_packs`）归属不变。
7. **S9 与 W5-06 的先后：**PG-094 一行说迁 Goals 要先有 W5-06，原计划却把「删手写舞台」放在 S11。建议：S9 不改项目页的拼装（`web-goals-read.ts`、`goals-page-renderer.ts` 经动作读，保持现状），S11 在 W5-06 的 #1107 合入后做；请 ① 确认这个顺序，免得 S9 做完发现舞台要由运行中的实例来画。
8. **PG-087 的 attention、context-ledger 服务：**Goals 的协调器现在自己组装 Attention 与 ContextLedger（`goal-project-application.ts`）。建议：由 ② 经 services 提供，S9 第 1 块之前合入；要不要先让 Goals 自带一份（再删）请 ② 定，迁移线倾向不自带，避免两份。
9. **号段与编号：**S8b 约 6 个、S9 约 30 个 RAC 号；S 号（安全不变量）至少 2 个（`user_action` 的入口上下文、journal 端口的取消/撤权后不写）。

## 7. 门禁与风险

- 巨大单元只许变小：搬迁后 `GoalEventState`、`GoalEventFacts`、两个仓库类在新位置仍要在阈值内，不能因为搬家变成「新增的巨大单元」（对 merge-base 不是巨大单元的，登记也不放行）。
- page-assets：改客户端路径会改 `molis-work-workbench.js` 的字节；净增要在 PR 里写明，不预支额度（>10 KB 或新资源先问用户）。
- 动作合同快照：S9 不改动作；若第 1 块要升版本，按 `docs/system/CONTRACT-CHANGES.md`。
- 安全不变量：身份只从上下文来；不从输入读 `user_action`；撤权、取消、停用后不写业务记录（含 Goals 的失败记账）；新增或改动一条要同步 `docs/system/SECURITY-INVARIANTS.md`，向统筹要 S 号。
- 本机延后验证：存量项目库（有看板、有 31 张表）在新构建下打开、重开、关闭，要用真实 Home 的备份拷贝演练，不碰真实 Home。
