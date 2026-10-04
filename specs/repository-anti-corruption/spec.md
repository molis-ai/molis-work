# 系统性代码与架构防腐整理

状态：main 自检已完成（§9，2026-10-03～04）：全量 3,758 个用例 2 个失败，都是本轮新发现、已修（#220、#221），第一步与成果库改造修过的问题没有复发；第一步问题表 5 条状态已更正。成果库补漏（§9.4 第 10–12 条）已收尾。另一会话复查的九条（§9.5）基本做完：#234、#236–#242 已合入，#243、#244、#246 第二批全量通过、排队合入；第三批（需求覆盖账本、成果作插件输入 #247、Casebook 改名 #248、PMR-12 守护 #249）在跑全量。之后按 §5a 门禁先行，开工结构性改动。第一步已完成并归档；同一目标里用户追加的「Artifact 定位与统一外壳」见 [artifact-positioning](../artifact-positioning/spec.md)。

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
| 2026-10-03 | 场景 9：拷贝真实 Home 用当前 main 打开（弹窗） | 拷到会话临时目录验证（推荐）；等 4173 装新版时一起做；不做 | 拷到会话临时目录验证 | 先确认 4207 没在写，再把 `~/.molis-work` 拷到会话临时目录；用当前 main 在别的端口、文件密钥后端打开这份拷贝走一遍；不碰原 Home、不调模型，做完删拷贝。结果记在 §9.4 第 12 条 |
| 2026-10-04 | 内置插件安装停在旧版本，删「可从旧版本升级」名单前怎么办（弹窗） | 内置插件随宿主升级（推荐）；在插件市场里逐个确认升级；先不删名单 | 内置插件随宿主升级 | 随宿主发布的内置插件（监督器名单里标 `bundled`）启动时把安装记录升到宿主的版本：保留新 Manifest 仍声明的授权、补上它要求的授权，与新装一致；不再恢复旧发行物。第三方与生成的插件不变 |
| 2026-10-04 | 没配模型目录时的文字补全兜底（§9.5 第 7 条，弹窗） | 只删旧凭据，环境变量留作开发配置（推荐）；全删，只认模型目录；先不动 | 只删旧凭据，环境变量留作开发配置 | 删掉读 `model:text:api_key` 和导入「文本补全 · 原有密钥」。`MOLIS_WORK_TEXT_*` 与 `MINIMAX_API_KEY` 只作开发与测试的显式配置，写进手册。通用的 `MOLIS_WORK_TEXT_API_KEY` 不再默认成 MiniMax。产品里只有模型目录配置模型 |
| 2026-10-04 | V3 一次性导入（§9.5 第 6 条附带，弹窗）：早先独立仓库规格特意保留的产品入口（BL-083） | 删掉导入全链（推荐）；保留导入 | 删掉导入全链 | 删 CLI `import-v3`、管理 MCP `import_v3`、宿主能力、Goals 动作与导入实现，BL-083 关闭。只有导入会写的覆盖账本随后单独删。身份修复与之无关，已先做 |
| 2026-10-04 | 删两处兼容前是否只读核对真实 Home（弹窗） | 只读核对后再删（推荐）；不核对直接删；两处都先保留 | 只读核对后再删 | ② 密钥库：只按格式核对 `feed/secrets.json`（不解密、不输出内容），格式 2、keychain+aes-gcm，27 条全是 AES-GCM，没有 v0.3 信封，可以删。① 会话执行者：执行时发现执行者存在 Prologue 的加密记录里，核对要用真实 Home 的存储密钥在内存里解开会话索引，超出弹窗里说的「拷单个文件只读统计」，没有动手，改为再问（下一行） |
| 2026-10-04 | 会话执行者核对要解密，怎么办（更正后再问，弹窗） | 在拷贝上解密索引只数条数（推荐）；不核对，保留这处兼容；不核对，直接删 | 不核对，直接删 | 删 `legacyActorId`，会话的执行者改为必填；没写执行者的很早的旧会话，插件读不到（用户已知） |
| 2026-10-04 | Casebook 对外合同的旧名（待决 6，弹窗） | 改成 Molis Work 的名字（推荐）；保持旧名列入例外；等外部插件下次改版 | 改成 Molis Work 的名字 | `goalboard.casebook.*` 改为 `molis-work.casebook.*`，Schema `$id` 改到 `https://molis-work.dev/contracts/casebook/...`（与已归档的 Casebook v1 合同同一写法），用户动作签名的域名串一并改；不留旧名别名。外部 Casebook 插件要同步，PR 里列出全部新旧 id |
| 2026-10-04 | 真实 Home 的库（用户在对话里说 "you can touch the database"） | — | 授权动真实 Home 的库 | 用于 §4.1「每个库一份当前 schema 加版本」：按 10-02 的「保留并升级」执行。先整份备份 `~/.molis-work`，确认 4207、4208、4173 都没在跑；每一步先在拷贝上演练、核对，再动原库；只写结构版本号（`PRAGMA user_version`），不改表和数据 |

**待决（开工后攒批弹窗问）**：

