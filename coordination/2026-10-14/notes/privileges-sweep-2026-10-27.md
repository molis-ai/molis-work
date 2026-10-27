# 防腐线收尾核对：privileges.md 待做行、§3.8 BACKLOG、装配门禁冻结名单（2026-10-27）

ac-sweep 只读核对。基线 `origin/main` = `74f31c19e`（含 #1295 `9efbf8d04`、batch-41 #1310 `29f1ffd47`、batch-42 #1311、#1314/#1315）；C 分支 `origin/feature/anticorruption-closeout-c` = `bc7c06c07`。只用 `git show/grep/log`，没有跑构建、测试、门禁。行号指 main 上的 `specs/repository-anti-corruption/privileges.md`（下称 priv）与 `specs/BACKLOG.md`。

计数（PG 29 行 + §8 T0 一项 + §3.8 点名的 BL 67 条，共 97 项）：

| 类 | PG | T0 | BL | 合计 |
| --- | --- | --- | --- | --- |
| A main 已做 | 5 | 1 | 11 | 17 |
| B C 分支已做 | 11 | — | 0 | 11 |
| C 还要写代码 | 10 | — | 47 | 57 |
| D 维护窗口或真实 Home | 1 | — | 3 | 4 |
| E 本轮绕开（Alchemist、创作台） | 2 | — | 0 | 2 |
| 待定 | 0 | — | 6 | 6 |

另有几行带着 D 部分，但按主体归类，没有重复计数：PG-020（v11 维护）、PG-094 ③、PG-077 A5。

## 0. 总表

### 0.1 PG 行（priv §3 状态不是「已做」「不迁」的 29 行）

