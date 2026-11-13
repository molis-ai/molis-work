# Observation

**白话：** 把这台电脑上发生的工作——本人在界面上的操作、每次动作调用、各种 AI 的运行、工作流的每一步、定时与后台执行——逐条记下来，留下当时的材料，并如实登记哪些记了、哪些没记、为什么。

**提供：** 工作记录、证据快照、覆盖登记与缺口；系统动作 `observation.report@1`；来源范围 `withObservationSource`。读取动作、保留期清理与用途开关归第 29 批，评测留存归第 30 批。

**不拥有：** 任何业务事实。记录只说「发生了什么、当时用的是什么」，业务状态永远向主人读。

## 三条写入路

1. **动作调用出口。** kernel 结算每一次动作调用时，把输入、结果、起止时间、处理器是否已开始、调用层级（`invocation_id`、`parent_invocation_id`）交给 `CallReports.observed`。宿主把它转给 `ObservationLayer.observed`，记成一行 `action.call`。什么情况留什么内容，见[设计 §7](../../specs/observation-collection/contract-design.md)。
2. **平台服务的 sink。** 宿主装配时给每个服务一个只认它前缀的 `ObservationSink`。服务在一件事开始时（一轮 Agent 运行、一次唤醒、一次检索）`bind(origin)`，之后在回调里随时 `record(fact)`：即使那时动作的异步上下文已经结束，身份也不会丢。
3. **上报动作。** 外壳只经宿主签发入口凭据的界面阶段路由上报 `ui.*`；插件在 Manifest `capabilities.consumes` 声明 `observation.report@1`，只能上报以自己 `plugin_id` 开头的事实。每次至多 100 条、1 MiB；每个上报方每天至多 20,000 条、64 MiB。

## 接入一种新事实

- **事实名**：`<前缀>.<名字>`，小写点连接。服务的前缀在合同 `OBSERVATION_SERVICE_PREFIXES`，插件的前缀就是它的 `plugin_id`。
- **正文走证据**：`detail` 只放码、耗时、计数这类标量；正文放 `evidence`，给 `content`（采集层存快照）或主人自己的固定版本引用。拿不到的写 `missing` 并给原因（`not_obtained`、`truncated`、`redacted`、`forbidden`、`by_rule`），不要不写。
- **关联**：知道这件事属于哪一轮运行、哪项工作就填 `work.run_id`、`work.work_ref`；不知道就不填，读的人会看到「未关联」，不要猜。
- **来源类别**：插件或服务只能说自己批次的 `first_read`、`catch_up`、`imported`；宿主入口用 `withObservationSource` 包住它整件工作（首次同步、补读、导入、自检）。
- **登记覆盖**：在 `OBSERVATION_COVERAGE_PLAN` 加一行（主人、事实、入口、状态）；没接上的写 `not_connected` 和原因键。`tests/observation-coverage-plan.test.ts` 核对这张表与真实装配一致：说完整的事实要有代码以字面量写它，宿主接上的每个 sink 都要在表里。
- **草稿**：动作的输入是本人还没发出的草稿（输入框草稿、写到一半的回答），在定义上写 `draft: true`（沙箱包写在操作上）；出口只记存过，不留输入与结果。
- **宿主侧的记录器**：服务不在 Host 对象上时，用 `liveObservation(home)` 找到这个 Home 正在运行的采集层；授权变化走 `recordGrantChanges`，写在保存之后、从不抛错。

## 出了问题看哪里

- 记录少了：先看 `coverage_gaps`。写不进去的批次记成 `lost`（`write_failed`、`queue_full`、`store_unavailable`），上次进程没写完就退出的记 `unknown_exit`，超出每天额度的记 `report_quota`，密钥取不到的记 `unavailable`。
- 证据打不开：证据用 Home 密钥库里的 `system:observation:evidence:v1` 加密，摘要用 `system:observation:digest:v1`；密钥丢了，旧证据无法打开，新的写入记 `missing: not_obtained`。
- 删了项目还有记录：删项目经 `ProjectDeletedOwner`（`id: "observation"`）清掉，之后对这个项目的写入一律丢弃，直到目录里再有同 id 的项目。
