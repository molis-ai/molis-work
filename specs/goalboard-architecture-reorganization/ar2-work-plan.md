# AR2 — Context Ledger 迁移执行计划

权威范围：`goal-reorg-ar2` revision 1 和总 spec §7、§20.3。完成目标没有缩减；本文件记录串行实现路径，不替代已确认 Contract。

## 目标与边界

跨模块关系只有一个事实 owner；原始 Goal、Artifact、Feed、Session、Project 内容仍归原模块。Goal 内部依赖、父子关系，以及 Artifact 内部版本 lineage 不搬入 Ledger。不能因旧字段名包含 relation / impact / provenance 就移动它。

现状：Context Ledger 只有包占位；Feed 的 `linked_goal_id` 存在 `feed_items`，关联更新、反向查询与内容读取混在同一大文件。Session 关联与规划来源还需逐条核对。现有引用有精确版本和身份引用两种：Artifact 必须 id + version；旧 Goal 身份引用不猜测补成某个历史版本。

## 顺序

1. 建立公开 ObjectRef / ContextEdge API、Ledger 自有 Repository、版本历史与 scope 边界；完成 Feed → Goal 整条读写链和旧数据迁移。Feed 的 disposition、revision、Attention、副作用仍由 Feed 维护，关系写入与它们同事务提交。旧字段迁移后清空，不保留双写权威。
2. 核对并迁移 Session association、Project reference、规划来源以及真正跨 owner 的 impact / provenance。保留模块内部关系；逐条记录 caller 与退出证据，不用空包代替完成。
3. 通过各 owner 公开 Query 装配上下文，补齐精确 Artifact 引用、缺失/过期引用、访问控制、循环、撤销、重试恢复与可重建视图。长久结果归 Artifact，不复制到 Ledger。
4. 验证全部 AR2 标准，更新开发文档与边界说明，再提交证据和复核。整体模拟用户前后端 E2E 仍在全部开发完成之后。

## 第一切片决策

- Ledger 保存引用与关系历史，不保存业务 payload。单值关联的替换由发起模块指定稳定 key；Ledger 只维护每次变更的递增 revision。
- 关系 scope 与对象 scope 必须一致。读取和写入均由注入的访问端口判定；本地 Feed 使用现有本地 project 分区，不将其推断为 Team。
- Feed 本身决定能否关联、何时更新 disposition，Ledger 不复制其业务规则。
- 迁移从 Feed 的旧列读取；写入 Ledger 与清空旧列必须在同一个 SQLite immediate transaction 中。失败回滚，重复打开不重复迁移。旧数据中的缺失引用保留为引用事实，不擅自删除内容或制造对象。
- 所有跨 owner 访问通过 Contracts API 注入；Module 不导入另一 Module implementation。Root 只做组合。

## 验收与验证

第一切片必须证明：真实 Feed public API 的关联、反向查询、重新关联、重复调用和重启无损；旧关联精确迁移、失败不丢失；事件失败使关系和 Feed/Attention 一起回滚；跨 scope 不可见；关系历史不会包含目标 payload。

命令：相关包 build、`pnpm exec tsc --noEmit -p tsconfig.json`、`pnpm boundary:check`、`node --import tsx --test --test-concurrency=1 tests/context-ledger.test.ts tests/feed-module-repositories.test.ts`，影响链路扩大后追加 Feed/Session/HTTP 回归；AR2 收尾运行全量测试。

当前完成等级：开发中。第一切片通过不代表 AR2 完成，后续三个步骤均为必需工作。

## 2026-09-05 第一切片结果

