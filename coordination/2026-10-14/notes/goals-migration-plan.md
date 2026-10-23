# Goals 迁到 Plugin Runtime（PG-094）：计划

> **① 14:34 UTC（消息额度用完，先写在这里）：** Pulse 取消入口要做，归 ③，排在 QA-023 之后、S7b 之前。QA-023 照你说的做：不补入口，PR 写「修 QA-023」。入口单独一片，要求见 `coord-shared/DISPATCH-1019-0710.md` D27：一个动作 `runCancel` 按作业种类分发；守住 RES07，取消零写；界面加「停止」；新验收编号 `W5-01-ALC-RES09`；QA-023 的用例 A 改经入口调用。

③ 迁移线，2026-10-19。状态：计划，交 ① 审。代码按 `origin/main`（ebad9a223 前后）核对，没有改文件，没有跑构建或测试。这份是 ③ 审定过的稿；初稿由一个只读的规划子代理起草，标「未重核」的地方是引自 privileges.md、没有再看代码的。

## 0. 结论

- **⑥ 不必等整个迁移。** 回执阶段 4 只需要 S2、S3 两片：
  - S2：外部会话对笔记、要求、决定说「已读到 / 怎么处理」的新动作；
  - S3：对话输入到 Goal 的 Context Ledger 边。
- 这两片现在就能做，不等 PG-110、PG-006、X-5 和 W5-06。前提是新动作的受众不含 `plugin`。
- **建议 S2、S3 由 ⑥ 自己做。** 它们是回执阶段 4 的功能，验收编号走 ⑥ 的 RCPT。③ 在这两片合入之前不碰它们的文件。这样 ⑥ 今天就能开工，不用排在 ③ 的 PG-110 后面。
- 整个迁移（S9）要等这些：
  - ③ 的 PG-110（网关核验插件调用者，① 10-19 改派）和 PG-006；
  - ② 的 X-5（PG-020/021）和 PG-087 的 services；
  - PG-029；
  - T1 解冻。

## 1. Goals 现在的宿主特权

| # | 特权 | origin/main 位置 | PG | 换成什么 |
|---|---|---|---|---|
| 1 | 四个动作只放行进程里登记过的内置调用者 | `plugins/native/goals/src/action-contract.ts:11-21`、`actions.ts:203`、`apps/local-host/src/goals-actions.ts:17-19`、`builtin-plugin-callers.ts:1-13` | PG-006 | 先由 PG-110 在网关核验宿主发的调用者和授权，再删名单 |
| 2 | 宿主把协调器的内部对象逐个交给动作处理器 | `goals-actions.ts:14-39` | PG-094 | Goals 包里的工厂，在 `start()` 里拿端口 |
| 3 | 宿主组装 Goals 的所有类，还替它造平台模块（Artifacts、ProcessItems、治理协作、ContextLedger、Attention） | `goal-project-application.ts:17-31,78-203` | PG-087、PG-094 | Goals 自己的类移进包内；平台的几样由平台经 services 给（privileges.md §4 h、l） |
| 4 | 项目运行时直接挂着 Goals 协调器 | `project-host.ts:65,160-173` | PG-094 | 运行时只挂平台事实，Goals 由监督器启动 |
| 5 | 宿主代码绕开动作，直接读协调器 | `web-request.ts:154`、`web-goals-read.ts:137`、`artifact-actions.ts:22`、`project-plugin-ports.ts:41`、`demo-seed.ts`、`workbench-renderer.ts:2,10` | PG-094、PG-091 | 改走公开动作 |
| 6 | 每次页面请求和每次 Inbox 列表之前，都把决定提醒对一遍 | `web-request.ts:165`、`inbox-actions.ts:23,59` | PG-033 | Goals 写完后自己对账，再改成发事件、Inbox 订阅 |
| 7 | 网页入口手写调用者和权限；`user_action` 也是手写的 | `goals-actions.ts:42-67` | PG-008、PG-029 | 按动作声明求权限；`user_action` 由入口上下文给 |
| 8 | 钉死 Goals 的提供方；从工作台 import 成果类型 | `goals-actions.ts:74-78`、`:4` | PG-031、PG-064 | 不钉提供方；成果类型从生成的登记表取 |
| 9 | Manifest 是 `native`，不声明路由；HTTP 走宿主路由表的 `/api/goals…` | `plugins/native/goals/src/manifest.ts:12-27`、`index.ts:120-121`、`http/create.ts:8`、`web-request.ts:26,253-284,294-295` | PG-058 | 路由写进 Manifest，由 Runtime 分发 |
| 10 | 项目页就是 Goals 页，宿主和工作台按插件名拼舞台 | `web-goals-read.ts:86,117,143-153`、`web-view.ts`、`apps/workbench/src/goals-page-renderer.ts` | PG-060 | W5-06 按 Manifest 的 `views` 挂 |
| 11 | 工作台写死 Goals 的别名和标签视图 | `apps/workbench/src/scripts/client/tab-workspace.ts:108,138,160-194` | PG-094 | 随 W6-01 删 |
| 12 | 项目库的身份就是 Goals 看板；表由宿主基线建 | `managed-project-database.ts:14,39-43`（未重核） | PG-020、PG-021 | X-5 按声明建表；`boards` 见 D1 |
| 13 | 常开、删不掉；个人规划方法由宿主实现 | 引自 PG-004、PG-012（未重核） | PG-004、PG-012 | `always_on` 声明；Home 级与项目级两部分 |
| 14 | 在构建期装配名单里 | `tests/builtin-plugin-assembly-gate.test.ts:45-48` | PG-094 | 移进 Runtime 装配 |