| 行 | 类 | 一句话 | 证据 |
| --- | --- | --- | --- |
| PG-002 L133 | A | 插件可选权限开关与动作已在 #1295 落地 | `apps/local-host/src/plugin-install-actions.ts:78` `plugins.permissions.set@1`、`plugins.home.permissions.set@1`；界面 `apps/workbench/src/settings-plugins.ts:151`；`git log -S` 指向 `9efbf8d04` |
| PG-004 L135 | A | 常开名单、拒绝卸载/停用（T3）、撤回（T5）、T3b 显示都已合入 | batch-36 #1259、batch-38 `fc1e03c3c`（T4/T5/T6）、batch-41 `29f1ffd47`（T7+T3b+T5b）；BACKLOG 已无 BL-585；余项在 BL-586/587 各自成行 |
| PG-005 L136 | A | 默认连线、默认组改读同意账本（T4） | `apps/local-host/src/plugin-default-bindings.ts:2-4,14,24-30,50`（`consentStands`）；batch-38 `fc1e03c3c`；余项是 BL-587 与 BL-616 |
| PG-008 L139 | E | Goals 一半 #1295 已做；剩下的只有 Alchemist 与创作台 | `apps/local-host/src/goal-callers.ts` 的 `bindGoalsWebActions` 走 `bindLocalWebActions`，`pinPermissions` 已无；`tests/goals-host-private-paths.test.ts:25,31,49`（RAC-803） |
| PG-011 L142 | C | 装上的插件声明 `runtime` 仍在安装时被拒，Home 级只认登记 | 余项 BL-710～715（本次没有逐条核） |
| PG-012 L143 | D | 个人规划的数据搬迁要用户的维护窗口 | `goals-personal-planning-move.mjs`（RAC-800）；真实 Home 没跑 |
| PG-017 L148 | C | 余项 BL-490～493 | 本次没有逐条核 |
| PG-020 L170 | B（带 D） | C 把 Feed 的表移出项目库基线（v11）；Goals 一半由 #1295 完成；存量 v10→v11 要维护窗口 | C 的 `project-database-schema.ts` 已不再 import SOURCES、SIGNALS、FEED、LISTENER_HOST |
| PG-026 L176 | A | 状态里已经写了「本身没有余项」 | priv L176 |
| PG-102 L178 | A | 同上，「本身没有余项」 | priv L178 |
| PG-031 L193 | B | Feed、Inbox 两半随 C 完成；Inbox 写死调 Pages 是裁定保留的（等信任与同意清单，R-45） | `plugins/native/inbox/src/actions.ts:66,77`、`pages.ts:70` 两边都还在 |
| PG-040 L210 | B | `workflow-feed-options.ts` 在 C 删掉；`web-project-schedulers.ts` 只剩 `runtime.schedule.tick()` | C 的 diff |
| PG-043 L213 | B | `feed-history-release.ts`、`connector-source-state.ts` 在 C 删掉 | C 的 diff |
| PG-045 L220 | B（部分） | Feed 改用 `services.connections`；Feed 不再写 `connection_id` 与绑定界面留给 FI7b；Alchemist 部分归 E | C 的 `plugins/native/feed/src` 里还有 20 处 `connection_id` |
| PG-046 L221 | C | `integration-providers.ts` 仍 import `catalog-connector.ts`（main:7）；余项 BL-740 | main 和 C 都还有这两个文件 |
| PG-057 L238 | B | `/api/feed`、`/api/inbox` 随 FI-4～7 清掉（C 已改这一行的状态） | C `0f4c83de4`、`d7da3e05c`；`inbox-native-plugin-http.ts`、`feed-native-plugin-http.ts` 在 C 删掉 |
| PG-058 L239 | B（部分） | Feed、Inbox 两半随 C；成果的 HTTP 随 PG-077；Goals 的改写是 BL-386；Alchemist 归 E | 同上 |
| PG-060 L241 | C | 工作台为 Goals 手写的特例还在；C 只为 Feed/Inbox 补了 3 个位置 | `apps/workbench/src/goals-plugin.ts`、`goals-fragment-renderer.ts`、`goals-document-routes.ts`、`scripts/client/tab-workspace.ts:110-289` 等；C 补的是 `web-view.ts:111`、`plugin-stage-fragment-http.ts:23,34-37`、`web-request.ts:201` |
| PG-064 L245 | C | `page-view.ts:1-3` 仍 type-import Goals、Feed、Schedule 三个插件包 | main 和 C 都是 `apps/workbench/src/page-view.ts:1-3` |
| PG-070 L257 | C | Coding 自己的客户端（3b）和 `CODING_STYLES`（PG-072）没做 | priv L257 的状态 |
| PG-077 L270 | C（带 D） | 成果 A6 等 W5-06 的挂载器（前提 PG-024 已随 batch-41 完成）；A5 与 A7 的目录改名要维护窗口 | `slices/ac-artifacts.md` 的状态句；`artifact-native-plugin-http.ts` 两边都在 |
| PG-078 L271 | C | 随 A6 | 同上 |
| PG-080 L273 | B（有条件） | Feed 迁到 Runtime；要等 RAC-510（Runtime 的 Feed 没接成果服务）在 C 里修完 | C 的 `slices/feed-inbox-runtime-plugins.md` §13 |
| PG-087 L280 | B | 几个模块并进 Feed，改走 attention、contextLedger、connections、sourcePull 服务 | C 删了 `modules/feed`、`modules/sources`、`modules/signals`、`horizontal/listener-host` |
| PG-089 L287 | B | Inbox 有了自己的库，`inbox-actions.ts` 已删，短路由迁到 `/api/stage/inbox` | C 的 diff，C 已改这一行 |
| PG-093 L291 | B（`information.plan` 待定） | 列出的宿主文件随 C 删掉；`information-actions.ts` 仍是宿主的 `system.information` 提供方，按 PG-031 的裁定它是平台提供方，算不算特权待定 | C 的 `apps/local-host/src/information-actions.ts` 还 import `feedQueryActions`、`inboxActions` |
| PG-094 L292 | C（③是 D） | ① BL-386 宿主的过渡改写；② 工作台的 Goals 特例；③ S9-2 加目录库 22→23（D）；④⑤ 见该行 | `web-request.ts:26,238-248`（注释「Goals has no Runtime installation yet」在 #1295 之后已过时） |
| PG-095 L298 | E | 只剩 Alchemist 的部分 | priv L298 |
| PG-111 L306 | C | `packages/contracts/src/modules/` 里 Feed 的 `feed.ts`、`signals.ts`、`sources.ts`，以及 Goals 的 `goals.ts`、`goal-*.ts`，main 和 C 都还在 | `git ls-tree` 两边 |