- 已实现 ContextEdge 版本历史、撤销、身份/精确版本引用、访问端口与 scope 拒绝；Feed Goal 关联已切换公共 API，旧列事务迁移并清空。
- 首次 5 项定向回归通过；扩展全部 Feed / Connector / 终端 HTTP 到 87 项全部通过，日志 `/private/tmp/molis-work-ar2-feed-regression.log`。类型检查与包边界 0 错误。
- 补充真实数据库关闭/重开后的关联查询后，5 项定向回归再次通过；最终 `pnpm test` 含完整构建与 **539 / 539** 全量回归通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-first-slice-full.log`。`git diff --check` 通过。此证据仅证明当前第一切片，不替代剩余 AR2 开发及最终整产品 E2E。
- HTTP 回归仍验证原来返回的 Goal、Feed 状态、Attention 和上下文行为；内部持久化断言改为检查旧列为空、公共查询确实读到 Ledger 关联，没有降低产品行为断言。
- 下一步证据：Session Registry 在独立的 `sessions.db`；`session_goal_links` 缺少历史 Project ID，`sessions.current_goal_id` 另存当前值。迁移必须保留原 link ID、时间、actor 和历史顺序，不能用当前 Project 猜测历史归属。先明确这些字段到 ObjectRef 的无损映射，再切换 Registry 与 LegacySessionMigrator caller。
- `input_bindings` 中的 Feed 来源是 Goals 的输入绑定/验证状态，需在下一轮区分其业务 receipt 与跨模块 edge；不能只按相同 Goal/Feed ID 就删掉业务状态。

## Session 切片映射与验收

- Session Registry 的 personal Ledger 分区留在同一 home 的 `sessions.db`，和 Session 修改同事务。它不是 Team 分区；应用层组合 Ledger factory，Module 只消费 Contracts。
- ObjectRef 增加可选 Project namespace 与对象类型，以区分不同 Project 的同名 Goal、以及 Project / workspace 对象。旧历史未知 Project 保留 null，不取 Session 当前值回填。
- `session_goal_links` 的每个 link ID 对应一条 Ledger history；保留原 actor、created_at、ended_at 和 current/history 排序。缺失 ended_at 明确留作未知。当前关系由 Ledger 活跃记录派生；遇到旧 current scalar / link 表冲突，迁移报错并回滚，不选择性丢数据。
- Session 的 Project / workspace 关联也进入 Ledger；workspace_path 是本地目录路径提示，仍留在 Session，不当作另一个对象的内容。旧关联列在迁移后清空并退出读写路径。
- 应用层提供 `openWorkSessionRegistry`，只组装同一事务资源上的两个 Module，不恢复已删除的旧 Registry 实现。更新真实 Web/MCP 入口和相关测试调用点。
- 必须验证真实旧 schema 迁移与重开、跨 Project 同名 Goal、历史与时间保真、取消/重新关联、迁移失败回滚、原 Session API 与 legacy panel/binding migration，以及 workspace reassignment 的项目隔离。

## Session 切片结果

- `openWorkSessionRegistry` 已归 apps/local-host，所有 Web/MCP 与相关测试入口切换；Module 间仍只通过 Contract 注入。
- schema v4 的 Project/Goal/workspace 关联、Goal link 历史已由 Ledger 唯一保存；旧列与旧 link 表清空。Session 内容、身份、Handoff 和本地路径不移动。
- Session/Workspace/Context 定向 **57 / 57** 通过，日志 `/private/tmp/molis-work-ar2-session-regression.log`；全量 **543 / 543** 通过，日志 `/private/tmp/molis-work-ar2-session-full.log`。
- 全量结束前复核补齐了 v1/v2 schema 升级与 Ledger 迁移的外层原子事务；随后重新构建受影响包，类型检查和 **15 / 15** 定向回归通过，日志 `/private/tmp/molis-work-ar2-session-atomic-upgrade.log`。包含 v1 Ledger 初始化失败不留下半升级 schema 的实测。
- 包边界检查：48 packages / 241 source files / 557 imports / 64 dependency edges，0 errors。`git diff --check` 通过。
- 下一段已定位：`src/web/feed-native-plugin-http.ts` 仍直接写 `input_bindings`，`src/web/server.ts` 直接读取；这不是 Coordinator 中的 Goal 内部关系。应分别保留输入确认/快照语义与跨 owner 来源引用，不能把 GoalTree Proposal 的事务 materialize 误当成上下文装配。

## 输入来源切片

先把 input binding 的确认状态、输入名称、快照摘要和原始来源引用收回 Goals 的公开 API，退出 Web 与根 Store 中的业务 SQL / 重复类型。保留现有 `feed_item` 与 `url` 行为，不把 URL 猜测注册成 Artifact。随后分别对账可解析的模块引用与仍需 AR3 显式转换的旧 opaque locator，建立 Ledger provenance / materialization 入口。此中间切片不宣称已完成整个来源迁移。

已完成第一步：`GoalInputBindingsApi`、Goals-owned schema / Repository、Feed promotion 与 Web caller 已切换。Coordinator 只增加公开 API 组合，WebInputBinding 改为 Contract 类型投影。Web / 终端 **93 / 93** 回归通过，日志 `/private/tmp/molis-work-ar2-input-caller.log`；随后增加 Project 归属校验、真实事务回滚测试，并复用 Goals 稳定错误类型。

最终定向校验：重新构建 Goals 包、根类型检查通过，`goal-input-bindings` / `context-ledger` / `session-ledger-migration` 三组共 **10 / 10** 通过。新增 owner 文件均按实际职责组织，没有增加 Huge Class。全量 543 的证据早于这一小段输入 API 切换；93 项 Web / 终端与最后 10 项定向测试是这一小段的直接证据，不能混称全量 545 已运行。

下一步必须继续，而非关闭 AR2：可解析 Feed 来源如何与 Ledger 的唯一关系记录关联、旧 URL 等 opaque locator 如何保留兼容；按 owner Query 装配现有 Feed context / Handoff context，补齐缺失引用、访问范围、重建与恢复证据；再核对 Coordinator 的真正跨模块 provenance / impact（Goal 内部关系和 Governance 决策回执不迁为通用上下文记录）。

## 输入来源关系实施决策

- `goal.input` 是确认时的来源关系，与可重新关联的 `feed.goal` 分开；key 使用输入 binding ID。Goals 保存确认状态、摘要及所属 Goal，只保存 Ledger edge key，不再保存第二份 Feed endpoint。
- 仅迁移 `source_type=feed_item` 且 locator 为非空 `feed-item:<id>` 的记录；URL 及不能解析的历史 locator 原样保留，不能凭空认定为 Artifact。历史 Feed 版本未知，使用身份引用，不推断历史 revision。
- Goals 在同一个数据库事务中完成 schema 补列、关系写入、旧 endpoint 清空。公开 list 通过 Ledger 还原原有 locator，HTTP 返回结构不变。缺失已登记的 edge 明确报错，不返回一个空的来源。
- 验证旧记录迁移/重开不重复、来源删除或 Feed 重关联不改写确认时 provenance、迁移或新写入失败全部回滚、原 URL/摘要/时间/actor 保真和 Project 隔离。完成这段后继续上下文重建，不以此关闭 AR2。

## 临时上下文重建实施决策

先迁移现有 Runtime advance-prompt 的 Feed 上下文：由 Ledger 按 Goal 的 incoming `feed.goal` 边定位来源，再经 Feed 公开 Query 读取内容，保持原来的更新时间排序、指定 Item 检查、内容脱敏和不可信输入边界。Native Feed Plugin 负责业务选择与格式化，Web 仅注入 API。

Ledger 内部提供同步 `ContextMaterializationApi.rebuild`，产出类型化、调用期临时视图及引用 provenance，不复制内容进数据库。读取前校验 scope/权限；owner 可拒绝内容访问；精确版本不匹配返回 stale；缺失对象明确标记；循环只访问一次；遍历预算耗尽明确 truncated；失败向上传递，重试从事实 owner 重建，不缓存失败或部分结果。长期 Artifact 结果、Handoff 及其他剩余范围继续后续切片，不能把此 Query 说成全部 materialization 生命周期已完成。

## 2026-09-05 来源与临时重建切片

已完成输入来源迁移、公开 API 兼容读取，以及 Runtime Feed advance-prompt 的实际接入。来源历史与当前 Feed 关联分离；迁移失败回滚、真实关闭/重开、重复打开不重复边、重复登记失败不篡改旧来源均有生产 API 测试。临时重建测试覆盖循环、精确 Artifact 版本不符、owner 拒绝/缺失、scope 拒绝、遍历预算、失败后重新创建 handler 并读取新内容。

类型检查与包边界通过（48 packages / 245 source files / 568 imports / 64 dependency edges，0 errors）。`context-materialization`、`goal-input-bindings`、`context-ledger`、`desktop-tui`、`web` 合计 **103 / 103** 通过，日志 `/private/tmp/molis-work-ar2-rebuild-regression.log`。首次 Web 回归的三个失败来自测试中的错误 Coordinator 类名和已退出的旧列断言；修正后仍检验相同的 locator、唯一确认记录、Goal 和终端行为，没有改生产语义迎合测试。

### 余项归属核对（尚未关闭）

| 当前事实与调用点 | 核对结论 | 后续动作 |
| --- | --- | --- |
| Coordinator `normalizeImpactFacts` / `impactConflicts`，`impact_bindings.surface/access/input_snapshot` | 目前是 Goal 的资源影响声明和执行互斥依据；surface 是字符串，不是另一个 Module 的 ObjectRef | 不伪造 Artifact/Feed endpoint 塞进 Ledger；仍须把 schema/CRUD/冲突判断从 Coordinator 按 Goals 与执行应用边界抽出，对账 Proposal 应用的两个写入点 |
| Coordinator `field_sources/source_refs` 校验及 Governance Proposal materialization | 包含用户回答、仓库/文档事实与 Runtime 推断，以及待确认状态；不等于已接受的跨对象关系 | 保留确认 provenance；分类迁移真正可解析的引用；opaque locator 与 AR3 输出迁移衔接，不能凭名称批量删除 |
| `RuntimeContextBindingRepository` 与 `src/projects/catalog.ts` workContexts | 保存工作入口→Project 绑定、确认/取消事件、候选拒绝与 setup 幂等；不仅是 Session 当前 Project | 需要拆开关系 endpoint 与控制/授权历史，不让 Ledger 接管拒绝策略；现有 Project/Session namespace 与明确绑定规则保持 |
| `SessionHandoffRepository` / Native Work `SessionHandoffService` | 当前 Handoff 还有独立加密 content_ref 与发送/重试状态；正文不是一次临时 UI 查询 | 下一切片重点：对齐持久结果的 Artifact owner、Ledger 输入/输出引用和 Work delivery 状态；先处理 sessions.db 与 project DB 及加密内容的真实边界，不能用瞬时 rebuild 包装一下就声称完成 |

这些余项仍在总目标中；当前测试证明的是本切片，不能代替全部 AR2、整体 Huge Class 清理或最终模拟用户前后端 E2E。

最终 `pnpm test`（含完整构建）**550 / 550** 通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-provenance-materialization-full.log`；`git diff --check` 通过。新增实现文件为 68 / 95 / 44 行的实际职责单元，没有新增 Huge Class。此次全量覆盖了来源迁移与临时重建的新代码；完成等级仍是 AR2 开发中的已验证切片，不是整产品无损验收通过。

