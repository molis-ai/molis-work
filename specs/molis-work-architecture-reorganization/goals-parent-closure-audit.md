# Goals 写入父项收口审查

## 本次完整核对结论（GW6 与 Feed Query 补齐后）

已提交待决定 `goal-tree-proposal-b7c484f1-c5c2-478f-8077-b67debd222a9`，单项 `item-gw-parent-closure-20260906`。正式read/check通过，cursor1195，conflict_item_ids=[]、planning_issues=[]；尚未确认，父项没有提前关闭。

原父项四个承诺与三个条件全部保留，建议仅结束拆分为 `accepted/closed_compound`；不是直接写 completed，不同时修改 DD、DV4 或根目标。GW1–GW6 的当前 Contract、准确输出/criterion、有效证据及 completed 投影均已读；历史 GW1–GW4 验收与当前 GW5/GW6、DD2、Query 修正一起核对，没有用旧“全部 caller”概述代替当前源码。

| 原承诺 | 当前可用结果与证明 |
| --- | --- |
| Goals Command API 与实现 | GW1 唯一 Command/Repository；DD2 的确认应用只调用原生 Goals Command，仍由 Governance 维护决定事实 |
| Goal 生命周期与规划引擎迁移 | GW2 Lifecycle、GW3 Planning；当前 Planning/跨入口 17/0/0，V1 生命周期与 Proposal/parent completion 在 GW6 回归内 |
| Goal 数据迁移 | GW2 的 4/11/12/13/21 与 GW6 的基础 schema、15/25/26/30、V3；真实回滚、重试、旧事实对账及重开 |
| 写入与并发兼容测试 | GW4 三入口、GW5 用户界面、GW6 新旧项目真实浏览器；193/0/0、历史补强6/0/0，另 Feed/Query/Web78/0/0 |

三项条件：`goals-planning` 由 GW3 与实际 Planning/Proposal 跨入口测试覆盖；`goals-write-rules` 由 GW1/GW2、GW4/GW5、GW6 的原子状态及用户链路覆盖；`goals-write-store` 由 GW1/GW4/GW6 的唯一 owner 与当前 caller 审查覆盖。无未迁的 Goals SQL 在生产 App/Host 中另存一套写法；最后发现的 Feed Attention exists callback 已按原 Query Contract 补齐，见 `goals-feed-query-correction.md`，canonical 2026-09-06T04:17:42.153Z revalidated=true、completed，cursor1187。

跨 `src/apps/plugins/horizontal` 全源 SQL 检索的剩余匹配为 `context-ui-model.ts` 注释 “markup from Goals relation”，不是 SQL。逐一核对原 Store/Coordinator、V3、Web、CLI/MCP、Feed 调用位置和 public API；没有为让扫描全绿改动注释，也不以扫描独自证明行为兼容。Host 共用事件、幂等、跨 owner 启动事务及最终薄装配退出仍是原 Cutover 工作，非 Goals 第二份事实实现。

方法：同目录的迁移、软件开发、开发者工具三份完整方法已重新读取，项目 floor 为空。沿用 `gw6-work-plan.md` 的逐条依赖判断：迁移1/2/5与软件5/9及开发工具2/5对应下游数据保证/Cutover消费可运行结果；迁移3、软件3/6/7、工具1/3对应已存在的 public Contract 消费；迁移4、软件8、工具4保留用户收口决定与不可逆边界；迁移6、软件10、工具6仅用现有part_of；软件1/2复用已确认SSOT、软件4不新增双向实现依赖。没有新关系或并行工作，无需重排既有图。新产品/AI生成/商业市场/生产发布的专业义务仍由原对应范围负责，不因迁移收口创建功能。

这次仅准备父项收口提案。用户确认前父项仍开放；确认后由系统按孩子结果和门禁计算可信完成。整体重组仍按全部开发 → 前后端真实 E2E → 清理 → 再 E2E → 初始架构/规范总审推进。

## GW6 实施后更新（2026-09-06）

原剩余数据反证已由正式接受的 GW6 迁出，并完成定向验证：Goals 基础 schema/15/25/26/30 Goals 内容、V3 覆盖账和 Web caller 统一使用 Goals owner；193/0/0 前后端回归与补强历史升级对账 6/0/0。详见 `gw6-validation.md`。父项仍为 frontier_open，尚未进行本次执行后的完整父项收口决定；不以局部测试通过直接标记父项完成。

## 实施前剩余数据职责与计划（历史）

