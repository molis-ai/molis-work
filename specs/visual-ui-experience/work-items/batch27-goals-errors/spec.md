# 第 27 批 Goals 记录读取错误

状态：已实现，2026-11-11 第 27 批（待公共 C 在整批最终头合审）。待办 BL-819、BL-821 随之删除。

## 实现记录（2026-11-11）

- **一处解码**：`plugins/native/goals/src/stored-json.ts` 的 `storedJson(row, 表, 列, 备用值)` 取代 Module 与 Governance 各一份的 `parseJson` 和 `rowJson`，`goals.storage.record_unreadable` 也只在这里声明一次（`command-error-codes.ts` 引用它，Governance 的重复声明删掉）。喂给它的每条 SELECT 投影 `rowid AS stored_row`（联表写 `t.rowid`）；没投影的语句第一次读就报 `TypeError`，所以现有的 Goals 用例都在替这一点把关，不必等到某一行坏了才发现。
- **比设计多收的一处**：`goal_work_event_judgments.basis_json` 原来直接 `JSON.parse`，坏行抛出带原文片段的 `SyntaxError`；现在同样走 `storedJson`，报记录错误并带位置。
- **BL-819**：`PersonalMethodsSnapshot.run` 收原调用的 `signal` 与 `assert_authority_current`。Home 读取失败时：已归类的取消原样抛；信号已中止抛信号的原因（平台入口中止时给的是 `actions.cancelled`）；然后对**所有**非取消的失败都再问一次原调用的授权，撤权的按原拒绝落码（设计只要求在转交详情前问；对 Home 不可用也问，撤权的调用就不会被说成「Home 没回应」）；之后才区分记录错误（原样透出）与 Home 不可用。
- **断言的预期变化**：RAC-1495 原来断言错误详情里没有表名和列名（T-050 保留定位），按用户 2026-11-09 的决定改成断言详情正好是表、列、行号，并继续断言没有存的原文和方法 id。

## 目标与边界