1. ~~真实 Home 的处理~~：已定，见上表（同事没有要保留的 Home）。已知：`~/.molis-work`，主检出上的 4207 与常驻服务 4173（LaunchAgent `com.adeptify.goalboard.web`，安装版 0.2.0）都用它；`~/.goalboard` 是指向它的符号链接，不是另一个 Home；4208 开工核对时没有在监听。
2. ~~插件升级声明的机制~~：已定，见上表。
3. ~~共享核心的评审方式~~：已定，见上表。
4. ~~vendored 私有包~~：已定，见上表。
5. ~~他人的工作树与分支~~：已定，见上表；保留 Codex 工作树 d62d（1,173 个未提交文件）、side-shelf（未审阅的 spec 草稿）、anti-rot（本目标的任务书）、plugin-picker-pins（在做）。
6. ~~Casebook 外部合同的旧名~~：已定（10-04，见上表）。原记录：`apps/local-host/src/casebook/` 里的 `contract_id` 都是 `goalboard.casebook.*`，JSON Schema 的 `$id` 在 `goalboard.dev` 下。外部 Casebook 插件按这些 id 对接，改名是合同变化，要外部插件同步（§4.1「旧身份与旧名称」）。源码里其余的 `GoalBoard`（如 `project-capabilities.ts` 的 `checkGoalBoard`）只是内部命名，随 `board_id` 合并一起改。

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

## 9. main 自检（2026-10-03，main aef917dc）

第二步结构性改动的起点。按用户 10-03 的要求：任务书合入 main 后，逐条复核第一步与成果库改造修过的问题在最新 main 上仍然成立，再对照四份任务要求逐项标出已覆盖、本轮新发现、不适用（第二步还没做的标「待做」并指到本文的计划）。

**方法**：

- 最新 main（aef917dc，含 #219）整体构建后跑全量回归（738 个用例文件），作为本阶段证据，也一次跑过下面每一条的守护用例；
- 守护用例取自每个修复 PR 改动的测试文件（`gh pr view <N> --json files`）；已删除的用例逐个核对去向；
- 「交第二步」与「待决」的条目，用命令在 main 上重新量；
- 界面上的条目以 10-03 的隔离 Home 走查为准（[artifact-positioning §5b](../artifact-positioning/spec.md)）。

### 9.1 回归自检

**全量回归**：3,758 个用例：3,749 通过、2 失败、7 跳过（main aef917dc，10-03 10:47 起）。两个失败都不是旧问题复发，是本轮新发现，都在干净的 main 上复现（3/3 与必现），已修：见 9.4 第 1、2 条（#220、#221）。没有一条第一步或成果库改造修过的问题复发。

**第一步问题表（PMR）**

| 编号 | 当时的处理 | 复核结论 | 证据 |
| --- | --- | --- | --- |
| PMR-01 | 已修 #138 | 未复发 | `context-onboarding-blank.e2e`（全量通过） |
| PMR-02 | 已修 #140 | 未复发 | `announce-guard`、`plugin-notification-bell`、`plugin-event-recovery.e2e`（全量通过） |
| PMR-03 | 已修 #141 | 未复发 | `characters-appearance`、`creative-tools-plugins`（全量通过） |
| PMR-04 | 交第二步 | 状态准确：仍有 38 个重复键（共 3,517 个）；另查出约 1,489 个无引用的键（9.4 #1） | 逐键统计脚本，见 9.3 |
| PMR-05 | 交第二步 | 状态准确：`migrateLegacy` 仍在（15 处） | `git grep -c migrateLegacy` |
| PMR-06 | 交第二步 | **已不成立**：#170 删了 3 份未用的包，vendored 只剩 `side-panel-memory.tgz`；状态改为「已修（#170）」 | `ls vendor/prologue-sdk/*.tgz` |
| PMR-07 | 核实中 | **状态不准**：归档 spec §12.2 已量过（首屏 293 KB HTML、6,041 个节点），处理在第二步「浏览器脚本打包、按需渲染」；状态改为「已量，交第二步」，本轮重量见 9.3 | 9.3 首屏体量 |
| PMR-08 | 交第二步 | 状态准确：`#decision-goal-` 2 处、`feed-start=1` 1 处仍在 | `git grep` |
| PMR-09 | 交第二步 | 状态准确：`scripts/personal-assistant-public-sources.mts` 仍在 | `ls` |
| PMR-10 | 已修 #139 | 未复发 | `project-page-links`（全量通过） |
| PMR-11 | 已关闭 | 不适用 | — |
| PMR-12 | 核实中 | **状态不准**：助理会话 9-30 已修（c48a8608，在 main）：左栏看不到时对话顶部一行给出状态与暂停、继续、停止；抽屉开着时点对话区先收起抽屉。当时用替身在 800、1440 核对，**没有自动守护用例**（9.4 #9） | `git merge-base --is-ancestor c48a8608 main`；`assistant-dock.ts` 的 `data-assistant-strip` |
| PMR-13 | 已关闭 | 不适用 | — |
| PMR-14 | 交第二步 | 状态准确：`assistant-island.ts` 仍是 `L("正在看") + "："` | `git grep` |
| PMR-15 | 已定，交第二步 | 状态准确：BL-088 未做 | `tests/builtin-plugin-assembly-gate.test.ts` 名单未减 |
| PMR-16 | 已修 #144 | 未复发 | `system-search`、`todo-actions`（全量通过） |
| PMR-17 | 已关闭（未复现） | 不适用；第二步重跑场景 1 时留意 | — |
| PMR-18 | 已修 #146 | 未复发 | `jelly-outside-changes.e2e`（全量通过） |
| PMR-19 | 已修 #151 | 未复发 | `assistant-business-gateway`、`announce-guard`（全量通过） |
| PMR-20 | 已修 #145 | 未复发 | `context-onboarding-todo.e2e`（全量通过） |
| PMR-21 | 已修 #148 | 未复发 | `assistant-undo-refresh.e2e`、`assistant-undo`（全量通过） |
| PMR-22 | 已修 #153 | 未复发；`jelly-material` 随灵感页一起删除 | `jelly-*` 其余用例（全量通过） |
| PMR-23 | 已修 #149 | 未复发 | `side-panel-narrow-stage.e2e`（全量通过） |
| PMR-24 | 已修 #152 | 未复发（提示词 v2 仍在）；真实模型回放不在全量里，未重跑 | `pages-plugin`（全量通过） |
| PMR-25 | 已修 #154 | 未复发 | `open-plugin-link.e2e`（全量通过） |
| PMR-26 | 已修 #155 | 未复发 | `todo-actions`（全量通过） |
| PMR-27 | 已修 #157 | 未复发 | `side-panel-assistant-surface`（#157 加的 3 条，全量通过） |
| PMR-28 | 已修 #158 | 未复发 | `assistant-business-gateway` 反例（全量通过） |
| PMR-29 | 已修 #160 | 未复发 | `side-panel-assistant-surface`（全量通过） |
| PMR-30 | 交 BACKLOG | 状态准确 | BACKLOG |
| PMR-31 | 已修 #162 | 未复发 | `assistant-origin-name.e2e`（全量通过） |
| PMR-32 | 交 BACKLOG（BL-104） | 状态准确 | BACKLOG |
| PMR-33 | 已修 #163 | 未复发 | `agent-built-plugins-agent`（全量通过） |
| PMR-34 | 修复中（#172） | **状态不准**：#172 已合入（35257cd9），应为「已修」 | `plugin-builder-stage.e2e`（全量通过） |
| PMR-35 | 修复中（#182） | **状态不准**：#182 已合入（141f6cef），应为「已修」 | `agent-built-plugins-agent`（#182 加的重叠保存用例，全量通过） |
| PMR-36 | 交后续（BL-113） | 状态准确 | BACKLOG |

