# DD2 执行进度

2026-09-06。Goal accepted revision 1，canonical 已完成；本页是进度记录，完成 Evidence 见 `dd2-validation.md`。

## 当前收尾检查点

原生/历史应用、提案贡献、决定分组/最近结果、提交客户端与文案/样式均已迁；具体 owner 和旧职责退出见 `dd2-caller-audit.md`。Workbench 组合页面与 Feed 详情，只接已生成片段；公共刷新/receipt 留在 Workbench。root Coordinator / renderer / server 为 2,771 / 2,240 / 3,243 行，未整体 retired。

最终串行 **209/0/0，38.70 秒**，`/private/tmp/dd2-acceptance-regression.log`；完整命令和覆盖见 `dd2-validation.md`。新 Chrome 三流程全部通过：原生确认失败重试/退回、历史风险修订后明确采用、Candidate 批准后单独拒绝 Rewire。此前 UI 69/0/0（24.29 秒），`/private/tmp/dd2-workbench-decision-regression.log`。

12 项边界反证通过，512 sources / 1,585 imports / 71 edges / 0 errors；构建、root tsc、diff check 通过。全部运行进程已结束。2026-09-05T21:10:21.787Z self Review pass，projection=verified/completed，cursor 1126。Evidence `evidence-5bbb9ca4-957d-4ca0-bd52-e64547da2bd4` locator verified；Review `review-ed351489-139c-409e-be42-f3f33afdcf6b`。执行与复核 Claim/Run 均完成并释放。下一步是父项完整覆盖审查，不重复 DD2。

浏览器测试失败记录：初稿点击隐藏表单、误用旧展开入口，按当前 Inbox 目录修正；随后误将 Proposal approved 写成 applied，已按原状态契约修正，同时检查 Items applied。失败的组合日志 `/private/tmp/dd2-legacy-proposal-ui-regression.log` 保留；最终用例通过，没有因此改产品逻辑。

## 历史已验证切片

以下旧检查点的“当前/待做”只描述记录时刻；不覆盖上述最新状态。

### 当前检查点：提案应用入口已迁，开始决定呈现

新旧提案全部应用入口已迁：native submit/list/check/decide，以及 historical Contract/Candidate/Dependency submit、Contract/Candidate/Rewire decide。Host/Web/CLI/MCP caller 改接具名应用；Coordinator 原方法和独占 helper 删除。`GoalTreeDecisionPlan` 管确认前的现状/范围/规划检查，`GoalTreeDecisionApplication` 管原子落地与结果，`LegacyGoalTreeDecisionApplication` 只把原统一历史 ID 转到各历史应用。没有把 488 行旧决定方法搬成另一个大类。

Goals 的 Candidate 待确认与 Rewire 后有效性收尾采用有限 lifecycle 方法，不公开任意 validity setter；已确认 Risk 的写入与 Rewire 原 `risk.added` 事件归 `ConfirmedRiskCommands`。Execution 公开已有 nonterminal Run 查询，不再由 Plugin 调 Repository。Governance `goal-tree-records.ts` / `proposal-operation-store.ts` / `record-store.ts` 分别为 219 / 232 / 298 行，原 operation、请求 hash、结果和时间语义保留，无新表。

最新验证：Candidate **122/0/0，4.53 秒**（`/private/tmp/dd2-legacy-candidate-decision-regression.log`）；Rewire **125/0/0，5.74 秒**（`/private/tmp/dd2-legacy-rewire-decision-regression.log`）；完整 native 决定 **125/0/0，5.46 秒**（`/private/tmp/dd2-native-decision-regression.log`）、Web **59/0/0，17.50 秒**（`/private/tmp/dd2-native-decision-web.log`）；所有历史提交也迁完后 **139/0/0，4.94 秒**（`/private/tmp/dd2-all-proposal-apps-regression.log`）。11 项边界故障保护通过。

Web 决定准备也已迁：`GoalTreeWebDecisionInput` 只准备风险修订/整份退回理由，不鉴权、不写事实。Host 保留原输入检查先后、可信身份/消息引用、HTTP 和调用决定 API。Web **59/0/0，15.69 秒**（`/private/tmp/dd2-web-decision-input-regression.log`）；构建/diff/边界通过，490 sources / 1,490 imports / 71 edges / 0 errors。当前 Coordinator 2,771 行、root server 3,243 行。以上测试进程均结束。

