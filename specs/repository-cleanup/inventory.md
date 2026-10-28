# 两仓存量清理：覆盖、处置与验证

状态：本地清理已完成；Prologue 已由用户合入，Work 的 CI、评审与合并处理中（2026-10-22）；负责人 Codex。唯一需求书为 [spec](spec.md)。下列工程结论不代替产品体验或用户验收。

## 范围与方法

Work 扫描全部 72 个 workspace 包、开始基线的 2405 份产品 TypeScript 与 1425 份测试/夹具文件，并对 4401 份已跟踪代码、配置和工具做名称消费补查。Prologue 扫描全部 29 个 SDK 模块、353 份产品 TypeScript、两个原生 crate（27 份 Rust）及 6 份脚本。两仓另以 TypeScript noUnusedLocals/noUnusedParameters 确认没有隐藏的未使用本地声明（Work 为原构建规则，Prologue 额外只读检查通过）。Archive 不纳入现役删除。

静态图解析 import、re-export、动态 import、import() 类型；测试经 dist 的导入映射回源码。全名词法索引只生成候选：同名局部函数、注释与别的模块类型不是消费者；浏览器全局、Manifest、动态打包、发布 API 则是独立保留证据。没有把“未被静态 import”直接等同于死代码。

当前开放 PR 28 项；本机 Work 工作树 122 份、Prologue 工作树 32 份参与实际未合差异检查。仅继承旧调用的分支不阻挡删除；旧分支只改同一文件、没有新增消费者，也不阻挡收窄内部 export。没有改其他工作树。数字为本轮基线快照，后续开发不滚动扩大本次任务。

## 本轮实现

- Work 删除 15 个闲置定义（含一份完整死文件），收窄 532 处内部导出/无消费者转出；定义仍有文件内用途的保持原逻辑。类型生成需要的 6 个具名类型保留。
- Work 合并 5 组重复实现：Host 的 Context Ledger 数据库适配；Goals 完成状态重开；Projects 删除回执；Feed 来源故障收尾；9 处 JSON 值排序。JSON 排序成为 Plugin SDK 的一个纯 helper，新增导出 `canonicalJsonValue`，其余公开合同不变。
- Work 删除 Agent Host 对 `@tauri-apps/api` 的多余直接依赖；其直接依赖的 vendored Prologue SDK 自己声明该包，安装链保留。Goals Module 添加对 SDK 的实际依赖，登记、锁文件、README、API 快照同步。
- Prologue 收窄 16 处内部导出/转出；把 workspace 的两份写入前检查合并在原 root 职责文件中。错误码、文案、权限、只读元数据和调用时刻保持原有语义；公开 API 快照没有变化。

之前已合入的 `server/src/auth.ts`、Feed `isActiveAttention`、Host `normalizeTrailingNewline`/`withoutPersonalSpace` 不计本轮成果。

### 删除的定义

| 文件 | 定义 |
| --- | --- |
| `apps/local-host/src/artifact-line-head.ts` | `artifactLineHead` |
| `apps/local-host/src/computer/computer-record-source.ts` | `COMPUTER_PROVIDER_ID` |
| `apps/local-host/src/connector-directory.ts` | `liveConnectorIds` |
| `apps/local-host/src/material-source-reader.ts` | `readMaterialPublicSource` |
| `apps/mcp/src/tool-schemas.ts` | `v1PayloadTool` |
| `apps/workbench/src/arrival/shell.ts` | `ArrivalShell` |
| `modules/goals/src/event-facts-validation.ts` | `sameTypeDefinition` |
| `modules/goals/src/event-state-authorization.ts` | `resolveDecisionEffects` |
| `modules/goals/src/event-state-authorization.ts` | `decisionCoversScope` |
| `modules/goals/src/goal-contract-records.ts` | `contractInputFromGoal` |
| `apps/local-host/src/agent-definitions/instructions.ts` | `withRegisteredPrompts` |
| `apps/local-host/src/workspace-git-operations.ts` | `GIT_OPERATION_TOOLS` |
| `apps/local-host/src/project-file-paths.ts` | `isWithin` |
| `plugins/native/coding/src/route-activation.ts` | `sessionTitle` |
| `server/src/database.ts` | `ImDatabase` |

### Work 全包覆盖

每行都检查源码可达性、内部/公开导出、依赖与注册/构建入口。改动列是本轮处理的声明数；没有删除的包同样已纳入扫描，仍以其现行入口、Manifest、公共 API 或测试消费保留。测试与工具不按无产品 import 删除。

