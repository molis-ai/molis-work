# 已完成父项覆盖记录复核

正式提案：`goal-tree-proposal-11becfc9-439e-4a2d-8ddc-73e539075550`。8项 `item-parent-coverage-refresh-{1..8}-20260906`，均 pending；read/check通过，cursor1263，conflict_item_ids=[]、planning_issues=[]。未决定、未改变 canonical。澄清 Run 已随提交完成释放。

2026-09-06，基线 cursor1256。Molis Work 为唯一生命周期事实源。本文件是提案审阅材料。

## 目的与边界

八个 accepted/closed_compound 父 Goal 均为 revision2、valid/satisfied，但覆盖记录早于当前子 Contract。逐项阅读31个子 Goal（均 revision1、valid/satisfied）后，原32项 promised outputs、24项 acceptance criteria 与子要求仍一致，精确输出名和 criterion 引用全部存在。

本提案复制八个父 Contract 的原业务字段、验收、完整 decomposition_review 与原覆盖映射，只通过正式 revision 刷新当前子版本基线。没有新增、移动或重开 Goal；没有修改关系、Evidence、Review。提交不改变 canonical；用户决定后仍需读取 semantic_review，确认完成状态与历史保留。

## 覆盖结果

|父项|子项|输出 / 验收|
|---|---|---|
|建立架构 SSOT 与完整 Monorepo 包底座|F1、F2、F3|4 / 3|
|完成 Plugin Platform 与 Feed 集成样板迁移|FD1、FD2、FD3、FD4|4 / 3|
|迁移 Goals 写入、生命周期与 Planning|GW1、GW2、GW3、GW4、GW5、GW6|4 / 3|
|迁移 Work、Session 与 Runtime Host|WK1、WK2、WK3|4 / 3|
|建立 Artifacts 与 Context Ledger 正式实现|AR1、AR2、AR3|4 / 3|
|迁移 Projects、Local Host、Workbench 与 Desktop Shell|AP1、AP2、AP3、AP4|4 / 3|
|迁移 Execution、Evidence 与 Governance 链路|EX1、EX2、EX3、EX4|4 / 3|
|迁移 Runtime 与 Plugin 开发者集成和分发|DV1、DV2、DV3、DV4|4 / 3|

完整精确映射保留在各父 Goal 的 decomposition_review.contract_coverage；本提案原样携带，不在文档复制另一份可漂移的 Contract。

## 对实现证据的限制

这是需求覆盖审查，不重新验收实现。已有叶项结果仅按其原边界复用。最新 cutover-preflight.md 已明确旧 Coordinator、Store、Catalog、Feed 与 Web 的剩余职责、真实 caller 和现有测试替身；这些仍由未完成的最终切换与整体真实用户验收处理。绿色迁移边界基线不代表整个旧实现已退出。

根 Goal 的覆盖刷新不包含本次变更；其完整要求还要结合 assurance 范围、DD 收口及 Cutover 结果再核对。Assurance 范围提案和 DD 收口提案仍独立待决定，本提案不代替它们。

## 影响与验证

planning_analyze_change 返回根父项、9个下游消费者、1个相邻上游；图问题0。输入、输出、条件、关系均原样保留。决定后按返回的 review_order 读当前 Contract，若发现真实不一致再提出必要修订。

无需重跑无改动的生产测试。本次只核对要求映射及提案预检；最终实现验收顺序遵循 cutover-preflight.md。