[27-4](../../../post-anticorruption-roadmap/reference/batches/27.md#batch-27-item-4) 的 BL-819 与 BL-821。本片归 E 轨 Goals，涉及跨出口的错误合同。实现写手和 C 轨评审待分配。本稿交付合同设计，后续实现和验收按第 27 批及原需求约定的完成程度执行。项目使用个人规划方法时，能区分 Goals 记录读坏、Home 不可用和调用取消。需要排查坏记录时，从 Goals 的错误详情取得最小定位信息，普通界面继续用现有的记录读取失败文案。

依据为 `4547c26b5`。T-025 的任务书在 `7d179e65d9`，实现 `9688a61b5` 让项目侧 Module 与 Governance 拒绝不可解析的文本，保留 SQL NULL 的既有备用值。T-050 的任务书在 `5d35b5150`，实现 `4ff81e60e` 将同一判定接入 Home 的个人方法列表和保存事务。T-050 的交接记录了同一个坏 Home 上的进程内实测，Home 列表报记录读坏，项目采用方法报 Home 不可用，项目快照仍正常。当前设计证据来自源码、原任务及用例，另有下文的内存 SQLite 探针。 [T-025](https://github.com/molis-ai/molis-work/pull/1359) · [T-050](https://github.com/molis-ai/molis-work/pull/1374)

本片处理两个解码入口及这次 Home 读取的失败回执。Goals 拥有 Home 的个人方法包和项目库的 Goal、事件及治理事实。平台拥有动作分派、授权、错误传输和调用诊断。合法 JSON 的业务形状校验、坏库维修入口及平台诊断页承载位置信息均属其他需求。恢复由维护者在对应库修正原值，随后通过原动作重新读取。 [事实主人](../../../../docs/SSOT-MATRIX.md) · [Goals 开发要求](../../../../plugins/native/goals/README.md#开发要求)

## BL-819 项目读取 Home 的失败回执

- 项目的 `goals.planning.catalog`、`goals.planning.read`、`goals.planning.apply`、`goals.document.read@1`、带非空方法采用请求的 `goals.events.configure@1` 会读个人方法，以上均为第 1 版。各自先在项目库窗口运行。第一次读空快照时抛 `goals.planning.personal_not_loaded`，读窗口结束，写事务回滚。项目实例在窗口外以现行 `services.actions.invoke` 调用同一插件的 Home 动作 `goals.planning.personal.list@1`，传 `{}` 与原调用的 control，依现有成功响应中的 `scope` 取个人方法。只在这次加载成功后重跑原项目处理器一次。无需个人方法的调用无需这次加载。 [项目装配](../../../../plugins/native/goals/src/plugin.ts) · [快照](../../../../plugins/native/goals/src/runtime-ports.ts) · [Host 动作客户端](../../../../apps/local-host/src/plugin-actions-client.ts)
- Home 实例从 `personal_planning_method_packs.pack_json` 解码。任何一条不可解析，`personal.list` 整体抛出 `goals.storage.record_unreadable`，类别为 `internal`。Home 的 `personal.save@1` 先读全表确定版本，遇同一故障便在写前失败。内核在处理器成功返回时校验动作输出，处理器已抛的错误经结算原样上抛。项目侧的 `PersonalMethodsSnapshot.run` 只对加载错误检查 `kind === "cancelled"`，其余改成 `goals.planning.personal_unavailable`，类别为 `unavailable`。 [Home 装配](../../../../plugins/native/goals/src/home-plugin.ts) · [个人方法仓储](../../../../plugins/native/goals/src/module/planning/personal-methods.ts) · [动作结算](../../../../packages/kernel/src/action-settlement.ts)

| 口径 | 用户看到什么 | 对调用方的影响 |
| --- | --- | --- |
| A 已选，原样透出已知的记录错误 | 项目和 Home 均说明有一条 Goals 记录读不出来。 | 本次坏行从 `personal_unavailable/unavailable` 改为 `goals.storage.record_unreadable/internal`，采用共用错误模型的 HTTP 入口随之由 503 变为 500。按码分支的固定调用方须把该故障视为记录待修，继续按原码处理 Home 不可用。 |
| B 未采用，保留 `personal_unavailable`，添加已知原因 | 项目用同一句记录读取失败文案，使用通用 API 的人可从错误详情确认具体原因。 | 外层码与 503 保留，详情须稳定提供原因为 `goals.storage.record_unreadable` 的结构。按外层码或 HTTP 状态判断的工具仍会把坏行识别为暂时不可用。要区分须读取原因，只有消息的消费者也须靠文案辨认。 |

用户 2026-11-09 已选 A，只在同一插件的这次已登记 Home 读取中识别精确的现有码及类别，直接保留错误对象的码、消息和允许透出的详情。真实无 Home、Home 依赖不可用及其他加载错误沿用 `goals.planning.personal_unavailable` 的现行映射。外层分派的权限拒绝由原入口处理。工作流的固定动作引用、助理工具的已选动作和 MCP 工具名继续使用原 id、版本、提供方与成功 schema，错误码与类别的改变仍是调用合同变化。 [合同变更流程](../../../../docs/system/CONTRACT-CHANGES.md) · [动作快照](../../../../tooling/gates/actions/actions.tsv)

取消优先。处理器前的取消由现有分派短路。加载失败时应保留原信号已中止的原因与已经归类的取消，使用 SDK 的 `actionErrorKind` 识别只带 `actions.cancelled` 码的标准取消。该码在平台表里是 `cancelled`，构造 `ActionError` 时的 `kind` 字段可省略。只有原调用仍有效，才可把这次 Home 的记录错误及详情交给原调用方。沿用原 control 的同步授权检查，尤其核对 Home 拒绝返回到项目这一跳是否已检查原调用。发现缺口时在转交详情前检查该 control，不加异步发现或授权查询。已撤权、已停用及过期调用走现有拒绝和事务栅栏。 [平台错误表](../../../../packages/contracts/src/platform/action-errors.ts) · [共同分类](../../../../packages/plugin-sdk/src/errors.ts) · [原调用与权限栅栏](../../../../packages/plugin-runtime/src/action-scope.ts) · [S-18](../../../../docs/system/security-invariants/S-18.md)

## BL-821 定位从哪来

在基点按调用表达式逐个计数。Module 有 13 处直接读（项目 12，Home 1）和 16 处经 `rowJson` 读。Governance 有 12 处直接读。总计 41 个字段解码点，覆盖 19 张表的 40 个不同表列，`policy_bindings.policy_json` 在两条路径重复读取。另有 `rowJson` 内一次单纯转发。旧任务书的「二十多处」早于 Home 接入，也未作为这次的计数。

| 读取位置 | 表与列 | 可取的现有键 |
| --- | --- | --- |
| `module/repository.ts`、`query-facts-repository.ts` | `policy_bindings.policy_json`（两处） | `policy_binding_id`，前者两条 SELECT 须补投影 |
| `module/repository.ts`、`module/planning/personal-methods.ts` | `planning_method_packs.pack_json`、`personal_planning_method_packs.pack_json` | `method_id`，项目键还含项目范围，两边 SELECT 当前只取包文本 |
| `module/repository.ts` | `goals` 的 `in_scope_json`、`out_of_scope_json`、`constraints_json`、`required_inputs_json`、`promised_outputs_json`、`decomposition_review_json` | `goal_id` |
| `module/repository.ts` | `acceptance_criteria` 的 `target_json`、`required_evidence_json` | `criterion_id` |
| `module/repository.ts` | `project_guidance_entries.source_refs_json`、`project_guidance_revisions.source_refs_json` | `guidance_id`、`revision_id` |
| `module/event-facts-config-records.ts` | `goal_event_config_versions.adopted_planning_json`、`goal_event_types.source_json/fields_json` | 配置版可投影 `config_event_id`，类型由项目、Goal、`type_id` 与 `type_version` 唯一定位 |
| `module/event-facts-requirement-records.ts`、`event-facts-work-event-records.ts` | `goal_event_requirements.source_json`、`goal_work_events.payload_json` | `requirement_id`、`event_id` |
| `module/event-state-concern-records.ts`、`event-state-outcome-records.ts` | `goal_event_concerns.scope_json`、`goal_event_closures.unmet_reasons_json` | `concern_id`、`closure_id` |
| `module/event-state-decision-records.ts` | `goal_event_decision_requests` 的 `options_json`、`scope_json`、`proposed_change_json`、`commitment_json` | `request_id` |
| 同上 | `goal_event_applied_decisions` 的 `effects_json`、`scope_json`、`commitment_json`、`authorized_change_json` | `decision_id` |
| `governance/mappers.ts` | `goal_tree_proposals` 的 `narrative_json`、`decision_json` | `proposal_id` |
| 同上 | `goal_tree_proposal_items` 的 `payload_json`、`source_refs_json`、`explanation_json`、`affected_objects_json`、`baseline_versions_json`、`conflict_json`、`materialized_objects_json` | `item_id` |
| 同上 | `goal_tree_proposal_decisions.materialized_objects_json` | `decision_id` |
| `governance/event-decisions.ts` | `goal_event_trusted_decisions.scope_json/change_json` | `decision_id` |

表、列由对应 mapper 写成固定名称。上表的业务键仅用于说明现有读取路径，不进入错误详情。`method_id`、`goal_id`、`criterion_id` 等可来自业务输入，进了数据库也仍可能含用户内容。用户 2026-11-09 选择统一提供表、列和短期库行号，不披露业务键，即使某些键由 owner 生成也不另设例外。选择范围继续来自可信动作上下文和仓储参数。 [项目库声明](../../../../plugins/native/goals/src/project-database.ts) · [Home 库声明](../../../../plugins/native/goals/src/home-database.ts)

复用 `ActionError.details`，精确形状为 `{ storage: { table, column, row_ref } }`，三个值均为字符串。`row_ref` 从既有 SELECT 返回的同一行取得表限定的 SQLite `rowid`，使用十进制字符串；只供当前库的当次维护定位，不是跨重建稳定身份。消息与详情排除原 JSON、解析器原异常、业务键、其他列、SQL、凭据和绝对路径，不新增受限维护出口或额外查询。用 Home 实际 DDL 与原生 owner SQL 授权做的内存探针读到了自有表的行号，读取外表被拒；同一业务行另行重建时从行号 5 变成 1。项目库现行语句检查接受 `Rowid` 和 `Cast` 指令，实际查询仍须经原授权验证。此探针不代替实现后逐读取路径的验收。 [Home 语句授权](../../../../packages/storage/src/sqlite-owner-boundary.ts) · [项目语句检查](../../../../packages/plugin-runtime/src/project-database-statements.ts)

## 谁会收到详情

| 现有出口 | 实际接收 |
| --- | --- |
| 进程内动作及通用 HTTP | `defineErrorCodes` 接受可选详情。SDK 的 `actionErrorResponse` 发送 `{ error, code, details? }`，由类别映射 500 或 503。SDK 的 `actionErrorFromResponse` 能按状态复原类别及详情。Goals 的 `goalsRoute` 失败出口及项目设置汇总也采用这个错误体。 [SDK](../../../../packages/plugin-sdk/src/errors.ts) · [Goals 路由](../../../../plugins/native/goals/src/http/failure.ts) · [项目设置汇总](../../../../apps/local-host/src/web-goals-read.ts) |
| Home 与项目的专用规划设置页和 API | `web-planning.ts` 的读及相应保存或采用错误走 400 与 `{ error }`。原样透出后项目会收到记录读坏文案。已有 `method_not_found` 的 404 由专用路由处理。 [规划设置出口](../../../../apps/local-host/src/web-planning.ts) |
| MCP 与助理 | MCP 的动作错误 JSON 会保留详情，只滤掉详情内伪装成 `code` 或 `call_id` 的键。助理的 HTTP 错误适配保留外部 owner 的详情。Agent 的通用工具网关把错误变成码与消息文本，工作流的步骤失败取错误消息。故详情要按技术调用方可读处理，普通提示及模型用语无需拼入位置。 [MCP](../../../../apps/mcp/src/tool-error.ts) · [助理](../../../../apps/local-host/src/assistant/assistant-error.ts) · [Agent](../../../../horizontal/agent-host/src/adapters/prologue-action-gateway.ts) · [工作流](../../../../plugins/native/workflows/src/step-runner.ts) |
| 设置 › 诊断 | 调用结算只传码与消息，未执行与失败读的记录只留调用元数据和码，已执行的失败命令可留截断消息。现有诊断页按已有编号查这些行，无法从中取得 `details`。 [结算](../../../../packages/kernel/src/action-settlement.ts) · [调用记录](../../../../apps/local-host/src/action-call-log.ts) · [设置诊断](../../../../apps/local-host/src/web-call-diagnostics.ts) |

**用户决定（2026-11-09）**：BL-819 如实返回现有的 `goals.storage.record_unreadable/internal`，通用 HTTP 从 503 改为 500；Home 真正不可用时保持原错误。BL-821 在已授权的动作及现有 HTTP/MCP 错误详情中提供表、列和短期库行号，不提供记录正文或业务键；库重建后行号可能变化。普通界面继续使用现有记录读取失败文案。该决定替换 T-025、T-050 对定位字段的保留，不再等待用户重复确认；原始内容及凭据的拒绝断言继续有效，公共 C 合审与实现尚未完成。

## 实现边界与合审

BL-819 落在 `plugins/native/goals/src/runtime-ports.ts` 的加载拒绝分支，若要传原 control 或重查则限于 `plugin.ts` 现有接线。BL-821 由 Goals 包内部的同一解码函数接收原 SQL 值、既有备用值与最小定位，供两处现行解析器和 `rowJson` 的读者共用。将重复的解码和 `record_unreadable` 构造收在一个包内模块，涉及现有的 `module/command-error-codes.ts` 和 `governance/errors.ts` 声明。Module、Governance 和 Home 分别提供表列及同一行的短期库行号。补投影只改既有 SELECT。更新 Goals README 的两条不变量和对应验收用例。

请公共合同台核对已选 A 的错误语义与固定消费者、表列及短期行号详情的精确形状及受众、HTTP 500/503 与专用规划 400 的投影、MCP/助理输出、取消与授权优先顺序。当前属合同阶段一，推荐方案使用已有公开字段与动作声明，API、动作快照及版本预计无差异。C 轨在设计后评审，在整批最终头合审。消费者证据和本片合同随第 27 批 PR 汇合。 [轨道规则](../../../post-anticorruption-roadmap/reference/tracks.md#section-5)

## 验收与验证计划

| 编号 | 可观察结果与拟验证入口（实现后的证明见表后） |
| --- | --- |
| BGE-01 | 在隔离 Home 先用现行动作保存两个个人包并建项目，再只损坏一行的 JSON。真实 Home `personal.list` 与项目 `planning.read/apply` 分别断言已定的码和类别，项目快照仍可读。用真实设置 GET 与已有授权 MCP 动作对照其各自错误体，未授权 MCP 走原拒绝。采用 A 时基线的项目错误码和文案会使新断言失败。扩充 [Home 坏行测试](../../../../tests/goals-personal-methods-stored-json.test.ts) 和 [MCP 夹具](../../../../tests/goals-mcp-actions.test.ts) 所走的入口。 |
| BGE-02 | 无 Home 的项目经现有 CLI 测试夹具的真实动作入口采用方法仍以 `goals.planning.personal_unavailable` 拒绝，业务行逐列相同，项目可读。在同一缺失依赖上验收，无需用假的加载失败模拟断线。沿用 [PG094-CLI-03](../../../../tests/cli-home-owner-entry.test.ts)。 |
| BGE-03 | 覆盖处理器前的取消、撤权与停用，并让嵌套 Home 读取与取消、撤权发生受控交错。沿已有 Host 验证栅栏先等确认进入读取，再取消（含只带 `actions.cancelled` 码）或撤销原调用授权。断言保留取消原因，撤权按既有拒绝边界落码，迟到的坏行详情和成功结果都无法交付，也不启动第二次项目写入。通过有信号的真实网关调用断开连接，覆盖入口自身的取消。处理器前的诊断行仍为未执行，只记允许的元数据与码。 [授权交错示例](../../../../tests/goal-pin-authority.test.ts) · [未执行诊断](../../../../tests/action-call-log.test.ts) |
| BGE-04 | Home 坏行时同 id 和新 id 的保存都拒绝。项目采用或事件配置拒绝后逐列比较个人包、项目方法、Goal、事件、幂等和相关已加入事务的记录。先采集拒绝结果与写后状态，再断言，坏值和其他行保持原样。项目规则读坏仍阻断完成，治理提案的坏基线仍拒绝读取。 [RAC-1496](../../../../tests/goals-personal-methods-stored-json.test.ts) · [RAC-1261/1264](../../../../tests/goal-events-state.test.ts) · [RAC-1266/1267](../../../../tests/governance-collaboration-module.test.ts) |
| BGE-05 | 逐一覆盖实际受改的读取点，按故障注入的 owner 表和列断言归属，并核对获批定位字段的精确值和各出口的可见范围。同一表列经多条路径读取时，每条路径都要覆盖。可按 owner 或读取入口分组验证。直接 Module、经 `rowJson` 的事件配置、Governance 与 Home 均走真实库行及各自入口。注入文本、路径及假密钥标记，消息、详情、HTTP/MCP 回执和诊断中均无原文。对全部业务键检验不披露，定位只使用已批准的短期行号；核对同库行定位及重建后行号不保证稳定。保留 [RAC-1269](../../../../tests/goals-stored-json.test.ts) 和 [RAC-1495](../../../../tests/goals-personal-methods-stored-json.test.ts) 对正文的拒绝。 |
| BGE-06 | 现行的 SQL NULL 备用值及合法 JSON 保持原路径。用真实方法包仅改 `confidence` 为字符串，Home 列表仍由成功输出 schema 拒绝为 `actions.output_invalid`，项目嵌套仍走其他加载错误的映射。另核合法 JSON 文本 `null` 的现有过滤。形状检查只覆盖已有合同实际检查的边界。 [RAC-1268](../../../../tests/goals-stored-json.test.ts) · [方法成功 schema](../../../../plugins/native/goals/src/contract/goal-planning-action-schemas.ts) |
| BGE-07 | 维护夹具恢复那一格的原值后，同一个 Host 的下一次调用读回两个方法和各自版本。原失败配置可沿原幂等键重试一次，成功产生一份业务结果，未损坏方法与既有项目副本保持原值。 [RAC-1497](../../../../tests/goals-personal-methods-stored-json.test.ts) · [打开项目即时读回](../../../../tests/goals-planning-actions.test.ts) |

实现后的证明：BGE-01、BGE-04、BGE-07 在 `tests/goals-personal-methods-stored-json.test.ts`「BGE-01 BGE-04 BGE-07」一例（项目读、采用、快照与修复后读回，采用被拒后逐列比较项目的规划与事件配置表）；BGE-03 在同文件「BGE-03」一例（经 Host 的可用性检查在 Home 读取那一刻取消或撤权，取消得 `actions.cancelled`、撤权得 `actions.forbidden`，都不带位置；同一 Host 上仍有效的调用照常拿到记录错误）；BGE-05 在 `tests/goals-stored-json.test.ts`（RAC-1260/1262/1263/1265 断言精确详情，规则表两条读取路径都指到同一行；RAC-1269 断言详情不带业务键；「BGE-05」一例把源码里每一处 `storedJson` 的表与列对照项目库和 Home 库的实际结构）与 RAC-1495；BGE-02 沿用 PG094-CLI-03；BGE-06 沿用 RAC-1268。MCP 与设置 GET 的错误体对照、受控交错之外的网关断连，没有另写用例：错误体由 SDK 的 `actionErrorResponse` 与 MCP 的 `tool-error.ts` 原样序列化 `details`，本片没有改它们。

原计划：实现后用临时 Home、真实 Host 与公开动作入口，将编号写入对应测试名或注释。子分支经机器槽运行刚改的文件，整批统一 `pnpm build`，按 `node scripts/affected-tests.mjs` 与 Goals README 的必跑清单，经 `node scripts/machine-slot.mjs run browser --label "27-4 Goals errors tests" -- node scripts/run-tests.mjs --jobs 1 <文件…>` 复核。最终头验 `pnpm boundary:check`、`node scripts/check-health-gates.mjs --base origin/main` 和动作/API 快照，Full 由统筹在 CI 安排。设计阶段仅记录现有证据与验证计划。 [并行开发规则](../../../../docs/system/PARALLEL-DEVELOPMENT.md#51-子代理与并发的-agent)

## 开工前检查

| 项 | 设计判断 |
| --- | --- |
| 1 事实主人 | Goals 的项目实例和 Home 实例各读自己的库。个人方法通过现行 Home 动作，平台只分派与投影。 |
| 2 插件同等待遇 | 沿 Plugin Runtime、共同 SDK 与存储端口。定位取自插件自有表。 |
| 3 能力注册 | 复用 Goals Manifest 的既有动作、输入及调度，身份来自原调用上下文。 |
| 4 合同 | BL-819 改失败语义，BL-821 按用户已定范围增加 owner 详情。阶段一随整批交 C，当前没有消费者排队等单独合同 PR。 |
| 5 包与分层 | 解码和位置选择放 Goals 包。Host、SDK 与内核提供既有分派和传输。 |
| 6 表与存储 | Goals 现行表与 Manifest 是依据。SELECT 加投影即可。 |
| 7 兼容与迁移 | 不涉及。继续按当前存储格式读取，坏值由维护者修正。 |
| 8 安全边界 | 详情可见范围已由用户确认，原权限、安装、项目和取消栅栏是发布前提。用拒绝与越权用例验证 S-18、S-12，若实际改动触及登记边界，同步其主人维护的断言。 |
| 9 调用次数 | 一次调用至多发起一次原有的进程内 Home 列表。失败时第二次项目尝试不发生，成功沿原重跑。定位同一行同一查询取得，额外 HTTP 请求、全量发现、开库和逐行查询均为零。 |
| 10 升级与数据 | 不涉及库升级。存量合法记录、版本和固定动作引用继续可用，故障只改变失败回执。 |
| 11 成果与过程项 | 不涉及。这些是 Goals 自有记录和动作错误。 |
| 12 页面与文字 | 现有规划页用现有的 Goals 读取错误文字。码驱动判定，详情走技术出口。没有新增交互、页面资源或事件。 |
| 13 错误 | 用现有 `goals.storage.record_unreadable`、`goals.planning.personal_unavailable` 和共同类别。位置放可选详情，由 SDK 序列化。 |
| 14 冲突面 | 写手待分配。主会话已核 #1999 占 Goals README、`plugin.ts` 和 `module/event-facts-work-event-records.ts` 等，#2000 涉宿主页面错误用例。实现前由统筹重查并安排交接，设计可先审。 |
| 15 全局最优 | 见下表，优先复用同一错误类别和技术出口。 |

| 场景 | 对方案的影响 |
| --- | --- |
| 插件 | Goals 两个实例和 Governance 共用包内解码。第三方已有同一 `defineErrorCodes` 与详情出口，可用自己的 owner 数据，无须 Goals 专用平台服务。 |
| 平台 | 用 SDK 的现有类别映射，Home 不可用与记录坏行得以区分。只准维护者看的位置需要另立受限出口，现有调用日志仍可按编号说明哪次调用失败。 |
| 助理 | Agent 的发现和授权与原动作绑定，错误码与安全文案足以区分记录故障和临时不可用。`goal-advance` 已读规划目录及选定方法，采用 A 可避免把坏行当可重试断线。 |
| 各类平台能力 | MCP 通用错误与工作流步骤失败复用现有呈现。公共诊断继续只管调用记录。输入、资料目录、连接器、成果、同步和团队流程无新依赖。 |
| 后续开发 | 26 的共同诊断编号可继续关联失败调用，行定位由 Goals 自己持有。新增同类读取只补一处 owner 表列与同一行的短期库行号。若未来决定给维护者专属显示，由相应平台批做受限投影，现阶段无需把错误系统扩大。 |
