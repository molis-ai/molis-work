# Characters

个人 Character 草稿与启用状态的唯一写入方。草稿跨项目复用，按本人隔离；修改与状态变更使用修订检查，删除保留墓碑。

公开入口提供查询、草稿命令和同步发布回调，并提供角色的全部动作：声明（`CHARACTERS_ACTIONS` / `charactersActions`，`src/actions.ts`）、处理器 `createCharactersActionHandlers(ports, runtime)`（列表、草稿、发布、固定版本的复用与替换、导入与预览、可运行判断、执行与启动的核对、用法登记、成果预览）和归属绑定 `bindCharactersActions`（`src/action-bindings.ts`）。Characters 不是插件（CHR-1，2026-10-22）：Host 用自己的端口（本人身份、草稿服务、发布者、本机导入）建出处理器，并为每个项目注册这些动作的提供方（`apps/local-host/src/characters-host.ts`），页面的地址由 Host 的 `apps/local-host/src/characters-http.ts` 接。Artifact 的固定正文、版本、来源仍由原 Artifacts Module 拥有；本模块只在确认草稿仍有效时，将固定内容交给 Host 注入的发布者，不直接依赖或写入另一个业务模块。

允许依赖 Characters Contract、storage 的库基线、Node SQLite/文件系统；禁止依赖插件、App Shell、Agent Runtime 或另一个 Module 的实现。仓库实现不从公开入口导出。当前无遗留角色数据迁移，不创建默认人格。

- Status: `slice`
- Migration Goals: `goal-reorg-f2`, `coding-c12`
- Contract: `@molis-ai/molis-work-contracts/modules/characters`
- SSOT: `specs/coding-plugin/spec.md` §0 C12
- 管理发布经 Host 注册的 Characters 动作接入（不再是独立插件），Coding 选择、Host/SDK 冻结、停用阻止新执行与固定报告已实操。真实模型对照保留尚未改善人工负担的证据；行为质量和完整验收未完成，不把数据层通过当作 C12 完成。

## 开发要求

- 负责：个人 Character 草稿与启用状态；原生执行的记录（`src/runs.ts`，表 `character_runs`：谁、哪个项目、哪个版本、任务、目录、是否派发成功；不存终端输出）；项目被删除时清掉该项目的执行记录（`src/project-data.ts` 的 `charactersProjectData`：确认框里的标签与 `purgeCharactersProject`；Characters 不是插件，由宿主在 `apps/local-host/src/project-deleted-owners.ts` 里按名登记，草稿不属于任何项目、不清）；角色动作的声明（`src/actions.ts`）、处理器（`src/action-handlers.ts`，按记录、草稿、发布、导入分组）、归属绑定（`src/action-bindings.ts`）、发布的来源与身份核对（`src/publications.ts`）、本机导入与预览的非界面逻辑（`src/imports.ts`、`src/import-preview.ts`）、Agent 可用动作的登记与草稿校验（`src/agent-actions.ts`）、用法登记（`src/usages.ts`）、成果预览的 Markdown（`src/artifact-preview.ts`）。
- 不负责：已发布正文（在 Artifact）、执行（写角色包、起进程由 Host 的 `apps/local-host/src/character-native-execution.ts` 做，记录经 `openCharacterRuns` 写这里）、终端输出、权限、界面；注册动作提供方、接页面的地址、给端口（Host：`apps/local-host/src/characters-host.ts`、`apps/local-host/src/characters-http.ts`）；「设置 › 角色」的界面（`apps/workbench/src/characters/`）。
- 公开入口：`@molis-ai/molis-work-module-characters`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/characters`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-storage`（库的结构基线 `applySqliteBaseline`）。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 动作处理器只经 Host 给的端口与运行时（项目、成果库客户端、Agent 目录）做事，不开库、不读环境、不碰另一个 Module；发布前核对项目、所有者、发布者身份与类型，不一致就拒绝。
  - 草稿与状态的唯一写入方，按本人隔离、跨项目复用；修改与状态变更做修订检查，删除保留墓碑。
  - 只在确认草稿仍有效时，把固定内容交给 Host 注入的发布者。
  - 不依赖插件、App、Agent Runtime 或其他 Module 的实现；仓库实现不从公开入口导出。
  - 仅空的版本 0 库初始化为当前版本 2；已有结构的版本 0 库、版本 1 库（加 `character_runs` 之前的，维护见 `tests/fixtures/characters-maintenance-v2.sql`）和未来版本拒绝打开，保留原库的结构、数据、版本及文件权限，不盖章升级。
- 改动后必跑：`node scripts/run-tests.mjs tests/characters-module.test.ts tests/characters-actions.test.ts tests/characters-action-handlers.test.ts tests/characters-import.test.ts tests/characters-schema.test.ts tests/characters-maintenance-v2.test.ts tests/characters-project-deletion.test.ts`；动了声明、绑定或处理器再跑 `tests/characters-native-execution.test.ts tests/characters-publication-http.test.ts tests/security-invariants-plugin-original-caller.test.ts`
- 相关手册：[docs/system/PACKAGE-BOUNDARIES.md](../../docs/system/PACKAGE-BOUNDARIES.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
