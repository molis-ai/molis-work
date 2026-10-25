# Workflows（工作流程）

把已有插件按顺序串成一件可以做完的事。插件仍各自工作；流程只决定顺序，以及上一步的结果怎样交给下一步。

- **一条流程**：若干插件排成的链。插件是站，两站之间是衔接。
- **衔接**：模板转换（按定好的规则转换，不问人）、AI（整理后送过去，整理结果留在记录里）、手动（人看完决定交不交、交什么）。没配好的衔接显示为未接上，不能走。
- **一次实例**：同一条流程可以走很多次，每次带自己的内容；实例保留当时的链、走到哪一步、每段交接留下的内容。

本包只负责流程与实例的数据、链的编辑规则、交接的纯计算、界面、Manifest 声明的路由与 Plugin Runtime 入口（`createWorkflowsPlugin`）。它由 Plugin Runtime 装配，每个项目一个实例，库仍是 `{home}/workflows/workflows.db`。内容站从系统动作目录发现并调用：插件通过 `defineWorkflowContentActions` 声明列表、读取、接收及可选空白创建，兑现对应处理器。Feed、Inbox、Pages、灵光各自拥有这些业务实现，Host 只组合存储、可信调用上下文与模型。

保存和开始实例会固定能力 ID、版本及提供方。旧链仍能读取，首次保存或开始时解析引用；旧实例在继续前固定尚未固定的站点。能力撤回、失权或升级导致原版本不可用时，保留原引用并显示原因，不自动换成同名新能力。`kind: "function"` 仅作为存量模板转换的存储值保留，不代表系统判断规则。

该内容协议要求明确的输入输出及语义版本，不根据 JSON 形状猜测内容用途。存量输入选择现在列出全部可交接内容，不再截断为前 60 条。动作步骤从授权目录发现，以字段映射接收上一步内容；步骤在记下尝试之前先经目录预检（`check`），输入不合格或调用者够不到的步骤既不执行也不留尝试。内容接收端用固定交接键重试；任意动作在发出前保存尝试，结果未确认时必须由用户明确选择重试，避免重复外部副作用。取消或撤权后不再保存完成/失败记账，保留此前的未确认尝试供恢复。

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Migration: `goal-reorg-f2`

## 站点操作的触控入口

站点的移动、移除按钮在无悬停或粗指针设备上直接显示，不依赖触摸被浏览器转换为鼠标事件或把焦点交给站点。只有支持悬停的细指针设备才在未悬停、未聚焦时隐藏；键盘聚焦仍显示，实际拖拽期间仍隐藏。沿用站点现有工具栏和编辑动作，不新增手势识别、焦点处理或保存路径。

本次修复限于本包样式、本文和真实页面回归；现有 Goals / Workflows 浏览器夹具仅透传可选 Chrome 启动参数，用真实媒体状态覆盖无悬停的细指针，默认行为保持。验证宽屏与 390px 工具栏的完整命中区、触控移动后的持久顺序、横向触摸滚动不跳页，以及鼠标拖拽取消后的工具恢复；保留 `tests/hover-actions.e2e.test.ts` 的动作、等待和断言。

触屏回归由原生 CDP `touchStart/move/end` 驱动浏览器手势识别，不在页面合成事件或写入滚动位置。横向指轨保持已观察的 95px、120px/s，点击保持 60ms；手势结束立即核对滚动、页面和焦点，再核对按钮动作的持久结果，不增加结束后的等待或重试。

## 开发要求

- 负责：把已有插件按顺序串起来的项目流程与类型化交接。
- 不负责：插件的内容存储、模型提供方、Feed/Inbox/Pages 的内部实现。
- 公开入口：`@molis-ai/molis-work-plugin-workflows`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入；`createWorkflowsPlugin` 是 Runtime 入口）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 站点、动作步骤与判断规则都经 `context.services.actions.directory`（Manifest 权限 `actions:delegate`）到达，以启动这次调用的人、MCP 客户端或 Agent 本人的身份：目录沿用调用者的 `allowed_actions` 与 `validate_authority`，只把受众改成 `workflow`。插件本身只持有 `storage:private`、`workflows:read`、`workflows:write`、`actions:delegate`（必需）和 `model:invoke`（可选），站点和步骤要的权限归调用者，不归插件。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（`defineErrorCodes`，错误码都是 `workflows.<原因>`，状态由错误种类决定，Workflows 不自带状态表）、`@molis-ai/molis-work-storage`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 被取消、撤权的调用不再写任何业务记录：写入前 `await beforeEffect()`，嵌套调用带着原调用的 `signal`、`beforeEffect` 与最终授权检查；人、MCP 客户端、Agent 各自够不到的步骤既不执行，也不在实例上留下「尝试」。
  - 流程只决定顺序与交接，插件各自工作；没配好的衔接显示为未接上，不能走。
  - 实例保留当时的链、进度与每段交接的内容；判断规则拦下一次运行时，原因与判断结果记在被拦下的那一步，重新读取时仍在。
  - 实例每次写入都让并发凭证（`updated_at`）变大，不会停在原值或倒退；带旧凭证的继续调用被拒绝。
  - 编辑保存固定所属流程和每次内容快照；排队请求只推进该流程的版本，切换流程或返回目录不会改写后来对象。标题与交接字段的去抖在离开时归原流程提交；动画后的编辑只操作仍在看的原流程。
  - 保存失败保留该流程的最新编辑并暂停它后续的排队写入；本标签页重新打开或重载后仍可查看并明确重试。开始实例先等该次编辑保存完成，失败草稿不能拿旧链开始。失败与重读不会跳回原流程，其他流程继续可用。
  - 搜索和对象标签的打开请求按同一流程 ID 读取正文、标题与助理上下文；首次加载先读目录，最新打开意图优先于旧的页面记忆，无 ID 的请求返回目录。
  - 能力撤回、失权或升级使原版本不可用时，保留原引用并显示原因，不自动换成同名新能力。
  - 只有目录在交给提供方之前拒绝的调用才算没执行；其他错误按可能已执行处理。
  - 项目被删除时平台按 Manifest 里 Home 库的 `project_rows`（`src/database.ts`：确认框里的标签与要删的表）删掉流程（含已隐藏的）与它们的运行实例；插件的代码不参与，平台在自己的连接上删，库不存在时不创建，重复运行没有副作用（PG-024）。