| 包 | 基线产品 TS 文件 | 清理声明 |
| --- | ---: | ---: |
| `apps/server` | 5 | 1 |
| `server` | 18 | 7 |
| `packages/im-ui` | 11 | 0 |
| `packages/plugin-sandbox` | 9 | 3 |
| `apps/desktop` | 14 | 0 |
| `apps/workbench` | 218 | 34 |
| `apps/local-host` | 542 | 248 |
| `apps/cli` | 4 | 0 |
| `apps/mcp` | 17 | 3 |
| `packages/contracts` | 130 | 0 |
| `packages/kernel` | 14 | 0 |
| `packages/plugin-runtime` | 41 | 4 |
| `packages/plugin-sdk` | 25 | 0 |
| `packages/storage` | 15 | 0 |
| `packages/ui-host` | 7 | 0 |
| `packages/design-system` | 90 | 3 |
| `packages/test-kit` | 11 | 0 |
| `modules/projects` | 8 | 1 |
| `modules/context-ledger` | 5 | 0 |
| `modules/sources` | 1 | 0 |
| `modules/signals` | 1 | 0 |
| `modules/feed` | 2 | 0 |
| `modules/attention-resumption` | 1 | 0 |
| `modules/goals` | 47 | 23 |
| `modules/private-work-context` | 23 | 6 |
| `modules/artifacts` | 8 | 5 |
| `modules/shelf` | 11 | 2 |
| `modules/characters` | 11 | 1 |
| `modules/functions` | 11 | 5 |
| `modules/governance-collaboration` | 11 | 1 |
| `horizontal/agent-host` | 70 | 44 |
| `horizontal/connector-host` | 4 | 1 |
| `horizontal/listener-host` | 1 | 0 |
| `horizontal/runtime-host` | 5 | 0 |
| `horizontal/scheduler` | 1 | 0 |
| `horizontal/memory` | 10 | 3 |
| `horizontal/knowledge` | 11 | 1 |
| `horizontal/search` | 2 | 0 |
| `horizontal/placement` | 2 | 0 |
| `plugins/native/goals` | 156 | 14 |
| `plugins/native/artifacts` | 21 | 3 |
| `plugins/native/characters` | 14 | 0 |
| `plugins/native/coding` | 106 | 30 |
| `plugins/native/files` | 19 | 2 |
| `plugins/native/diff` | 13 | 1 |
| `plugins/native/git` | 18 | 3 |
| `plugins/native/text-stats` | 8 | 0 |
| `plugins/native/issues` | 16 | 2 |
| `plugins/native/inbox` | 13 | 1 |
| `plugins/native/schedule` | 26 | 1 |
| `plugins/native/shelf` | 22 | 9 |
| `plugins/native/images` | 18 | 3 |
| `plugins/native/pages` | 91 | 26 |
| `plugins/native/form` | 34 | 6 |
| `plugins/native/dataset` | 17 | 1 |
| `plugins/native/ppt` | 19 | 1 |
| `plugins/native/cognia` | 19 | 6 |
| `plugins/native/jelly` | 30 | 8 |
| `plugins/native/lingguang` | 15 | 4 |
| `plugins/native/todo` | 23 | 6 |
| `plugins/native/workflows` | 20 | 11 |
| `plugins/native/plugin-builder` | 19 | 0 |
| `plugins/native/alchemist` | 107 | 0 |
| `plugins/native/feed` | 48 | 6 |
| `plugins/native/work` | 45 | 3 |
| `plugins/official-integrations/catalog` | 10 | 3 |
| `plugins/official-integrations/github` | 6 | 0 |
| `plugins/official-integrations/gmail` | 13 | 1 |
| `plugins/official-integrations/rss` | 8 | 0 |
| `plugins/official-integrations/web-query` | 1 | 0 |
| `plugins/official-integrations/youtube` | 2 | 0 |
| `tooling/plugin-cli` | 8 | 0 |

### 特殊入口、依赖与工具

| 对象 | 具体保留依据 |
| --- | --- |
| Host 的 Cognia / Images / Jelly 依赖 | `apps/workbench/src/builtin-plugins.ts` 注册 package name；`apps/local-host/src/home-plugins.ts` 调 `nativePluginReleaseArtifact` 动态打包，resolveDir 是 Host，因此不是无用依赖。 |
| Workbench 的 im-ui 依赖 | `specs/context-program/spec.md` §7/F12/W6 已接受“项目讨论输入框成为落点”；`specs/context-toolbar/spec.md` 的 2026-10-02 决定明确保留。不是“可能会用”。 |
| sandbox worker、OAuth Worker | 前者由打包脚本作为隔离执行入口；后者独立部署，测试消费不能替代部署入口。 |
| Alchemist bootstrap/job 与三份测试专用 fixture | 前两者随 BL-376 整体删除；fixture 仍验证隔离/权限边界，先有通用替代再删除。 |
| `server/tooling/continuity-demo.ts` | 现有手动连续性演示入口，保留其文档/验证用途。 |
| 187 份 Work 脚本与 tooling | 补计 .mts、.js/.ts 后缀映射及文档/CI/测试入口后，没有证据充分的无人引用工具。切片演示脚本仍有现役 spec/录制入口。 |
| @types 与 root 工具依赖 | 与各自运行库或 root 的脚本、测试、打包命令对应；补查后剩余四项候选就是上方三个动态依赖与 im-ui。 |
| 原生代码 | Work Rust/Swift 各自由 desktop 与 helper 构建入口、native-checks 登记；已知桌面问题由 SYS 修复处理。本次没有修改原生逻辑。Prologue 的平台分支和旧检查点字段属于跨平台/旧落盘拒绝合同，clippy 没有新的未使用警告。 |

### 重复实现处置