## Handoff 切片：依据原始边界修正

总 spec §20.11 明确将私人 Handoff、未发布 Context Pack 与本地恢复快照留给 Private Work Context；§20.13 也限定“只有符合 Artifact 定义的持久结果迁入”。因此上段“持久 Handoff 一律转 Artifact”的推断不成立：保留私人加密正文、digest、发送状态与重试，不自动注册/发布 Artifact。正式结果转换仍由 AR3 按定义处理，不通过复制 boards/events 到 sessions.db 来勉强适配 Artifact。

本段实际迁移：Handoff → 来源 Goal（含 Project namespace）、目标 Project / workspace 的 endpoint 进入同库 Ledger；来源/目标 Session 属同一个 Work owner，留在 Handoff 状态记录。新 prepare 传入已知 Goal Contract revision，历史版本未知保留 null，不用当前 Session 关联回填旧 Handoff。Handoff public record、编辑/发送/重试/取消、加密正文与本地路径保持不变。

schema v5 在原有 Session 迁移的同一外层事务里迁移 Handoff endpoint 并清空旧列（必填旧列暂留空字符串，workspace 留 null）；新建与修改 Handoff 也同事务提交 Ledger 和 Work 状态。迁移失败保留原版本和所有旧关系，重开不重复写。验证旧 draft/failed/sent/cancelled 保真、源 Session 后来重关联不改写旧 Handoff、目标 workspace 修改/清除与重试不重复历史、Ledger 故障回滚，以及现有隐私/发送/恢复 HTTP 回归。

