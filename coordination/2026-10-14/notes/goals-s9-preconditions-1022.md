# Goals S9 前提核对（③ 后台子代理，只读 origin/main f6f0b1fd3，2026-10-22）

全程只读，证据是 origin/main 上的路径和行号。标「推断」的地方没有跑代码验证。

## 1. Goals S1（PG-110、PG-006）：已完成（#812，5b82ee82b，10-20）

- `apps/local-host/src/builtin-plugin-callers.ts` 已删，`goals.builtin_plugin_required` 在代码里零引用。
- 测试：`tests/security-invariants-plugin-callers.test.ts`（PG110-xx）。
- privileges.md 的 :132、:147 两行状态写的是 #812。

## 2. Goals S5：未做，也没有 PR

- `apps/local-host/src/goal-project-application.ts:19-31` 仍从插件包导入 13 个内部类：`GoalTree*` 十个，加上 `GoalEventApplication`、`GoalReadApplication`、`GoalDecisionAttentionSync`。`:54-206` 由宿主逐个 new。
- `plugins/native/goals/src/index.ts:13-23,99-105` 仍导出这些类。
- `project-host.ts:63-68` 的 `MolisWorkProjectRuntime` 只有 store、coordinator、project_id。
- `artifacts`、`processItems` 仍挂在协调器上，`project-plugins.ts:127-128` 又 new 了一份。
- 全仓没有 PG094-07、PG094-08 的字样。
- 待核：① 要 ② 在 S5 开工前用一行确认搬移做法。这一行在 coord-shared 里，没有查。

## 3. PG-087：main 上没去掉

- 状态句（privileges.md:273）：「待做（统筹已定，见 §4）」。
- `goal-project-application.ts` 里宿主组装的东西：
  - Artifacts、ProcessItems、Governance：`:82-112`；
  - ContextLedger：`:113-116`；
  - AttentionModule：`:146-168`。
- `PluginHostServices`（`packages/contracts/src/platform/plugin.ts:109-163`）里没有 attention、context-ledger 服务。
- artifacts、processItems 只给了窄客户端：publish、read、head、readOwn、listConsumable。够不够 Goals 用，要对照 `goals-actions.ts:22,25` 核（推断）。

## 4. PG-012：平台一半已补，Goals 一半未做

**状态句过时**：privileges.md:138 还写「S0-2b-2 待合」，但 #891（eb7547b2c）、#893（0641e1f69）都已合。`specs/dual-instance-plugins/spec.md:3` 的状态句也一样过时。

**平台一半已有**：
- `registration.runtime.dual_instance`
- `plugin-scope-entries.ts`
- 门禁 `scripts/gates/dual-instance.mjs`
- `host.md` 的双实例一节
- `tests/dual-instance-*.test.ts`

**还没做**：
- S0-2b-3（U3，服务按实例区分）：没有提交，也没有 PR。
- Goals 一半：
  - `registration.ts` 没有 `runtime`；`manifest.ts:26` 仍是 `kind:"native"`。
  - 个人规划的两个 home 动作已在 Manifest 声明（`:30,:34`），实现仍在 `personal-planning-actions.ts:10-29`，走的是以 `io.molis.work.goals.home`、`kind:"system"` 注册的私路。
  - 数据在 Catalog 库（`project-catalog.ts:173`、`catalog-schema.ts:20`）。
  - `tests/dual-instance-coverage.test.ts:20` 是 `SHIPPED = []`。

## 5. S9 缺的平台能力（归 ②）

计划里的 S9：
- `createGoalsPlugin`，`kind:"app"`，路由进 Manifest，加监督器条目；
- 删掉 `goals-actions.ts`，以及 `web-request.ts` 里的 Goals 行；
- 重新生成包清单表，处理 CLI、MCP 里写死的提供方。
- 验收编号：PG094-11。
- 依赖：S1（已做）、S5（未做）、S8（#881 已合），② 的 PG-087 services 和 PG-029，T1 解冻，PG-012。

缺的几项：
- **PG-029 可信 `user_action`**：待做，没有 PR。
  - `goals-actions.ts:47,52,60` 手写 web 来源，`:105,:139` 是管理入口；另有 `personal-planning-actions.ts:34`。
  - `contracts/platform/actions.ts:101` 只是上下文里的自由字段，`plugin-runtime/src/callback-context.ts:10` 只原样透传。
- **PG-087 的 attention、context-ledger 服务**：`PluginHostServices` 里没有。
- **插件能用的 journal 与幂等记录服务**（推断，计划里没点名）：
  - Goals、Governance 用自己的 SQL 写共享表 `events`、`idempotency_records`。`tooling/gates/table-owners.json:4-13` 写着「后续改成注入的 journal 端口」。
  - `services.project_database` 逐句检查，只放行插件自己的表和 `project_root`（`plugin-runtime/src/project-database-statements.ts:4-11`），所以 Goals 上 Runtime 以后写不了这两张表。
  - 要 ② 定做法。
- **T1**：
  - W5-02 PR-1a（#840）已合；PR-1b、PR-2 没做，没有 PR（privileges.md:245,248）。
  - main 上没有书面的解冻记录。#840 之后 `project-plugins.ts` 和装配门禁测试又改过多次，看来事实上能改（推断）。S9 要改这两处，请 ① 确认。
- **PG-012 的 Goals 一半**：平台一半够用（推断）。S0-2b-3 只涉及 model、ownerFiles、materials、background 四项服务，Goals 用不到。L4 没做也不挡。
- **W5-06 / PG-060**：待做。计划里它属 S11，可 privileges.md:115 把它列为迁 Goals 的等待点，两处不一致，请 ① 裁。
- **PG-027 嵌套 command**：privileges.md:184 仍写待做，但 #843（`services.actions.directory`）已合，状态疑似过时。Goals 的 pin 流程（`goals-actions.ts:25-26`）要实测（推断）。
- ③ 自己还没做的前置：S6（`web-request.ts:165` 每个请求仍对账）、S4。S7a（#821）已合。

## 6. 在途 PR

7 个在途 PR，没有一个在做上面任何一项：
- #1022 VUX
- #1021 memory
- #1018 draft
- #1017、#1010 Coding 性能
- #784 QA
- #734 Linux CI

#1018 改了 `project-host.ts`、`project-plugins.ts`。S5、S9 开工前要留意冲突。
