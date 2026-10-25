# W5-10 agent-host 份与 BL-541

状态：工程验证中，待评审与合入（2026-10-25）。负责人：ac-kernel。本片只做统筹派的三项，#1064（记忆线）改到的文件一律不动代码。

## 范围

1. **W5-10 agent-host 份**，按 2026-10-25 的新口径（巨大单元不硬拆，混了几件事的才拆，本身合理的标明）：
   - `horizontal/agent-host/src/adapters/prologue-checkpoints.ts` 的 `createPrologueCheckpoints`（221 行）：本片原先做过一次纯搬移拆分（RAC-659，46bce6a6d），**被 R-38 第 2 片取代**——R-38 第 2 片（51e2f24d9，随 batch-37）已经拆过这个函数，清单的 Agent Host 行也已由 R-38 收尾（0b5dcc0f8）重判。合并 batch-37 时 `prologue-checkpoints.ts` 与 Agent Host 表都用 batch-37 的版本，本片不再改这个文件。
   - `adapters/prologue-taskboard.ts` 的 `createPrologueTaskBoards`（实测 129 行）已由 R-38 收尾在 Agent Host 表里标为阈值以下；`apps/local-host/src/agent-host-composition.ts` 的 `composeAgentHost`（实测 87 行）batch-37 没覆盖，本片只把 local-host 表的那一行改成「已在阈值以下」，不改代码。
   - `prologue.ts`、`index.ts`、`prologue-stream.ts`、`prologue-action-gateway.ts`、`capability-registration.ts` 的判定以 batch-37（R-38）在 Agent Host 表里写的为准，本片不另判。
2. **BL-541**：计划步骤的持有者与报告作者改成结构化字段。`AgentStepOwner` 加 `title`（子任务的标题，即协调者派出时给的键）；报告的 `by` 从中文字符串改成 `AgentStepReportAuthor`（`kind`：`session`、`subtask`、`person`、`handover`、`other`；`label` 是宿主给本轮模型看的原话；子任务带 `title`）。W5-04 3b 已把 Coding 的三个浏览器客户端改成打包、类型检查的 TypeScript（`*-client.ts` 只读 bundle），所以读取一侧落在 `plugins/native/coding/src/browser/plan-progress.ts`、`browser/steps.ts`、`browser/taskboard-tree.ts`，类型从合同的 `AgentStepBoard` 取出。Coding 的任务板、计划进度与报告步骤只读 `kind` 和 `title`，不再用正则抠「子任务「…」」，也不再比 `本会话`、`用户`、`改派` 这些字面量。合同变了，按 `docs/system/CONTRACT-CHANGES.md` 不留兼容期，`pnpm api:update` 刷新快照。宿主给模型看的那一行（`stepLine`）照旧用 `label`。
3. **BL-470**（`AgentRunView` / `AgentSessionView` 嵌套 schema 收紧）跳过：schema 在 `packages/contracts/src/services/agent-host.ts`，类型在 `agent-host-run-view.ts`，两份都在 #1064 里。为了不碰这两份，BL-541 的新类型也不经 `agent-host.ts` 转出，调用方从 `AgentStepBoard` 取出这个类型。

## 验收

| 编号 | 标准 |
| --- | --- |
| RAC-658 | 计划步骤的报告带结构化作者：改派是 `handover`，子任务是 `subtask` 并带自己的标题，本会话是 `session`，人是 `person`；`label` 仍是宿主的原话。`tests/coding-step-claims.test.ts`、`tests/coding-coordinator-board.test.ts` 断言整个对象。 |
| RAC-659 | 被 R-38 第 2 片取代：`createPrologueCheckpoints` 的拆分由 R-38 第 2 片（51e2f24d9）完成，验收以该片为准，本片不再声明。 |