### Handoff 切片结果

已完成 `handoff-associations.ts`、Registry v5 原子迁移及 Handoff create/update/map caller 切换；Native Work prepare 传递实际 Goal revision。21 项 Handoff / Session Ledger / 隐私回归通过，日志 `/private/tmp/molis-work-ar2-handoff-migration-regression.log`。新测试真实关闭并重开旧 v4 数据库，逐字段对账四种 Handoff 状态和加密正文；迁移失败与新建/修改失败均不留下关系或 Work 状态的半次写入。旧 endpoint SQL 已限定在本 owner 的迁移/清空位置，产品读取只从 Ledger 投影。

包边界通过：48 packages / 246 source files / 573 imports / 64 dependency edges，0 errors。最终 `pnpm test`（含完整构建）**553 / 553** 通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-handoff-full.log`。随后在真实 Native Work prepare 测试中增加 Ledger 精确 Goal 版本断言，**4 / 4** 通过，日志 `/private/tmp/molis-work-ar2-handoff-version-pin.log`。`git diff --check` 通过。

下一段已定位 `RuntimeContextBindingRepository`：当前绑定的 Project endpoint 仍在 `runtime_context_bindings`，绑定/解除事件、setup request 与 suggestion rejection 是控制/授权历史，不能一概删掉。它在 catalog.db，schema 当前 v9，旧 project_id 有 NOT NULL + Project FK；迁移需由 Catalog 升级入口和 Work owner 共同原子提交，不能给它写空字符串绕过 FK。旧 reader 拒绝新版，重绑定/解除/Project 删除及候选拒绝行为要逐项回归。Handoff 的私人正文不再列作 AR2 必须迁入 Artifact 的欠项。

## Runtime 工作入口绑定实施

- Catalog schema v10：Work owner 在同事务中把当前 binding → Project endpoint 写入 Ledger，重建本 owner 的 binding metadata 表并移除旧 Project 列，而不是写入违反 FK 的空字符串。原 binding ID、Runtime/stable-work-context 身份、创建/更新时间、actor 保留。
- Catalog 只组装公开 Ledger / Work API 并负责版本升级；Project 有效性由注入的 Projects Query 校验，不让 Work Repository 跨 Store 查询 Project。所有旧版升级与关系迁移在同一外层事务中完成。
- 绑定确认、拒绝建议、setup 幂等和事件历史仍归 Work 控制状态。事件中的 Project 是历史决定快照，不作为当前绑定的第二事实来源。
- 新建/重绑定/解除绑定及 Project 删除通过 Work API 同事务更新 metadata 与 Ledger；解除产生 tombstone，Project 删除只移除该 Project 当前绑定并保留既有事件/迁移历史。不改变用户确认要求或根据目录自动绑定。
- 验证真实 v9 迁移/重开、故障回滚及重试、重复绑定、重绑定需确认、解除与拒绝建议、Project 删除隔离、未知 Project 拒绝、旧 reader/new schema 拒绝，以及 Catalog/MCP/Web/Session 回归。

### Runtime 绑定定向结果

已完成 Catalog v10 与 Work Ledger 适配。原有 Catalog / Work **19 / 19** 回归通过，日志 `/private/tmp/molis-work-ar2-runtime-binding-first.log`。新增 `tests/runtime-binding-ledger.test.ts` **3 / 3** 通过：真实 v9 metadata 表升级并重开、第二条边写入故障导致整次升级回滚并可重试、绑定/重绑定/解除/Project 删除的故障原子性与其他 Project 隔离。旧 schema 来自迁移前真实定义，不只把版本号调低来模拟升级。Ledger 历史、公开 Binding / Event / Project 数据和删除失败后的文件位置均被校验。

完整 `pnpm test`（含构建）**556 / 556** 通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-runtime-binding-full.log`。包边界检查通过：48 packages / 247 source files / 580 imports / 64 dependency edges，0 errors，日志 `/private/tmp/molis-work-ar2-runtime-binding-boundary.log`。`git diff --check` 通过。这些证据不等于 AR2 或最终模拟用户无损验收完成。