**第一步合并缺陷（§4）**

| 项 | 复核结论 | 证据 |
| --- | --- | --- |
| 冲突标记 | 仍无 | `git grep` 除 Markdown 与锁文件外 0 处 |
| `en.ts` 重复键（PMR-04） | 仍然成立，交第二步 | 38 个键重复（共 3,517 个） |
| Prologue SDK 合成包 | 已收：vendored 只剩一份 `side-panel-memory.tgz`（#170 删了 3 份） | `ls vendor/prologue-sdk/*.tgz` |

**成果库改造（S1–S7、A1–A7、A4b、走查）**

| 片 | 守住它的用例 | 复核结论 |
| --- | --- | --- |
| S1 删独立工作区、演示记录（#176） | `shell-page-gate`；`plugin-page-workspace` 随功能删除 | 未复发：`renderPluginPageWorkspace` 0 处 |
| S1b 删旧创作台（#198） | `agent-studio.e2e`、`plugin-builder-stage.e2e`；旧创作台用例随功能删除 | 未复发：`/plugin-builder` 整页路由 0 处 |
| S2 直达链接打开工作台（#177） | `shell-direct-links.e2e`、`shell-page-gate` | 未复发 |
| S3 沙箱框只在工作台里（#186） | `plugin-builder-stage.e2e`、`agent-plugin-identity` | 未复发 |
| S4 创作台去框（#197） | `agent-studio.e2e`、`plugin-builder-stage.e2e` | 未复发 |
| S5 文件在工作台里预览（#187） | `shell-file-preview.e2e`、`artifact-reference-ui` | 未复发 |
| S6、S6b 设置与能力库进工作台（#193、#195） | `settings-direct-access`、`capabilities-in-settings.e2e`、`project-settings-*.e2e`、`functions-draft-retention`（#206 补了用例装配） | 未复发 |
| S7 整页门禁（#196） | `shell-page-gate`（CI 里跑） | 未复发 |
| A1 合同（#202） | `artifacts-module`、`artifact-subject-context`、`artifact-browser` | 未复发 |
| A2 交换数据迁回 owner（#201） | `artifact-type-gate`、`coding-artifacts` 等 Coding 用例 | 未复发 |
| A3 导入只在成果库（#203）；Pages 恢复自己的导入（#211） | `artifact-document-import`、`artifacts-actions-browser`、`pages-import-entry.e2e` | 未复发：`/artifacts/import` 整页 0 处（只剩 `POST /api/artifacts/import`） |
| A4a owner 预览（#204） | `artifact-browser`、`artifact-type-gate`、Forms/PPT/Dataset 的 MCP 用例 | 未复发 |
| A4b-1 原文已改、被谁引用（#210） | `artifact-source-and-links` | 未复发 |
| A4b-2 作为 Goal 的输入（#212） | `goal-artifact-inputs`、`artifact-goal-input.e2e` | 未复发 |
| A4b-3a、3b 从这一版继续、侧栏预览（#213、#215） | `artifact-continue`、`artifact-continue.e2e`、`side-files-artifacts`、`artifact-type-gate` | 未复发 |
| A5a、A5b、A5c Goal 交付、当场固定、提议（#205、#207、#208） | `goal-deliverables`、`goal-deliverable-proposals`、`goal-event-document.e2e`、`goal-events-state` | 未复发 |
| A6 命名与 Feed 声明（#200） | `artifact-browser`、`immersive-workbench.e2e`、`plugin-declarative-mounting` | 未复发 |
| A7 声明门禁（#209） | `artifact-declaration-gate`、`artifact-type-gate`（CI 里跑） | 未复发 |
| 走查发现（#217、#219） | `pin-toast-opens-version.e2e`、`artifact-walkthrough.e2e`（1440、390） | 未复发 |
| 用例缺陷（#206、#214） | `functions-draft-retention`、`ppt-actions.e2e` | 未复发 |

