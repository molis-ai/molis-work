# WI02 修正 F 交回

Writer 完成第 6 组：真正有限的结构提交类型、无消费者 schema/glue 清理，以及主复核指出的两个生产边界。未宣称 WI02 或主验收通过。A–E 已主验收；本项交回后由主独立复跑探针。未改 A–E 语义、迁移/身份授权。未 commit/push。未改主 spec/progress/acceptance。

## 有限提交类型

生产新写入只接受：

- `kind=goal` `operation=create`，payload 为 `GoalTreeGoalCreatePayload`（`title` 必填字符串；可选 `outcome`/`why`/`business_logic` 字符串、`priority` 数字、`goal_id` 字符串、`requirements[]`）
- `kind=relation` `operation=create`，payload 为两端 + `type=part_of|depends_on` + `reason`
- `kind=relation` `operation=deactivate`，payload 为 `relation_id + reason`，或两端 + `type` + `reason`（可另带 `relation_id`）

`GoalTreeProposalSubmitInput.items` 与 `GoalTreeProposalItemDecisionInput.revised_item` 都引用同一 discriminated union。历史 `GoalTreeProposalItemRecord` 仍是宽 `kind` + `Record` payload，只供读。

运行时校验与类型同步：旧 kind、错误 operation、对象 title、`human_decision_required: "true"`、未知键、嵌套 `board_id` 在持久化前拒绝。合法 `true`/`false` 原样写入已存提案。来源数组/理由/置信度仍走既有 provenance，parser 不再 filter/String/Number 后交给它。

`relation/deactivate` 的 `{relation_id, reason}` 是已验收行为；基线与 materializer 仍按 `goal-tree-inputs.normalizeGoalTreeRelation` 用 ID 或三元组解析，未改全组原子检查。

## 调用链

新提交：MCP/Host `goal_tree_propose` → `GoalTreeSubmissionApplication` → `GoalTreeProposalNormalizer.parseGoalTreeWriteItem` → provenance → 已存 native proposal。

修订：decide 的 `revised_item` 再走同一 normalizer，不能塞回 risk/contract。

受保护决定：Web/管理 `decideGoalTreeProposal`；Runtime dispatch 仍拒绝写入。整组确认仍要求 `whole_confirmation_prompted`；`runtime_dialogue` 还要绑具体 `prompted_proposal_id`。测试补的是 Web 权威输入，没有放宽生产规则。

## 删除与保留

删除（本组无消费者）：

- MCP `GOAL_TREE_CONTRACT/DEPENDENCY/RISK/POLICY/CANDIDATE/REWIRE_PAYLOAD` 及其独占 glue
- `prepareRiskRepair` 与 HTTP `risk_repairs` 写路径；该请求现返回 `kind_retired`
- 决定页「保存风险处理」按钮和 `repair-risks` 前端提交

保留：

- 历史提案可读；check/decide 遇旧 kind 仍 `kind_retired` 不落地
- `CONTRACT_PROPOSAL_GOAL_PAYLOAD`、`GOAL_TREE_POLICY_FIELDS` 等仍有真实 MCP 消费者的通用 schema
- 旧 Candidate/Rewire/Contract Proposal HTTP 决定入口（03 全局退役）

## 验证

主探针未改。生产改动后先 build，再从仓库 stdin 跑主脚本：

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/02-f-build.log  EXIT 0

npx tsc --noEmit --strict --skipLibCheck --target ES2022 --module NodeNext --moduleResolution NodeNext \
  /private/tmp/molis-work-flow-cleanup/02-f-types-acceptance.mts
  → /private/tmp/molis-work-flow-cleanup/02-f-types.log  EXIT 0

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-f-wire-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-f-wire.log  EXIT 0
    PASS invalid human-flag / object-title rejected
    PASS valid true/false human flags survive propose+read without materializing

node --import tsx --input-type=module < /private/tmp/molis-work-flow-cleanup/02-tree-acceptance.mjs
  → /private/tmp/molis-work-flow-cleanup/02-f-tree.log  EXIT 0
    含 ID-only relation/deactivate、竞争关系、陈旧拒绝、循环/跨项目、Host 焦点

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/02-f-boundary.log  EXIT 0  errors: []

env -u FORCE_COLOR 未使用；node --import tsx --test --test-concurrency=1 原 02 定向 11 文件
  → /private/tmp/molis-work-flow-cleanup/02-f-tests.log  77 pass / 0 fail / 0 skip
  → 副本 /private/tmp/molis-work-flow-cleanup/02-final-tests.log

named Web：atomic whole confirmation 显示 in_progress/进行中；退役 contract 拆分断言 kind_retired
  → /private/tmp/molis-work-flow-cleanup/02-f-web-d.log  2 pass / 0 fail
```

Writer 本地跑过上述主探针，**不代替主独立复跑，不宣称主验收通过**。

## 测试承接

- `goal-tree-event-flow`：Web 整组确认补 `whole_confirmation_prompted`；伪造 Runtime 整组确认仍 `whole_confirmation_ambiguous`；旧 risk kind 断言改为核对 `kind_retired` 代码
- 事件测试：新建改为 `createIntent` 要求，不再靠旧 criterion ID；人工门禁用 `human_decision_required`，阻塞 Concern 用 `applyConcern`；不删反证
- Web 固定拆分测试改为提交期 `kind_retired`；不恢复旧 kind
- `mcp-resume-view.test.ts` 尾部多余空行已删

审查修正（生产已主验收，仅收紧被放宽的回归断言，未改生产）：

- `registers fields...`：开关前后都独立断言 kind 顺序 `system, configuration, report`，并保留 payload/version/actor/journal
- 分页历史：独立断言创建系统事件 + configuration + `进展 一..五` 全文；保留分页无缺口/无重复/跨 Goal/顺序与非法游标
- 有界最新报告：首页独立断言长度 50、前两条 system/configuration、reports `report 1`..`report 48`；保留最新 `55..51` 与重启读取。不再用 `notEqual(..., "report 55")`

```
node --import tsx --test --test-concurrency=1 tests/goal-events.test.ts
  → /private/tmp/molis-work-flow-cleanup/02-f-goal-events-review.log  13 pass / 0 fail / 0 skip
git diff --check -- tests/goal-events.test.ts specs/.../correction-f-handoff.md
  → 无空白错误
```

## 03 待执行

全局退役旧 MCP/CLI/执行器写入口与 discovery 残留；Web 仍存在的 Candidate/Rewire/Contract Proposal/历史 Risk 修复/伪叶子/任务链等旧测试与 UI，随 03 删除，不把它们算作 F 幂等或类型失败。Skill/文档在 04。
