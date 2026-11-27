# Observation

**白话：** 把这台电脑上发生的工作——本人在界面上的操作、每次动作调用、各种 AI 的运行、工作流的每一步、定时与后台执行——逐条记下来，留下当时的材料，并如实登记哪些记了、哪些没记、为什么。

**提供：** 工作记录、证据快照、覆盖登记与缺口；系统动作 `observation.report@1`、读取动作（`records.query@1`、`evidence.get@1`、`coverage.get@1`）、记录管理与清理动作（`settings.get/set@1`、`space.get@1`、`cleanup.preview/apply@1`）、评测样本留存动作（`holds.put/release/list@1`）；用途开关、暂停／恢复、自动与手动清理（含留存豁免）、空间占用与容量提醒线；来源范围 `withObservationSource`。评测样本期望、判分与对比运行归 `horizontal/evaluation`。

**不拥有：** 任何业务事实。记录只说「发生了什么、当时用的是什么」，业务状态永远向主人读。

## 三条写入路

1. **动作调用出口。** kernel 结算每一次动作调用时，把输入、结果、起止时间、处理器是否已开始、调用层级（`invocation_id`、`parent_invocation_id`）交给 `CallReports.observed`。宿主把它转给 `ObservationLayer.observed`，记成一行 `action.call`。什么情况留什么内容，见[设计 §7](../../specs/observation-collection/contract-design.md)。
2. **平台服务的 sink。** 宿主装配时给每个服务一个只认它前缀的 `ObservationSink`。服务在一件事开始时（一轮 Agent 运行、一次唤醒、一次连接器拉取）`bind(origin)`，之后在回调里随时 `record(fact)`：即使那时动作的异步上下文已经结束，身份也不会丢。检索、读取与记忆写入是动作调用，随出口记，不另设 sink。
3. **上报动作。** 外壳只经宿主签发入口凭据的界面阶段路由上报 `ui.*`；插件在 Manifest `capabilities.consumes` 声明 `observation.report@1`，只能上报以自己 `plugin_id` 开头的事实。每次至多 100 条、1 MiB；每个上报方每天至多 20,000 条、64 MiB。

分区总览的后台重建完成后，`home.overview_rebuild` 只记成功刷新数和失败数。前台总览查询沿用动作出口的读取记录。

## 接入一种新事实

- **事实名**：`<前缀>.<名字>`，小写点连接。服务的前缀在合同 `OBSERVATION_SERVICE_PREFIXES`，插件的前缀就是它的 `plugin_id`。
- **正文走证据**：`detail` 只放码、耗时、计数这类标量；正文放 `evidence`，给 `content`（采集层存快照）或主人自己的固定版本引用。拿不到的写 `missing` 并给原因（`not_obtained`、`truncated`、`redacted`、`forbidden`、`by_rule`），不要不写。
- **关联**：知道这件事属于哪一轮运行、哪项工作就填 `work.run_id`、`work.work_ref`；不知道就不填，读的人会看到「未关联」，不要猜。
- **来源类别**：插件或服务只能说自己批次的 `first_read`、`catch_up`、`imported`；宿主入口用 `withObservationSource` 包住它整件工作（首次同步、补读、导入、自检）。
- **登记覆盖**：在 `OBSERVATION_COVERAGE_PLAN` 加一行（主人、事实、入口、状态）；没接上的写 `not_connected` 和原因键。`tests/observation-coverage-plan.test.ts` 核对这张表与真实装配一致：说完整的事实要有代码以字面量写它，宿主接上的每个 sink 都要在表里。
- **草稿**：动作的输入是本人还没发出的草稿（输入框草稿、写到一半的回答），在定义上写 `draft: true`（沙箱包写在操作上）；出口只记存过，不留输入与结果。
- **插件上报**：照工作流程插件（`plugins/native/workflows/src/observation.ts`）：Manifest 声明消费 `observation.report@1`，用 `context.services.actions.invoke` 以自己的安装身份调用，在业务写完之后 await、出错吞掉，从不让上报决定业务的成败；被取消或撤权的调用，上报也会被拒。
- **外壳的界面阶段**：工作台页面脚本 `apps/workbench/src/scripts/client/work-records.ts` 是唯一的发送处（项目页发到 `/projects/<id>/api/observation/ui`，记在该项目下）；别的界面代码拿到它的 `record`、`subject`、`interaction(list)` 来记，不另开请求。高频的停留与滚动按对象每分钟汇总。
- **宿主侧的记录器**：服务不在 Host 对象上时，用 `liveObservation(home)` 找到这个 Home 正在运行的采集层；没有运行层（命令行卸载）时，`recordGrantChanges` 直接开这个 Home 的库写同形记录。授权变化写在保存之后、从不抛错。
- **单次文字模型用量**：`HostCompleteText` 和 `hostTextGeneration` 共用 `onReceipt`。技能起草、修订、回放和插件的 `services.model` 经同一个宿主记录器写 `agent.usage`（`stage: "inference"`）。每份实际用量回执只记一次，正文交付的末次复查仍单独进行。记录用原调用的项目、入口和调用编号，带 Prologue 运行编号、请求模型、供应商报告的模型、用量来源与缓存口径。估算值标明来源，未知数字留空。技能回放与判定标为 `trial`。

