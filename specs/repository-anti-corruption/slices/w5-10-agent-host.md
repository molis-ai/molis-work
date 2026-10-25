# W5-10 agent-host 份与 BL-541

状态：工程验证中，待评审与合入（2026-10-25）。负责人：ac-kernel。本片只做统筹派的三项，#1064（记忆线）改到的文件一律不动代码。

## 范围

1. **W5-10 agent-host 份**，按 2026-10-25 的新口径（巨大单元不硬拆，混了几件事的才拆，本身合理的标明）：
   - `horizontal/agent-host/src/adapters/prologue-checkpoints.ts` 的 `createPrologueCheckpoints`（221 行）：本片原先做过一次纯搬移拆分（RAC-659，46bce6a6d），**被 R-38 第 2 片取代**——R-38 第 2 片（51e2f24d9，随 batch-37）已经拆过这个函数，清单的 Agent Host 行也已由 R-38 收尾（0b5dcc0f8）重判。合并 batch-37 时 `prologue-checkpoints.ts` 与 Agent Host 表都用 batch-37 的版本，本片不再改这个文件。
   - `adapters/prologue-taskboard.ts` 的 `createPrologueTaskBoards`（实测 129 行）已由 R-38 收尾在 Agent Host 表里标为阈值以下；`apps/local-host/src/agent-host-composition.ts` 的 `composeAgentHost`（实测 87 行）batch-37 没覆盖，本片只把 local-host 表的那一行改成「已在阈值以下」，不改代码。
   - `prologue.ts`、`index.ts`、`prologue-stream.ts`、`prologue-action-gateway.ts`、`capability-registration.ts` 的判定以 batch-37（R-38）在 Agent Host 表里写的为准，本片不另判。
2. **BL-541**：计划步骤的持有者与报告作者改成结构化字段。`AgentStepOwner` 加 `title`（子任务的标题，即协调者派出时给的键）；报告的 `by` 从中文字符串改成 `AgentStepReportAuthor`（`kind`：`session`、`subtask`、`person`、`handover`、`other`；`label` 是宿主给本轮模型看的原话；子任务带 `title`）。W5-04 3b 已把 Coding 的三个浏览器客户端改成打包、类型检查的 TypeScript（`*-client.ts` 只读 bundle），所以读取一侧落在 `plugins/native/coding/src/browser/plan-progress.ts`、`browser/steps.ts`、`browser/taskboard-tree.ts`，类型从合同的 `AgentStepBoard` 取出。Coding 的任务板、计划进度与报告步骤只读 `kind` 和 `title`，不再用正则抠「子任务「…」」，也不再比 `本会话`、`用户`、`改派` 这些字面量。合同变了，按 `docs/system/CONTRACT-CHANGES.md` 不留兼容期，`pnpm api:update` 刷新快照。宿主给模型看的那一行（`stepLine`）照旧用 `label`。
3. **BL-470**（`AgentRunView` / `AgentSessionView` 嵌套 schema 收紧）：原先因 #1064 跳过，统筹 2026-10-25 改派，见下面「BL-470」一节。

## BL-470：会话与一轮视图的嵌套对象（2026-10-25，ac-kernel）

统筹 2026-10-25 改派。R8 第 3 批（`r8-agent-host-actions.md` §9.3①）只把顶层列全，嵌套对象只写 `object`：动作服务按输出 schema 核对返回，可只写 `object` 的地方什么形状都放得过，动作合同快照也看不出它变了。

做法（`packages/contracts/src/services/agent-host.ts`）：

- `readRun`、`readSession`（`latest_run`）、`waitRun` 的 `view`、`listSubagents` 共用的嵌套对象逐个写出字段：`frozen`、`turns`（含 `steer`）、`activity`、`usage`（含 `tokens`、`compaction`、`context`）、`awaiting_input`（含 `options`）、`step_board`（节点、报告、`by`、`owner`）、`memory_recalled`、`todo`、`turn_changes`（含 `files`）、`retry_wait`、`model_switch`、`offers`（含 `reference`、`missing`）、会话的 `queued_inputs`；子任务的 `activity`、`usage` 用同一份。
- 只写仓库里调用方（Coding 的服务端与页面）读的字段，类型照 `agent-host-run-view.ts` 等处的接口；接口里必有的写进 `required`。Coding 不读的（`allows_free_text`、`attempt`、`action_digest`、`injected`、`left_by`、`ending_review`、`image_materials`、`continues_step_board_of`、`action_gateway`）不写。
- 嵌套对象不加 `additionalProperties: false`：其余是运行时自己的记录，多带的字段照样放过。再往下一层（`frozen.execution`、`character`、`budget` 等）仍只写 `object`。
- 不升 `version`：这些动作只给插件调（`audiences: ["plugin"]`），Coding 经 `services.agents` 调用，不写 `capability_id@version` 的固定引用，工作流、MCP 也调不到，所以没有固定引用会遇到另一份合同；合法的返回本来就符合新形状，收紧只拒掉不符合类型的返回。#1064 会把 `readRun`、`readSession`、`startRun`、`waitRun` 升到 2，与本片在 `runViewOutput` 那一行有一处文字冲突（它加 `original_input: object`），合并时两边都留。

| 编号 | 标准 |
| --- | --- |
| RAC-667 | 一轮视图和会话视图的嵌套对象按类型核对：完整视图（含 schema 没列的字段）原样通过；用量 token 不是数、轮次种类不在四种之内、活动缺时间、问题缺选项、步骤持有者缺 `label`、报告作者种类不在五种之内、冻结提示词的层不对、冻结预算不是对象或 null、建议缺提供方、写入的文件缺摘要、重试原因不在三种之内、待办状态不在四种之内，在 `readRun` 与 `readSession` 里都被 `actions.output_invalid` 拒；会话里待读输入的来源不在三种之内同样被拒。`tests/agent-view-schema.test.ts`。 |

