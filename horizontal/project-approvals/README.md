# 项目审批

项目审批拥有平台可信决定记录与项目审批规则。合同见[授权需求 §3.6](../../specs/agent-approval/spec.md#36-可信决定)。

## 开发要求

- 负责：已提交的本人决定、项目审批规则、版本与原记录引用。
- 不负责：业务对象、待审版本和物化结果。这些事实由动作提供方保存。
- 公开入口：`@molis-ai/molis-work-service-project-approvals`。项目库结构随宿主项目库基线创建。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`、`@molis-ai/molis-work-storage`。
- 不变量：
  - 只接受 Host 已核实的项目、动作、安装、入口和操作者。决定记录与业务写入共用项目库事务。
  - 同步记录与入口审计字段均不能签发许可。
  - 决定的业务结果只按提供方 Manifest 同步集合里的 `approval_outcomes`（结果所在分区、表与列）由平台自己读、算摘要并冻结在决定记录上（`outcomes.ts`，第 44B 批）；不跑插件代码，同步时按同一摘要核对。
- 改动后必跑：`node scripts/run-tests.mjs --jobs 1 tests/project-approvals.test.ts`。
- 相关手册：[合同变更](../../docs/system/CONTRACT-CHANGES.md)、[可信决定](../../specs/agent-approval/spec.md#36-可信决定)。