**已删除的守护用例**：`plugin-page-workspace.test.ts`（S1 删了独立工作区）、`plugin-builder-{browser,visual}.e2e`、`plugin-builder-{presentation,publication,runtime,workflow}.test.ts`（S1b 删了旧创作台）、`jelly-material.test.ts`（PMR-22 自己的修复 #153 去掉了 Jelly 灵感）。都是随被删的功能一起删，没有丢失守护。

### 9.2 对照任务要求的补查

**第一步任务书（main 上的新版）**：新版比归档时的旧版多两条要求——

1. 「本步的修复不新增任何兼容或迁移逻辑」：已覆盖。第一步的修复 PR（#137–#185）里只有 #176 动了带 legacy 字样的文件，且是删除（`legacy-actions.ts` −33 行、`alchemist-legacy.ts` −14 行）。成果库改造的 A1、A2 新表写进现有的建库语句，没有新增迁移步骤。
2. 场景 9 改为「拷贝一份我（以及同事）正在用的 Home，用当前 main 打开，看能不能正常用」：**未做**，涉及真实 Home 的拷贝，要用户同意（见 §1 待决）。10-03 已经删了真实 Home 的旧成果表、停了 4173，用当前 main 打开时成果库从空开始。

其余各节的完成标准见第一步归档 spec §13.1，复核结论同上表。

**第二步任务书**：

| 节 | 结论 | 指向 |
| --- | --- | --- |
| §3 先量化现状 | 已量（10-02），本节 9.3 重量 | §2、§9.3 |
| §4.1 清除兼容逻辑 | 待做；清单初稿与真实 Home 的步骤已有 | §4（真实 Home 步骤 10-03 重写） |
| §4.2 调用链文档 | 待做 | — |
| §4.3 分层与边界 | 待做；已知问题已登记 | §3 N-03、N-12 |
| §4.4 包级清单 | 初稿 | §5 |
| §4.5 巨大单元 | 门禁已接（只减不增，181 个）；拆分待做 | `tooling/gates/baseline.json` |
| §4.6 扩展点与插件平台 | 待做；装配名单冻结 19 个、未减少 | `tests/builtin-plugin-assembly-gate.test.ts` |
| §4.7 多人并行 | 待做；CODEOWNERS 用户 10-02 已定要加，尚未加；`docs/system/PARALLEL-DEVELOPMENT.md` 不存在 | §1 |
| §4.8 改需求的便利 | 待做 | — |
| §4.9 体检报告逐项闭环 | 进行中 | §3、§9.3 |
| §4.10 新合同全链路 | 部分：成果库的预览、固定、比较、继续协议都有门禁与用例；其余合同待做 | artifact-positioning A4–A7 |
| §4.11 数据与可靠性 | 待做；真实 Home 旧成果表已删 | §1 |
| §4.12 卫生与文档 | 部分：vendored 已收到一份；`MIGRATION.md` 未归档；工作树清理按用户决定做了一部分 | §7 |
| §4.13 门禁 | 第一批已接（健康门禁、整页门禁、成果类型与声明门禁）；静态检查、API 快照、页面资源预算待做 | §5a |
| §4.14 手册与 Skill | 部分：插件开发 Skill 写明了成果类型的 title、preview、pin、compare、continue | `skills/molis-plugin-dev/elements.md` |
| §4.15 术语表 | 待做 | — |
| §4.16 静态检查 | 待做：仓库没有 lint/format 脚本 | `package.json` |
| §4.17 依赖与 SDK | 待做 | — |
| §4.18 安全不变量 | 初稿 | §6 |
| §4.19 C 端就绪方案 | 待做 | — |

**仓库系统整理要求（15 节）**：§1、§2 已覆盖（第一步 spec §1、§7）；§9 前端动线：壳子 S1–S7 与成果库走查覆盖了「插件不出整页、直达打开工作台、对话框与侧栏在工作台里」，其余页面的质感审查待做；§12 测试与预期对齐：第一步回归基线与本轮的 #206、#214（用例装配与下载竞态）覆盖了已发现的，系统性审查待做；§13 Prologue AI 手册与 Skill 已有（`docs/platform/PROLOGUE-AI.md`、`skills/molis-prologue-ai/SKILL.md`），与当前代码的一致性待第二步 §4.14 复核；§3–§8、§10、§11、§14、§15 归第二步，见上表。

**体检报告**：附录 A 的数字见 9.3；§5 的防腐顺序与第二步 §5 相同，第一步「门禁先行」已开始（第一批），其余未开始；§7.5 对在途线的建议：在途线都已合入或删除（见第一步 §13），不再适用。

### 9.3 重新量（main aef917dc，与 10-02 开工时对比）

