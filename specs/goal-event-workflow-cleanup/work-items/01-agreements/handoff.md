# WI01 交回

Writer 已按独立验收裁决完成三项修正，未宣称主验收通过。完成等级：本项功能可用/内部完整切片，UI 截图与全仓留给主/04。

## 最终接口

- `setAgreement` 必填 `expected_agreement_version` + `expected_config_version`。变更形状：`outcome?`、`new_requirements?`、`revise_requirements?`、`retire_requirement_ids?`、`cited_decision_id?`。空操作拒绝。未知键拒绝。
- `configure` 不再接受自由文本 `new_requirements`。`adopt_default_requirement_ids` 非空时必填 `expected_agreement_version`，同事务走约定新增。
- `submitClosure` 必填两个 expected 版本；缺一或过期在写入前拒绝。
- `requestDecision` 必填 `purpose`：`suggestion` | `requirement_acceptance` | `action` | `agreement_change`。`agreement_change` 必须带 `proposed_change`，并持久化请求时 `commitment`（原结果 + 受影响要求的 statement/绑定/人工责任）。
- 新效果 `authorize_agreement_change`；拒绝使用已有 `deny_action` + `set_agreement`。授权比较业务 delta（不含 expected 版本/幂等键/`cited_decision_id`），并核对请求时承诺与当前实际承诺。相关承诺变过则批准拒绝、无部分写入。无关类型发布不使授权失效。应用时仍做双版本 CAS。没有承诺快照时不以「同 ID 当前存在」兜底。
- 保护性：替换非空结果、改已有 statement、退休要求、`human_decision_required` true→false。Runtime 必须引用匹配的 `cited_decision_id`。Web/management `actor_kind=user` 可直接提交。false→true 可直接提高门禁，但该要求旧支持/结论过期。
- 更换非空 outcome 使全部当前要求的支持和人工结论过期，历史保留；仅修订某一要求时才保留其它要求的支持。任意实际约定变更使已生效完成退出。人工接受后更新的 `unknown` 与 `contradicts` 均不满足。
- 类型 v2 可改字段集合与约束；旧事件按保存的 `type_version` 读。类型演化不改当前要求。
- 采用规划可退出当前列表；历史配置事件不改写。

## 数据库

迁移 **35**（新库在首次安装路径同时记 34/35）。`ensureGoalEventAgreementChangeColumns` 每次打开补列，fresh CREATE 与旧库升级都含 `commitment_json`。

- `goal_event_requirements`：`human_decision_required`、`current_status`、`revision`、`support_valid_after_seq`
- `goal_event_decision_requests`：`purpose`、`proposed_change_json`、`commitment_json`
- `goal_event_applied_decisions`：`authorized_change_json`
- `goal_event_trusted_decisions`：`change_json`（含 GOVERNANCE 建表 SQL）

不碰真实用户 DB。

## 拆分

为通过 700 行边界：`event-agreement-change.ts`、`event-state-agreement.ts`、`event-facts-requirements.ts`。无新总编排器。

## 独立验收后的三项修复

1. `expireRequirementIds` 在非空 outcome 被替换时返回全部当前要求 ID，抬高 `support_valid_after_seq`。公共反例：close 后 Web 替换结果，`currently_satisfied` 为 false，下一 close 只记录 `completion_applied:false`。历史 `supports` 判断仍可读。单要求修订仍只过期该要求。
2. `requestDecision` 写入请求时 commitment。`recordTrustedDecision` 在 `persistGovernance` 之前比较；相关承诺变过则 `event_decision.stale_commitment`，cursor/要求/决定均无写入。cite 时也不再把空承诺快照当成「同 ID 仍有效」。
3. 约定变更表单改为互斥、初始未选的 `agreement_change_decision=authorize|deny`，不再预勾 `authorize_agreement_change`，也不再用业务 radio 当授权。client 只发 `authorize_agreement_change` 或 `deny_action set_agreement`，不另改请求范围。审阅展示原结果/原要求原文；过期请求提示刷新或重新请求，HTTP 批准返回 400。

## 场景证据（生产公共入口）

| 场景 | 结果 |
| --- | --- |
| Draft 新意图替换非空结果，Runtime 无具体授权 | 拒绝 `event_agreement.unauthorized_change`，完成仍生效、无新事件 |
| 用户/cite 替换非空结果 | 完成退出；全部当前要求 `currently_satisfied=false`；旧报告仍在；立即 close 为 `completion_applied:false` |
| close 省略约定版本 | MCP/Module 拒绝，无写入 |
| HTTP 未知顶层键 / Module 嵌套未知键 | 拒绝，无写入 |
| 新人工要求保存读回；仅 supports 不能完成；接受后 unknown 不满足 | 通过 |
| suggestion 不挡完成；requirement_acceptance pending 挡住 | 通过 |
| 修订一条 statement 只过期该支持；空约定变更拒绝 | 通过 |
| 请求后改相关要求再批准旧 retire | HTTP/MCP/Module 拒绝，无决定写入，原文仍是新 statement |
| 无关类型 v2 后仍可应用已批准的 outcome delta | 通过 |
| 类型 v2 改名/删字段，v1 事件仍完整；同版本重写拒绝 | 通过 |
| 规划默认要求 + `expected_agreement_version` | planning 定向通过 |
| 约定变更表单 | 互斥必选、不预勾、展示原结果/退休原文；过期请求有处理说明 |

## 命令

```
pnpm_config_verify_deps_before_run=warn pnpm build
  → /private/tmp/molis-work-flow-cleanup/01-correction-build.log  EXIT 0

pnpm_config_verify_deps_before_run=warn pnpm boundary:check
  → /private/tmp/molis-work-flow-cleanup/01-correction-boundary.log  EXIT 0

env -u FORCE_COLOR NODE_NO_WARNINGS=1 node --import tsx --test --test-concurrency=1 \
  tests/goal-events.test.ts tests/goal-events-state.test.ts \
  tests/mcp-goal-events-state.test.ts tests/goal-event-http.test.ts \
  tests/goal-events-planning.test.ts
  → /private/tmp/molis-work-flow-cleanup/01-correction-tests.log  52 pass / 0 fail
```

未跑全仓、未截图、未 commit/push。未改 /tmp 主验收脚本。

## 未完 / 交给主

- 桌面/390px 表单操作与视觉由主做 UI 验收（约定变更现为互斥必选批准/拒绝，过期请求有说明）。
- 新建入口、旧数据切换、MCP 删除、Skill 由 02–04。
- 旧 acceptance criterion 仍只读，不在本项做修订模型。
- 新库首次安装路径原先只记到迁移 33，已补记 34/35 并给 trusted decisions 加 `change_json`、请求表加 `commitment_json`；主独立 /tmp 复现时请用新临时库。