### 0.2 §8 T0 表（priv L424–468）

| 项 | 类 | 一句话 | 证据 |
| --- | --- | --- | --- |
| T0 结论列与 §3 不一致 | A | PG-023、027、038、047、052、081、088 在 §3 已标「已做」，PG-092 是「不迁」，T0 却还写着「仍待做」。改成「已做，见 §3」 / 「不迁，见 §3」 | priv §3 对应行 |
| T0 里真正还没做的 | — | PG-026（A）、043（B）、045（B 部分）、058（B 部分）、077/078（C）、089（B）、095（E）；结论跟着 §3 写，不单独计数 | 同上 |

### 0.3 roadmap §3.8「随防腐线收」点名的 BL（67 条）

| 条目 | 类 | 一句话 |
| --- | --- | --- |
| BL-081、530、588、628、680 | A | main 的 BACKLOG 里已经没有这几行，无需动作 |
| BL-500 | A | `artifact-actions.ts:14,29` 的 `goalTitle` 已经通过公开动作 `goals.directory.read@1` 读，这行可以删。还没核：`tests/goals-host-no-direct-reads.test.ts` 是否还在（grep 没找到） |
| BL-575、576、577、584 | A | 成果 A1、A2a、A2b、A3 已合入（#1294 等，见 `ac-artifacts.md` 状态句），可以删行 |
| BL-617 | A | Images、Jelly 的合同已迁走（#1263），`contracts/src/modules/` 里没有它们，可以删行 |
| BL-579、581 | D | 成果 A5、A7 的目录改名要用户的维护窗口 |
| BL-178 | D | 把 `{home}/lingguang/models` 搬目录要动真实 Home（W5-01 只改了归属） |
| BL-085、086、088、117、121、635 | 待定 | 见 §6 |
| 其余 47 条 | C | 见 §3.2 |

### 0.4 装配门禁的四份冻结名单（`tests/builtin-plugin-assembly-gate.test.ts`）

| 名单 | main | C 合入后 | 还剩什么、归谁 |
| --- | --- | --- | --- |
| `BUILD_TIME_ASSEMBLED` L49 | alchemist、artifacts、feed、inbox、plugin-builder | alchemist、artifacts、plugin-builder | alchemist、plugin-builder 归 **E**（BL-376/377，绕开后删除重做）；artifacts 归成果线 A5～A8（A5/A7 改名是 D，A6 等 W5-06 挂载器是 C，A8 收口 BL-582） |
| `NATIVE_PLUGIN_HTTP_FILES` L55 | alchemist、artifact、feed、inbox | alchemist、artifact | alchemist 归 **E**；artifact（`artifact-native-plugin-http.ts`）随 A6/PG-077，归成果线 |
| `HYBRID_RUNTIME_PLUGINS` L149 | goals | goals | Goals 宿主的手写代码：`goal-callers.ts`、`web-goals-read.ts`（C 已删 `feed-goal-promotion.ts`）。归 Goals 收尾：PG-094 ①（BL-386）、PG-060 Goals 部分、PG-064。注意：C 里 `HOST_FILES_NAMED_FOR` L156 仍列着已删的 `feed-goal-promotion.ts`，测试不会因此失败，但名字过时，可以在 C 里顺手删 |
| `HAND_STARTED` L34 | files | files | Files 的工厂要宿主的 `readable` 端口，要等端口做成平台服务：BL-616，即 PG-005 的 X-5 |

## 1. A：main 已做（17）

建议写进状态格的话：