| 项 | 10-02 | 10-03 | 口径 |
| --- | --- | --- | --- |
| 构建期装配的内置插件（R-01） | 19 | 19 | `tests/builtin-plugin-assembly-gate.test.ts` 冻结名单；`project-host.ts` 的 `registerProvider` 26 处 |
| 宿主 `apps/local-host/src`（R-03） | 367 文件、42,714 行 | 369 文件、42,787 行 | `git ls-files` 的 `.ts`；`*-native-plugin-http.ts` 18 个、`*-actions.ts` 34 个，未变 |
| 工作台客户端脚本（R-07） | 32 个、14,032 行 | 33 个、14,469 行 | `apps/workbench/src/scripts/client/*.ts` |
| 插件客户端（R-07） | 26 个、13,086 行 | 25 个、12,842 行 | `plugins/native/*/src/client*.ts` |
| 空 `catch` | 145 | 142 | 源码（不含测试） |
| `Error` 子类（R-08） | 116 | 112 | 同上 |
| `as unknown as`（R-12） | 236 | 236（源码 154、测试 82） | 含测试 |
| `.impeccable/` 入库文件（R-14） | 1,067 | 1,085 | `git ls-files` |
| vendored Prologue 包（N-02） | 4 | 1 | `vendor/prologue-sdk/*.tgz` |
| 旧能力注册（N-12） | 18 个文件、10 处 | 18 个文件、11 处 | `HostCapabilityDefinition` 文件数、`registerCapability` 处数 |
| 巨大单元（健康门禁） | 181 | 181 | `pnpm health:check` |
| 测试引用包内部 | 979 | 979 | 同上 |
| `en.ts` 无引用的键 | — | 约 1,489 | 逐键查源码，见 §5.x |

宿主与工作台客户端仍在小幅增长（成果库改造新增了比较、继续、作为输入等入口），第二步「声明代替名单」与「浏览器脚本打包」要先做。

### 9.4 本轮新发现与处理