已读取原父完整 Contract、GW1–GW5 输出/条件，以及受影响的架构、Feed、Query、Execution、数据保证、Cutover 和根目标。原结果和下游消费关系无需缩减；原父项仍未完成。

剩余反证不是下文已解决的 Policy/Risk/Proposal caller：`src/v1/store.ts` 仍持有 Goals 基础 schema、15/25/26 以及 30 的 Goals revision/coverage 回填；`coverage_items` 的真实 V3 导入写入和 Web 读取也未归到 Goals public API。不能把有消费方的表删掉，或用只迁 DDL 代替完整数据结果。

补齐提案 `goal-tree-proposal-6edbcde6-4085-4bdf-89c5-6b9544edcd48` 已经用户明确确认，四项 applied（cursor 1162），GW6 accepted/closed_leaf revision 1。原父全部结果和验收保留，仍 frontier_open；详细范围见 `gw6-work-plan.md`。独立 DD 收口提案仍未批准。下文仅是分阶段审查历史。

## Query 纠正后的更新（2026-09-06 21:31 UTC）

下列 DD2 后读取旁路已在原 Goals Query Goal 中纠正，不新增重复子 Goal。原 caller Evidence 已 retract，fresh Evidence `evidence-8f29fc8c-e202-4f4b-98bf-579329e64416` verified，revalidate 成功恢复 completed（cursor 1141）。182 项真实前后端/Runtime 回归通过，详见 goals-query-correction-validation.md。

目前不能把这次较窄读取验收当作完整父项验收。下一次父项收口需把 GW1–GW5 的原承诺、模块初始化/迁移、兼容 Store 与剩余 Host 职责一并核对；仅 SQL 搜索无命中不足以证明所有原范围已退出。不再重复下文已消除的 Proposal 或读取工作。

## DD2 完成后的更新（2026-09-06）

原父项仍不能直接收口，但缺口已经变小。DD1/DD2 均 canonical completed；`dd2-caller-audit.md` 和 `dd2-validation.md` 证明 native/legacy Proposal 写入已经过 Goals public Command，原 Coordinator 对应实现已删除，最终 209 项串行回归通过。下文旧行号、待确认提案和旧写入只保留为历史反证，不再代表当前源码。

本轮重新读取现用调用，仍存在：

- `src/web/server.ts:379`：buildMolisWorkWebView 直接查询 policy_bindings 并映射 WebPolicyBinding，没有经过 Goals public Query。
- `src/v1/coordinator.ts:1441`：替代 Goal 查询跨 goal_relations / goals；2080 的 completionRiskReasons 直接读 risks / goal_risks；2456 / 2493 的后代关系与风险、2688 / 2703 的标题与风险描述同样直接读取。它们不是 DD2 已退出的提案物化，也不能当成双写证据。

下一有限结果应是把父验收涉及的现用 Goals / Policy / Relation / Risk 读取统一接回 owner 的公共查询，保持原排序、关联范围、错误原因和 Web 返回结构，并验证真实 caller；先核对既有公共 API，不建重复 Repository 或通用 SQL 通道。完成后按原三条父标准复核。如何纳入原 Goal Tree 尚待明确提案，不把它默认为已执行或已接受的新子 Goal。

最终 Cutover 仍消费父结果，因此不能只把这个前置缺口留到 Cutover，也不新增父项反向依赖 Cutover。DD 父项可单独根据其原范围收口，见 dd-parent-closure-audit.md；其结论不代替本父项。

## 历史检查（DD 实施前）

2026-09-06。只读审查当前 Contract、源码和已有验收证据，不修改 Goal 生命周期，不宣称新测试运行或完成。父项 `goal-ccdd09e2-7bfe-4b4b-82e2-29b632b51b5d` 当前 draft/frontier_open/unmet，Available 提供 clarifier 而不是 executor。

## 当前结论

**不能仅因 GW1–GW5 五个子项完成就关闭父项。** 原父项 `goals-write-store` 要求“不存在新旧 Store 双写或 App 直接 SQL”；当前源码仍存在越过 Goals public owner 的正式写入，以及 root Web 的 Policy SQL。这里证明的是多个实现入口仍直接操作同一组表，**不是证明发生过一次请求同时重复写入或数据损坏**。

## 按原三条验收核对