## 2. 切片（每片一个 PR）

### 现在就能做的

| 片 | 谁 | 内容 | 依赖 | 验收 |
|---|---|---|---|---|
| S1 | ③ | PG-110 加 PG-006，同一个 PR：网关只认宿主发的插件调用者，删 Goals 的内置名单，改 S-15 | 无（在做，`fix/gateway-plugin-caller`） | PG110-xx、PG094-01 |
| **S2** | 建议 ⑥ | 新动作（暂名 `goals.inputs.acknowledge`）：外部会话对 `gevt-` 笔记、要求、决定说「已读到 / 处理方式」。受众只给 `mcp`、`agent`，声明 `authorship:"session"`。写一条 `system` 事件（`goal_work_events.kind` 已允许 `system`，`modules/goals/src/event-facts-schema.ts:72`），时间线显示 | 无 | ⑥ 的 RCPT 编号 |
| **S3** | 建议 ⑥ | 对话输入到 Goal 的 ledger 边。新开动作，不改 `goals.inputs.confirm`（改了要升版本）。AI 的声明只写成提议，本人接受后才生效。Goal 页加「来自对话的输入」 | S2（只为错开 `actions.ts` 的冲突） | ⑥ 的 RCPT 编号 |
| S4 | ③ | 切掉宿主对协调器的直接读，去掉钉死的提供方。三处同步的 `goalTitle` 端口（`project-plugins.ts:37`）和 Coding 一族（PG-091）一起改，所以这部分等 T1 解冻 | 部分等 T1 | PG094-06 |
| S5 | ③ | Goals 自己的类移进包内工厂，`index.ts` 不再导出内部类；宿主把 Artifacts、ProcessItems 提到 `runtime` 上（D3） | 无 | PG094-07 |
| S6 | ③ | PG-033 第一步：Goals 写决定后在包内自己对账，项目打开时补对一次；删掉每个请求上的对账 | 建议排在 S5 之后 | PG094-08 |
| S7 | ③ | Goals 的客户端改用 `molisWorkRequest`（PG-056）；HTTP 处理器改成 Runtime 路由的形状 | 无 | PG094-09 |

### 要等的

| 片 | 内容 | 依赖 | 验收 |
|---|---|---|---|
| S8 | Goals 声明自己的项目库，由 X-5 建表；同步 `table-owners.json` | ② X-5（PG-020/021）、D1 | PG094-10 |
| S9 | `createGoalsPlugin`，`kind:"app"`，路由进 Manifest；加监督器条目；删 `goals-actions.ts` 和 `web-request.ts` 里的 Goals 行；重新生成包清单表；处理 CLI、MCP 里钉死的提供方 | S1、S5、S8；② 的 PG-087 services 与 PG-029；T1 解冻；PG-012 | PG094-11 |
| S10 | Goals 发事件、Inbox 订阅，删掉 S6 的直接调用 | S9；Inbox 迁到 Runtime | PG094-12 |
| S11 | 删掉工作台手写的 Goals 舞台 | ② W5-06 | PG094-13 |
| S12 | 删 tab 别名；常开改成声明 | W6-01、PG-004 | PG094-14 |

③ 的顺序：S1 → S5 → S6 → S7 → S4（等 T1）→ S8 起等平台。

## 3. ⑥ 要什么