- **PG-002**：「已做：项目与个人空间的可选权限开关 `plugins.permissions.set@1`、`plugins.home.permissions.set@1` 和插件设置页的开关随 #1295 合入（`9efbf8d04`）；撤权后的调用按硬约束不写业务记录。」
- **PG-004**：「已做：常开名单从安装记录与同意账本生成、服务端拒绝卸载和停用（T3 #1259，batch-36）；撤回与世代（T5，batch-38 #1300）；T3b 显示与 Goals 不在时的路径（batch-41 #1310）。余项见 BL-586、BL-587。」
- **PG-005**：「已做：默认连线与默认输入组只在同意账本里有效同意时生效，来源签名按此刻核对（T4，batch-38 #1300，`plugin-default-bindings.ts` 的 `consentStands`）。余项：BL-587（默认组选择没有来源），BL-616（Files 端口）。」
- **PG-026、PG-102**：「已做（本身没有余项）。」
- **§8 T0**：把 PG-023、027、038、047、052、081、088 的结论改成「已做，见 §3」；PG-092 改成「不迁，见 §3」。
- **BACKLOG 删行**：BL-500、575、576、577、584、617。BACKLOG.md 同时在 C 和 W5-10/11 的文件名单里，不要单独开 PR，放进 C 的收口或 C 之后的文档片（§7 第 1 片）。
- 已经不在 BACKLOG 的：BL-081、530、588、628、680。

## 2. B：C 分支已做（11），C 合入时改状态

PG-020、031、040、043、045（部分）、057、058（部分）、080（有条件）、087、089、093。C 已改过 PG-057、PG-060（只补位置）、PG-089 的状态。其余行 C 合入时要一起改：

- **PG-040、043、087、089**：写「已做（C 合入，FI-x）」。
- **PG-020**：写「代码已做（FI-5，项目库基线 v11）；存量升级待维护窗口」。
- **PG-045、PG-058**：写「部分」。PG-045 的余项是 FI7b 和 Alchemist（E）；PG-058 的余项是 PG-077 的成果 HTTP、BL-386 和 Alchemist（E）。
- **PG-080**：只有 RAC-510 在 C 里修完（Runtime 的 Feed 接上成果服务、写 `feed.capture`）才能写「已做」，否则写「部分」。修复正在等 ① 批准。
- **PG-031**：写「已做」，并注明「Inbox→Pages 写死裁定保留（R-45）」。
- **PG-093**：写「已做（宿主文件已删）」。另起一句：`information-actions.ts` 是平台的 `system.information` 提供方，按 PG-031 的裁定不算特权；它还从插件包 import `feedQueryActions`、`inboxActions`，见 §7 第 2 片。

C 里看到的问题，C 合入前处理：

1. **`tests/artifact-host-writers.test.ts` 在 C 上可能红**：`HOST_WRITERS` 还列着 C 已删的 `apps/local-host/src/feed-application.ts`，又没列 C 里调用 `registerVersion` 的 `demo-feed-library.ts:89`。这个测试用 deepEqual 加 readFileSync，大概率失败。我没有跑，待核。
2. **C 的 privileges.md 丢了 main 的 10-27 头部那一行**（C 的 `0f4c83de4`、`d7da3e05c` 基于更早的 main）。合并时保留 main 的那一行。
3. 前面提过的 `HOST_FILES_NAMED_FOR` 里过时的 `feed-goal-promotion.ts`。

## 3. C：还要写代码（57）

### 3.1 PG 行（10）