## 验收

| 编号 | 标准 |
| --- | --- |
| RAC-658 | 计划步骤的报告带结构化作者：改派是 `handover`，子任务是 `subtask` 并带自己的标题，本会话是 `session`，人是 `person`；`label` 仍是宿主的原话。`tests/coding-step-claims.test.ts`、`tests/coding-coordinator-board.test.ts` 断言整个对象。 |
| RAC-659 | 被 R-38 第 2 片取代：`createPrologueCheckpoints` 的拆分由 R-38 第 2 片（51e2f24d9）完成，验收以该片为准，本片不再声明。 |

## 接受 WO：BL-541 步骤详情语言与 owner 类型（Codex I1，2026-10-25）

固定输入为 `6bce81fdac9ea194da8bcf98fee02f33201050bb`，承接 [FIRST 6399559635](https://github.com/molis-ai/molis-work/pull/1297#issuecomment-6399559635) 的非阻塞项 1、2，负责人 Codex I1。目标完成程度：这两项中英文步骤详情行为修复可用；不宣称原片、真实模型执行或全产品已验收。独立分支实施，不修改原 ac-kernel 工作树、原 PR 或主检出。

步骤详情的 owner 与 report.by 和计划卡/任务板共用一份按 `kind` 取页面稳定翻译键的纯函数：session、person、none、other 用现有页面词，subtask 用真实 `title` 原样插值或缺标题时用通称，handover 仍明确显示改派。宿主 `label` 继续留给模型，不作为页面文案，不解析或截取标题。`StepNode.owner` 直接索引既有 `AgentStepBoard["nodes"][number]["owner"]`，不新增合同或公共导出。

允许改动：Coding browser 步骤/形状与现有 owner 文案的最小共享 helper，相关现有回归及本 spec。RAC-659/51e 检查点、Prologue、Memory、BL-470、完整 TaskBoard 模型与原 PR 标题不在本 WO；不用兼容层，不改授权或持久数据。

| 编号 | 本 WO 验收与证据 |
| --- | --- |
| RAC-658-UI-01 | 实际步骤详情在中文/英文页分别显示五种 owner 的页面词，宿主中文 label 哨兵不能进入详情。 |
| RAC-658-UI-02 | 报告作者按结构化 kind 显示，handover 仍明确为改派/Reassigned，报告正文保留。 |
| RAC-658-UI-03 | 子任务 title 含内层引号、标点、中英文及其他文字时完整保留，缺 title 才使用子任务通称；不截取或从 label 还原。 |
| RAC-658-UI-04 | owner 沿用合同闭合类型；Coding 浏览器整体类型检查通过，无新公开 API/类型、动作或快照变化。 |

验证走现有打包链和定向回归：先在公共 build FIFO 整体 `pnpm build`；非浏览器只跑 `coding-client-bundle` 与 `coding-step-receipt-link`；单浏览器批只跑 `coding-state-rings.e2e` 的新增 RAC-658-UI 与原 RING-07 路径，使用公共 test-kit、隔离 Home/profile 和专用测试浏览器，finally 关闭并清目录。实际 diff 再核 health（明确父输入与 main 比较边界）、boundary、页面资源；不放宽数字/资源，不重原七文件批或 full。鲜取 main、secrets 后固定普通推送，只交既有 REVIEW/TEST 核本增量，由 PIPE 采用。

本 WO 实际验证：整体 `pnpm build` 在公共 FIFO 自然 exit 0（`/tmp/bl541-step-build.log`）；`coding-client-bundle` 6/6、`coding-step-receipt-link` 1/1（`/tmp/bl541-step-unit.log`）。独立浏览器批按 FIFO 完成，专用 test-kit/测试浏览器执行新增 RAC-658-UI 与原 RING-07 两条，2/2、零 fail/cancel/skip、自然 exit 0，结束关闭浏览器并删除临时目录（`/tmp/bl541-step-browser.log`）；同文件其他用例未在此批运行。测试在真实浏览器加载生产 bundle 与真实词典，结构化 API 返回为受控 fixture，证明本 WO 的页面行为，不扩为真实模型或整产品验收。

health 分别对准确父输入 `6bce81fd` 及鲜取 `origin/main` 实际通过，原件 `/tmp/bl541-step-health-parent.log`、`/tmp/bl541-step-health-main.log`；整体构建后的原 boundary checker 为 70 包、2,943 源文件、13,490 imports、250 依赖边、67 合同子路径，零错误（`/tmp/bl541-step-boundary.log`）。没有新公共类型、合同、动作、翻译键或快照变更，也没有触及撤回的 RAC-659。

资源实测 31 项、7,548,812 字节，只有 Coding 客户端相对冻结值 `289774` 为 `288960`（下降 814），其余 30 项不变。`/tmp/bl541-step-assets.log` 只是报告；原精确资源门禁 `/tmp/bl541-step-assets-check.log` exit 1，原因是下降后未回填冻结值，不写成本 leaf 全门禁绿。按原统筹 [6399521951](https://github.com/molis-ai/molis-work/pull/1297#issuecomment-6399521951) 及本轮 Root/PIPE 确认，公共 `page-assets.json` 由唯一 carrier 在真实组合树统一冻结，本 leaf 不并写；精确单行建议 `/tmp/bl541-step-budget-decrease.patch` 随交付，但组合采用时重新实测，不机械套本 leaf 字节数。原七文件批、full、原 PR 标题及 checkpoint 拆法均未重做；固定分支仍须独立 REVIEW/TEST 通过再交 PIPE 采用。
