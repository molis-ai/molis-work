# 系统性代码与架构防腐整理

状态：准备中，结构性改动尚未开工（2026-10-03）。第一步已完成并归档；同一目标里用户追加的「Artifact 定位与统一外壳」（[artifact-positioning](../artifact-positioning/spec.md)）壳子 S1–S7 与成果库 A1–A7、A4b 已全部合入 main。下一步：main 自检（本文「main 自检」一节），再按 §5a 门禁先行开始结构性改动。

任务要求：`docs/prompts/repository-anti-corruption.md`（2026-10-03 起以 main 上的版本为准，见 §1）。同时适用 `docs/prompts/repository-systematic-review.md` 与 `docs/prompts/code-health-report-2026-09-30.md`。上一轮整理见 [repository-systematic-review](../archive/repository-systematic-review/spec.md)，这里不重复它的内容。

本 spec 是第二步唯一的进度与证据记录，每完成一片就更新。

## 0. 现场与范围

- **基线**：第一步最终 main。第一步全量回归基线见 [post-merge-review §7.1](../archive/post-merge-review/spec.md#71-回归基线)；能力快照见 [§7.2](../archive/post-merge-review/spec.md#72-能力快照)；跨功能场景清单见 [§7.4](../archive/post-merge-review/spec.md#74-跨功能场景清单)。
- **范围**：全仓 73 个 workspace 包（`apps` 6、`horizontal`、`modules`、`packages`、`plugins/native` 26、`plugins/official-integrations`、`server`、`tooling/plugin-cli`）。每个包都至少做一次结构审查，交出 §5 的包级清单。
- **在途的其他线**（开工前要重新核对）：`feature/side-shelf`、`feat/plugin-picker-pins`、`docs/archive-project-arrival-flow`、`feature/fix-project-management-freeze`（另一工作树）、Codex 工作树 `~/.codex/worktrees/d62d`。

## 1. 决策记录与待决事项

| 日期 | 事项 | 选项 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-02 | 任务要求以哪份为准 | anti-rot 版；main 版 | anti-rot 版 | 用户在目标里指定；anti-rot 合入并删除后改用 main 版 |
| 2026-10-02 | `~/.molis-work` 在删迁移代码前怎么处理 | 保留并升级；备份后重建；先不处理 | 保留并升级 | 先整份备份；停 4207 与常驻服务期间用删除前的代码升到最新；与新基线逐表比对一致后才删迁移代码 |
| 2026-10-02 | 4173 上的服务（第一次问时我误说成独立的旧 Home，用户选「备份后停用」；执行前发现是真实 Home 的常驻服务，重问） | 不停，保持现状；停掉常驻服务；第二步升级时一并换新版 | 不停，保持现状 | 不备份、不停；升级 `~/.molis-work` 时常驻服务也要一起停，升级后由用户决定是否换新版（**已被 2026-10-03 的决定推翻**：备份、停 4173、删旧成果表，见本表下方）|
| 2026-10-02 | 插件升级声明的机制 | 保留机制，清掉旧声明；连机制一起删 | 保留机制，清掉旧声明 | 保留 `compatible_from_versions`、`migratable_from_versions` 与发行物留存；内置插件为过去版本写的声明删掉，版本号按新策略重置 |
| 2026-10-02 | 同事有没有要保留的 Home | 给同事一份备份升级说明；没有同事在用；稍后告知 | 没有同事在用 | 只处理本机 `~/.molis-work` |
| 2026-10-02 | 共享核心的评审方式 | CODEOWNERS 记归属、不开必选评审；共享核心必须评审；再加合并队列 | CODEOWNERS 记归属，不开必选评审 | 加 `.github/CODEOWNERS`，自动请求评审但不强制；合同变更靠门禁守；不改仓库设置、不开合并队列 |
| 2026-10-02 | vendored 私有包 | 删 3 份不用的、分发照旧；删 3 份并改私有源；先不动 | 删 3 份不用的，分发照旧 | [#170](https://github.com/molis-ai/molis-work/pull/170) 删掉 assistant-memory、compaction-growth、resource-intake；私有包继续随仓库分发 |
| 2026-10-02 | 他人的工作树与分支 | 只清已合入且干净的；全部保留；逐个问 | 只清已合入且干净的 | 已删 `~/code/molis-work-performance-pr` 工作树与本地分支（#150 已合、无未提交改动）。删远端已合入分支（他人的 #159、#164，以及本目标自己的 23 条）被自动模式拦下，留给用户在 GitHub 上删，清单见 §7 |
| 2026-10-03 | 任务书来源 | — | 以 main 为准 | 任务书已合入 main：[#216](https://github.com/molis-ai/molis-work/pull/216)（`592f15bc`）用 anti-rot 上的两份任务书替换 main 上的旧版（anti-rot 自分叉以来只改了这两个文件）。此后任务要求、代码与 spec 都以 main 为准，按目标原文「anti-rot 合入 main 后以 main 为准」执行；每个分支从最新 origin/main 开，开工前 fetch、合并前同步到最新 main，不再基于 anti-rot 或其他旧分支开新工作 |
| 2026-10-03 | 验证频率 | — | 用户调整 | 用户 2026-10-03 调整验证频率：小改动攒成一批，整体构建一次，跑这批改动涉及的相关用例（改了什么就跑读它、调它的用例；带 `L()` 文案的加 `tests/i18n.test.ts`，改路由的加所有读这条路由的用例）；全量回归只在大改动时跑（改共享核心 contracts、kernel、modules、local-host 的装配、workbench 外壳，改迁移或存储，改动跨三个以上包，删除整块旧代码，或合入后相关用例意外失败），每个阶段收尾也跑一次全量作为阶段证据。不变的底线：每个 PR 的 CI 必须通过；跑测试前先整体构建；构建与浏览器用例串行；不跳过、不放宽、不删除断言；失败先用干净基线工作树比对 |
| 2026-10-03 | 推翻 10-02「4173 不停，保持现状」 | 保持现状；备份、停 4173、现在删旧成果表 | 备份、停 4173、现在删 | 成果库改造里用户决定立即删真实 Home 的旧成果表（[artifact-positioning §1](../artifact-positioning/spec.md)）：已 `launchctl bootout` 停下 4173（安装版 0.2.0，没有旧表已不能用，要等装新版）；18 个项目库已备份到 `~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/` 后逐库删掉 `artifacts`、`artifact_versions`。下面 §4.1 第 4 步按此重写 |
| 2026-10-03 | anti-rot 分支与工作树（弹窗） | #216 合入后三处都删（推荐）；只删工作树与本地分支；先都不删 | 三处都删 | 已执行：#216 合入（592f15bc）后删了工作树 `.claude/worktrees/review-prompts-goal`（无未提交改动）、本地分支 `anti-rot`（无本地独有提交）与远端 `origin/anti-rot` |

**待决（开工后攒批弹窗问）**：

1. ~~真实 Home 的处理~~：已定，见上表（同事没有要保留的 Home）。已知：`~/.molis-work`，主检出上的 4207 与常驻服务 4173（LaunchAgent `com.adeptify.goalboard.web`，安装版 0.2.0）都用它；`~/.goalboard` 是指向它的符号链接，不是另一个 Home；4208 开工核对时没有在监听。
2. ~~插件升级声明的机制~~：已定，见上表。
3. ~~共享核心的评审方式~~：已定，见上表。
4. ~~vendored 私有包~~：已定，见上表。
5. ~~他人的工作树与分支~~：已定，见上表；保留 Codex 工作树 d62d（1,173 个未提交文件）、side-shelf（未审阅的 spec 草稿）、anti-rot（本目标的任务书）、plugin-picker-pins（在做）。
6. Casebook 外部合同的旧名：`apps/local-host/src/casebook/` 里的 `contract_id` 都是 `goalboard.casebook.*`，JSON Schema 的 `$id` 在 `goalboard.dev` 下。外部 Casebook 插件按这些 id 对接，改名是合同变化，要外部插件同步（§4.1「旧身份与旧名称」）。源码里其余的 `GoalBoard`（如 `project-capabilities.ts` 的 `checkGoalBoard`）只是内部命名，随 `board_id` 合并一起改。

## 2. 现状度量（§3）

开工时的数字（2026-10-02，main fccb2a30）。口径：源码是 git 跟踪的 `.ts/.mts`，排除 `tests/`、`specs/`、`docs/`、`dist/` 与 `.d.ts`；类和函数用 TypeScript 语法树量起止行。模板字符串里的浏览器脚本不按函数计，只算在文件行数里。

### 2.1 改动成本

- 09-28 起合入 main 的 PR：71 个。每个 PR 改动的文件数：中位数 6，p90 98，最大 615；改动的包数（`plugins/<区>/<包>` 与其他区的 `<区>/<包>`）：中位数 1，p90 11，最大 37。
- 新增一个内置插件的实际改动面（以 Todo 为例），插件包外有 15 个文件直接接线：
  - 宿主：`todo-actions.ts`、`todo-native-plugin-http.ts`、`project-host.ts`（`registerProvider`）、`web-request.ts`、`web-catalog.ts`、`context-onboarding-service.ts`、`package.json`；
  - 工作台：`builtin-plugins.ts`、`ui-composition.ts`、`i18n/en.ts`、`scripts/client/initialization.ts`、`package.json`；
  - 合同：`contracts/src/modules/todo.ts`；
  - 根：`package.json`、`scripts/workspace-packages.mjs`。

  目标：只改插件自己的包和声明。

### 2.2 冲突热点

自 09-28 起被最多 PR 改过的源码文件（按合入 main 的 70 个合并提交统计）：

| PR 数 | 文件 | 类型 |
| --- | --- | --- |
| 15 | `apps/workbench/src/scripts/client/assistant-island.ts` | 巨大文件 |
| 14 | `horizontal/agent-host/src/adapters/prologue-node.ts` | 巨大文件 |
| 12 | `packages/design-system/src/styles/craft-finish.ts` | 总样式 |
| 12 | `apps/workbench/src/i18n/en.ts` | 总词典 |
| 12 | `apps/local-host/src/web-request.ts` | 路由分发 |
| 11 | `packages/contracts/src/platform/actions.ts` | 公共合同 |
| 11 | `apps/workbench/src/scripts/client/initialization.ts` | 页面初始化 |
| 11 | `apps/workbench/src/immersive-shell.ts` | 外壳 |
| 11 | `apps/local-host/src/assistant/assistant-service.ts` | 巨大文件 |
| 10 | `plugins/native/pages/src/actions.ts`、`contracts/src/services/assistant.ts`、`contracts/src/services/agent-host.ts`、`agent-host/src/adapters/announce-guard.ts` | 合同、插件 |
| 9 | `apps/workbench/src/scripts/client/tab-workspace.ts`、`apps/local-host/src/web-catalog.ts` | 外壳、路由 |
| 8 | `scripts/workspace-packages.mjs`、`plugins/native/pages/src/client.ts`、`apps/workbench/src/page-assets.ts` | 登记、聚合 |

### 2.3 巨大单元

阈值按 §4.5：文件超过 800 行，类超过 300 行或超过 25 个方法，函数超过 150 行。

| 度量 | 编写时（74776928） | 开工时 |
| --- | --- | --- |
| 超过 800 行的源文件 | — | 37 |
| 超过 1000 行的源文件 | 24 | 25 |
| 超过 300 行的类 | 42 | 43 |
| 方法超过 25 个的类 | 25 | 25 |
| 超过 150 行的函数 | — | 99 |
| 超过 300 行的函数 | 22 | 22 |

排在前面的：

- **文件**：`pages/editor-browser.ts` 4,043 行，`workbench/i18n/en.ts` 3,661，`assistant-island.ts` 2,813，`assistant-service.ts` 2,700，`craft-finish.ts` 2,245，`pages/commands.ts` 2,241，`tab-workspace.ts` 2,050。
- **类**：`AssistantService` 2,131 行、121 个方法；`MemoryService` 1,170 行、59 个方法；`ShelfStore` 748 行、35 个方法。
- **函数**：`initializePrologueNodeAdapter` 1,436 行，`codingRouteBindings` 1,365，Pages 编辑器 `mount` 1,024，`startIm` 957。

### 2.4 边界穿透

| 度量 | 编写时 | 开工时 |
| --- | --- | --- |
| 测试直接引用包内部源码（`../<区>/*/src/`） | 942 处 | 959 处，另有 34 处引用 `dist/`；涉及 336 个测试文件 |
| 宿主入口导出 | 136 行，12 个 `export *` | 不变（`apps/local-host/src/index.ts` 222 行） |
| contracts 导出的运行时函数、类与常量 | 157 | 503（口径更宽：含 Schema 常量） |
| 只有占位描述的 contracts subpath | 6 | 6，见 §3 R-11 |
| 跨层依赖 | — | `boundary:check` 通过，兼容白名单 0 条；它守的是声明过的规则。按 `docs/system/PACKAGE-BOUNDARIES.md` 的层次重新数「向上」与「同层插件互引」，在分层一片里做 |

## 3. 体检报告附录 A 复核

| 编号 | 当时 | 开工时 | 初判 |
| --- | --- | --- | --- |
| R-01 | 7 个经 Runtime，19 个构建期组合 | 冻结名单 19 个（含 todo）；`project-host.ts` 26 处 `registerProvider` | 仍然成立 |
| R-02 | legacyMcp、LEGACY_* 没有退役条件 | `mcp-native-plugins.ts` 的 `legacyMcp`；`LEGACY_FUNCTIONS_MCP`、`LEGACY_GOALS_MCP` 仍在 catalog、server、event-identity 中使用。仓外消费者：Claude Code 里配置的 goalboard MCP（`molis_work_v1_*`） | 仍然成立；按授权直接删除，同步 Skill 与接入说明 |
| R-03 | 349 文件，3.7 万行 | 367 文件，42,714 行；18 个 `*-native-plugin-http.ts`，34 个 `*-actions.ts` | 仍然成立，还在增长 |
| R-04 | 旧助理 | `personal-assistant-` 只出现在审查 spec 的叙述里 | 已修复 |
| R-05 | README 三份 | `README.md`、`README.zh.md` | 已修复；内容待核 |
| R-07 | 工作台 27 个脚本约 1 万行；插件 18 个 client 约 1 万行；空 catch 126 处 | 工作台 32 个、14,032 行；插件 `client*` 26 个、13,086 行；空 catch 145 处 | 仍然成立，还在增长 |
| R-08 | 105 个 Error 类；escapeHtml 11 份；readBody 5 份 | Error 子类 116 个；escapeHtml 定义 28 处，另有 esc 类 14 处；readBody 6 处 | 仍然成立，还在增长 |
| R-09 | 每个 Home 至少 13 个 SQLite | QA Home 实数 30 个 Molis 自有库（不含侧栏浏览器 profile 的 5 个 Chrome 库） | 仍然成立 |
| R-10 | 184 份 spec | specs 根目录 12 个目录，其中 4 份是其他会话在做的 | 第一步已修；缺门禁 |
| R-11 | 6 个占位 subpath，总数 63 | 总数 66。只有占位描述、仓内没有使用者的 6 个：`modules/actions`、`modules/automation`、`modules/identity-team-access`、`modules/sync-replication`、`platform/exchange`、`platform/observability`。`platform/kernel`、`platform/testing` 各 1 个使用者，待查；`platform/plugin-builder` 有真实类型但没有 subpath 使用者，待查 | 仍然成立 |
| R-12 | `as unknown as` 138 处 | 236 处 | 仍然成立，还在增长 |
| R-14 | `.impeccable/` 约 1,000 个文件 | 1,067 个 | 仍然成立 |
| N-02 | 4 份 tgz | 4 份 | 仍然成立；删除要问用户 |
| N-07 | 二十多个工作树 | 27 个；本会话已清掉自己的 13 个 | 他人的待用户确认 |
| N-12 | 两套能力机制 | `HostCapabilityDefinition` 18 个源码文件；`registerCapability` 10 处；动作服务 `registerProvider` 45 处。`LocalHost.register()`（`apps/local-host/src/local-host.ts:121`）分两路：定义带 `action` 的交给 `ActionService.registerProvider`，与插件能力同一条路；不带的进 `CapabilityRegistry`，经 `LocalHost.invoke()` 调用，自带 `host_only` 可用性、提供方令牌与 `beforeEffect` 校验，是第二条路径 | 仍然成立。收敛方案：不带 `action` 的宿主能力也登记为动作（`host_only` 改成动作的可用性策略），删掉 `CapabilityRegistry` 直调分支，`LocalHost.invoke()` 改走动作服务 |
| N-13 | 没有格式化与静态检查 | 没有 lint/format 配置与脚本 | 仍然成立 |
| N-15 | 兼容逻辑大量存在 | 见 §4 | 仍然成立 |
| N-16 | 测试串行 | `scripts/run-tests.mjs` 仍用 `--test-concurrency=1` | 仍然成立 |
| N-19 | 版本策略缺失 | 73 个子包都是 0.0.0 | 仍然成立 |
| N-20 | 非 TS 不在检查里 | Rust 18、Swift 3、shell 7、Python 1 | 仍然成立 |
| N-03 | 平台记忆、放置落在横向服务 | 按 `docs/system/ARCHITECTURE.md` §3：Horizontal Service「保存 cursor、lease、retry 等技术状态，但不决定业务结果」。`horizontal/memory` 负责写入门与自动写入决策，`horizontal/placement` 记录对象与工作的业务关系，都属于 Module 的职责；`horizontal/search` 是索引技术服务，留在横向。架构文档 §2 还写着 `board_id` 的兼容说明，要随 §4.1 一起改 | 仍然成立；开工后给迁移方案 |
| 新 | 真实 Home 上同时跑着两个 Web | `~/.molis-work` 上有主检出的 4207（开发）与常驻服务 4173（安装版 0.2.0，LaunchAgent），两个版本差很多。`AGENTS.md` 的硬约束是「一个 Home 只有一个执行进程」；Agent 运行锁在两者之间仲裁（storage_busy 时轮流用） | 第二步升级真实 Home 时一并处理：同一 Home 只留一个常驻服务，其他入口转发给它；开发用隔离 Home |

其余条目（皮肤、Goals UI、Server、N-01、N-04～N-06、N-08～N-11、N-14、N-17、N-18、C 组）开工后逐项复核。

## 4. 兼容逻辑清单（§4.1，初稿）

从文件名就能看出是迁移、旧格式或兼容的文件，共 50 个：

- **宿主**：`catalog-migrations.ts`、`feed-migrations.ts`、`project-migrations.ts`、`session-migration.ts`、`pages-legacy-project.ts`；
- **Modules**：
  - `artifacts/migrations.ts`、`evidence-verification/migrations.ts`、`execution/migrations.ts`；
  - goals 的 `migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts`、`legacy-coverage.ts`；
  - governance 的 `migrations.ts`、`legacy-proposal-view.ts`；
  - `private-work-context/session-migration.ts`；
- **炼金术士**：10 个 SQL 迁移、`migrate.ts`、`pre-migration-backup.ts`、`legacy-actions.ts`；
- **测试与样本**：13 个；
- **tooling**：`tooling/migrations/` 三个文件，以及兼容白名单 `tooling/boundaries/compatibility-allowlist.json`。

此外：

- `board_id` 出现在 269 个源码文件、335 个测试文件里；建库语句里有 91 处 `board_id TEXT` 列。最多的是宿主 75 个文件、goals 模块 35、Goals 插件 32、contracts 19、Feed 14。按 `docs/system/ARCHITECTURE.md` §2，新项目两者同值，`board_id` 只为旧 V1 库保留。方案：与各库的基线重写同一片做，列与合同字段统一成 `project_id`，合同里的 `board_id` 字段删除，不留别名；
- 源码里提到旧产品名 GoalBoard 的有 10 个文件；
- 0.1.x 根 SDK 出口、MCP 旧名与别名仍在。

源码（排除 tests/specs/docs/dist）里与兼容相关的标识：

| 标识 | 文件数 | 处数 |
| --- | --- | --- |
| `legacy` / `Legacy` | 158 / 101 | 449 / 304 |
| `compat` | 78 | 187 |
| `historical` | 48 | 82 |
| `backfill` | 11 | 15 |
| `v3Import` / `importV3` / `V3_` | 11 | 19 |
| `GoalBoard` / `goalboard` | 1 / 9 | 38 / 21 |

另有：0.1.x 根 SDK 出口 `apps/local-host/sdk/`（index、sdk-store、sdk-types）、`tsconfig.sdk.json`、根包 `exports["."]`。

这些标识里，有些是产品里的「历史」功能，例如时间线、版本、撤销记录，不算兼容。开工时逐项分类：删除，或写明保留理由。

### 4.0 按文件名找到的兼容文件：初判

依据 §4.1「要删除的」逐条对照（main 16879b22）：

| 文件 | 做什么 | 初判 |
| --- | --- | --- |
| 宿主 `catalog-migrations.ts`、`project-migrations.ts`、`feed-migrations.ts`、`session-migration.ts` | 在目录库、项目库上按序跑各 owner 的迁移；项目恢复时校验支持的 Goal schema | 删迁移链；每个库改为一份当前 schema 的建库代码加版本校验，版本不符明确拒绝 |
| 宿主 `pages-legacy-project.ts` | 为 Pages 旧项目读原目录 owner | 随「Pages 旧项目导入」一起删 |
| Modules：`artifacts`、`evidence-verification`、`execution`、`governance-collaboration` 的 `migrations.ts` | 各自的升级链 | 删；执行、证据、治理里只剩历史职责的部分按 §4.1 一并删 |
| Goals：`migrations.ts`、`event-workflow-migration.ts`、`guidance-migrations.ts`、`revision-migration.ts` | 事件工作流、指导、修订回填等升级 | 删，Goals 库只留当前建库语句 |
| Goals `legacy-coverage.ts` | V3 导入带来的覆盖账，注释写明「不是现行账本」 | 随 v3 看板导入一起删 |
| 治理 `legacy-proposal-view.ts` | 旧提案的只读投影 | 删 |
| `private-work-context/session-migration.ts` | 会话库升级 | 删 |
| 炼金术士 `migrations/001`～`010` 十个 SQL、`migrate.ts`、`pre-migration-backup.ts` | 按序迁移与迁移前备份 | 合成一份基线建库 SQL 带版本号；删迁移器与迁移前备份 |
| 炼金术士 `legacy-actions.ts` | 为旧动作保留的入口 | 删，调用方改用现行动作 |
| `tooling/migrations/audit-goal-lifecycle.mjs`、`audit-project-identity.mjs` 等 | 迁移审计脚本 | 删 |
| `tooling/boundaries/compatibility-allowlist.json` | 兼容白名单（现为 0 条） | 删，换成防回流门禁（§4.1「以后的规则」） |

测试与样本里的 13 个（历史 SQL 样本、迁移测试、读取兼容测试、旧名拒绝测试）随代码删除；只留「当前 schema 建库正确」和「拒绝版本不符的库」的测试。

### 4.1 库与就地补表

一个隔离 Home（QA Home，跑过一轮场景）里 Molis 自己的库共 30 个：

- 个人库 16 个：`{name}/{name}.db`，名单在 `packages/storage/src/home-sqlite.ts` 的 `PERSONAL_HOME_SQLITE_STORES`；
- 其他 Home 级库：`projects/catalog.db`、`assistant/assistant.db`、`sessions/sessions.db`、`placement/placement.db`、`agent-definitions/agent-definitions.db`、`characters/characters.sqlite`、`agent-runtime/.molis-runtime-owner.db`、`plugins/experiments/private.sqlite`；
- 每个项目一个 `projects/<id>/molis-work.db`；炼金术士每个项目一个 `alchemist/projects/<id>/studio.sqlite`；
- 锁库：`images` 的运行锁与 runner 库、`feed/secrets.lock.sqlite`。

建库代码里就地补旧表（main 16879b22，源码，不含测试）：

| 写法 | 处数 | 文件数 |
| --- | --- | --- |
| `ALTER TABLE` | 80 | 31 |
| `ensureSqliteColumn()`（缺列就加） | 35 | 7 |
| `PRAGMA table_info`（看列再决定） | 23 | 18 |
| `PRAGMA user_version` | 2 | 1 |

补得最多的文件：

- `modules/functions/src/store.ts` 12 处；
- `modules/goals/src/event-state-schema.ts` 9；
- `plugins/native/form/src/store.ts` 8；
- `modules/governance-collaboration/src/migrations.ts` 8；
- `pages/store.ts`、`goals/migrations.ts`、`execution/migrations.ts` 各 6。

版本记法不统一：`catalog_meta.schema_version`（项目目录）、`search_meta.schema`（搜索索引，不符就重建）、`user_version`（1 处），其余库没有版本，靠看列补列。

**方案**（开工后按库执行）：

1. 每个库只留一份当前 schema 的建库语句，删掉 `ALTER TABLE`、`ensureSqliteColumn` 与看列补列；
2. 统一一个版本记法：建库时写入当前版本；
3. 打开时版本不符就明确拒绝，报出库路径与期望版本，不就地升级；
4. 加门禁：源码里不再出现 `ALTER TABLE` 与 `ensureSqliteColumn`（测试夹具除外）。

搜索索引这种可以从权威数据重建的派生库，版本不符时重建，不算兼容。

**执行顺序**（每步一个 PR）：

1. `packages/storage` 加一个共用的打开函数，例如 `openBaselineSqlite(home, name, { version, schema })`：
   - 新库：执行基线建库语句，写入版本号（`PRAGMA user_version`）；
   - 版本相同：直接打开；
   - 版本不同：抛出明确的错误，带库路径、期望版本和处理办法，不就地升级。
2. 按库替换，每个库只留一份当前 schema。Home 级库的打开处（main 16879b22）：

   | 库 | 打开处 |
   | --- | --- |
   | `agent-definitions` | `apps/local-host/src/agent-definitions/agent-definitions.ts:315` |
   | `assistant`（助理与记忆宿主共用） | `assistant/assistant-http.ts:41`、`memory/memory-host.ts:256` |
   | `connectors` | `connector-authorization-status.ts`、`connector-connection-store.ts`、`connector-protocol-store.ts` |
   | `context-onboarding` | `context-onboarding-store.ts` |
   | `placement` | `placement-actions.ts` |
   | `functions` | `modules/functions/src/store.ts:460` |
   | 记忆账本 | `packages/storage/src/adapters/memory-ledger.ts` |
   | 搜索索引 | `text-search-index.ts`（派生库，不符就重建） |
   | 插件库 | cognia、dataset、form、images、jelly、lingguang、pages、ppt、todo、workflows 各自的 `src/store.ts` |

3. 项目库 `projects/<id>/molis-work.db` 由多个 Module 的建库语句经 `catalog-migrations`、`project-migrations` 依次组成，最后做：
   - 各 Module 只交出当前 schema；
   - 宿主一次建库、写版本；
   - 删掉迁移链与 `tooling/migrations/`。
4. 真实 Home（用户选「保留并升级」；2026-10-03 起的现状：旧成果表已删、常驻服务 4173 已停，见 §1）：
   1. 整份备份 `~/.molis-work`（10-03 已单独备份 18 个项目库，见 §7；升级前仍要整份备份一次）；
   2. 确认 4207 没在跑、4173 仍停着（10-03 起它没有旧成果表已不能用）；
   3. 用删除迁移代码之前的最新 main 打开一次，让每个库升到最新（新成果表、过程项表在这一步建出）；
   4. 用新代码在临时目录建一个基线库，逐表比对两者的表、列、索引、约束与版本号；
   5. 一致后才合入删除迁移代码的 PR；
   6. 合入后用新代码打开真实 Home，确认版本相符、不被拒绝；
   7. 4173 换成新版（重新安装或指向新构建）再启动，由用户决定时机。

真实 Home 要先按用户的决定备份、升级或重建，才能删兼容代码（§4.1「真实 Home 的安全」）。

## 5. 包级清单（§4.4）

开工后逐包填写：公共入口、负责与不负责、主要文件及各自的变化原因、放错位置的类和方法、重复实现、建议的移动。73 个包的 README 都有「开发要求」一节。

开工时的事实（main 16879b22，脚本统计）：「源文件」「行数」只算 `src/` 下的 `.ts/.mts`；「公开入口」是 `package.json` 的 `exports` 条数；「依赖内部包」「被依赖」只算仓内 workspace 包之间的运行时依赖。

| 包 | 源文件 | 行数 | 最大文件 | 公开入口 | 依赖内部包 | 被依赖 |
| --- | --- | --- | --- | --- | --- | --- |
| `apps/cli` | 5 | 186 | `command-dispatch.ts` 66 | 1 | 2 | 1 |
| `apps/desktop` | 11 | 1,209 | `capsule-shell.ts` 556 | 1 | 6 | 1 |
| `apps/local-host` | 367 | 43,086 | `assistant/assistant-service.ts` 2,700 | 1 | 66 | 2 |
| `apps/mcp` | 20 | 1,448 | `runtime-context-tools.ts` 162 | 1 | 2 | 1 |
| `apps/server` | 5 | 185 | `assets.ts` 75 | 1 | 7 | 0 |
| `apps/workbench` | 171 | 41,054 | `i18n/en.ts` 3,636 | 2 | 32 | 1 |
| `horizontal/agent-host` | 35 | 9,391 | `adapters/prologue-node.ts` 1,764 | 1 | 1 | 1 |
| `horizontal/connector-host` | 3 | 591 | `connection-store.ts` 345 | 1 | 1 | 1 |
| `horizontal/listener-host` | 1 | 757 | `index.ts` 757 | 1 | 1 | 1 |
| `horizontal/memory` | 5 | 1,641 | `service.ts` 1,419 | 1 | 1 | 1 |
| `horizontal/placement` | 1 | 480 | `index.ts` 480 | 1 | 1 | 1 |
| `horizontal/runtime-host` | 5 | 980 | `adapters/terminal-pty.ts` 424 | 1 | 1 | 2 |
| `horizontal/scheduler` | 1 | 573 | `index.ts` 573 | 1 | 2 | 1 |
| `horizontal/search` | 1 | 572 | `index.ts` 572 | 1 | 1 | 1 |
| `modules/artifacts` | 6 | 880 | `service.ts` 448 | 1 | 1 | 1 |
| `modules/attention-resumption` | 1 | 512 | `index.ts` 512 | 1 | 1 | 1 |
| `modules/characters` | 4 | 203 | `service.ts` 128 | 1 | 1 | 1 |
| `modules/context-ledger` | 4 | 288 | `service.ts` 102 | 1 | 1 | 1 |
| `modules/evidence-verification` | 6 | 827 | `locator.ts` 360 | 1 | 1 | 2 |
| `modules/execution` | 4 | 545 | `repository.ts` 273 | 1 | 1 | 2 |
| `modules/feed` | 3 | 1,004 | `index.ts` 922 | 1 | 2 | 1 |
| `modules/functions` | 9 | 1,896 | `store.ts` 1,030 | 1 | 2 | 1 |
| `modules/goals` | 49 | 11,193 | `event-facts.ts` 631 | 1 | 1 | 2 |
| `modules/governance-collaboration` | 16 | 1,908 | `goal-tree-records.ts` 220 | 1 | 1 | 1 |
| `modules/private-work-context` | 21 | 3,440 | `session-schema.ts` 401 | 1 | 1 | 1 |
| `modules/projects` | 6 | 1,246 | `repository.ts` 571 | 1 | 1 | 1 |
| `modules/shelf` | 11 | 2,652 | `store.ts` 1,176 | 1 | 2 | 2 |
| `modules/signals` | 1 | 380 | `index.ts` 380 | 1 | 1 | 1 |
| `modules/sources` | 1 | 483 | `index.ts` 483 | 1 | 1 | 1 |
| `packages/contracts` | 93 | 17,158 | `services/agent-host.ts` 1,736 | 66 | 0 | 72 |
| `packages/design-system` | 44 | 17,123 | `styles/craft-finish.ts` 2,245 | 1 | 1 | 22 |
| `packages/im-ui` | 11 | 1,401 | `browser/controller.ts` 966 | 1 | 2 | 3 |
| `packages/kernel` | 5 | 1,146 | `action-service.ts` 489 | 1 | 1 | 4 |
| `packages/plugin-runtime` | 19 | 4,672 | `index.ts` 912 | 1 | 1 | 3 |
| `packages/plugin-sandbox` | 8 | 726 | `runner.ts` 214 | 1 | 2 | 1 |
| `packages/plugin-sdk` | 2 | 203 | `index.ts` 186 | 1 | 1 | 8 |
| `packages/storage` | 12 | 2,115 | `adapters/file-secret-store.ts` 719 | 1 | 1 | 17 |
| `packages/test-kit` | 2 | 483 | `boundaries.ts` 456 | 1 | 1 | 0 |
| `packages/ui-host` | 4 | 441 | `client-lifecycle.ts` 152 | 1 | 1 | 2 |
| `plugins/native/alchemist` | 101 | 10,240 | `studio/server/db/pulse-repository.ts` 567 | 1 | 4 | 2 |
| `plugins/native/artifacts` | 14 | 1,298 | `browser-ui.ts` 195 | 1 | 2 | 2 |
| `plugins/native/characters` | 12 | 954 | `client.ts` 217 | 1 | 2 | 2 |
| `plugins/native/coding` | 57 | 10,840 | `client.ts` 1,656 | 1 | 2 | 2 |
| `plugins/native/cognia` | 16 | 702 | `store.ts` 145 | 1 | 3 | 2 |
| `plugins/native/dataset` | 16 | 2,018 | `client.ts` 694 | 1 | 3 | 2 |
| `plugins/native/diff` | 10 | 953 | `comparison.ts` 286 | 1 | 1 | 2 |
| `plugins/native/experiments` | 10 | 740 | `styles.ts` 164 | 1 | 1 | 2 |
| `plugins/native/feed` | 45 | 5,896 | `ui.ts` 702 | 1 | 2 | 3 |
| `plugins/native/files` | 16 | 1,176 | `actions.ts` 149 | 1 | 1 | 2 |
| `plugins/native/form` | 17 | 2,509 | `client.ts` 934 | 1 | 3 | 2 |
| `plugins/native/git` | 15 | 1,712 | `client.ts` 255 | 1 | 1 | 2 |
| `plugins/native/goals` | 157 | 16,247 | `event-document-client.ts` 733 | 1 | 4 | 4 |
| `plugins/native/images` | 14 | 1,506 | `client.ts` 454 | 1 | 4 | 2 |
| `plugins/native/inbox` | 13 | 1,019 | `ui.ts` 189 | 1 | 1 | 2 |
| `plugins/native/jelly` | 28 | 2,390 | `content.ts` 202 | 1 | 3 | 2 |
| `plugins/native/lingguang` | 14 | 1,785 | `client.ts` 645 | 1 | 3 | 2 |
| `plugins/native/pages` | 45 | 14,861 | `editor-browser.ts` 4,043 | 3 | 3 | 2 |
| `plugins/native/plugin-builder` | 35 | 4,906 | `agent-authoring.ts` 800 | 1 | 2 | 2 |
| `plugins/native/ppt` | 18 | 2,242 | `client.ts` 806 | 1 | 3 | 2 |
| `plugins/native/schedule` | 24 | 2,517 | `client.ts` 379 | 1 | 1 | 2 |
| `plugins/native/shelf` | 21 | 5,025 | `client.ts` 1,708 | 2 | 3 | 2 |
| `plugins/native/text-stats` | 6 | 372 | `core.ts` 105 | 1 | 1 | 2 |
| `plugins/native/todo` | 22 | 4,202 | `client.ts` 1,245 | 1 | 3 | 2 |
| `plugins/native/work` | 44 | 6,666 | `terminal/client.ts` 478 | 3 | 2 | 2 |
| `plugins/native/workflows` | 14 | 3,623 | `client.ts` 1,398 | 1 | 3 | 2 |
| `plugins/official-integrations/catalog` | 9 | 2,133 | `catalog.ts` 1,015 | 1 | 2 | 1 |
| `plugins/official-integrations/github` | 5 | 939 | `provider.ts` 586 | 1 | 2 | 1 |
| `plugins/official-integrations/gmail` | 12 | 3,009 | `provider.ts` 961 | 3 | 2 | 2 |
| `plugins/official-integrations/rss` | 6 | 1,246 | `catalog.ts` 540 | 2 | 2 | 2 |
| `plugins/official-integrations/web-query` | 1 | 55 | `index.ts` 55 | 1 | 2 | 0 |
| `plugins/official-integrations/youtube` | 2 | 138 | `channel.ts` 82 | 1 | 2 | 1 |
| `server` | 18 | 1,064 | `continuity/service.ts` 162 | 1 | 2 | 2 |
| `tooling/plugin-cli` | 8 | 329 | `sample-source.ts` 90 | 1 | 2 | 0 |

### 5.x 本轮补记的清单项（2026-10-03）

| 项 | 现状 | 证据 | 处理 |
| --- | --- | --- | --- |
| `apps/workbench/src/i18n/en.ts` 无引用的译文 | 约 1,489 条键在源码里找不到（全文件约 3,640 行），译文表一大半是死数据 | 脚本逐键在 `apps`、`plugins`、`packages`、`modules`、`horizontal`、`server`、`tooling`、`examples` 的源码里查找（排除 `dist`、`node_modules`）；抽查「官方连接方式」「计划与执行看板」「钉住预览」只在 `en.ts` 出现 | 死代码清理一片：删无引用的键，把动态拼出的文案改成常量后再删；健康门禁随之下调 |
| `tests/ppt-actions.e2e.test.ts` 下载竞态 | 读到 Chrome 先建的空文件就停，main 上 3 次 2 次失败 | A4b-3b 相关用例与基线对比 | 已修：[#214](https://github.com/molis-ai/molis-work/pull/214)（等文件写完再读，断言不变）。`tests/alchemist-workbench.e2e.test.ts` 读导出有同样写法，尚未见失败，留待测试稳定性一片一起改 |
| 演示稿对象的两套种类名 | PPT 的动作（`ppt.*`）声明 `subject_kinds: ["ppt"]`，对象读取、搬动、搜索、侧栏与成果来源用 `presentation` | `plugins/native/ppt/src/actions.ts`（`subject_kinds: ["ppt"]`）对 `search.ts`、`defineObjectMoveAction("ppt.placement.move", ["presentation"])` | 统一成 `presentation`；改动方的发现与授权都按种类匹配，要连同读它的用例一起改 |

## 5a. 门禁先行（§5 第 1 步，方案）

先接进 CI、防止边整理边恶化。每个门禁都有入库的基线文件，「只减不增」；改动后用突变验证（故意违反一次，确认 CI 变红）。

| 门禁 | 机制 | 基线 | 突变验证 |
| --- | --- | --- | --- |
| 静态检查最小规则集 | ESLint（或 Biome）只开几条：无未用变量与导入、无空 catch（显式注释的除外）、无 `as unknown as`（现有处数进基线） | `tooling/gates/lint-baseline.json` | 新增一处空 catch |
| 公开 API 快照 | 插件 SDK、contracts 各 subpath 的导出清单生成文件入库；导出一变就要显式更新快照，PR 里说明兼容影响 | `tooling/gates/api/*.txt` | 新增一个导出不更新快照 |
| 巨大单元只减不增 | 按 §4.5 阈值（文件 800 行、类 300 行或 25 个方法、函数 150 行）统计，超出的列名单 | `tooling/gates/giant-units.json`（开工时 37 个文件、43 个类、99 个函数） | 新增一个 160 行函数 |
| 装配名单只减不增 | 已有 `tests/builtin-plugin-assembly-gate.test.ts`，接进 CI | 冻结名单 | 加回一个 `*-native-plugin-http.ts` |
| 分层与依赖方向 | 已有 `pnpm boundary:check`，按 `PACKAGE-BOUNDARIES.md` 补上「向上依赖」与「插件互引」的统计 | 现有规则 | 插件 import 另一插件 |
| 测试不新增内部引用 | 统计测试里 `../<区>/*/src/` 与 `dist/` 的引用处数，只减不增 | 开工时 959 + 34 处 | 新增一处内部引用 |
| vendored 包数量 | `vendor/prologue-sdk/*.tgz` 不超过 2 份 | #170 合入后 1 份 | 放回一份旧包 |
| spec 状态句与根目录 | `specs/` 根目录每份都有状态句；只许在做的与现行规范 | 当前根目录 | 新建一份没有状态句的 spec |
| 兼容逻辑不回流 | 源码不再出现 `ALTER TABLE`、`ensureSqliteColumn`、旧产品名与兼容标记（建库基线与允许名单除外） | 删兼容后为 0 | 加一处 `ALTER TABLE` |
| 独立整页（artifact-positioning S7） | 除例外清单外没有路由返回完整 HTML；插件内容里不出现自带外壳；站内链接不跳出工作台 | [artifact-positioning §4](../artifact-positioning/spec.md) | 加一个返回整页的路由 |
| 成果库声明（artifact-positioning A7） | manifest 声明与实际写入一致；可见类型必须有预览；交换数据不进用户可见列表 | 同上 | 写一个未声明的类型 |

**进度**：

- 第一批已做：[#179](https://github.com/molis-ai/molis-work/pull/179)，`pnpm health:check`，接进 CI。覆盖巨大单元、测试内部引用、vendored SDK 份数、就地补表、spec 状态句。
- 开工基线（main 2b138559）：巨大单元 182（文件 37、类 48、函数 97），测试内部引用 1016，vendored SDK 1，就地补表 115。
- 突变验证四项都失败。
- 实例：基线若从 98984bf7 起算，#171 会被拦下。它让 `events-primary.ts`、`navigation-feed.ts`、`craft-finish.ts` 三个超长文件又变长，并新增 2 处测试内部引用。
- 静态检查规则集与公开 API 快照放下一批：要加 ESLint 依赖或生成 `.d.ts` 清单。

CI 目前只跑边界、类型、合同与炼金术士（`.github/workflows/ci.yml`）；以上门禁都以非浏览器用例或脚本形式加到 `architecture-boundaries` 作业里，时间预算 3 分钟以内。

## 6. 安全不变量（§4.18，初稿）

开工后逐条补上守住它的测试（要求断言「拒绝」本身），没有的补写。

| 不变量 | 代码位置（main 16879b22） | 守住的测试 |
| --- | --- | --- |
| Web 只绑回环地址 | `apps/desktop/launchers/web/server.ts:52` | 待确认 |
| 变更请求要控制令牌、同源 Origin、一次性操作键 | `apps/local-host/src/web-http.ts` 的 `authorizeLocalWebRequest` | `tests/action-gateway.test.ts` 等，待逐条确认 |
| 跨进程动作网关只接受回环 http，不带账号、密码与查询串 | `apps/local-host/src/action-gateway.ts:16` | 待确认 |
| MCP 逐客户端授权 | `apps/local-host/src/mcp-action-client.ts` 的 `authorizeMcpActions` | 待确认 |
| 插件权限与沙箱 | Plugin Runtime 的权限与网络策略 | `tests/installed-plugin-policy.test.ts`、`agent-built-plugins-network.test.ts`，待确认 |
| 密钥只给引用 | 连接存储与密钥库 | 待确认 |
| 侧栏浏览器与 Computer Use 的站点策略与逐步确认 | Prologue `surface-act` 闸门；Molis 侧 `prologue-surfaces.ts` | `tests/side-panel-*`，待确认 |
| 网页与记忆内容的提示注入防护 | Prologue 以 `<untrusted-page-content>` 交给模型 | 待确认 |
| 外部输入的路径与 URL 校验 | 见下 | 待确认 |

「是不是本机地址」的判断在源码里至少各写了一份：

- `action-gateway.ts:16`；
- `browser/browser-socket.ts:19`；
- `configured-models.ts:45`；
- `connector-api-oauth.ts:32`；
- `connector-mcp.ts:105`、`:136`；
- `im-server.ts:39`；
- `web-http.ts:32`。

允许的写法也不一样（有的认 `localhost`，有的只认 IP）。这一条并入 R-08 的重复实现，收成一个共用判断。

## 7. 需要用户操作的事项

- **常驻服务 4173 要装新版**：10-03 已停（`launchctl bootout gui/<uid>/com.adeptify.goalboard.web`，plist 未改）。它是安装版 0.2.0，读写已删除的旧成果表，不能再用；装新版或改指向新构建后，用 `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.adeptify.goalboard.web.plist` 启动。
- **旧成果表的备份**：`~/.molis-work-backups/2026-10-03-drop-old-artifact-tables/`（18 个项目库，148 MB，逐个 `integrity_check` 通过、行数与删除前一致）。确认不再需要后由用户删除。
- ~~**anti-rot**~~：已于 10-03 删除（工作树、本地与远端分支，见 §1），不再需要用户操作。
- **#192–#215 合入后留下的远端分支**（24 条，GitHub 上 Branches 页删除）：`docs/artifact-positioning-progress`、`fix/shell-s6-settings-in-workbench`、`docs/archive-post-merge-review`、`fix/shell-s6b-capabilities-in-workbench`、`chore/shell-s7-page-gates`、`fix/shell-s4-studio-in-workbench`、`fix/shell-s1b-drop-old-builder`、`docs/artifact-positioning-s4-s1b`、`fix/artifact-a6-naming-and-feed-manifest`、`feat/artifact-a2-process-items`、`feat/artifact-a1-contract`、`feat/artifact-a3-import-in-library`、`feat/artifact-a4-consumers`、`feat/artifact-a5-goal-delivery`、`fix/test-functions-harness-host`、`feat/artifact-a5b-pin-deliverables`、`feat/artifact-a5c-deliverable-proposals`、`feat/artifact-a7-declaration-gates`、`feat/artifact-a4b-source-and-references`、`feat/pages-import-entry-back`、`feat/artifact-a4b2-goal-inputs`、`feat/artifact-a4b3-continue-and-side`、`fix/test-ppt-download-race`、`feat/artifact-a4b3b-continue`；以及之后合入的本目标分支。
- 删除已合入的远端分支（自动模式拦下了我执行的删除）：`docs/spec-sweep`、`fix/onboarding-blank-name`、`fix/global-links-in-project`、`feat/one-attention-bell`、`feat/characters-settings-only`、`fix/contextual-live-region`、`test/baseline-timing-defects`、`fix/todo-project-search`、`fix/open-plugin-link`、`fix/jelly-assistant-refresh`、`fix/assistant-undo-refresh`、`fix/narrow-stage-side-panel`、`fix/assistant-claimed-save`、`fix/pages-writing-faithful`、`feat/one-idea-inbox`、`fix/open-plugin-enabled-only`、`fix/todo-search-plain-fields`、`fix/side-browser-stop-revoke`、`fix/button-guard-same-sentence`、`fix/side-browser-wait-no-ask`、`fix/assistant-origin-name`、`fix/builder-model-call-limit`、`fix/test-pages-publication-narrow`，以及他人的 `feature/project-arrival-flow`（#159）、`claude/nostalgic-engelbart-93e407`（#164）。也可以在仓库设置里打开「合并后自动删除分支」。

## 8. 未验证的范围

尚未开工，暂无。