| 行 | 剩什么 | 文件 | 体量 | 前提 | 现在能开工吗 |
| --- | --- | --- | --- | --- | --- |
| PG-094 ① = BL-386 | 删 `web-request.ts` 里 goals 条目的旧地址改写（L238-248）和对 goals 插件的 import（L26），并更正过时的注释 | `apps/local-host/src/web-request.ts`；工作台里还在调旧地址的地方 | 中；要跑一次浏览器批次 | 无 | **否**：`web-request.ts` 在 C 的名单里，也是枢纽文件 |
| PG-094 ② + PG-060 Goals | 工作台为 Goals 手写的部分：`goals-plugin.ts`、`goals-fragment-renderer.ts`、`goals-document-routes.ts`、`goals-planning-request.ts`、`capsule*.ts`、`ui-composition.ts`、`shell-page-renderer.ts`、`project-settings-pages.ts`、`page-assets.ts`、`scripts/client/{documents-state,editing-graph,refresh-decisions}.ts`、`tab-workspace.ts:110-289` | 同左 | 大，要拆几片 | 等 W5-11 里的 `tab-workspace*` 合入 | **否**：`tab-workspace*` 在 W5-11 |
| PG-094 ④⑤ | 见该行 | — | — | — | 待定（没逐项核） |
| PG-064 | 去掉 `page-view.ts:1-3` 对三个插件包的类型 import（外壳画的 Goals、Feed、Schedule 三页） | `apps/workbench/src/page-view.ts` 和三处画页的代码 | 中 | Feed 一半要等 C；Goals 一半最好跟 PG-111 一起 | Schedule 一半现在可以；Goals、Feed 一半等 C |
| PG-111 | 把 Feed（`feed.ts`、`signals.ts`、`sources.ts`）和 Goals（`goals.ts`、`goal-*.ts`）的合同从 `packages/contracts/src/modules/` 移进各自插件 | contracts、两个插件、各处调用方、API 快照 | 大（改合同，要跑 `pnpm api:update`） | Feed 等 C；Goals 等 W5-10（会改到 `plugins/native/goals/src/module/*`） | **否** |
| PG-070 | Coding 客户端 3b、`CODING_STYLES`（PG-072） | `plugins/native/coding`、`apps/workbench/src/scripts/settings.ts`、`page-assets.json` | 中 | 无 | **否**：资源字节数会变，要改 `tooling/gates/page-assets.json`，它在 W5-10/11 名单里，等 W5-11 合入后开 |
| PG-077、PG-078 | 成果 A6 删 `artifact-native-plugin-http.ts`，A8 收口 | `apps/local-host/src/artifact-*`、`modules/artifacts` | 中 | W5-06 挂载器（草稿 #1112）；PG-024 已完成 | **否**：等 W5-06 |
| PG-046 | 删 `catalog-connector.ts`，`integration-providers.ts` 改走连接服务；余项 BL-740 | `apps/local-host/src/{catalog-connector,integration-providers}.ts` | 中 | 和 W5-11 的 OAuth 声明（`connector-oauth-declarations.ts`）相邻 | 建议等 W5-11 |
| PG-011 | 余项 BL-710～715 | — | 待核 | — | 待定 |
| PG-017 | 余项 BL-490～493 | — | 待核 | — | 待定 |

### 3.2 BL（47 条，「没做掉的按所在包归进轨道」）

- **随 C、FI7b 收**：BL-525（目录卡跟着消费方搬走）、526、527（引用账建好以后：删项目时释放 Feed 正文、清扫孤儿正文。C 有没有建好账，待核）。
- **随 Goals 收尾**：
  - BL-386：PG-094 ①。
  - BL-508：`/api/goals/:id/panels` 改名；改合同；在 `web-panel-routes.ts`。
  - BL-637、695：Goal 终端窗格、工作终端还留在工作台。
  - BL-646：「被谁引用」的输出仍叫 `goals`，在 `artifact-actions.ts` 一带，输出字段的位置待核。
  - BL-121：决定回执等三项要产品判断，见待定。