DD2 未完成：决定 renderer/common copy/client/样式/英文归属与真实浏览器/Runtime 最终验收仍待做。以下均为历史切片记录，旧租期、行数或剩余列表不代表当前状态。

最新检查点（2026-09-06）：决定来源/逐项输入校验迁至 `GoalTreeDecisionNormalizer`；修订版本、语义影响提示和等价历史 Rewire 收尾迁至 `GoalTreeDecisionFollowup`。Governance `goal-tree-records.ts` 独占 native Proposal/Item/Decision 记录和状态聚合，RecordStore 组合公开 API；保持原事件、顺序和总事务，没有提高 400 行 owner 限制。

`LegacyContractDecisionApplication` 已接真实 Host/Web 的历史 Contract 批准/拒绝；Coordinator 方法删除。原键、请求 hash、返回值和重放由 Governance `proposal-operation-store.ts` 保存，应用保留字段验证及 Goals accept/Policy/Impact/Risk 顺序。

验证：决定记录 **120/0/0，4.80 秒**（`/private/tmp/dd2-decision-records-regression.log`）；修订收尾 **120/0/0，4.74 秒**（`/private/tmp/dd2-decision-followup-regression.log`）；历史 Contract 决定 **120/0/0，5.04 秒**（`/private/tmp/dd2-legacy-contract-decision-regression.log`）；owner 拆分后 **122/0/0，4.48 秒**（`/private/tmp/dd2-decision-owner-regression.log`）；Web **59/0/0，15.75 秒**（`/private/tmp/dd2-legacy-contract-decision-web.log`）。此前 check Web **59/0/0，16.72 秒**（`/private/tmp/dd2-check-web-regression.log`）。构建、5 项边界故障保护通过；483 sources / 1,430 imports / 71 edges，0 errors，diff check 通过。以上测试均结束。

仍待 native 决定、历史 Candidate/Rewire 决定、Web 决定呈现及最终真实浏览器/Runtime 验收。以下按迁移过程保留历史记录，旧行数和剩余列表不代表当前状态。

提案读取：`GoalTreeQueryApplication` 组合 Goals 身份查询、Governance native/legacy 查询和 cursor。Host、Web 及内部 caller 已改为 `.goalTree.listGoalTreeProposals`；旧同名方法删除。旧提案短 ID、统一映射、排序和过滤不变。`closeOpenClarificationSessions` 也已删除，两个决定 caller 改用 Governance clarification `closeAccepted`，保留批准后关闭和原事务/事件。构建通过，V1/跨入口/Runtime **118/0/0**，日志 `/private/tmp/dd2-query-regression.log`。

同批收口：真实合法提案把父收口条目放在新子 Goal/part_of 之前，旧预检仍拒绝 `batch-close`，日志 `/private/tmp/dd2-batch-before.log`。`goalTreeMaterializationGroups` 统一预检与决定顺序：新对象 → Policy/Risk → 关系 → 已接受父 Goal 的 closed_compound 更新。没有跳过子项、coverage、版本或用户确认检查。新增回归验证预检不落地；整份确认建一份子项/关系并收口；重放无变化；子项/关系已真实写入后注入父级失败，整个 snapshot 含决定/事件/revision 回滚，相同 key 重试成功。原非法结构用例仍通过。**122/0/0，5.24 秒**，`/private/tmp/dd2-order-regression.log`。夹具初版缺叶子范围字段、误用确认参数，在形成正式失败基线前修正，没有放宽生产校验。

Policy 物化：`GoalsCommandApi.applyConfirmedPolicy` 是已授权决定内部的有限 replace/deactivate 端口；`confirmed-policy.ts` 拥有原校验、规范化、持久化和事件，未增加 CLI/MCP 绕确认入口。Coordinator 对应 helper 只拆 payload、调用 Command，Policy 写入 SQL 删除。普通 `setPolicy` 与提案共用 GoalsRepository 替换写入，保留各自原错误/规范化/事件；新规则插入失败会恢复原 active 规则。

contracts/Goals/Goals Plugin/root 构建通过；模块/命令 wire/Draft/跨入口/Runtime/V1 **126 项通过**。新增 Policy 测试初版误按两个字符串调用对象参数的查询 API，只改测试后单独通过；日志 `/private/tmp/dd2-policy-regression.log`、`/private/tmp/dd2-policy-owner-validation.log`。已通过 127 项相关测试，不伪称首轮全绿。新增用例核对有效策略、能力规范化、替换来源事件、唯一键失败回滚、类型错误、跨 Board 禁止停用和重复停用无事件；原 native Policy 提案由 V1 覆盖。

