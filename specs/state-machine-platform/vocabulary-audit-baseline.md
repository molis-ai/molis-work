# 状态词汇审计基线

状态：第 26 批对 2026-11-08 [审计](../../docs/reviews/implicit-state-machines-2026-11-08.md) 的合同取值复核（SMP-02）。源树为 `5945c0271a`。

命名项按 contracts 的 `export type *Status/*State/*Phase` 取全，共 31 个。原审计只留了内联联合的 38 项总数，因此按源树复查所有 contracts 导出类型里由检查脚本识别的状态、相位内联字段，共 71 个。表中保留重复投影及各自的位置。

「公开」是消费者依赖的状态词。「内部」属于平台执行或记账。「派生」由其他事实计算或投影。「非状态机」是结果、模式或接口。公开词汇首片和公开的派生取值见 [平台词表](../../docs/platform/STATE-VOCABULARY.md)，后续采用见 [迁移待办](../backlog/BL-state-machine-migration.md)。持续比较按合并基点，运行 `node scripts/gates/state-vocabulary.mjs --report --base origin/main`。

## 命名类型

| 合同中的位置 | 类型或字段 | 分类 | 当前采用或历史取值 |
| --- | --- | --- | --- |
| [modules/artifacts.ts:22](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/artifacts.ts#L22) | `ArtifactLifecycleState` | 公开 | 留在现有合同，随对应主人迁移 |
| [modules/attention-resumption.ts:17](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/attention-resumption.ts#L17) | `AttentionStatus` | 公开 | 留在现有合同，随对应主人迁移 |
| [modules/characters.ts:30](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/characters.ts#L30) | `CharacterState` | 公开 | 留在现有合同，随对应主人迁移 |
| [modules/functions.ts:49](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/functions.ts#L49) | `JudgmentRuleStatus` | 公开 | 留在现有合同，随对应主人迁移 |
| [modules/model-providers.ts:110](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/model-providers.ts#L110) | `ModelProviderStatus` | 派生 | `ready`、`needs-credential`、`credential-unavailable`、`no-models`、`disabled` |
| [platform/artifact-pins.ts:87](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/artifact-pins.ts#L87) | `ArtifactCompareState` | 派生 | `same`、`changed`、`moved`、`missing` |
| [platform/dom-events.ts](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/dom-events.ts) | `PageStateOwnerId` | 非状态机 | 页面事实主人的标识 |
| [platform/installation-detection.ts:15](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/installation-detection.ts#L15) | `RuntimeConnectionState` | 派生 | `not_detected`、`molis_work_unavailable`、`not_connected`、`needs_repair`、`connected`、`conflict` |
| [platform/installation-detection.ts:33](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/installation-detection.ts#L33) | `MolisWorkWebServiceState` | 派生 | `unsupported`、`unavailable`、`absent`、`stopped`、`running`、`unhealthy`、`needs_repair`、`conflict` |
| [platform/plugin-events.ts:189](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-events.ts#L189) | `PluginEventCursorState` | 内部 | 投递账本的游标 |
| [platform/plugin-wiring.ts](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-wiring.ts) | `PluginInputStatus` | 派生 | 聚合各输入端口的放置结果 |
| [platform/plugin-wiring.ts:151](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-wiring.ts#L151) | `PluginInputPortState` | 派生 | `selected`、`ambiguous`、`missing`、`unavailable`、`unrestored` |
| [platform/plugin.ts:49](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin.ts#L49) | `PluginLifecycleState` | 公开 | 词表 `pluginLifecycle` |
| [platform/sync-transport.ts](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/sync-transport.ts) | `SyncConflictState` | 非状态机 | 冲突快照函数类型 |
| [services/agent-collaboration.ts:36](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-collaboration.ts#L36) | `AgentCollaborationWaitState` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-collaboration.ts:63](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-collaboration.ts#L63) | `AgentContinuationState` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-ports.ts:108](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-ports.ts#L108) | `AgentSubagentState` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-reviews.ts:104](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-reviews.ts#L104) | `AgentReviewStatus` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-run-view.ts:47](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-run-view.ts#L47) | `AgentToolActivityState` | 派生 | `started`、`completed`、`failed`、`unknown` |
| [services/agent-host-runtime.ts:60](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-runtime.ts#L60) | `AgentRuntimeHealthStatus` | 派生 | `ready`、`needs_setup` |
| [services/agent-host-runtime.ts:103](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-runtime.ts#L103) | `AgentRunPhase` | 公开 | 词表 `agentRun` |
| [services/assistant.ts:44](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L44) | `AssistantWorkState` | 派生 | `idle`、`running`、`waiting-input`、`waiting-review`、`paused`、`completed`、`failed`、`stopped`、`needs-check` |
| [services/browser.ts:10](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/browser.ts#L10) | `BrowserPageStatus` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/computer.ts:14](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/computer.ts#L14) | `ComputerHelperState` | 派生 | `unsupported`、`missing`、`stopped`、`ready`、`crashed` |
| [services/connector-host.ts:258](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-host.ts#L258) | `ConnectorConnectionState` | 公开 | 词表 `connectorConnection` |
| [services/knowledge.ts:236](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/knowledge.ts#L236) | `KnowledgeCardState` | 公开 | 词表 `knowledgeCard` |
| [services/memory.ts:38](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L38) | `MemoryState` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/placement.ts:34](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/placement.ts#L34) | `PlacementObjectState` | 派生 | 词表 `placementObject` |
| [services/scheduler.ts:21](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/scheduler.ts#L21) | `ScheduleWakeupStatus` | 非状态机 | 一次唤醒的结果 |
| [services/search.ts:49](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/search.ts#L49) | `SearchSourceState` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/search.ts:60](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/search.ts#L60) | `SearchQueryStatus` | 派生 | `complete`、`partial`、`indexing`、`empty_scope` |

## 内联联合

| 合同中的位置 | 类型或字段 | 分类 | 当前采用或历史取值 |
| --- | --- | --- | --- |
| [modules/context-ledger.ts:51](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/context-ledger.ts#L51) | `ContextEdge.state` | 内部 | `active`、`removed` |
| [modules/context-ledger.ts:92](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/context-ledger.ts#L92) | `ContextObjectRead.state` | 派生 | `missing`、`denied`、`unavailable` |
| [modules/context-ledger.ts:96](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/context-ledger.ts#L96) | `ContextMaterializedNode.state` | 派生 | `missing`、`denied`、`unavailable`、`stale` |
| [modules/model-providers.ts:115](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/model-providers.ts#L115) | `ModelProviderHealth.credential_status` | 派生 | `present`、`missing`、`unavailable` |
| [modules/projects.ts:145](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/projects.ts#L145) | `ProjectDirectory.state` | 派生 | `ok`、`missing` |
| [modules/projects.ts:210](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/projects.ts#L210) | `ProjectDeletionStep.state` | 内部 | `pending`、`complete` |
| [modules/projects.ts:222](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/projects.ts#L222) | `ProjectDeletionReceipt.cleanup_state` | 派生 | 由清理步骤汇总 |
| [modules/runtime-project-context.ts:17](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/modules/runtime-project-context.ts#L17) | `MolisWorkRuntimeContextResolution.status` | 派生 | `bound`、`suggested`、`unbound` |
| [platform/app-host.ts:39](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/app-host.ts#L39) | `LocalHostProjectState.state` | 内部 | `opening`、`ready`、`closing` |
| [platform/app-host.ts:44](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/app-host.ts#L44) | `LocalHostStatus.state` | 内部 | `running`、`closing`、`closed` |
| [platform/plugin-connections.ts:73](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-connections.ts#L73) | `PluginConnectionDescription.state` | 派生 | 现有连接状态的插件读取投影 |
| [platform/plugin-sandbox.ts:169](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-sandbox.ts#L169) | `SandboxConnectionDescription.state` | 派生 | 沙箱读取同一连接状态 |
| [platform/plugin-sandbox.ts:194](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-sandbox.ts#L194) | `SandboxMaterialExtraction.status` | 非状态机 | `sufficient`、`partial`、`insufficient` |
| [platform/plugin-sandbox.ts:211](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-sandbox.ts#L211) | `SandboxMaterialDocumentBatch.status` | 非状态机 | `sufficient`、`partial`、`insufficient` |
| [platform/plugin-sync.ts:63](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin-sync.ts#L63) | `PluginSyncSnapshotAdapter.status` | 非状态机 | `applied`、`unchanged` |
| [platform/plugin.ts:318](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/plugin.ts#L318) | `IntegrationProviderPort.status` | 派生 | `connected`、`disconnected`、`error`、`mock`、`needs_auth` |
| [platform/project-materials.ts:38](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/project-materials.ts#L38) | `MaterialOrigin.state` | 派生 | `ok`、`changed`、`missing`、`forbidden`、`truncated`、`unreadable`、`unmapped` |
| [platform/ui-returns.ts:29](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/platform/ui-returns.ts#L29) | `UiReturnOutcome.status` | 派生 | `ready`、`not_ready` |
| [services/account-dto.ts:3](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L3) | `AccountView.state` | 派生 | 账号会话有效性分支 |
| [services/account-dto.ts:14](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L14) | `Invitation.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/account-dto.ts:18](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L18) | `Membership.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/account-dto.ts:20](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L20) | `OwnershipTransfer.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/account-dto.ts:24](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L24) | `PlatformTenantView.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/account-dto.ts:33](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L33) | `Subscription.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/account-dto.ts:36](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/account-dto.ts#L36) | `TenantView.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-collaboration.ts:118](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-collaboration.ts#L118) | `AgentWorkNode.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-definitions.ts:49](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-definitions.ts#L49) | `AgentDefinitionSource.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-builder.ts:43](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-builder.ts#L43) | `BuilderAgentRecord.phase` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-builder.ts:54](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-builder.ts#L54) | `BoundedInferenceReceipt.state` | 非状态机 | `completed`、`failed`、`cancelled`、`tripped`、`circuit-tripped` |
| [services/agent-host-memory.ts:58](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-memory.ts#L58) | `AgentMemoryCandidateEntry.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-memory.ts:97](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-memory.ts#L97) | `AgentMemoryRecallFact.status` | 公开 | 交付事实与响应证据 |
| [services/agent-host-memory.ts:230](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-memory.ts#L230) | `AgentMemoryDecisionReceipt.state` | 派生 | `present`、`cleared`、`unknown` |
| [services/agent-host-ports.ts:168](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-ports.ts#L168) | `AgentScheduledTask.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-run-view.ts:116](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-run-view.ts#L116) | `AgentTodoItem.state` | 派生 | `pending`、`in-progress`、`done`、`abandoned` |
| [services/agent-host-runtime.ts:134](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-runtime.ts#L134) | `AgentRuntimeDiagnostics.state` | 派生 | 运行及能力探测投影 |
| [services/agent-host-runtime.ts:137](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-runtime.ts#L137) | `AgentRuntimeDiagnostics.state` | 派生 | 运行及能力探测投影 |
| [services/agent-host-session.ts:18](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-session.ts#L18) | `AgentProjectWork.state` | 派生 | `waiting`、`running`、`done`、`failed`、`stopped` |
| [services/agent-host-session.ts:55](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-session.ts#L55) | `AgentSessionMessage.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-session.ts:107](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-session.ts#L107) | `AgentBackgroundTask.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-host-session.ts:151](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-session.ts#L151) | `AgentStepBoard.state` | 派生 | Prologue 工作板回投影 |
| [services/agent-host-session.ts:181](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-host-session.ts#L181) | `AgentStepAmendment.state` | 非状态机 | `succeeded`、`failed` |
| [services/agent-inputs.ts:170](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-inputs.ts#L170) | `AgentInputQuestion.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-inputs.ts:184](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-inputs.ts#L184) | `AgentTurnSteer.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/agent-task-grants.ts:70](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/agent-task-grants.ts#L70) | `TaskGrantCategoryState.status` | 派生 | `granted`、`needs_confirmation`、`unavailable`、`removed` |
| [services/assistant-activity.ts:20](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant-activity.ts#L20) | `AssistantActivity.state` | 派生 | `started`、`completed`、`failed`、`unknown` |
| [services/assistant-cards.ts:38](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant-cards.ts#L38) | `AssistantCard.status` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/assistant-memory.ts:47](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant-memory.ts#L47) | `AssistantMemoryCandidate.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/assistant.ts:328](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L328) | `AssistantRound.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/assistant.ts:390](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L390) | `AssistantWorkObject.state` | 派生 | `current`、`changed`、`missing`、`unavailable`、`moved` |
| [services/assistant.ts:430](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L430) | `AssistantWorkConnection.state` | 派生 | `connected`、`needs-authorization`、`failed`、`disconnected`、`unchecked`、`incomplete`、`off` |
| [services/assistant.ts:576](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L576) | `AssistantBackgroundJob.state` | 派生 | `running`、`completed`、`failed`、`unknown` |
| [services/assistant.ts:673](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L673) | `AssistantUndoable.state` | 派生 | `available`、`undone`、`failed` |
| [services/assistant.ts:688](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L688) | `AssistantUnsettledChange.state` | 派生 | `pending`、`completed`、`failed`、`not-run` |
| [services/assistant.ts:744](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/assistant.ts#L744) | `AssistantRoundDiagnostics.state` | 派生 | `failed`、`unknown` |
| [services/browser.ts:33](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/browser.ts#L33) | `BrowserDownload.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/connector-host.ts:28](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-host.ts#L28) | `ConnectorHealth.status` | 派生 | `connected`、`disconnected`、`error`、`needs_auth` |
| [services/connector-status.ts:43](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-status.ts#L43) | `ConnectorConnectionStatus.state` | 派生 | 授权、连通、范围或能力的聚合值 |
| [services/connector-status.ts:45](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-status.ts#L45) | `ConnectorConnectionStatus.state` | 派生 | 授权、连通、范围或能力的聚合值 |
| [services/connector-status.ts:54](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-status.ts#L54) | `ConnectorConnectionStatus.scope_state` | 派生 | `reported`、`unknown` |
| [services/connector-status.ts:55](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-status.ts#L55) | `ConnectorConnectionStatus.state` | 派生 | 授权、连通、范围或能力的聚合值 |
| [services/connector-status.ts:58](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/connector-status.ts#L58) | `ConnectorConnectionStatus.state` | 派生 | 授权、连通、范围或能力的聚合值 |
| [services/materials.ts:14](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/materials.ts#L14) | `MaterialExtraction.status` | 非状态机 | `sufficient`、`partial`、`insufficient` |
| [services/memory.ts:148](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L148) | `MemoryCandidate.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/memory.ts:174](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L174) | `MemoryChange.state` | 公开 | 留在现有合同，随对应主人迁移 |
| [services/memory.ts:241](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L241) | `MemoryRecallResponse.state` | 派生 | `ok`、`off` |
| [services/memory.ts:270](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L270) | `MemorySignalResult.state` | 非状态机 | `counted`、`duplicate`、`off` |
| [services/memory.ts:664](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L664) | `MemoryUseRecord.state` | 内部 | `used`、`returned`、`omitted`、`not-dispatched`、`dispatched-or-unknown`、`response-observed` |
| [services/memory.ts:697](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L697) | `MemoryLedgerPort.state` | 非状态机 | 信号计数结果及处置投影 |
| [services/memory.ts:711](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L711) | `MemoryLedgerPort.state` | 派生 | 信号计数结果及处置投影 |
| [services/memory.ts:712](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/memory.ts#L712) | `MemoryLedgerPort.state` | 派生 | 信号计数结果及处置投影 |
| [services/search.ts:187](https://github.com/molis-ai/molis-work/blob/5945c0271a/packages/contracts/src/services/search.ts#L187) | `SearchIndexSourceRecord.state` | 派生 | 索引行状态的子集 |