- **随成果线**：BL-580（A6）、BL-582（A8）、BL-647（恢复出来的版本归谁）。
- **随信任线余项**：BL-586（T6）、587（T4）、589（T2 作者工具）、619、620、621、622、623、625、626、627。
- **随 Files 端口**：BL-616（`HAND_STARTED` 的 files），即 PG-005 的 X-5。
- **构建期装配与 E 相关**：BL-072（版本化升级与恢复不含构建期插件；E 删掉后只剩 artifacts）、BL-080（「19 个构建期插件」这句已过时，C 之后只剩 3 个，见 §0.4；可以改写成指向那 3 个）。
- **平台与工作台**：BL-123、124、127、130（随 W6-03）、136、324、375、378、381、382、505、507、520、522、531、532、550、568、638、639、657。
  - 要改合同或做设计的：BL-375、505、639、647。
  - 小而机械的：BL-123、124、324、638。
- **工程门禁**：BL-122（Swift 构建挡合并，BL 里写着先不挡）。

### 3.3 能不能开工（只列和 C、W5-10/11、枢纽文件都不冲突的）

- **BL-123**：`packages/storage/src/adapters/` 下 `memory-ledger*.ts`、`text-search-index.ts`、`knowledge-cards.ts` 读 `contracts/services/*`。C 只动了 `evidence-content.ts` 和 storage 的 `index.ts`。现在可以开工，但别碰 `index.ts`。
- **BL-646**：`artifact-actions.ts` 和 `modules/artifacts` 都不在两份名单里。要改动作合同，会动 `tooling/gates/actions/`，而 C 动了其中 3 个文件，要核是不是同一个文件。
- **PG-064 的 Schedule 一半**：`page-view.ts` 不在名单里。
- **BL-507**（改名 `private-work-context`）：涉及 62 个文件，其中 12 个在 C 名单、2 个在 W 名单。**不能开工**。
- **BL-124**：`tests/plugin-sample.e2e.test.ts` 在 C 名单。**不能开工**。
- **BL-324**：要改 `specs/repository-anti-corruption/spec.md`，在 C 名单。**不能开工**。
- **BL-638**：要动 Shelf 的 `package.json` 和 lockfile，lockfile 在 C 名单。**不能开工**。

## 4. D：要维护窗口或真实 Home（4，另有 3 行带着 D 部分）

- **PG-012**：个人规划的数据搬迁（`goals-personal-planning-move.mjs`，RAC-800）。
- **BL-579、BL-581**：成果 A5、A7 的目录改名。
- **BL-178**：搬 `lingguang/models` 目录。
- 带着 D 部分的：
  - PG-020：项目库基线 v10→v11（FI-5）。
  - PG-094 ③：S9-2 加目录库 22→23。
  - PG-077：A5。
  - 还有 `goals-journal-names.mjs`。

这台 Mac 上没有真实 Home，以上都留给用户的维护窗口。

## 5. E：本轮绕开（2）

- **PG-008**：建议状态写「Goals 部分已做（#1295，RAC-803）；Alchemist、创作台的部分随 BL-376/377 删除后重做」。
- **PG-095**：建议状态写「只剩 Alchemist 部分，随 BL-376/377」。
- 其他行里 Alchemist、创作台的余项（PG-045、058 等）都这样标注，不单独计数。
- 冻结名单里的 alchemist、plugin-builder 也属于这一类。

## 6. 待定（6）

| 条目 | 缺什么证据 |
| --- | --- |
| BL-085 | 三处遗留（Promote 写 `goal_id`、Functions 并发锁、手写 HTTP 别名）各自在 main 上还有没有：没逐条 grep |
| BL-086 | 这一行本身是「不是死代码」的核对记录，要不要删行由统筹定 |
| BL-088 | 「移除即停用」有没有完整实现：没核 `project-action-availability.ts` 与搜索来源 |
| BL-117 | 发版策略的余项是否已被决定 #23 消化：没读全行 |
| BL-121 | 三项要产品判断（决定回执等），代码还在没在：没核 `refresh-decisions.ts` |
| BL-635 | W5-08 删了一部分出口，约 80 个无消费者的出口还剩多少：没数 |

另外，PG-093 的 `information.plan` 算不算特权，见 §2。

## 7. 下一批可开工的切片（建议顺序）