首页主人在选择落库后记 `home.selection`，采用、恢复与退回基础页分别关联页面版本和选择回执。同一请求重送沿用原回执。助理卡片的候选进入视口、本人最终确认时，工作台分别记 `ui.candidates` 的 `presented` 和 `chosen`。真正启用或按原回执撤销技能时，主人另记 `automation.adoption`。按同一项目及 `work_ref` 查询即可区分人看到了什么、选了什么、实际改了什么。

## 读取、用途开关与清理

- **统一读取动作**：页面、主动助理、效果评测、工作流、插件与 MCP 共用 `observation.records.query@1`（按 `work_ref`、`call_id`、`run_id`、`subject`、时间、平台版本或 `after_seq` 增量游标查询，返回 `kind`、`late` 与可选 `subject_status`）、`observation.evidence.get@1`（按 `record_id` 解封快照或核对主人版本引用）与 `observation.coverage.get@1`（查看覆盖登记、缺口与无活动区分）。
- **跨项目与用途边界**：非本人受众只能读当前 `context.project_id`，不得跨项目或传 `use: "lookback"`；本人跨项目读取由宿主现算当前可读且未关闭的项目集合（`S-74`）。关掉某项用途开关（`assistant`、`evaluation`、`export`）后，对应 `use` 的查询与证据读取立即拒 `observation.use_disabled`。
- **暂停、保留期、手动清理与评测样本留存**：管理与留存动作（`settings.get/set@1`、`space.get@1`、`cleanup.preview/apply@1`、`holds.put/release/list@1`）仅对本人开放。暂停记录前先刷完已入队记录并记下 `paused_at`，恢复时记一段 `by_rule: recording_paused` 缺口；自动到期清理与手动范围清理均在单事务内删除记录、回收无引用快照并记 `expired` 缺口，其中未过期 `evaluation_holds` 覆盖的记录及其关联快照豁免清理并计入 `preserved.evaluation_samples_count`；项目删除与插件清除仍优先删除；容量提醒线到达后只提醒不删记录、不阻断写入。

<a id="observation-evidence"></a>

**怎样读覆盖结果。** `complete` 表示所列入口接上这项事实。评估一次工作是否成功，还要把同轮 `run_id`、`tool_call_id`、有版本的能力和平台动作联系起来，从业务主人读取最终结果。重试、拒绝和只读调用各保留原结果，缺关联时留下缺证原因，不据此推定业务成功。归因样本由[第 63 批](../../specs/post-anticorruption-roadmap/reference/batches/63.md)维护，长期使用效果在[第 76 批](../../specs/post-anticorruption-roadmap/reference/batches/76.md)观察。现行三条写入入口照常使用。

## 出了问题看哪里

- 记录少了：先看 `coverage_gaps`。写不进去的批次记成 `lost`（`write_failed`、`queue_full`、`store_unavailable`），上次进程没写完就退出的记 `unknown_exit`，超出每天额度的记 `report_quota`，密钥取不到的记 `unavailable`。
- 证据打不开：证据用 Home 密钥库里的 `system:observation:evidence:v1` 加密，摘要用 `system:observation:digest:v1`；密钥丢了，旧证据无法打开，新的写入记 `missing: not_obtained`。
- 删了项目还有记录：删项目经 `ProjectDeletedOwner`（`id: "observation"`）清掉，之后对这个项目的写入一律丢弃，直到目录里再有同 id 的项目。
