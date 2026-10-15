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
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `workflows.<原因>`，状态由错误种类决定，Workflows 不自带状态表）、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 流程只决定顺序与交接，插件各自工作；没配好的衔接显示为未接上，不能走。
  - 实例保留当时的链、进度与每段交接的内容；判断规则拦下一次运行时，原因与判断结果记在被拦下的那一步，重新读取时仍在。
  - 实例每次写入都让并发凭证（`updated_at`）变大，不会停在原值或倒退；带旧凭证的继续调用被拒绝。
  - 编辑保存固定所属流程和每次内容快照；排队请求只推进该流程的版本，切换流程或返回目录不会改写后来对象。标题与交接字段的去抖在离开时归原流程提交；动画后的编辑只操作仍在看的原流程。
  - 保存失败保留该流程的最新编辑并暂停它后续的排队写入；本标签页重新打开或重载后仍可查看并明确重试。开始实例先等该次编辑保存完成，失败草稿不能拿旧链开始。失败与重读不会跳回原流程，其他流程继续可用。
  - 搜索和对象标签的打开请求按同一流程 ID 读取正文、标题与助理上下文；首次加载先读目录，最新打开意图优先于旧的页面记忆，无 ID 的请求返回目录。
  - 能力撤回、失权或升级使原版本不可用时，保留原引用并显示原因，不自动换成同名新能力。
  - 只有目录在交给提供方之前拒绝的调用才算没执行；其他错误按可能已执行处理。
  - 项目被删除时宿主按目录条目上的 `project_data`（`workflowsProjectData`，`src/project-data.ts`：确认框里的标签与 `purgeWorkflowsProject`）调用清掉流程（含已隐藏的）与它们的运行实例；只读库文件，库不存在时不创建，重复运行没有副作用。
- 改动后必跑：`node scripts/run-tests.mjs tests/workflows-plugin.test.ts tests/workflows-action-steps.test.ts tests/workflows-handoff-idempotency.test.ts tests/workflows-step-directory.test.ts tests/workflow-content-actions.test.ts tests/workflow-station-kinds.test.ts tests/workflows-judgment-link.test.ts tests/workflows-stop-and-token.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 保存与编辑导航改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workflows-save-ownership.e2e.test.ts`（W2-18-WFSAVE-01/02：真实 HTTP/Store 回执屏障、跨流程与目录、标题/交接去抖、失败重载及明确重试、动画后过期编辑）。
- 对象打开改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workflows-open-object.e2e.test.ts`（W2-18-WF-OPEN-01：正式搜索、已开另一条流程、对象标签/重载恢复、首次按需加载、无 ID 返回目录）。
- 相关手册：[skills/molis-plugin-dev/host.md](../../../skills/molis-plugin-dev/host.md)、[specs/action-architecture/spec.md](../../../specs/action-architecture/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