Goal 创建、Risk、Relation 与 Draft 更新：已分别收回 Goals `confirmed-goal.ts`、`confirmed-risk.ts`、`confirmed-relations.ts`。普通创建与提案创建共用 `goal-contract-records.ts` 的初始 Goal/验收/revision 写入，Draft 更新复用验收写入；删除 Coordinator 对应 Goal/验收、Risk/GoalRisk、Relation SQL。Relation 仍按原批次写完后更新父级状态；Risk 仍保留 triggered invalidation、resolved 证据要求、解除后的 revalidation 及原事件；Draft 原 accepted 转换复用现有 lifecycle。用户确认与整份事务仍由原应用掌管，不增加外部绕行入口。

四次切片构建均通过，八文件模块/命令/Draft/跨入口/Runtime/V1 回归分别 **128/0/0**：`/private/tmp/dd2-goal-create-regression.log`、`/private/tmp/dd2-risk-regression.log`、`/private/tmp/dd2-relations-regression.log`、`/private/tmp/dd2-draft-write-regression.log`；最后一轮 8.05 秒。Relation 首次编译发现既有规范化返回 nullable relation_id，公共类型按原语义修正，未改协议或丢弃 null。

## 当前边界与下一步

最新：native/legacy `checkGoalTreeProposal` 均由 `GoalTreeCheckApplication` 实施，真实 Host/test caller 改接；旧 check/legacy check 两方法删除。`LegacyContractProposalValidator` 保留旧字段/来源/依赖校验，事实使用 Goals/Governance Query，原 shape helper 与大类 validator 删除。`proposal-operation-store.ts` 统一 submit/check 的既有幂等读写和事件，保留不同返回形式、原 operation key/hash/保存时间；未引入第二份 schema。legacy validator **120/0/0，4.13 秒**（`/private/tmp/dd2-legacy-validation-regression.log`），完整 check **120/0/0，4.24 秒**（`/private/tmp/dd2-check-app-regression.log`）。

预检应用：`GoalTreeMaterializationConflicts` 组合 owner 引用状态；Goal/验收 ID 冲突与 Candidate Contract 匹配回到 Goals Planning，未把跨 Board Goal 内容作为新 public Query 暴露。`GoalTreeMaterializationApplication` 共用真实物化，Governance `previewMaterialization/previewMaterializationItem` 维护原同名 savepoints：成功条目供后续项读取、冲突条目回退、最终整批回退。原三个预检/分派/恢复 helper 删除。冲突迁移 **134/0/0，3.96 秒**（`/private/tmp/dd2-materialization-conflicts-regression.log`），预检迁移 **120/0/0，4.54 秒**（`/private/tmp/dd2-preflight-app-regression.log`）。

Candidate/Rewire：`GoalTreeGovernanceMaterializer` 与 Goals fact materializer 共同落实原流程；Governance records 拥有 approved/rejected/applied 原事件，`query.hasCandidateBootstrap` 验证历史物化来源。Candidate 关系解析归 InputReader；Goals Planning `proposals` 拥有 Candidate/standalone dependency 校验，唯一 ID 查询仅返回存在性。Rewire **120/0/0，3.71 秒**（`/private/tmp/dd2-rewire-materializer-regression.log`）；Candidate 查询 **119/0/0，3.65 秒**（`/private/tmp/dd2-candidate-queries-regression.log`）；共用校验 **133/0/0，3.79 秒**（`/private/tmp/dd2-candidate-coordination-regression.log`）；完整 Candidate **134/0/0，4.32 秒**（`/private/tmp/dd2-candidate-materializer-regression.log`）。之后 Web **59/0/0，15.81 秒**（`/private/tmp/dd2-materialization-web-regression.log`）。

当前 Coordinator **4,760 行**。最新构建、4 项边界故障保护、diff check 通过；边界 479 sources / 1,407 imports / 71 edges，0 errors。仍待完整决定入口及 native/legacy 决定辅助逻辑、Web 决定呈现、本项最终浏览器/Runtime 验收；不按减少行数宣称 DD2 完成。下面为旧检查点。