- 页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/workflows-client.js`（banner/footer 包成工作台要的 `(host) => {…}` 工厂，`--minify`）；`src/client.ts` 的 `WORKFLOWS_CLIENT_FACTORY_SCRIPT` 只读这个包。页面状态在一个 `WorkflowsPage` 对象里（`page.ts`），各部分是拿它当第一个参数的函数：`nav.ts`（列表、流程、运行之间的切换与记住）、`flow.ts` 与 `list.ts`（画链）、`save.ts`（保存队列、撤销、拖动与删除）、`popover.ts`、`link.ts`、`step.ts`（浮层里的交接设置与动作步骤）、`run.ts` 与 `handoff.ts`（运行视图与交接）、`dialog.ts`、`click.ts`、`pop-events.ts`、`root-events.ts`、`drag.ts`（事件）；请求只经工作台的 `molisWorkRequest`（`request.ts`，路径在 `/workflows` 之后，路由由 `host.pluginRoute` 按 Manifest 身份与当前项目给出）。
- 页面上的字是稳定键（`workflows.<区域>.<名称>`），中英文都在 `src/messages.ts`，在 `manifest.ts` 的 `ui.messages` 声明，不经工作台的 `i18n/en.ts` import。不是从表里选的字只有一类：别的主人写的字（插件的名字、站点不可用的原因、动作返回的摘要），它们经 `dom.ts` 的 `said()` 一处交给宿主的词典翻译；`tests/workflows-client-bundle.test.ts` 钉住这一处和键与词的对应。`src/en.ts` 的 `WORKFLOWS_EN` 只留 45 条宿主还按中文原文翻译的词（服务端标签与错误、别的主人在查的词，BL-463）。
- 改动后必跑：`node scripts/run-tests.mjs tests/workflows-plugin.test.ts tests/workflows-action-steps.test.ts tests/workflows-handoff-idempotency.test.ts tests/workflows-step-directory.test.ts tests/workflow-content-actions.test.ts tests/workflow-station-kinds.test.ts tests/workflows-client-bundle.test.ts tests/workflows-judgment-link.test.ts tests/workflows-stop-and-token.test.ts tests/workflows-stop-effects.test.ts tests/workflows-delegation.test.ts tests/workflows-project-deletion.test.ts tests/workflows-store.test.ts tests/project-deletion-owners.test.ts tests/document-plugins-error-model.test.ts tests/builtin-plugin-assembly-gate.test.ts`
- 界面改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workflows-save-ownership.e2e.test.ts tests/workflows-open-object.e2e.test.ts tests/workflows-action-steps.e2e.test.ts tests/workflows-touch-tools.e2e.test.ts tests/model-ready-surfaces.e2e.test.ts`（页面在没有模型时显示「没有模型」，模型设置页宣布第一个模型（`molis-work:model-ready`）后它要重读；这个文件每个页面一条用例）。
- 保存与编辑导航改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workflows-save-ownership.e2e.test.ts`（W2-18-WFSAVE-01/02：真实 HTTP/Store 回执屏障、跨流程与目录、标题/交接去抖、失败重载及明确重试、动画后过期编辑）。
- 对象打开改动加跑（需要本机 Chrome）：`node scripts/run-tests.mjs tests/workflows-open-object.e2e.test.ts`（W2-18-WF-OPEN-01：正式搜索、已开另一条流程、对象标签/重载恢复、首次按需加载、无 ID 返回目录）。
- 相关手册：[skills/molis-plugin-dev/host.md](../../../skills/molis-plugin-dev/host.md)、[specs/action-architecture/spec.md](../../../specs/action-architecture/spec.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