| # | 发现 | 处理 |
| --- | --- | --- |
| 1 | 全量回归的失败①：`project-home-start` 的首页快捷方式用例在 main 上 3/3 失败。S7（#196）让站内地址不开第二个标签页，用例仍期望开新标签页；预期变化没随改，当时相关用例集漏了它 | 已修：[#220](https://github.com/molis-ai/molis-work/pull/220)（f7d7f1ec），用例改为断言在本页打开、没有第二个标签页，其余断言全部保留 |
| 2 | 全量回归的失败②：`soft-workbench-refinement` 的字号刻度。成果库导入浮层的标题 18px、结果 16px、提醒 14px 不在刻度上，来自 A3（#203） | 已修：[#221](https://github.com/molis-ai/molis-work/pull/221)（61b805a7） |
| 3 | 第一步问题表有 5 条状态与事实不符：PMR-06（#170 已删旧包）、PMR-07（已量过）、PMR-12（9-30 已修）、PMR-34（#172 已合）、PMR-35（#182 已合） | 本 PR 在归档 spec 里更正，注明「10-03 main 自检更正」 |
| 4 | PMR-12 的修复（c48a8608）没有自动守护用例，只在当时用替身核对过 | 第二步补用例：800 宽、左栏收起时，暂停与等确认两种状态下顶部一行显示继续、停止与「去确认」 |
| 5 | 成果版本的「被谁引用」只列 Goal，助理工作不在里面 | 已补做：[#222](https://github.com/molis-ai/molis-work/pull/222)（3f7a7b00）；从直达链接打开的成果标签记的是带项目前缀的地址，由 [#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9）补查 |
| 6 | 文档引用成果：Pages 没有引用成果版本的节点，也不记反向引用 | 用户拍板「识别正文里的版本链接」：[#225](https://github.com/molis-ai/molis-work/pull/225)（a9cd3f8c，新协议 `molis.artifacts.referrers`） |
| 7 | Goal 概览看不到交付物（走查 F6） | 已补做：[#223](https://github.com/molis-ai/molis-work/pull/223)（d69f4a27），「Goal 信息」里加「交付物 · N 份」 |
| 8 | 助理面板的结果栏也叫「成果」，与成果库同名不同义 | 用户拍板改叫「产出」：[#224](https://github.com/molis-ai/molis-work/pull/224)（960acab7） |
| 9 | 成果版本没有「交给助理 / Coding」 | 用户拍板现在做：[#226](https://github.com/molis-ai/molis-work/pull/226)（ebeca52c），成果详情加两个按钮，把这一版作为材料交给新工作 |
| 10 | 成果版本不能作为工作流步骤的输入 | 用户拍板现在做：[#228](https://github.com/molis-ai/molis-work/pull/228)，工作流内容协议支持「只能作起点」的站点，成果库声明列出与读取 |
| 11 | 「存为固定版本」与「放在哪里」重叠；Goal 有两种输入 | 用户拍板「合成一种入口」：Goal 只留一个「加输入」，选对象时再选「跟着原文」或「固定这一版」（进行中） |
| 12 | 场景 9（拷贝真实 Home 用当前 main 打开） | 已做（10-04，main 818d0aff）：4207、4208、4173 都没在跑，占着 Home 文件的只有已安装 0.2.0 的 MCP 服务（只开着自己的二进制，不开库）；把 `~/.molis-work` 拷到会话临时目录（排除 1.9 GB 的 `releases/` 安装包，拷了 7.0 GB），137 个库完整性检查全过；用当前 main、文件密钥后端在 4331 打开：项目列表、项目首页（今天的工作）、Goals、Coding（旧会话在）、工作流、设置、能力库都正常，浏览器与服务端无报错，成果库为空（旧表 10-03 已删，符合预期）。插件安装记录停在旧版本（如 Coding 1.32.0、1.44.0，当前 1.50.0）但跑的是当前代码，没有升级提示；把 Coding 加进一个装着 1.32.0 的项目也能用。未验证：调模型（按约定不调）、连接（文件密钥后端读不到钥匙串里的凭据）。做完已删拷贝与临时启动项 |
| 13 | 助理底栏「正在看」对从直达链接打开的成果标签显示地址而不是标题（标签本身的名字是对的）：工作台替插件命名打开的对象时没带标签名 | 已修：[#227](https://github.com/molis-ai/molis-work/pull/227)（ec8429f9） |
| 14 | 常驻服务 4173 停着，要装新版 | 用户操作，见 §7 |
| 15 | 宿主与工作台客户端仍在增长（9.3） | 第二步「声明代替名单」「浏览器脚本打包」先做 |
| 16 | `en.ts` 约 1,489 个无引用的键、38 个重复键；演示稿两套种类名 | 已记入 §5.x，第二步处理 |

### 9.5 另一会话复查的九条（用户 2026-10-04 转来，由我判断修不修、怎么修）

逐条在 main 上核实，并用场景 9 的拷贝查了真实 Home 是否还依赖。

| # | 发现 | 核实 | 判断与做法 |
| --- | --- | --- | --- |
| 1 | 本机网页把所有调用者写成 `"web-user"` | 属实：约 20 个宿主文件各写一份字面量，`agent-host-composition.ts` 还有 `legacyActorId` | 修（第二步，可信身份一节）：身份值不变（已存数据按它记），收成合同里的一个常量，所有调用方引用它；删 `legacyActorId`。多人身份属 §4.19 C 端就绪，不在这里做 |
| 2 | 来源表 `feed_sources` 有两个主人 | 属实：`modules/sources` 建表，`horizontal/listener-host` 建 `feed_source_runs` 并对 `feed_sources` 加外键、删行；`cursor_json` 标着只给旧数据用、靠就地补列 | 修（分层与边界）：删 `cursor_json` 与就地补列、CHECK 重建、旧游标拷贝（不留兼容），见 [#240](https://github.com/molis-ai/molis-work/pull/240)。`feed_source_runs` 的处理改了做法（10-04）：运行记录是 Listener Host 的同步账本，留在它那里，只去掉它对来源表的外键。来源只退役不硬删，这条级联从不触发；运行记录本来就由 `deleteListenerSourceState` 显式清理。分支 `refactor/listener-runs-own-table` |
| 3 | 会话库仍在把 `goalboard_*` 改写成 `molis_work_*` | 属实：`session-schema.ts` 见旧值就整表重建；兼容清单只列了 `session-migration.ts` | 修（清除兼容）：真实 Home 的会话库已是第 6 版、没有旧值（54 条 `legacy_migrated`、2 条 `molis_work_created`），删掉改写；`legacy_migrated` 与 `session_migration_receipts` 一并列入兼容清单 |
| 4 | 文件密钥库的派生盐是 `"goalboard-feed-secretstore-v1"` | 属实 | **不改值**：它是派生已封存密钥的常量，换了旧密钥就解不开，只能再加一层重新封存（那才是兼容逻辑）。代码里已注明（`Historical key-derivation constant. Changing the string would invalidate existing ciphertext.`），列入 §4 例外。**另发现**：同一文件在打开时把 v0.3 的 Base64 信封重新加密（兼容逻辑），列入兼容清单；删之前先只按格式（不读内容）核对真实 Home 还有没有这种信封 |
| 5 | 八个内置插件仍列着可以从哪些旧版本升上来 | 属实；真实 Home 的安装记录多是旧版本（Coding 1.32.0 / 1.44.0、Characters 1.2.0、Files 1.1.0、Git 1.3.0 / 1.4.0） | **更正（10-04）**：前一版写「内置插件启动时不查这些名单」不对。读监督器的代码：已装版本在名单里就直接跑新代码、记录不动；不在名单里就恢复当时存下的旧发行物——所以真实 Home 里装着 Coding 1.32.0 的项目很可能跑的是旧 Coding；照原计划删名单，其余项目也会退回旧代码。用户 10-04 弹窗拍板「内置插件随宿主升级」：随宿主发布的内置插件启动时把安装记录升到当前版本、跑当前代码，不再靠名单；然后删名单。第三方与生成的插件仍走升级确认。分支 `feat/bundled-plugins-follow-host` |
| 6 | CLI 与 MCP 仍能初始化旧看板、导入 v3，执行者来自参数 | 属实：`init`、`import-v3`、`molis_work_v1_initialize`、`molis_work_v1_import_v3`，宿主用参数里的 `actor_id` 做管理身份 | 修（安全不变量，硬约束「可信身份从调用上下文来」）：删 `import-v3` 全链（旧数据导入，按「不留兼容」）；初始化的身份改从调用上下文取，参数里不再收 `actor_id`。MCP 外部调用方会少一个工具、少一个参数，在 PR 里写明 |
| 7 | 生产用的模型入口没有清单；没有模型目录时仍读环境变量与旧凭据、默认走 MiniMax | 属实（BL-082）；真实 Home 的模型目录里有 1 个已配置的提供方，不走兜底 | 修，按用户 10-04 的决定（§1）：<br>• 写调用链清单（§4.2，十七处宿主绑定都经 `host-complete-text.ts` 到 Prologue）。<br>• 删 `model:text:api_key` 的读取与导入，见 [#239](https://github.com/molis-ai/molis-work/pull/239)。<br>• 环境变量留作开发与测试的显式配置，写进手册；通用变量不再默认成 MiniMax。<br>• 产品里没配模型时，调用方提示「请先配置可用的文字模型」。<br>• 其他旧账号导入（TypeSafe、图片、旧连接引用）列入兼容清单，核对真实 Home 后再删 |
| 8 | 演示稿两套种类名 | 属实，方向相反：PPT 动作声明的是 `ppt`，对象、搜索、侧栏、成果来源都用 `presentation` | 修：统一为 `presentation`（动作声明的种类不入库，改它不涉及数据） |
| 9 | 炼金术士自己的库用了平台在用的表名 | 属实（`workspaces`、`jobs`、`evidence`、`claims`） | **不改**：每个项目单独的 `studio.sqlite`，不与平台库同库，不会冲突；改名要迁移用户数据。只在将来并库时再处理，记入已知命名 |

执行顺序：3、8、6 先做（小、独立）；1、2、5、7 随第二步对应小节做。每条一个 PR，进度记在本节。

进度（10-04）：
- 第 3 条：分支 `fix/drop-session-name-rewrite`——查下去发现改名只是会话库旧版升级链的一部分（新建的库先建成第 3 版再迁到第 6 版），按「不留兼容」一并删掉，只认第 6 版；全量回归在跑（存储改动按 10-03 的验证频率要跑全量）。
- 同时发现并修了一处与它无关的时序：`immersive-directory.e2e` 关切换器前 Dock 还在重排，按下与松开不在同一处——[#232](https://github.com/molis-ai/molis-work/pull/232)（268325bd）。
- 第 5 条：见上表更正与 §1 的决定。

进度（10-04 下午）：

| # | PR | 状态 |
| --- | --- | --- |
| 3 | [#234](https://github.com/molis-ai/molis-work/pull/234)（3fa5f40f）：会话库只认第 6 版，删旧版升级链与改名 | 已合入；全量回归在合入前跑过 |
| 8 | [#236](https://github.com/molis-ai/molis-work/pull/236)（fc0b1b70）：演示稿只用 `presentation` | 已合入 |
| 5 | [#237](https://github.com/molis-ai/molis-work/pull/237)：内置插件随宿主升级，删八份名单 | 已合入 |
| 1 | [#238](https://github.com/molis-ai/molis-work/pull/238)（69f2cd65）：`"web-user"` 收成合同常量 `LOCAL_PERSON_ACTOR_ID`（25 个文件）；`legacyActorId` 由 [#243](https://github.com/molis-ai/molis-work/pull/243) 删（§1 决定） | 已合入；#243 待全量 |
| 7 | [#239](https://github.com/molis-ai/molis-work/pull/239)（bab13d7a）：删旧凭据读取与导入；补充 [#246](https://github.com/molis-ai/molis-work/pull/246)：通用环境变量不默认 MiniMax、手册写明、删 BL-082 | #239 已合入；#246 第二批全量通过，排队合入 |
| 2 | [#240](https://github.com/molis-ai/molis-work/pull/240)（46b7ec3f）：来源表只按当前结构建，删补列、重建、旧游标拷贝；v35 夹具去掉旧的空来源表 | 已合入 |
| 6 | [#244](https://github.com/molis-ai/molis-work/pull/244)：管理入口（CLI、管理 MCP）一律以本机这个人的身份调用。initialize、import-v3 不收 `actor_id`；event_decide、goal_tree_decide 的身份与出处由宿主固定，参数里带了就拒绝；随后删 V3 导入全链（§1 决定）；Goals README 的动作数更正为 64 / 58 / 6 | 第二批全量通过；CI 曾因 `goals-storage-boundaries.test.mjs` 还读已删的导入文件而失败，已修（ed8b91e5），排队合入 |

- 本批验证方式：#237–#240 都动共享核心（插件运行时、宿主、模块、合同），按 10-03 的验证频率合成一个集成分支 `integration/batch-10-04`。整体构建、健康与边界门禁都过，在上面跑一次全量回归，失败先用干净基线比对。全量通过后逐个合入。
- 第一批全量回归（集成分支 `integration/batch-10-04`）：3,753 个用例，3,745 通过，1 失败，7 跳过（需要真实账号的 live 用例），用时 76 分钟。唯一的失败是 `goal-event-document-history`：v35 旧库夹具里的来源表还是旧 CHECK，#240 不再就地重建它，属于预期变化。改为夹具装载时删掉这张空表，补在 #240；之后装载 v35 夹具的 9 个用例文件 40/40 通过。四个 PR 都贴了结果，按顺序合入。
- 第二批（集成分支 `integration/batch-10-04b` = 第一批 + 下面五项）：整体构建一次就过，健康与边界门禁通过。140 个相关非浏览器用例文件里 9 个失败，都是我写的预期变化没跟上：替身会话没写执行者、管理调用者不是本机这个人、旧密钥文件在打开时就被拒绝。已逐个修好，复跑 32/32 通过。全量回归在跑。
  - [#241](https://github.com/molis-ai/molis-work/pull/241)：工作流站点的对象种类。pages、feed、inbox、lingguang 原来拿站点 id 当种类；`subject_kind` 改为必填，加门禁 `workflow-station-kinds`。
  - [#242](https://github.com/molis-ai/molis-work/pull/242)：密钥库删 v0.3 信封升级，加用例 `secret-store-format`。
  - [#243](https://github.com/molis-ai/molis-work/pull/243)：会话执行者必填，删 `legacyActorId`。
  - [#244](https://github.com/molis-ai/molis-work/pull/244)：第 6 条（见上表）。
  - #239 的补充：通用模型环境变量不再默认成 MiniMax，手册写明开发用的环境变量，删 BL-082。#239 合入后另开 PR。
- 第二批全量回归（集成分支 `integration/batch-10-04b`）：3,748 个用例，3,740 通过，1 失败，7 跳过，用时 76 分钟。唯一的失败是 `goals-document.e2e` 的一次 CDP `Runtime.evaluate` 超时，没有断言失败；同一棵树上单独连跑 3 次都通过，第一批全量里也通过，判为全量负载下的时序问题。已合入：#241（67aa74ef）、#242（d142eb72）；#243、#244、#246 排队。
- **验证缺口（10-04 发现）**：`scripts/run-tests.mjs` 不带参数时只收 `tests/*.test.ts`，四个 `tests/*.test.mjs`（Goals 查询与存储边界、草稿对话边界、工作台注册边界）只在 CI 里按名字跑。#244 删了导入文件后，第二批全量没发现 `goals-storage-boundaries.test.mjs` 还读它，是 CI 报出来的。之后每批全量另跑 `node --test tests/*.test.mjs`（第三批 10/10）；让全量也带上它们另开小 PR。
- 第三批（集成分支 `integration/batch-10-04c` = 第二批 + 下面四项）：整体构建一次（修了一处没用到的类型引用），健康与边界门禁通过。59 个相关非浏览器用例文件 418 个用例，2 个失败：`.mjs` 边界用例（已修在 #244），以及新用例的项目没启用成果库（已修）。27 个 Goal / 成果相关浏览器用例 55/55 通过。全量回归在跑。
  - 只有 V3 导入会写的需求覆盖账本：分支 `refactor/goals-drop-legacy-coverage`（叠在 #244 上，合入后开 PR）。
  - [#247](https://github.com/molis-ai/molis-work/pull/247)：成果库里固定的一版交给插件作为输入（artifact-positioning 10-04 的决定）。
  - [#248](https://github.com/molis-ai/molis-work/pull/248)：Casebook 对外合同改名（§1 决定；外部 Casebook 插件要同步）。
  - [#249](https://github.com/molis-ai/molis-work/pull/249)：PMR-12 守护用例 `assistant-strip-narrow.e2e`。
- 门禁第二批（§5a）：空 catch、`as unknown as`、旧产品名的计数，以及 contracts 与插件 SDK 的公开 API 快照，加进 `pnpm health:check`（分支 `chore/health-gates-lint-api`）。公开 API 会随前面的合同改动变化，等本批合入后再生成基线开 PR。
- 「其他旧账号导入」已查（10-04）：**不全是兼容，不能直接删**。
  - `importLegacyAccounts`（`apps/local-host/src/web-connector-connections.ts`）每次列出连接时都会做几种「认领」：旧图片密钥、TypeSafe 的 `FUNCTIONS_CREDENTIAL_REF`、各连接器的 `connector:<id>:…`、模型目录的 `model-provider:<id>`，以及各项目来源里的凭据引用。认领后它们出现在设置的「连接」里。
  - 其中至少三种仍由现行流程写入：模型设置按 `model-provider:<id>` 存密钥（`model-provider-store.ts:96`）；Functions / Jev 仍直接读 `FUNCTIONS_CREDENTIAL_REF`（`functions-host.ts`、`experiments-executor.ts`）；Feed 的 GitHub、Gmail 来源注册仍写连接器凭据引用（`plugins/native/feed/src/connector-service.ts`、`connector-source-registration.ts`）。
  - 所以这里一部分是「活的投影」：把直接存的凭据显示成连接。
  - 处理：记入 §5 的分层问题。连接只有一个主人：现行流程直接建连接，认领只留给确实只有旧数据的那几种；那时再按格式核对真实 Home、删掉认领。不在兼容清单里直接删。
- 「桌面面板的 reconcile 是否仍在用」已查（10-04）：**仍在用，不能当兼容删**。
  - Work 插件的终端面板仍存在 `catalog.desktopPanels`（`plugins/native/work/src/http/panels.ts` 打开、列出、标记退出）。
  - `reconcileLegacySessionCatalog`（`apps/local-host/src/session-migration.ts`）在 MCP、网页会话与运行时面板每次读会话时，把面板与运行时绑定同步进会话库（`registry.migrateLegacy`）。名字带 legacy，其实是活路径。
  - 产品代码里没有 `openDesktopPanel` 的调用者，只有用例在用。
  - 处理：记入 §5 包级清单的分层问题。改成显式的「面板 → 会话」投影，改名，去掉 `legacy` 字样，并把 `session_migration_receipts` 与 `legacy_migrated` 的去留一起理清；不在兼容清单里删。