确认后的事实转换：`GoalTreeFactMaterializer` 组合 Goal/Contract、Relation、Policy、Risk 的公开 owner 操作；Coordinator 对应五个 helper 删除。Draft 更新仍先 supersede 旧提案/关闭会话，再由 Goals `recordConfirmedDraftUpdate` 记录原最终事件。关系/Policy/Risk 第一切片 **120/0/0，7.70 秒**（`/private/tmp/dd2-fact-materializer-regression.log`）；完整 Goal/Contract 切片 **123/0/0，4.05 秒**（`/private/tmp/dd2-goal-materializer-regression.log`）。

Contract revision 收尾：Execution `contract-revision.ts` 接管原 Claim/Run 转换；Plugin 再调用 Governance 豁免旧 obligation。metadata 保持当前 Run/验收，非 metadata 按原顺序结束旧工作；删除 Coordinator 旧 transition 方法。构建与 **125/0/0，4.98 秒**（`/private/tmp/dd2-revision-closeout-regression.log`），含原 metadata 连续性与 accepted revision 流程。最新 Coordinator **6,228 行**，边界 472 sources / 1,368 imports / 71 edges，0 errors。边界检查曾把合法 `operation: "update"` 误认 SQL，改为匹配实际 UPDATE … SET 语法，未删除 SQL 保护；diff check 通过。

当前剩余重点是 Candidate/Rewire 物化和冲突预检、native/legacy check/decide 完整入口、Web 决定呈现及最终真实浏览器验收；本项和总 Goal 均未完成。以下都是已结束的历史切片，不重复执行无变化结果。

提交入口已迁出：`GoalTreeSubmissionApplication` 组合正常化、Planning、Run 身份、Governance records 和 lifecycle application；Host 的真实提交 caller 已切换，Coordinator 原 submit 方法删除。`proposal-normalizer.ts` 保留原 narrative/item/关系/来源校验；`proposal-item-validation.ts` 被 Plugin、Web render/server 共用，原 root 文件删除。Governance 的 `proposal-submission-store.ts` 接管原提交幂等记录与 submitted/revised 事件，无新 schema；重放仍先于 Run 活性检查，提交不物化建议的 Goal。首次编译发现 Governance appendEvent 原返回 void，改为原有 eventCursor 查询；删除已无 caller 的旧类型引用后构建通过，没有改变行为以放过检查。

规范化迁移 **120/0/0，3.60 秒**（`/private/tmp/dd2-proposal-normalizer-regression.log`）；完整提交迁移后 V1/Runtime/CLI-MCP/回滚链 **121/0/0，14.28 秒**（`/private/tmp/dd2-submission-app-regression.log`）；Web **59/0/0，26.45 秒**（`/private/tmp/dd2-submission-web-regression.log`），使用获准隔离测试环境，不停止现用 4173。边界保护新增退回旧 submit caller/facade/SQL 的故障用例，三项通过；边界 469 sources / 1,356 imports / 71 edges，0 errors，diff check 通过。这是局部接口/Web 回归，不替代 DD2 最终真实浏览器或总重组最终 E2E。

最新检查点（以下历史计数保留）：提案 Goal/Relation/Risk/Policy 状态查询已走 Goals Query；`GoalTreeBaselineQuery` 组合公开事实并保留旧 hash/semantic-v1 规则，旧五个 baseline/read helper 删除。`GoalTreeInputReader` 接管 payload 与 Risk 条目解析；Run 身份/租约检查迁至 Plugin `goal-tree-run-authority.ts`，关系图预检归 Goals Planning。对应分步回归各 **125/0/0**：`dd2-proposal-fact-query-regression.log`、`dd2-baseline-app-regression.log`、`dd2-input-app-regression.log`、`dd2-proposal-authority-regression.log`，均在 `/private/tmp/`。

版本/history 查询：Contract 与 coverage revision 查询归 Goals；Goals、Execution、Evidence、Governance 分别读取自己的原 lifecycle event 类型。root Store 只组合，保持原 seq 顺序，不新增表/事件通道；Storage Contract 仅复用记录字段。`/private/tmp/dd2-revision-query-regression.log` **125/0/0，7.15 秒**；`/private/tmp/dd2-owner-history-regression.log` **125/0/0，4.44 秒**。