环境待验事实：本轮 `context_resolve` 的 Project 关联可用，但 Session Registry 返回 `schema=5，当前 reader 支持 3`。最终真实用户验证前必须统一已安装宿主与 schema reader，再验证 Session 列表/恢复；不能把仓库测试通过当作当前已安装产品已经无损可用。

## Impact 职责退出

现有 Impact 是 Goal 的资源占用声明（surface、read/write/decide/exclusive、输入快照、确认/停用历史），并非另一个模块的对象，不转换为虚构的 Ledger edge。

- Goals 拥有声明类型、schema、CRUD、校验与历史；Execution 消费声明和有效 Claim，决定能否同时执行。先将冲突判定及并行兼容规则迁入 Execution 的公开纯函数，再迁移 Goals 声明存储与命令。Coordinator 只组装事实和调用结果，不保留规则副本。
- 保持原来的同 surface 判定：read/read 可并行；read/write 仅在读取方固定了输入快照时可并行；write/write、decide、exclusive 冲突。只纳入仍有效 Claim 的 confirmed 声明，保留现有 DecisionReason code、facts、排序和用户提示。
- 目标写入点包括 add/update/deactivate，以及 Contract Proposal / Rewire 应用中的两处 insert；后两处不能无意增加独立事件或改变既有事务、幂等及审计语义。
- 验证输入快照方向、确认状态、不同 surface、冲突原因、并行建议和真实 select/Claim 门禁；迁移命令再覆盖事件失败回滚、修改归属拒绝、停用历史保留、Proposal 原子应用和 Project 隔离。先做职责一致性检查，不以新的包名或函数包装充数。

