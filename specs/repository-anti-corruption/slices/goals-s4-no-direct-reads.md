# Goals S4：宿主网页层不再碰 Goals 的协调器（PG094-06）

状态：已实现（2026-10-23，迁移线 ac-sc3 片，PG-094 的 S4）；代码按 main `38111ce61` 核过。钉死的提供方与 `goalTitle` 端口没有动，原因见第 3 节。

## 1. 目标

Goals 迁到 Plugin Runtime（PG-094）的第四步：宿主不再绕开 Goals 的动作，直接读它组装出来的对象。计划（`goals-migration-plan.md` §1 第 5 行、§2 S4）点了六处：`web-request.ts:154`、`web-goals-read.ts:137`、`artifact-actions.ts:22`、`project-plugin-ports.ts:41`、`demo-seed.ts`、`workbench-renderer.ts`。S5～S7b 做完后，对着 main 再核一遍：

| 位置 | 现在 | 本片 |
| --- | --- | --- |
| `web-request.ts`、`web-project-context.ts`、`web-goals-read.ts` | 网页请求的项目上下文带着协调器，一路传到 Goals 页处理函数；那里只拿它当「有没有」的开关，页面内容其实经 Goals 的动作取 | **删掉**：上下文不带协调器，页处理函数不收它 |
| `project-plugin-ports.ts`、`workbench-renderer.ts` | 已经没有对协调器的引用（C2、S7 做过） | 不用动 |
| `artifact-actions.ts:22` | 成果库提供方的 `goalTitle` 端口读 `goalQueries.getGoal` | **留着**：三处同步的端口，随 T1 解冻与 Coding 一族（PG-091）一起改 |
| `demo-seed.ts` | 样例项目直接写 Goal 事实 | **留着**：S9 与样例种子一起改 |
| `goals-actions.ts`、`goal-project-application.ts`、`project-host.ts` | 宿主装配 Goals | **留着**：S9 删（`createGoalsPlugin` 由监督器启动） |
| `managed-project-database.ts`、`local-plugin-development.ts`、`project-database.ts`、`demo-plugin-seed.ts` | 项目库的身份是 Goals 看板：新库先建看板、读看板快照；样例插件种子先问「演示项目的看板在不在」 | **留着**：S8 的另一半（PG094-10，等 X-5） |
| `feed-application.ts` | Feed 的注意力检查读 Goals 的 `getGoal` | **留着**：随 Feed 迁到 Runtime（PG-093） |

## 2. 范围

- 改：`apps/local-host/src/web-project-context.ts`、`web-request.ts`、`web-goals-read.ts`。Goals 页的路由不再把协调器交给 `goalsReadHttp.page`；`page` 只看有没有库（`store`）来决定要不要取所选 Goal 的文档（原先的「有协调器没有库」分支，路由从不走到，一并删）。
- 加：`tests/goals-host-no-direct-reads.test.ts`。把宿主里还持有协调器、还读 Goals 表的文件，连同次数与原因写成冻结的清单；新增一处或清单过期（次数变少没改清单）都失败。
- 不改动作、合同、公开 API、页面资源。

## 3. 没做的，和为什么

- **钉死的提供方**（计划第 8 行、PG-031 的 Goals 部分：`goals-actions.ts` 的 `readProjectGuidance` 与 `bindGoalsManagementActions` 把 `provider_id` 写成 `GOALS_PLUGIN_ID`）。2026-10-10 用户在 `RUNTIME-MIGRATION.md` 选 (a)：内置插件的 `provider_id` 等于 `plugin_id`，宿主对内置插件写 `plugin_id` 是稳定的、认可的。去掉它要改 `allowed_actions` 的合同（现在要求精确的提供方）并让宿主按能力在目录里找提供方，改的是信任边界，且 PG-031 同一行还有 Inbox、Pages、CLI、MCP；本片不动它，登记为 BL-501。统筹 2026-10-23 已裁：宿主按 `capability_id@version` 在共同目录（`services.actions.directory`）里找提供方，同一能力多个提供方时带码拒绝；`allowed_actions` 对插件与外部调用方仍要求精确提供方；PG-031 的 Goals、Inbox、Pages、CLI、MCP 合成一片，归 `ac-platform`。删除条件：`provider_id: GOALS_PLUGIN_ID` 一类写死点为 0。2026-10-24 BL-501 做完：宿主两处都改为按目录找唯一提供方再钉住，见 [bl501-host-provider-lookup.md](bl501-host-provider-lookup.md)。
- **`goalTitle` 端口**：计划写明这部分等 T1 解冻，与 Coding 一族一起。登记为 BL-500。
- **项目库身份**与 **Feed 读 Goals**：分别归 S8 的另一半和 PG-093，清单里写了名字。

## 4. 验收

- **RAC-250**：宿主的 `web-*.ts` 不出现 `coordinator`、`GoalProjectApplication`；项目请求上下文的类型不带协调器。（`tests/goals-host-no-direct-reads.test.ts`）
- **RAC-251**：`apps/` 里持有协调器（`coordinator`、`GoalProjectApplication`）的文件恰好是清单上的那几个，次数不超过登记值；清单上的文件不再持有或次数变少时，必须改清单。
- **RAC-252**：`apps/` 里读 Goals 表（`goalsQuery`、`createGoalReadServices`、`readMolisWorkSnapshot`）的文件恰好是清单上的那几个，且都在 `apps/local-host/src`；命令行、MCP、工作台、桌面壳一处也没有。
- **RAC-253**：清单的每一条写了原因，原因里点明由哪一片（S8、S9）、T1 或哪条 PG 删掉它；判断只认这几种写法，不认「样例」之类的泛称。

## 5. 对调用方的影响

没有。没有动作、合同、API 快照、页面资源的变化；网页层的 Goals 页输出与原来相同（原来的两个分支里，进入的那个不变）。
