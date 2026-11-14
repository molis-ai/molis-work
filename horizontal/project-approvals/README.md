# 项目审批

项目审批拥有平台可信决定记录与项目审批规则。合同见[授权需求 §3.6](../../specs/agent-approval/spec.md#36-可信决定)。

## 开发要求

- 负责已提交的本人决定、项目规则、版本与原记录引用。
- 业务对象、待审版本和物化结果归原动作 owner。平台接线传入当前项目库连接，决定记录与业务写入共用该连接的实际事务。
- 公开入口为 `@molis-ai/molis-work-service-project-approvals`。项目库结构随宿主项目库基线创建。
- 依赖 contracts、plugin-sdk 和 storage。只接受 Host 已核实的项目、动作、安装、入口和操作者。外部内容、同步的历史记录及可信入口的审计字段均不会签发许可。
- 改动后运行 `node scripts/run-tests.mjs --jobs 1 tests/project-approvals.test.ts`。