### Impact 规则迁移

`ImpactBindingRecord` / `ImpactAccess` 已移到 Goals Contract，旧类型路径仅保留别名。Execution 的 `executionImpactPolicy` 统一承担冲突判定和并行兼容；Coordinator 已删除规则副本，保留其调用期有效 Claim / confirmed 声明投影。声明 CRUD、schema 与 Proposal 写入仍是下段必需工作。

受影响包构建、根类型检查通过；新增规则测试和 v1 / MCP 回归 **151 / 151** 通过，日志 `/private/tmp/molis-work-ar2-impact-policy-regression.log`。随后 `pnpm test` 完整重新构建宿主并运行 **559 / 559** 回归通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-impact-policy-full.log`；这次 MCP 子进程读取的是更新后的根宿主构建。仍不能替代最终已安装产品的模拟用户验收。

接续位置：Coordinator `addImpact` / `updateImpact` / `deactivateImpact` / `normalizeImpactFacts`、Contract Proposal 与 Rewire 两处 `impact_bindings` insert、root Store 的 Impact schema / migration / snapshot mapper。使用现有 `GoalsCommandContext` 的事务、错误工厂、幂等与事件端口承接，避免再造一套命令基础设施；保留 Proposal 应用自己的审计事件粒度。规则迁移后剩余工作仍在 AR2，未报告 Run 完成、未提交完整验收证据。

### Impact 声明 owner 迁移

已实现 `GoalsModule.impacts`、`GoalImpactRepository` 和 Goals-owned schema/history migration；Coordinator 原命令、字段校验及两处 insert 均退出，root Store schema/mapper/migration 也切公开 owner。Web/CLI/MCP 使用各 App 的 Goals adapter，测试跟随同一公开 API，没有保留旧方法转发。`registerAccepted` 仅承接已有批准流程内的事实写入，保留其外层事务与整体审计事件。

受影响包构建与根类型检查通过；Goals / v1 **119 / 119** 通过，日志 `/private/tmp/molis-work-ar2-impact-owner-first.log`。新增 owner 测试 **3 / 3** 通过，覆盖原始作者/时间/停用历史、逐字段审计内容、旧 schema 升级失败回滚与重开、事件写入失败后的事实/幂等回滚及原请求重试。随后在真实 Contract Proposal 与 Candidate→Rewire 流程增加整体审计失败回滚，确认声明随整次应用一起撤销，重试不重复独立事件。

最终 `pnpm test`（含完整构建）**562 / 562** 通过，0 失败/跳过，日志 `/private/tmp/molis-work-ar2-impact-owner-full.log`。包边界通过：48 packages / 250 source files / 591 imports / 64 dependency edges，0 errors，日志 `/private/tmp/molis-work-ar2-impact-owner-boundary.log`。边界脚本原来用已删除的 `addImpact` 作为 `readProjectGuidance` 检查区间终点，已更新为实际相邻方法，未降低原 Query owner 要求。`git diff --check` 通过；生产 `impact_bindings` SQL 只剩 Goals 的 `impact-repository.ts`。

下一核对点：Coordinator `validateContractProposal` 的 `field_sources` 校验、Draft dialogue fact/assumption 来源整理、legacy Proposal→Goal Tree 的来源投影。这些已知记录保留 user_answer / repository_fact / document_fact / runtime_inference 和待确认状态，本身不是已确认 ContextEdge。存储已在 Governance；需把相应来源规则从 Coordinator 收回正确 owner，不能把普通文件/URL/对话 locator 伪造为 Artifact ID。完成这部分后再对 AR2 的所有要求、caller 与 publication/materialization 基线适用性逐项审计，尚未关闭 AR2。

## Governance 来源规则迁移

将事实/假设的来源整理、Contract 字段来源完整性校验、旧 Proposal 的来源与状态投影迁入 Governance 公开 `provenance` API。Module 消费类型化的来源输入或 Governance snapshot，不依赖 Coordinator、Goals 实现或其 Store。事实/假设类型移至 Governance Contract，旧路径保留类型别名。

保持原规则与结果：用户回答标记已确认，仓库/文档事实保留自身确认位；推断只能作为假设；来源去重并追加原 clarification turn 引用；置信度范围、必需字段、待确认状态与错误码不变。旧 Contract/Candidate/Rewire 的原 ID、决定、状态映射、来源 locator、最低置信度、时间和 payload 无损保留，不新建关系或发布结果。验证错误输入、来源顺序/去重、可选字段来源门禁、空历史来源、原始记录不被改写、三种历史 Proposal 与真实 Draft/Proposal 流程重开/确认行为。

补充 caller 审计发现：native Goal Tree 条目的来源去重、理由、置信度及待确认门禁还留在 Coordinator。将这一组来源规则一并迁入同一个 Governance API，提交和用户修订均使用同一路径；不迁移整个 Goal Tree 编排，不改变 payload、受影响对象和决定权限规则。保留旧错误顺序与条目序号，来源不足或提前确认的条目仍不得保存。

## AR2 收尾补证

总 spec §20.3 要求 Ledger 丢失不得删除原始内容。增加隔离临时数据库的生产 API 测试：创建真实 Goal、Artifact、Feed 与 Work Session 内容，删除测试库中的 Ledger 记录，再关闭/重开，通过各 owner 公开 Query 核对内容仍在、关系不被旧字段偷偷恢复。此破坏操作仅针对测试新建数据库，不接触用户项目或已安装产品数据。异步 publication/materialization 在现有基线中的适用性与未实现状态记录于 `ar2-validation.md`，不凭词名或测试全绿宣称未来功能已交付。

Feed promotion caller 仍有一处直接查询 Goals 表来判断既有关联是否可重用；改为公开 Goals Query，保留 Project 隔离和 trashed/archived 排除。只处理本次关系迁移的这个调用点，不扩成整个 Web 入口重构。

### Governance 与 AR2 收尾结果

Draft 事实/假设、Contract 字段、native Goal Tree 条目来源规则和 legacy Proposal 展示已迁 Governance。新增公开端口测试及实际用户修订流程验证：错误来源/提前确认会拒绝整次决定且不留下部分应用，原请求修正后可重试，来源排序去重并保留 pending 状态。没有改变接受门槛或扩大 Runtime 权限。

完整 `pnpm test`（含构建）**566 / 566** 通过，日志 `/private/tmp/molis-work-ar2-governance-final-full.log`。之后的内容独立性补证与 Feed public Query caller 修改，根类型检查及 **61 / 61** 定向/Web 回归通过，日志 `/private/tmp/molis-work-ar2-owner-caller-regression.log`。最初独立性测试误用了不存在的应用查询方法，修正为真实 `goalQueries.readGoalContract` 后通过；没有为测试改动产品语义。

最终包边界与 diff 检查通过；归属、SQL/caller 退出、基线不存在的 publication/异步 materialization 及其不应假报完成的边界，详见 [AR2 验收核对](./ar2-validation.md)。本叶子已具备提交证据和自验的条件；后续 AR3、剩余模块迁移、Huge Class 清理与真实前后端用户操作验收继续保持未完成。

Molis Work 已于本轮记录执行完成、三项 criterion 对应 Evidence 和 self-verifier pass，事件 cursor 919 返回 `goal-reorg-ar2` 为 completed。自验另运行 33 项 AR2 直接测试全部通过，日志 `/private/tmp/molis-work-ar2-self-review.log`。当前接续 `goal-reorg-ar3`，整体目标不关闭。