1. **C 合入后的状态收口（文档片）**
   - 范围：§2 那几行的状态格；§1 的 A 行与 T0 结论列；删 BACKLOG 里 BL-500、575、576、577、584、617；把 BL-080 改写成指向剩下的 3 个；删 `HOST_FILES_NAMED_FOR` 里过时的名字。
   - 文件：`specs/repository-anti-corruption/privileges.md`、`specs/BACKLOG.md`、`tests/builtin-plugin-assembly-gate.test.ts`（只改那一个常量）。
   - 冲突：三份文件都在 C 名单，BACKLOG 还在 W 名单。所以要等 C 合入，并在 W5-10/11 之后 rebase；最好直接让 C 的作者在收口提交里做。
   - 体量：小（文档为主，约 50 行）。
2. **`information-actions.ts` 改用能力 id，不再 import 插件包（PG-093 尾巴）**
   - 范围：去掉对 feed 和 inbox 插件包的 import，`required_actions` 里已经写的是能力 id。
   - 文件：`apps/local-host/src/information-actions.ts`。
   - 冲突：这个文件不在 C 和 W 名单，但它 import 的 Feed、Inbox 导出在 C 里会变，所以等 C 合入后开。
   - 体量：小（十几行加一个测试断言）。
3. **BL-123：storage 不读 `contracts/services/*`**
   - 范围：把 `memory-ledger*.ts`、`text-search-index.ts`、`knowledge-cards.ts` 用到的类型改从 `contracts/platform/*` 取，或在 platform 层补等价的类型。
   - 文件：`packages/storage/src/adapters/` 下这 5 个文件，可能还有 contracts 的一个 platform 子路径。
   - 冲突：C 只动了 `evidence-content.ts` 和 `index.ts`，不碰它们就不冲突；W 没有 storage。**现在可以开工**。
   - 体量：小到中。若要在 platform 层新增类型，就改了合同，要跑 `pnpm api:update`；`tooling/gates/api/contracts/platform/` 下 W 动的是 dom-events 和 plugin-integrations，不是同一个文件。
4. **PG-064 的 Schedule 一半**
   - 范围：`page-view.ts:3` 不再从 Schedule 插件包取类型，改用 Schedule 的公开合同或生成的登记表。
   - 文件：`apps/workbench/src/page-view.ts` 和画 Schedule 页的那一处。
   - 冲突：都不在 C、W 名单。**现在可以开工**。
   - 体量：小到中。Goals、Feed 两半等第 6 片。
5. **BL-646：「被谁引用」的输出不再叫 `goals`**
   - 范围：输出字段改成通用的名字，标题通过声明了链接的那个插件读。
   - 文件：`apps/local-host/src/artifact-actions.ts`、`modules/artifacts`、动作快照。
   - 冲突：两个源码文件都不在名单里，但要先核 `tooling/gates/actions/` 下要改的那个快照文件不是 C 动过的 3 个之一。
   - 体量：中（改动作合同，要升 version 并更新调用方）。
6. **Goals 收尾：BL-386、PG-094 ②、PG-060 Goals、PG-111 Goals 合同、PG-064 Goals 与 Feed 两半**
   - 文件：`web-request.ts`、工作台的 `goals-*`、`tab-workspace*`、`contracts/src/modules/goal*`。
   - 冲突：要等 C（`web-request.ts`）、W5-10（`plugins/native/goals/src/module/*`）、W5-11（`tab-workspace*`）都合入。
   - 体量：大，至少拆成 3 片：路由改写、工作台特例、合同迁移。
   - 跑完要走一次浏览器批次。
7. **PG-070：Coding 客户端 3b 和 `CODING_STYLES`**
   - 冲突：`page-assets.json` 在 W 名单，等 W5-11 合入后开。
   - 体量：中。
8. **成果 A6、A8（PG-077、078，BL-580、582）**：等 W5-06 挂载器；A5、A7 的改名等维护窗口。

不建议现在开工：BL-507、124、324、638，理由见 §3.3。还有信任线余项 BL-586～627，归信任线自己排。
