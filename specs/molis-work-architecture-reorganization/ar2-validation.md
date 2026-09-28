# AR2 验收核对

对应 `goal-reorg-ar2` revision 1。本文是验收记录，不修改原范围，不代表最终整产品无损验收。权威需求为总 spec §7、§20.3 及当前 Goal Contract。

## 范围解释与未实现项

总 spec §1、§11 的本次重组规则和 AR2 `out_of_scope` 要求：完整建立包，迁移现有功能，不实现当前基线没有的未来业务。§20.3 描述模块最终应拥有的能力，不意味着本次已经交付所有能力。

- **已实现：** ObjectRef / ContextEdge、关系 revision/tombstone、授权分区、owner Query 驱动的临时上下文重建，以及下表中的实际 caller 迁移。
- **未实现且不是已有功能丢失：** Personal → Team Publication Receipt、异步 Materialization Definition / Durable Outbox handler / 请求取消与持久结果状态。基线 Context Ledger 与 Sync 包只有 descriptor；基线 Coordinator 的 `materializeGoalTree*` 是“用户批准提案后修改正式对象”，不是上下文后台装配。不能把两者混称为已迁移的 materialization。
- **已补齐的直接证据：** `context-owner-isolation.test.ts` 在独立临时库中删除 Ledger 记录并关闭/重开，真实 Goal、Artifact、Feed 与 Work Session/event 内容不变；关联消失且不从旧字段复活。这里只证明关系与内容的所有权隔离，不承诺凭空恢复丢失的关系历史。
- **仍在后续重组任务：** AR3 处理符合 Artifact 定义的已有结果入口；Goals Native Plugin / 规划决定入口继续其已确认切片；最终整产品前后端模拟用户验证、Huge Class 清理与二次 E2E 不由本叶子的模块回归替代。

## 唯一事实 owner 与调用链

| 原职责 | 现在的正式入口 / owner | 退出与保留边界 |
| --- | --- | --- |
| Feed → Goal 当前关联 | Feed `goal-links.ts` → Ledger API | `feed_items.linked_goal_id` 迁移后清空；响应同名字段派生，Feed 自己的状态、内容、事件与 Attention 不搬走 |
| Goal 输入的已确认 Feed 来源 | Goals `input-bindings.ts` → Ledger API | `goal.input` 与 `feed.goal` 分开；输入确认/摘要仍归 Goals，URL / opaque locator 不伪造对象身份 |
| Session → Goal/Project/workspace | Work `session-associations.ts` → Ledger API | 旧 scalar/link 表只供原子升级；历史未知 Project/version 不补猜测值 |
| Handoff → 来源 Goal/目标 Project/workspace | Work `handoff-associations.ts` → Ledger API | 新 prepare 固定实际 Goal revision；私人加密包、Session 内部关系、发送/重试仍归 Work |
| Runtime 工作入口 → 当前 Project | Work `context-binding-references.ts` → Ledger API | Catalog v10 删除旧 endpoint 列；绑定/解除决定与 setup 幂等历史仍归 Work |
| Goal 资源 Impact 声明 | `GoalsModule.impacts` | schema/CRUD/migration/mapper 与两处批准流程 insert 均退出 root；资源路径不是 ContextEdge |
| Impact 并行 / 冲突规则 | `executionImpactPolicy` | Coordinator 只提供有效 Claim 和 confirmed 声明，没有规则副本 |
| Draft 事实/假设、Contract/native 提案来源 | `GovernanceApplicationApi.provenance` | root 只调用公开校验；推断不变成事实，来源不足不保存，修订不跳过待确认 |
| 旧 Contract/Candidate/Rewire 展示 | Governance `legacy-proposal-view.ts` | 无写入；原 ID、来源、置信度、决定、状态和时间保持 |
| Runtime advance-prompt Feed context | Native Feed `readLinkedFeedContext` → Ledger materializer → Goals/Feed Query | Ledger 不读取其他 Store；Native Plugin 保留 Item 选择、排序、脱敏和提示格式 |

Goal 内部父子/依赖归 Goals；Artifact 内部版本 lineage 归 Artifacts；Governance 的待确认变更、Control event 的历史快照不是第二份当前对象关系。

## 验收证据映射

| Criterion | 直接证据 | 当前结论 |
| --- | --- | --- |
| `ar2-boundary` | `packages/contracts/src/modules/context-ledger.ts`、Ledger 的 repository/service/materialization、各 Module 的注入 API、`pnpm boundary:check` | 通过：Ledger 只依赖 Contracts，唯一 SQL owner；Host 组装同库事务，Module 只消费注入接口，无 deep import |
| `ar2-legacy-exit` | 上表 caller；`tests/context-ledger.test.ts`、`session-ledger-migration`、`handoff-ledger-migration`、`runtime-binding-ledger`、`goal-input-bindings`、`goal-impact-owner` | 通过：真实升级、关闭/重开、旧列退出及故障回滚；对应 Impact / provenance 规则已从 Coordinator 删除，不保留规则副本 |
| `ar2-result` | `tests/context-materialization.test.ts`、上述迁移测试、`execution-impact-policy`、`governance-provenance`、`context-owner-isolation` 及 v1/Web/MCP 回归 | 通过：精确版本、scope、权限、循环、缺失/过期/拒绝、失败后重建和内容独立性；未来 publication 未实现，不据此声称其已通过 |

测试日志与分步结果见 [AR2 执行计划](./ar2-work-plan.md)。路径有效、类型通过或测试数量本身不作为功能完成证明；必须检查断言实际覆盖的行为。

## 最终检查结果

- `pnpm test` 完整构建与 **566 / 566** 回归通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-governance-final-full.log`。覆盖 Governance 来源迁移及增强的真实修订事务测试。
- 此后补充原始内容独立性测试，以及 Feed promotion 查询入口替换；根类型检查与 **61 / 61** 原始内容/Web 回归通过，日志 `/private/tmp/molis-work-ar2-owner-caller-regression.log`。不把两个新增测试说成已运行全量 568。
- 最终包边界、`git diff --check` 通过。SQL 核对：`context_edges` 仅在 Ledger repository，`impact_bindings` 仅在 Goals impact repository；Session/Handoff/Runtime binding 的旧 endpoint 读取限定本 owner 升级路径。Feed SQL 中旧关联列的新写入值为 null，响应由 Ledger 派生。
- Coordinator 剩余 `normalizeProposedRelations` 处理 Goal 内部依赖提案的合法性和依据，不是跨 Module 关系存储；Goals Native/规划决定入口在后续已确认切片中治理，不借 AR2 吸收整套 Governance 编排。
- 新增 owner 实现分别为 Ledger schema/query/service/重建、业务 association、Impact commands/repository、Governance provenance/legacy projection；没有把原 Huge Class 整体搬到新包。原 Coordinator 和其他历史大文件尚未全部拆完，仍在总目标中。

## 已安装产品与最终验收缺口

当前宿主 MCP 可读取项目与 Goal，但 Session reader 曾返回支持 schema 3、实际数据为 5。必须在最终模拟用户验收前更新已安装宿主并验证真实 Session 列表/恢复。仓库全量测试不证明当前安装包已更新，也不证明所有重组 Goal 或产品发布完成。