| 原条件 | 已有证据 | 当前判断 |
| --- | --- | --- |
| goals-planning：方法、澄清、提案、预检和决定兼容 | GW3 公开 Planning 验证；GW4 历史跨入口回归；GW5 175 项页面组 | 方法引擎已有证据，但不能以历史全绿证明当前完整决定链无缺口。上一轮真实同批创建子项/父项收口预检失败仍在 DD 工作计划内；没有重新运行完整 Runtime 决定链 |
| goals-write-rules：revision、graph、policy/risk、lifecycle、proposal、parent completion | GW1/GW2 的 public owner、错误/幂等/状态/恢复验证，GW4 入口切换 | 已迁部分保留，剩余 Proposal 物化仍有直接 SQL；未证明所有正式写入已经过唯一 owner。不得重做已完成子项或把所有残留塞回 GW1 |
| goals-write-store：唯一 Store owner、无 App 直接 SQL | 新 Goals Repository 和公开 Command/Lifecycle；App 包薄适配 | **当前不满足整体收口前提**。下列实际源码与“全部入口无直接 SQL”相反；旧实现需要按已定 owner 继续退出 |

## 可复核的剩余调用

- `src/local-host/composition.ts:160–173` 的 Draft/GoalTree capability 注册仍回调 Coordinator 的七个方法；DV1 已有 public Contract/client 不等于实现退出。
- `src/v1/coordinator.ts:6024` 的 `materializeGoalTreeGoal`：create 分支在 6040 直接 `INSERT INTO goals`，6073 直接写 `goal_contract_revisions`；6177 的 Draft update 分支直接 `UPDATE goals`。与 `modules/goals/src/goal-commands.ts` 和 `lifecycle-revisions.ts` 形成两个正式表写入实现位置。
- 同文件 `materializeGoalTreeRelations` 的 6356 停用/6380 新增关系；Policy 6518/6522 替换与 6528 新增；Risk 6651 新增/6678 更新。都是应用物化内部 SQL，不是注释、测试或仅旧迁移脚本。
- 更早的 legacy Contract/Candidate/Rewire 决定分支同样有 3783/3790 Policy、3819/4479 Risk、4359/4392 Relation SQL。统一 Goal Tree 的 legacy 分支需要按 DD2 的范围一起迁移，不能只切新提案留旧实现回调。
- `src/web/server.ts:379–382` 的现用 Web read-view 直接查询 `policy_bindings`，由最终 Cutover 的 Host/query caller 清理处理；GW5 只迁 UI，未宣称根 HTTP/Store 全部清零。
- `src/v1/store.ts` 尚有历史迁移/兼容读取。它们与现用写入性质不同，不把所有 SQL 搜索命中等同运行时双写；最终迁移/安全保证与 Cutover 应逐条判断后退出。

来源检查命令：

```sh
rg -n '(INSERT INTO|UPDATE|DELETE FROM|FROM|JOIN) (goals|goal_relations|goal_contract_revisions|policy_bindings|risks|risk_goal_links|project_guidance|planning_method_packs)' src/v1/coordinator.ts src/v1/store.ts src/web/server.ts src/cli/main.ts src/mcp/server.ts apps modules/goals/src --glob '*.ts'
```

搜索后已读对应生产方法与 Host 注册，结论不单靠计数。没有访问用户 SQLite，没有运行或修改已安装服务。

## 下一步与边界

1. 当前待决定提案 `goal-tree-proposal-d6a1fac6-8695-4d89-8096-0d6eb3ba7f85` 仍 pending、无决定，DD1/DD2 尚未 canonical 创建，不能执行。原 accepted DD 总范围已经包含这些旧实现退出；当前发现不要求增加产品功能。
2. DD2 迁移时，Goal/Relation/Policy/Risk/Revision 写入应通过 Goals public API，Governance 仅维护 Proposal/Decision 与原子物化边界；不要把这些 SQL 原样搬进 Plugin 或 Governance 来伪装唯一 owner。
3. 最终 Cutover 完成剩余 root HTTP query/SQL 和兼容实现退出后，再按原父项三条条件重新审查；不要先以较窄的新解释把父项标完成。
4. 当前图对后续数据保证/Cutover 有父项完成依赖，因此存在收口顺序上的风险：若某个当前残留只能由 Cutover 完成，必须通过一次明确的受影响子图调整，把收口所需的有限工作安排在前置结果中；不能静默增加反向依赖形成环，也不能以“留给 Cutover”掩盖父项未满足。此处只记录问题和必要的后续规划，不自行改树。

保留 GW1–GW5 历史 completed，不用父项缺口自动否定各自较窄的 accepted Contract。独立父项收口提案暂不提交，避免在证据不足时增加第二份待确认“完成”决定。整体目标保持未完成，后续仍需详细用户 E2E、清理、重复 E2E 与初始架构要求核对。
