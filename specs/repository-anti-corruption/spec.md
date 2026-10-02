# 系统性代码与架构防腐整理

状态：准备中（2026-10-02）。第一步（[合入后功能审查](../post-merge-review/spec.md)）收尾期间先量化现状、做清单与方案；第一步完成并合入后开始结构性改动。

任务要求：`docs/prompts/repository-anti-corruption.md`，以 `origin/anti-rot` 上的版本为准（用户 2026-10-02 指定）。同时适用 `docs/prompts/repository-systematic-review.md` 与 `docs/prompts/code-health-report-2026-09-30.md`。上一轮整理见 [repository-systematic-review](../archive/repository-systematic-review/spec.md)，这里不重复它的内容。

本 spec 是第二步唯一的进度与证据记录，每完成一片就更新。

## 0. 现场与范围

- **基线**：第一步最终 main。第一步全量回归基线见 [post-merge-review §7.1](../post-merge-review/spec.md#71-回归基线)；能力快照见 [§7.2](../post-merge-review/spec.md#72-能力快照)；跨功能场景清单见 [§7.4](../post-merge-review/spec.md#74-跨功能场景清单)。
- **范围**：全仓 73 个 workspace 包（`apps` 6、`horizontal`、`modules`、`packages`、`plugins/native` 26、`plugins/official-integrations`、`server`、`tooling/plugin-cli`）。每个包都至少做一次结构审查，交出 §5 的包级清单。
- **在途的其他线**（开工前要重新核对）：`feature/side-shelf`、`feat/plugin-picker-pins`、`docs/archive-project-arrival-flow`、`feature/fix-project-management-freeze`（另一工作树）、Codex 工作树 `~/.codex/worktrees/d62d`。

## 1. 决策记录与待决事项

| 日期 | 事项 | 选项 | 结论 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-02 | 任务要求以哪份为准 | anti-rot 版；main 版 | anti-rot 版 | 用户在目标里指定；anti-rot 合入并删除后改用 main 版 |

**待决（开工后攒批弹窗问）**：

1. 真实 Home 的处理（§4.1「真实 Home 的安全」第 1 步）：列出用户和同事正在用的 Home，问哪些要保留。
2. 插件升级声明的机制是否连同机制一起简化（§4.1「不算兼容」第 2 条）。
3. 共享核心的评审方式（CODEOWNERS）、合并队列、必选评审（§4.7）。
4. vendored 私有 Prologue 包能否随公开仓库分发；删除不用的 3 份 tgz（§4.17、N-02）。
5. 他人的工作树与分支清理（N-07）。

## 2. 现状度量（§3）

开工时的数字（2026-10-02，main fccb2a30）。口径：源码是 git 跟踪的 `.ts/.mts`，排除 `tests/`、`specs/`、`docs/`、`dist/` 与 `.d.ts`；类和函数用 TypeScript 语法树量起止行。模板字符串里的浏览器脚本不按函数计，只算在文件行数里。

### 2.1 改动成本

- 09-28 起合入 main 的 PR：71 个。每个 PR 改动的文件数：中位数 6，p90 98，最大 615。
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
| N-12 | 两套能力机制 | `HostCapabilityDefinition` 18 个源码文件；`registerCapability` 10 处；动作服务 `registerProvider` 45 处 | 仍然成立 |
| N-13 | 没有格式化与静态检查 | 没有 lint/format 配置与脚本 | 仍然成立 |
| N-15 | 兼容逻辑大量存在 | 见 §4 | 仍然成立 |
| N-16 | 测试串行 | `scripts/run-tests.mjs` 仍用 `--test-concurrency=1` | 仍然成立 |
| N-19 | 版本策略缺失 | 73 个子包都是 0.0.0 | 仍然成立 |
| N-20 | 非 TS 不在检查里 | Rust 18、Swift 3、shell 7、Python 1 | 仍然成立 |

其余条目（皮肤、Goals UI、Server、N-01、N-03～N-06、N-08～N-11、N-14、N-17、N-18、C 组）开工后逐项复核。

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

- `board_id` 出现在 269 个源码文件、335 个测试文件里；
- 源码里提到旧产品名 GoalBoard 的有 10 个文件；
- 0.1.x 根 SDK 出口、MCP 旧名与别名仍在。

完整清单开工时全仓重新清点。

## 5. 包级清单（§4.4）

开工后逐包填写：公共入口、负责与不负责、主要文件及各自的变化原因、放错位置的类和方法、重复实现、建议的移动。73 个包的 README 都有「开发要求」一节。

## 6. 未验证的范围

尚未开工，暂无。