自动收尾：`LifecycleSnapshotQuery` 通过四个公开 Query 组合事实；`LifecycleReconciliationApplication` 复用原判断，调用 Goals reopen/satisfy 和 Execution release/complete 有限命令。删除 Coordinator `reconcileLifecycle` 与 root planner；Goals hook、Execution validation 和提案提交真实 caller 全部改接 Plugin，保留外层事务与原事件。先 **125/0/0，5.26 秒**；再加入真实 Claim/Run 写入后的故障、整份回滚、同 key 重试/数据库重开测试，并覆盖 Execution/Evidence/App adapter，**131/0/0，12.61 秒**，日志 `/private/tmp/dd2-lifecycle-closeout-regression.log`。构建与 diff check 通过，边界 48 packages / 465 sources / 1,331 imports / 71 edges / 30 subpaths / 10 compatibility / 5 legacy huge，0 errors。

DD2 仍在执行：剩余 submit/check/decide、native/legacy helper 和 Web 提案/决定呈现须完整迁出；上述切片不是 DD2 完成或全产品无损结论。下一步接提案规范化/校验，再迁完整应用入口。

accepted 结构规则：已迁入 `GoalsPlanningApi.contracts`；业务 Contract 比较、父收口及 revision 子项结构冲突共用同一规则实现，删除 Coordinator 五个旧 helper。既有 accept/revision/closure lifecycle 类型移入公共 Contracts，原 Module export 保持类型兼容；caller 和边界检查改为公开 `goals.lifecycle`，仍拒绝旧 SQL。构建与 128 项回归通过，`/private/tmp/dd2-contract-rules-regression.log`。

Policy 基准：`GoalsQueryApi.policyBindingVersion` 在 owner 内兼容旧 hash 和 semantic-v1，不向 Plugin 暴露 `policy_json` 或 SQL。历史序列化空白仍参与原有版本，只有原协议允许忽略的时间字段被排除。新增测试用独立旧 wire 字段验证旧版本完全一致、时间修改只影响 legacy、真实状态改变使 semantic 失效、停用事实不消失及 Board 隔离。**129/0/0，13.01 秒**，`/private/tmp/dd2-policy-version-regression.log`。

Legacy 写入：Contract 的 Policy/Risk 和 Rewire 的 Risk 通过 `registerAcceptedPolicy/registerAcceptedRisk` 进入 owner，保留原总事件/逐项事件，不另加审计副本。所有普通/native/legacy open Risk 共用 Repository 写入；规范化函数的返回类型明确已保证的 treatment_plan，不新增默认行为。首次整合因旧 sqliteJson import 已无 caller 被 tsc 拒绝，删除未使用 import 后 **129/0/0，5.79 秒**，`/private/tmp/dd2-legacy-risk-policy-regression.log`。

Legacy Rewire 关系：`applyAcceptedRewireRelations` 拥有原关系图预检、停用/新建、唯一关系检查、父级协调和待重验 Goal 集合；Application 保留参数转换、原确认/事件和后续 Risk/Impact 组合。循环判断共用 `planning.wouldCreatePartOfCycle`，旧 helper 删除。构建与 **129/0/0，8.56 秒**，`/private/tmp/dd2-legacy-relations-regression.log`。没有增加统一消息通道、schema 或用户功能。

Coordinator 当前 **7,558 行**。旧读取、关闭/accepted 结构/循环 helper，native Goal/验收/Policy/Risk/Relation 写入以及 legacy Contract/Rewire 的 Policy/Risk/Relation 写入已退出；其他验证/只读 SQL 与整体应用仍未清零。边界 48 packages / 459 sources / 1,293 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge，0 errors；diff check 通过。

DD2 尚缺剩余 native/legacy 校验和基准查询、Execution 收尾组合、submit/check/decide 应用及 Web 提案/决定 UI/copy/client。下一步接回其余 owner 职责，再切应用与 UI，最后本项真实浏览器/全入口验收与三条件 Review。总目标的最终两轮 E2E/清理不由局部回归代替。

普通 Draft supersession 已完成：删除 `goal-commands.ts:updateDraftGoal` 对 Governance 的 SELECT/UPDATE，必需的窄 hook 绑定既有 `GovernanceRecordsApi.supersedePendingContractProposals`，返回原创建时间顺序的 ID，保留决定内容与 `goal.draft_updated`。直接 Module 测试使用真实 Governance owner，无空实现。新增 `draft-proposal-supersession.test.ts` 验证真实写入后失败整份回滚、同 key 重试、其他 Goal/Board/已拒绝记录不变、原事件顺序、数据库重开后重放无副作用。构建通过，八文件 **142/0/0，6.01 秒**，`/private/tmp/dd2-supersession-regression.log`；边界 459 sources / 1,294 imports，0 errors。
