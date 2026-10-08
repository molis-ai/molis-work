# Workflows（工作流程）

把已有插件按顺序串成一件可以做完的事。插件仍各自工作；流程只决定顺序，以及上一步的结果怎样交给下一步。

- **一条流程**：若干插件排成的链。插件是站，两站之间是衔接。
- **衔接**：模板转换（按定好的规则转换，不问人）、AI（整理后送过去，整理结果留在记录里）、手动（人看完决定交不交、交什么）。没配好的衔接显示为未接上，不能走。
- **一次实例**：同一条流程可以走很多次，每次带自己的内容；实例保留当时的链、走到哪一步、每段交接留下的内容。

本包只负责流程与实例的数据、链的编辑规则、交接的纯计算、界面与路由表。内容站从系统动作目录发现并调用：插件通过 `defineWorkflowContentActions` 声明列表、读取、接收及可选空白创建，兑现对应处理器。Feed、Inbox、Pages、灵光各自拥有这些业务实现，Host 只组合存储、可信调用上下文与模型。

保存和开始实例会固定能力 ID、版本及提供方。旧链仍能读取，首次保存或开始时解析引用；旧实例在继续前固定尚未固定的站点。能力撤回、失权或升级导致原版本不可用时，保留原引用并显示原因，不自动换成同名新能力。`kind: "function"` 仅作为存量模板转换的存储值保留，不代表系统判断规则。

该内容协议要求明确的输入输出及语义版本，不根据 JSON 形状猜测内容用途。存量输入选择现在列出全部可交接内容，不再截断为前 60 条。动作步骤从授权目录发现，以字段映射接收上一步内容。内容接收端用固定交接键重试；任意动作在发出前保存尝试，结果未确认时必须由用户明确选择重试，避免重复外部副作用。取消或撤权后不再保存完成/失败记账，保留此前的未确认尝试供恢复。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 开发要求

- 负责：把已有插件按顺序串起来的项目流程与类型化交接。
- 不负责：插件的内容存储、模型提供方、Feed/Inbox/Pages 的内部实现。
- 公开入口：`@molis-ai/molis-work-plugin-workflows`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 流程只决定顺序与交接，插件各自工作；没配好的衔接显示为未接上，不能走。
  - 实例保留当时的链、进度与每段交接的内容；判断规则拦下一次运行时，原因与判断结果记在被拦下的那一步，重新读取时仍在。
  - 实例每次写入都让并发凭证（`updated_at`）变大，不会停在原值或倒退；带旧凭证的继续调用被拒绝。
  - 能力撤回、失权或升级使原版本不可用时，保留原引用并显示原因，不自动换成同名新能力。
  - 只有目录在交给提供方之前拒绝的调用才算没执行；其他错误按可能已执行处理。
- 改动后必跑：`node scripts/run-tests.mjs tests/workflows-plugin.test.ts tests/workflows-action-steps.test.ts tests/workflows-handoff-idempotency.test.ts tests/workflows-step-directory.test.ts tests/workflow-content-actions.test.ts tests/workflow-station-kinds.test.ts`
- 相关手册：[skills/molis-plugin-dev/host.md](../../../skills/molis-plugin-dev/host.md)、[specs/action-architecture/spec.md](../../../specs/action-architecture/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