| 组 | 结果与行为证明 |
| --- | --- |
| Context Ledger SQLite 适配 ×2 | 一个 Host 内部适配器；加入已有事务、BEGIN IMMEDIATE、提交/回滚及参数转发不变；Assistant/placement 真实数据库回归。 |
| Goals reopenCompletion ×2 | 放在原 `event-state-completion.ts`，先读旧状态、取时刻、撤销收尾、重开、记系统事件的顺序不变。 |
| Projects deletionRecord ×2 | 复用 Repository 内已有回执投影；Service 的现行方法签名保留。 |
| Feed resolveSourceFaults ×2 | 复用 `source-sync-result.ts`；仅当前 source 的 open/in_progress 条目变 done，使用原 revision。 |
| JSON 排序 ×9 | 一个 SDK helper；localeCompare、对象 undefined 值、JSON 序列化结果、递归与数组顺序不变，独立期望测试 CLN-06 与现有约定/幂等/提案回归。 |
| Alchemist mapIdeaCard/mapCard | 随已批准的 BL-376 整体删除；不在待退役实现上再增加共享层。 |
| 路由表 handle ×5、Inbox/Schedule writeResponse ×2 | 同型适配但分属现行插件及旧宿主装配；I1/I2/I3/I6 迁移对这些实际文件仍有未合改动。保留到同一迁移 owner 收口，不创建跨插件 import 或额外路由框架。 |
| Prologue workspace 写入前检查 ×2 | 同一 root 内部函数，原位置调用；6 个真实文件测试文件 81 条通过，覆盖补丁、回退、只读拒绝与根目录归属。 |

## 精确保留清单

下面是本轮候选的处置依据，不是待执行的定期清理计划。公开库和模块合同没有因本仓缺少第二消费者而缩减；运行中的旧装配不冒充“已经退役”。