- S2 解开阶段 4 的「外部 Runtime」一条（§8.4），S3 解开「ledger 边与 Goal 页」一条。两片都合入后，阶段 4 的验收就能做：这条要求被哪个会话读到、怎么处理、改了什么。
- 「改了什么」沿用 Goals 现有的提议机制，S3 只把提议和输入连起来。
- 新动作名里不要用 `receipt`：`goals.progress.receipt` 已被占用，意思也不同（`packages/contracts/src/modules/goal-actions.ts:46`）。
- Coding 要是以 `plugin` 身份直接写边，那一部分要等 S1。
- `specs/ai-input-receipts/spec.md` §13.4 说阶段 4 要改 `project-capabilities.ts`，这个文件现在没有 Goals 的引用，那句过时了，⑥ 可顺手改。

## 4. 待定

- **D1 `boards` 根行**：照 ② 的项目库计划 §2.4，留在宿主基线，只由 `modules/goals` 写，另立平台的「项目根行」服务。这条线不做数据迁移，拆表要动 8 个外键、要用户同意。
- **D2 工作台特殊待遇**：tab 别名等 W6-01；`/api/goals` 短路径在 S9 一次删掉，不留兼容层。删之前先核实 CLI 和 MCP 不走这条 HTTP。
- **D3 Artifacts、ProcessItems 从协调器里提出来**：③ 在 S5 做宿主内部的搬移，请 ② 评审；之后 ② 包成 services。
- **D4 S2、S3 归谁**：建议 ⑥（见 §0）。① 定。
- **D5 个人规划（PG-012）**：S9 等它，免得出现「Manifest 声明了动作、实现却在宿主」。

## 5. 门禁风险

- 巨大单元只许变小：
  - `GoalEventState`、`GoalEventFacts`、两个仓库类；
  - `createEventDocumentForms`、`createLocalGoalsReadHttp`，以及 `goals-page-renderer.ts` 的两个函数；
  - 新逻辑一律放进新文件。
- 以插件命名的宿主文件 16 个，含 `goals-actions.ts`。S2 到 S7 不新增，S9 减一个。
- `registerProvider` 共 20 处。Goals 走 `project-host.ts:173` 的 `add`，S9 只减不加。
- page-assets：Goals 的客户端打在 `molis-work-workbench.js` 里。S2、S3 在服务端渲染。S9 或 S11 会新增 `goals.js`：新资产要先问用户，workbench.js 要相应变小。
- 动作快照：S2、S3 只新增 v1 的行。S5 收窄导出后跑 `pnpm api:update`。
- 安全不变量：
  - 身份只从上下文来；
  - 新的写动作不开放给 `plugin` 受众（S1 合入之前）；
  - 不从输入读 `user_action`；
  - S12 会动 `tests/security-invariants-always-on.test.ts`。

## 6. privileges.md 的行号漂移（顺手记下，S1 的 PR 里改）

- PG-033：`web-request.ts:173` 现在是 `:165`。
- PG-094：`web-request.ts:34,54,278-297` 现在是 `:26,46,151-154,199-202,253-284,294-295`；`tab-workspace.ts:106,136` 现在是 `:108,138`。

## 7. ① 的批复（10-19 09:50 UTC）

照计划批，附条件，全文见 `coord-shared/DISPATCH-1019-0710.md` 的 D12。要点：S2、S3 归 ⑥；受众只给 `mcp`、`agent`；身份从上下文取；每种拒绝都有测试；③ 如果被 S2、S3 挡住，先做 S7；S5 开工前 ② 用一行确认搬移的做法。

## 8. ① 转来的（10-19 11:35 UTC，全文见 `coord-shared/DISPATCH-1019-0710.md` D23）

- **D1 作废。** 用户 10:20 的决定 b：现在就拆 `boards`。S8 要自己声明 `boards`，外键指平台的 `project_root`（归 `modules/projects`）。
- **`boards.title`：** 它是建项目时从显示名抄来的副本，之后从不同步。S8 的声明里去掉这一列，读者改读项目目录的 `display_name`；确实需要留的话，在 PR 里写明理由。
- **S8 和 ② 的 L1b 同一批。** v8 维护里 Goals 的账本行，用 S8 定稿的声明。
- **S5、S8 都排在 W5-02 PR-1a 之后。** 它们都改 `plugins/native/goals/package.json`。
- **「上 Runtime 之前由宿主替 Goals 调打开函数、建看板」是过渡特权。** 在 privileges.md 登记一行，到 S9 删掉。
- 表的主人门禁、`events` 和 `idempotency_records` 的 `shared` 条目、governance 的 4 张表，照 `project-library-plan.md` §3.4 做。