| 路径 | 候选 | 保留原因 |
| --- | --- | --- |
| `apps/local-host/src/artifact-native-plugin-http.ts` | `ArtifactHttpContext` | TypeScript 导出的返回值/变量签名需要这个具名类型；去掉会产生 TS4023/TS4058。 |
| `apps/local-host/src/assistant/assistant-service.ts` | `AssistantCaller`, `CODING_SESSION_KIND` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/assistant/assistant-surroundings.ts` | `SurroundingsPorts` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/coding-surface.ts` | `charactersWorkbenchPanel`, `codingCompanionStages` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/home-talk-actions.ts` | `HomeTalkPreparation` | TypeScript 导出的返回值/变量签名需要这个具名类型；去掉会产生 TS4023/TS4058。 |
| `apps/local-host/src/host-complete-text.ts` | `HostTextGenerationResult` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/knowledge-actions.ts` | `KnowledgeHostPorts`, `knowledgeModelLocator`, `knowledgeModelWriter` | SYS 修复 chat 的本轮实际修改文件，修复尚未声明写入结束。 |
| `apps/local-host/src/material-native.ts` | `materialImageExtensions` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `apps/local-host/src/plugin-builder/agent-surface.ts` | `AgentStudioModel`, `AgentStudioOptions`, `InstalledPluginStage` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/plugin-database-client.ts` | `PluginDatabaseConnections` | SYS 修复 chat 的本轮实际修改文件，修复尚未声明写入结束。 |
| `apps/local-host/src/plugin-model-service.ts` | `createPluginModelPort` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/local-host/src/plugin-project-cleanup.ts` | `PluginProjectCleanupEntry`, `PluginProjectLibraries` | SYS 修复正在修改同一文件。 |
| `apps/local-host/src/project-plugins.ts` | `ProjectStageView` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `apps/workbench/src/immersive-shell.ts` | `InstalledRailEntry`, `renderPickerExtend` | 开放 PR #970, #934 的实际修改文件。 |
| `apps/workbench/src/settings-connector-guide.ts` | `methodLabel`, `officialLinks` | 开放 PR #970, #946 的实际修改文件。 |
| `apps/workbench/src/settings-directory.ts` | `SettingsDirectoryPrimitives`, `renderPluginRailAccountFooter`（已删，#1353） | 开放 PR #970, #946 的实际修改文件。 |
| `apps/workbench/src/side-view-document.ts` | `sideViewKeys`（已删，#1353） | 开放 PR #970, #934 的实际修改文件。 |
| `horizontal/agent-host/src/adapters/prologue-documents.ts` | `parsePrologueDocument` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `horizontal/agent-host/src/adapters/prologue-inputs.ts` | `SteerInput`, `deliverSteer` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `horizontal/agent-host/src/adapters/prologue-stream.ts` | `PrologueTokenCount` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `packages/contracts/src/modules/goal-event-state.ts` | `GoalEventSystemOperation`, `GoalEventUserConclusionVerdict` | 公开合同/发布面，不能凭仓库内没有消费者删除。 |
| `packages/contracts/src/modules/goal-events.ts` | `GoalEventSystemOperation`, `GoalEventUserConclusionVerdict`, `GoalWorkEventBase` | 公开合同/发布面，保持现行类型名。 |
| `packages/design-system/src/palette.ts` | `MwContentMark`, `MwHueSwatch` | 开放 PR #970, #934 的实际修改文件。 |
| `packages/design-system/src/primitives/directory.ts` | `DirectoryStatusTone` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `plugins/native/alchemist/src/studio/domain/calibration/calibration.ts` | `ProposalDiff`, `rejectActionProposal` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/decision/decision.ts` | `DecisionGate`, `DecisionMaterials`, `DecisionReportBinding` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/discovery/idea-card.ts` | `KeepCardInput`, `KeepCardResult` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/discovery/pulse.ts` | `OpportunityStatus`, `PulseCoverage` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/kernel/identity.ts` | `ActorId` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/kernel/identity.ts` | `Brand`, `WorkspaceId` | Alchemist 的 BL-376/377 删除前置条件。 |
| `plugins/native/alchemist/src/studio/domain/kernel/revision.ts` | `TargetRef`, `VersionedRef` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/domain/research/report.ts` | `ClaimStatus` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/bootstrap/local-runtime.ts` | `LocalRuntimeOptions` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/db/activity-repository.ts` | `ActivityEvent` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/db/idea-repository.ts` | `KeepIdeaCardInput` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/db/memory-repository.ts` | `MemoryRuleApplication` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/db/schema.ts` | `ALCHEMIST_STUDIO_BASELINE` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/jobs/lens-job-handler.ts` | `LensJobDependencies` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/jobs/pulse-job-handler.ts` | `PulseJobDependencies` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/jobs/sqlite-job-runner.ts` | `SqliteJobRunnerOptions` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/runtime/pulse-synthesizer.ts` | `PulseSynthesisInput`, `PulseSynthesisResult` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/services/job-resumption.ts` | `ResumeView` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/services/workspace-export.ts` | `WorkspaceExportResult` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/server/sources/toolify-source.ts` | `parseToolifyTrending` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/actions.ts` | `cardSchema`, `directionSchema`, `explorationSchema`, `ideaSchema`, `ideaVersionSchema`, `lensRunSchema`, `researchPlanSchema`, `runStatusSchema`, `runtimeModelSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/annotation.ts` | `AnnotationDto`, `annotationParamsSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/bootstrap.ts` | `BootstrapDto`, `DirectionDto`, `ExplorationDto`, `IdeaCardDto`, `IdeaSummaryDto` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/conversation.ts` | `ConversationContextDto`, `ConversationMessageDto` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/decision.ts` | `ActivityEventDto`, `DecisionCaseStatus`, `DecisionLogEntryDto`, `DecisionsSurfaceDto`, `decisionParamsSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/direction.ts` | `directionIdParamsSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/exploration.ts` | `ExplorationGeneration`, `IdeaCardDraft`, `ideaCardDraftSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/idea.ts` | `KeepIdeaResponse`, `ideaCardParamsSchema`, `ideaVersionParamsSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/job.ts` | `JobEventDto`, `jobEventsParamsSchema`, `jobEventsQuerySchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/memory.ts` | `ActionProposalDto`, `MemoryWorkspaceDto`, `PlaybookRuleDto`, `TasteRuleDto`, `memoryRuleParamsSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/pulse.ts` | `OpportunityDto`, `PulseReportBundleDto`, `PulseReportDto`, `PulseRunDto`, `PulseWorkspaceDto`, `SourceSettingDto`, `SupplySignalDto`, `opportunityParamsSchema`, `updatePulseSourceRequestSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/studio/shared/contracts/research.ts` | `EvidenceDto`, `LensReportDto`, `LensRunDto`, `ResearchPlanDto`, `RuntimeModelDto`, `ideaResearchParamsSchema`, `lensParamsSchema`, `startLensRunRequestSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/alchemist/src/work-reuse/contracts.ts` | `reuseCandidateSchema`, `reuseMethodSchema` | Alchemist 整体删除的既定前置条件 BL-376/377 未满足，保留到该删除任务。 |
| `plugins/native/coding/src/delegation-view.ts` | `DelegationSides`, `artifactOf` | 开放 PR #970, #936 的实际修改文件。 |
| `plugins/native/coding/src/highlight.ts` | `CodeTokenKind` | 开放 PR #970, #940 的实际修改文件。 |
| `plugins/native/coding/src/report.ts` | `CodingExecutionReport` | 开放 PR #970, #934 的实际修改文件。 |
| `plugins/native/coding/src/routes-delegations.ts` | `runtimeSessionOf` | 开放 PR #970, #936 的实际修改文件。 |
| `plugins/native/coding/src/run-inputs.ts` | `CodingRunControl` | 开放 PR #970, #936 的实际修改文件。 |
| `plugins/native/coding/src/run-inputs.ts` | `questionAnswer` | 开放视觉 PR 正在调整该调用链。 |
| `plugins/native/coding/src/timeline.ts` | `TimelineWords` | 开放 PR #970, #934 的实际修改文件。 |
| `plugins/native/coding/src/writers.ts` | `CodingWriterAssignment` | TypeScript 导出的返回值/变量签名需要这个具名类型；去掉会产生 TS4023/TS4058。 |
| `plugins/native/goals/src/input-actions.ts` | `GoalBoundObject`, `GoalConfirmedInput` | TypeScript 导出的返回值/变量签名需要这个具名类型；去掉会产生 TS4023/TS4058。 |
| `plugins/native/goals/src/management-evidence.ts` | `evidenceText`, `managementEvidence` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `plugins/native/goals/src/planning-actions.ts` | `GoalPlanningComposition` | TypeScript 导出的返回值/变量签名需要这个具名类型；去掉会产生 TS4023/TS4058。 |
| `plugins/native/images/src/providers.ts` | `isLocalImageEndpoint` | 存在真实未合改动或新增消费者，见下方工作树依据；未合改动的取舍不由本次清理代决。 |
| `plugins/native/pages/src/commands-containers.ts` | `outdentItemGroup` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/commands-selection.ts` | `SlashSession`, `topBlockRange` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/commands.ts` | `SlashSession`, `outdentItemGroup`, `topBlockRange` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/comment-editor-client.ts` | `bindComments` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/comment-side-client.ts` | `mountComments` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/editor-browser.ts` | `FrozenPagesFocus`, `PagesToolItem`, `bindComments`, `listFailed`, `mountComments`, `mountPagesLanding` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/editor-types.ts` | `PagesToolItem` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/focus.ts` | `FrozenPagesFocus` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/landing-editor.ts` | `mountPagesLanding` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |
| `plugins/native/pages/src/list-client.ts` | `listFailed` | Pages 编辑器浏览器 bundle 的全局接口或其转出链；使用方是页面脚本/生成声明，不是静态 ES import。 |

未合工作具体依据：SteerInput/deliverSteer 在 `receipts/1d-coding` 的 Prologue adapter 新增消费；`isLocalImageEndpoint` 在 `feature/anti-corruption-wave3-i5`/I6 的 Images service 新增消费；`managementEvidence`/`evidenceText` 在 `integration/wave2b-compliance` 的 Goal capability 接线被消费；`materialImageExtensions` 在旧材料迁移文件中仍有差异，待材料 owner 收口；当前未合差异与 PR/修复文件的精确清单已检查，没有把历史继承关系直接算作依赖。

### Prologue 全模块覆盖

| 模块 | 产品 TS 文件 |
| --- | ---: |
| `agent` | 21 |
| `app-data` | 5 |
| `artifact` | 3 |
| `character` | 3 |
| `composition` | 60 |
| `context` | 12 |
| `data-source` | 6 |
| `delivery` | 4 |
| `effect-policy` | 14 |
| `function` | 4 |
| `hooks` | 5 |
| `host` | 24 |
| `kernel` | 11 |
| `mcp` | 15 |
| `memory` | 5 |
| `model` | 26 |
| `observability` | 9 |
| `orchestration` | 30 |
| `plugin` | 5 |
| `resource` | 9 |
| `runtime` | 9 |
| `scenario-pack` | 4 |
| `session` | 24 |
| `skill` | 8 |
| `source` | 8 |
| `testing` | 4 |
| `tool` | 7 |
| `ui-control` | 3 |
| `workspace` | 12 |

两个 crate：`prologue-host-contract`（1 份 Rust）、`prologue-host-tauri`（26 份 Rust）。唯一发布包的四个入口、Tauri 原生注册/能力、Node Host、6 份质量与消费脚本均纳入。源码没有不可达文件；`mcp/plugin/oauth-node.ts` 由真实 OAuth 测试消费，属于明确保留的 MCP 适配能力。

Prologue 其余候选保留依据：`docs/slices/architecture-hygiene.md` §0.4 Q5/§5.1 记录已接受的公开面保留与 experimental 决定，`packages/sdk/test/public-surface.test.ts` 和公开快照约束它；模块 core/api 的类型与 Port 转出属于现行模块合同。`EveryNameAssembled` 是编译期装配完整性断言。Runtime 旧幂等地址、Session 无 progressVersion 的旧记录、检查点缺目录身份后的拒绝，由现行需求和真实恢复测试约束，不是空的兼容路径。

同名短助手不一概合并：参数、领域身份、错误 owner 或 Host 信任边界不同的实现保持各自主人。真正函数体一致且合同相同的 workspace 写入检查已合并。

本轮保留的 Prologue 模块导出候选（按定义/转出文件列名）：

| 文件 | 名称 |
| --- | --- |
| `packages/sdk/src/agent/api/index.ts` | `KnownModeName` |
| `packages/sdk/src/agent/core/index.ts` | `KnownModeName`, `MAX_HANDLING_ITEMS`, `MAX_HANDLING_NOTE_CHARS`, `MAX_HANDLING_TARGETS` |
| `packages/sdk/src/agent/core/input-handling.ts` | `MAX_HANDLING_ITEMS`, `MAX_HANDLING_NOTE_CHARS`, `MAX_HANDLING_TARGETS` |
| `packages/sdk/src/agent/core/modes.ts` | `KnownModeName` |
| `packages/sdk/src/composition/api/index.ts` | `FrozenSubagentGrant`, `SubagentWorkspaceFact` |
| `packages/sdk/src/composition/core/index.ts` | `FrozenSubagentGrant`, `SubagentWorkspaceFact` |
| `packages/sdk/src/composition/core/runtime.ts` | `EveryNameAssembled` |
| `packages/sdk/src/composition/core/subagent-workspaces.ts` | `FrozenSubagentGrant`, `SubagentWorkspaceFact` |
| `packages/sdk/src/context/api/index.ts` | `ContextItemInput`, `InstructionSelection`, `TokenCount`, `assertProjectTrusted` |
| `packages/sdk/src/context/core/budget.ts` | `TokenCount` |
| `packages/sdk/src/context/core/compaction.ts` | `MicroCompactible` |
| `packages/sdk/src/context/core/ignore.ts` | `IGNORE_FILES` |
| `packages/sdk/src/context/core/index.ts` | `ContextItemInput`, `IGNORE_FILES`, `InstructionSelection`, `MicroCompactible`, `TokenCount`, `assertProjectTrusted` |
| `packages/sdk/src/context/core/instructions.ts` | `InstructionSelection`, `assertProjectTrusted` |
| `packages/sdk/src/context/core/provenance.ts` | `ContextItemInput` |
| `packages/sdk/src/delivery/core/envelope.ts` | `EnvelopeRowStore` |
| `packages/sdk/src/delivery/core/index.ts` | `EnvelopeRowStore` |
| `packages/sdk/src/effect-policy/api/index.ts` | `ApprovalReply`, `ChoiceAnswer`, `ConfirmationAnswer`, `EffectRun`, `PendingRequest`, `TextAnswer` |
| `packages/sdk/src/effect-policy/core/chain.ts` | `EffectRun` |
| `packages/sdk/src/effect-policy/core/index.ts` | `ApprovalReply`, `ChoiceAnswer`, `ConfirmationAnswer`, `EffectRun`, `OUTCOME_SEVERITY`, `PendingRequest`, `TextAnswer` |
| `packages/sdk/src/effect-policy/core/pending.ts` | `ApprovalReply`, `ChoiceAnswer`, `ConfirmationAnswer`, `HeldPending`, `PendingRequest`, `TextAnswer` |
| `packages/sdk/src/effect-policy/core/rules.ts` | `OUTCOME_SEVERITY` |
| `packages/sdk/src/host/core/contract.ts` | `RewindFileContents` |
| `packages/sdk/src/host/core/index.ts` | `ExpectedVersion`, `PROTECTED_SEGMENTS`, `RewindFileContents` |
| `packages/sdk/src/host/core/storage-contract.ts` | `ExpectedVersion` |
| `packages/sdk/src/host/core/workspace-path.ts` | `PROTECTED_SEGMENTS` |
| `packages/sdk/src/kernel/core/clock.ts` | `elapsedMs` |
| `packages/sdk/src/kernel/core/index.ts` | `elapsedMs` |
| `packages/sdk/src/mcp/api/index.ts` | `McpRegistryHooks` |
| `packages/sdk/src/mcp/core/connection.ts` | `McpRegistryHooks` |
| `packages/sdk/src/mcp/core/index.ts` | `JsonRpcErr`, `JsonRpcOk`, `MCP_PROTOCOL_VERSION`, `McpConnectAttempt`, `McpRegistryHooks`, `McpRequester`, `ServerRequest`, `encodeNotification` |
| `packages/sdk/src/mcp/core/lifecycle.ts` | `McpConnectAttempt` |
| `packages/sdk/src/mcp/core/protocol.ts` | `JsonRpcErr`, `JsonRpcOk`, `MCP_PROTOCOL_VERSION`, `ServerRequest`, `encodeNotification` |
| `packages/sdk/src/mcp/core/resources.ts` | `McpRequester` |
| `packages/sdk/src/model/api/index.ts` | `WireCache` |
| `packages/sdk/src/model/core/adapter.ts` | `WireCache` |
| `packages/sdk/src/model/core/index.ts` | `WireCache` |
| `packages/sdk/src/orchestration/core/background.ts` | `BACKGROUND_OUTPUT_POLL_MS`, `BackgroundHost`, `BackgroundRowStore` |
| `packages/sdk/src/orchestration/core/goal.ts` | `GoalRowStore` |
| `packages/sdk/src/orchestration/core/index.ts` | `BACKGROUND_OUTPUT_POLL_MS`, `BackgroundHost`, `BackgroundRowStore`, `BoardReporter`, `CheckLane`, `GoalRowStore`, `WaitBoard`, `WaitRowStore`, `WaitSources` |
| `packages/sdk/src/orchestration/core/taskboard-contract.ts` | `BoardReporter` |
| `packages/sdk/src/orchestration/core/taskboard.ts` | `BoardReporter` |
| `packages/sdk/src/orchestration/core/waits.ts` | `CheckLane`, `WaitBoard`, `WaitRowStore`, `WaitSources` |
| `packages/sdk/src/runtime/api/index.ts` | `HardBoundary` |
| `packages/sdk/src/runtime/core/index.ts` | `ASSEMBLED_ONLY_SLOTS`, `HardBoundary`, `scopeKey` |
| `packages/sdk/src/runtime/core/preset.ts` | `HardBoundary` |
| `packages/sdk/src/runtime/core/registry-store.ts` | `scopeKey` |
| `packages/sdk/src/runtime/core/slots.ts` | `ASSEMBLED_ONLY_SLOTS` |
| `packages/sdk/src/session/api/index.ts` | `assertSummaryIsBounded`, `selectInheritedRuns` |
| `packages/sdk/src/session/core/conversation.ts` | `projectConversation` |
| `packages/sdk/src/session/core/entries.ts` | `assertEntryKey` |
| `packages/sdk/src/session/core/fork.ts` | `assertSummaryIsBounded`, `selectInheritedRuns` |
| `packages/sdk/src/session/core/index.ts` | `ObjectiveEvidence`, `ObjectiveVerdict`, `UnfinishedRunRecord`, `assertEntryKey`, `assertSummaryIsBounded`, `assertTag`, `assertTags`, `assertTitle`, `describeCondition`, `projectConversation`, `selectInheritedRuns` |
| `packages/sdk/src/session/core/metadata.ts` | `assertTag`, `assertTags`, `assertTitle` |
| `packages/sdk/src/session/core/objective.ts` | `ObjectiveEvidence`, `ObjectiveVerdict`, `describeCondition` |
| `packages/sdk/src/session/core/run-journal.ts` | `UnfinishedRunRecord` |
| `packages/sdk/src/session/core/session.ts` | `TerminalRunState` |
| `packages/sdk/src/skill/api/index.ts` | `PrepareInput` |
| `packages/sdk/src/skill/core/index.ts` | `PrepareInput` |
| `packages/sdk/src/skill/core/invoke.ts` | `PrepareInput` |
| `packages/sdk/src/tool/api/index.ts` | `ToolCatalogLimits`, `ToolIdempotency` |
| `packages/sdk/src/tool/core/catalog.ts` | `ToolCatalogLimits`, `ToolIdempotency` |
| `packages/sdk/src/tool/core/index.ts` | `BOARD_TOOL_NAMES`, `ToolCatalogLimits`, `ToolIdempotency` |
| `packages/sdk/src/tool/core/system.ts` | `BOARD_TOOL_NAMES` |
| `packages/sdk/src/workspace/core/index.ts` | `MutationLimits` |
| `packages/sdk/src/workspace/core/mutate-contract.ts` | `MutationLimits` |
| `packages/sdk/src/workspace/core/mutate.ts` | `MutationLimits` |

## 验证状态

### PR 跟进（2026-10-22）

- Work #996 已同步主线 `0cdec88e82e6d8524d50c5ccc7665ef1a7ed0be7`。Coding 时间线的冲突保留主线新增的 locale 参数和文案行为，以及本次去掉无用 export 的清理；门禁 baseline 与 API 快照重新生成。整体 build、boundary、对照当前 merge-base 的 health 和页面资源检查通过；26 个资源共 7,609,790 字节，与同步后的主线相同。
- 旧 PR CI 的 Verify 通过，产品子集失败的三个文件已随主线修复测试的翻译接线；本树复核 `agent-prompt-layers`、`coding-report-usage`、`coding-review-card` 共 21/21 通过，原文案、权限和行为断言保留。最终 head 仍待 CI full-suite 与评审完成，以下旧基线的全量结果作为历史对照，不冒充当前结果。
- Prologue #59 的 Codex 评审完成，head `588b03c34c296ef42d6215ac9d0941d4fa7c99ce` 没有发现问题。Quality 作业因 GitHub 账户付款或支出额度被拦截，未启动；用户随后手动合并。已回读主线 `f481d53726b3a896a525386d8e93225f6091e947`，文件树与已审 head 一致。CI 未运行的限制保留，不记录为通过。

### 本地清理初次验收

- Work：最终整体 `pnpm build`、`pnpm boundary:check`、实施基线 merge-base health 与资源体积检查通过；公开 API 仅新增已声明的 `canonicalJsonValue`。全量 1,271 文件（259 个浏览器文件）已跑完，用时 69.5 分钟：1,242 文件通过、29 文件失败；8,620 项通过、11 项按原环境条件跳过。其中 `list-silent-refresh.test.ts` 的源码定位仍要求 `export const`，已改为只按函数名定位，原滚动/刷新断言不变，定向 4 项通过。其余为 27 个基线已有失败及 1 个首次失败、基线与清理树单独重跑均通过的分栏用例；没有未处置的本次新增失败。两个定向文件 16 项通过，其中错误模型测试的 Git 索引误报已消除。门禁未放宽。
- Prologue：完整 `pnpm quality` 通过（679 条稳定测试、类型/构建/API/ratchet/质量门禁、clean consumer 的真实边界拒绝/回环 HTTP/重放/磁盘重开、Rust fmt/clippy）；workspace 定向真实文件测试 81 条通过。稳定测试另以 maxWorkers=2 复核通过（67 文件、679 条），最终构建通过。本地提交 `588b03c3`。
- 没有启动日常 Chrome、写真实 Home、推送、开 PR、合并、发布或创建自动化。
- 不声明真实外部模型/交互式桌面或一骏最终验收通过；本次验收目标是保持行为的本地工程清理。

完整回归首次因删除文件尚未暂存、结构测试按 Git 索引枚举旧路径而中断；补齐本次暂存后，`action-error-model.test.ts` 15 项通过，随后从头重跑全量。该索引修正没有修改测试源码或既有断言。

干净基线 `6d2361652` 在单独工作树离线安装、整体构建，以下三项以相同浏览器和 runner 重跑，均复现同一断言失败：

| 测试文件 | 基线与清理树相同的失败 |
| --- | --- |
| `agent-prompt-layers.test.ts` | 期望“不能调用任何工具”，实际显示 `coding.identity.no-tools`。 |
| `assistant-process-info.e2e.test.ts` | 摘要多出 `Goal`，与精确文案断言不同。 |
| `attention-journey.e2e.test.ts` | 看板 continue 栏 `scrollTop > 80` 等待超时；另一项 Frame 用例通过。 |

直接涉及本次抽取/依赖调整的生产路径已通过：

- `goal-events-state.test.ts` 58 项，Goals 树/提案/约定相关回归；JSON helper 独立期望及 undefined 保留测试。
- `feed-connectors.test.ts` 13 项、`feed-sources.test.ts` 11 项、同步授权 18 项与并发 7 项。
- `project-deletion-service.test.ts` 16 项及其 owner/恢复/清理回归。
- `work-placement.test.ts` 17 项、其浏览器 2 项及移动回滚 5 项；Assistant 业务网关 64 项。
- 安装 22 项、卸载 4 项；只安装打包后 contracts/SDK 的外部插件样例，以及 SDK 导出/Runtime 集成。
- 全部 65 个 `security-invariants*` 文件通过。动作合同快照 25 项通过；资源字节数没有增长。quick-check baseline 重新测量时也吸收了主线原有但尚未刷新的下降，不将其计为本次清理成果。

按既有条件跳过 11 项，没有改测试来跳过：`coding-external-wait-live` 4 项与 `prologue-node-live` 1 项缺少 `MINIMAX_API_KEY`；`live-feed-accounts` 2 项未启用 `MOLIS_WORK_LIVE_ACCOUNTS`；`live-product-integration` 2 项未启用 `MOLIS_WORK_LIVE_ACCEPTANCE`；真实 npm HTTPS 1 项未启用 `MOLIS_SANDBOX_NETWORK_E2E`；官方 npm 包实装 1 项未启用 `MOLIS_PLUGIN_DEPENDENCY_E2E`。本次不据此声称真实账号、外部模型或公网包安装验证通过。

基线对照已完成：以下 27 个文件在干净开始基线上复现相同失败用例、相同通过/总项数与相同错误类型/断言。它们不计为本次新增回归，也没有在清理任务中修改其产品语义或断言。全量后的产品源码没有再改；仅修正列表测试的源码定位，定向 4/4 通过。

| 基线已有失败文件 | 清理树与基线均通过/总项数 |
| --- | --- |
| `tests/code-diff-scale.e2e.test.ts` | 0/1 |
| `tests/coding-state-rings.e2e.test.ts` | 4/5 |
| `tests/coding-taskboard.e2e.test.ts` | 2/3 |
| `tests/cognia-actions.e2e.test.ts` | 2/4 |
| `tests/companion-client-lifecycle.e2e.test.ts` | 3/8 |
| `tests/context-pick-result.e2e.test.ts` | 1/2 |
| `tests/field-fit.e2e.test.ts` | 4/5 |
| `tests/global-ui-interaction.e2e.test.ts` | 2/3 |
| `tests/coding-report-usage.test.ts` | 2/5 |
| `tests/coding-review-card.test.ts` | 3/5 |
| `tests/cognia-store.test.ts` | 9/11 |
| `tests/has-anchors.e2e.test.ts` | 0/1 |
| `tests/content-owner-regressions.test.ts` | 10/11 |
| `tests/media-zoom-board.e2e.test.ts` | 0/1 |
| `tests/model-vision.e2e.test.ts` | 0/1 |
| `tests/issue-naming.test.ts` | 10/11 |
| `tests/plugin-small-ux.e2e.test.ts` | 15/16 |
| `tests/plugin-tab-groups.e2e.test.ts` | 1/2 |
| `tests/personal-plugins-review-fixes.test.ts` | 15/16 |
| `tests/shelf-client-boundaries.e2e.test.ts` | 9/10 |
| `tests/stream-text.e2e.test.ts` | 1/2 |
| `tests/text-wrap.e2e.test.ts` | 0/2 |
| `tests/shelf-jelly-cognia-images-error-model.test.ts` | 11/12 |
| `tests/workbench-deferred-clients.e2e.test.ts` | 1/3 |
| `tests/attention-journey.e2e.test.ts` | 1/2 |
| `tests/agent-prompt-layers.test.ts` | 10/11 |
| `tests/assistant-process-info.e2e.test.ts` | 0/1 |

`context-landing-panes.e2e.test.ts` 在全量中一次失败，收到的是带真实 targets 与正文的窗格事件；基线单独运行 1/1 通过。清理树单独重跑也 1/1 通过；保留首次失败记录，按一次未复现的时序失败报告，未修改该测试或产品代码。

本地完整日志留在本工作树已忽略的 `.tmp/audit/verification/`，汇总与对照结果以本文件为准。临时干净基线工作树在对照结束后删除；交付工作树与本地提交保留供审阅。


## 验收结论与交付

| 编号 | 本轮结果 |
| --- | --- |
| CLN-01 | 完成：两仓刷新后的开始基线、隔离树、扫描方法及局限已记录。 |
| CLN-02 | 完成：72 个 Work 包、29 个 Prologue 模块及两仓原生/工具接线逐项覆盖。 |
| CLN-03 | 完成：15 个删除定义与全部导出收窄依据当前消费者、公开入口、动态接线及实际未合差异裁决。 |
| CLN-04 | 完成：Work 532 处、Prologue 16 处内部导出收窄；必要的类型生成、动态入口和具名在途依赖保留。列表测试定位同步，行为断言保留。 |
| CLN-05 | 通过：离线安装、Work 安装/卸载与外部插件样例通过；被移除的直接 Tauri 依赖仍由其实际消费者声明。 |
| CLN-06 | 通过：5 组 Work 重复实现和 Prologue workspace 写入前检查共用，生产路径与拒绝/恢复验证见上。 |
| CLN-07 | 完成：具体保留项与 Alchemist 退役前置条件逐项记录，不以未知未来用途笼统暂留。 |
| CLN-08 | 构建/边界/API/health/资源门禁通过；完整回归执行完毕。27 个基线已有失败、1 次未复现时序失败及 11 项环境跳过分别记录，未宣称全绿。 |
| CLN-09 | 通过：Prologue quality、679 条稳定测试、81 条 workspace 实操及额外 noUnused 检查通过，公开快照不变。 |
| CLN-10 | 完成：独立 Home 和测试 Chrome、机器构建/浏览器槽位、每批至多 2 文件；全量期间冻结产品源码；临时基线树已清理。 |
| CLN-11 | 完成：交付本地实现、验证与保留清单；Work 本清单所在提交，Prologue `588b03c3`，两仓分支均为 `feature/stock-code-cleanup`。未推送/开 PR/合并/发布，不创建接续自动化。 |

本次一次性清理到此结束；未合入主线，因此 spec 按仓库归档规则继续留在当前目录。已接受在途依赖与退役先后条件由原任务继续负责，本次不接管它们，也不将本地工程清理结果当成产品发布或用户验收。
