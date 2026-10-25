# W5-10 agent-host 份与 BL-541

状态：工程验证中，待评审与合入（2026-10-25）。负责人：ac-kernel。本片只做统筹派的三项，#1064（记忆线）改到的文件一律不动代码。

## 范围

1. **W5-10 agent-host 份**，按 2026-10-25 的新口径（巨大单元不硬拆，混了几件事的才拆，本身合理的标明）：
   - `horizontal/agent-host/src/adapters/prologue-checkpoints.ts` 的 `createPrologueCheckpoints`（221 行）判拆：它混着回退预览与审查请求、结果收口、重启后恢复、给下一轮的操作记录、检查点列表、准备回退几件事。纯搬移成模块级函数，共用状态收进 `CheckpointState`，行为不变；最大的 `prepareRewind` 67 行。
   - `adapters/prologue-taskboard.ts` 的 `createPrologueTaskBoards`（实测 129 行）和 `apps/local-host/src/agent-host-composition.ts` 的 `composeAgentHost`（实测 87 行）在 main 上已经低于阈值，不改代码，只改清单的行。
   - `prologue.ts`、`index.ts`、`prologue-stream.ts`、`prologue-action-gateway.ts`、`capability-registration.ts` 都在 #1064 里，只在 `docs/system/HUGE-CLASS-MIGRATION.md` 的 agent-host 表里重判，标「代码等 #1064」。其中 `applyPrologueEvent` 改判为例外（`cohesive-unit`）：它是一种运行事件对应一个分支的单一分发。`giant-exceptions.json` 的条目要写门禁实测的 `size`，而 #1064 正在改这个文件，所以条目等 #1064 合入后再写。
2. **BL-541**：计划步骤的持有者与报告作者改成结构化字段。`AgentStepOwner` 加 `title`（子任务的标题，即协调者派出时给的键）；报告的 `by` 从中文字符串改成 `AgentStepReportAuthor`（`kind`：`session`、`subtask`、`person`、`handover`、`other`；`label` 是宿主给本轮模型看的原话；子任务带 `title`）。Coding 的任务板、计划进度与报告步骤只读 `kind` 和 `title`，不再用正则抠「子任务「…」」，也不再比 `本会话`、`用户`、`改派` 这些字面量。合同变了，按 `docs/system/CONTRACT-CHANGES.md` 不留兼容期，`pnpm api:update` 刷新快照。宿主给模型看的那一行（`stepLine`）照旧用 `label`。
3. **BL-470**（`AgentRunView` / `AgentSessionView` 嵌套 schema 收紧）跳过：schema 在 `packages/contracts/src/services/agent-host.ts`，类型在 `agent-host-run-view.ts`，两份都在 #1064 里。为了不碰这两份，BL-541 的新类型也不经 `agent-host.ts` 转出，调用方从 `AgentStepBoard` 取出这个类型。

## 验收

| 编号 | 标准 |
| --- | --- |
| RAC-658 | 计划步骤的报告带结构化作者：改派是 `handover`，子任务是 `subtask` 并带自己的标题，本会话是 `session`，人是 `person`；`label` 仍是宿主的原话。`tests/coding-step-claims.test.ts`、`tests/coding-coordinator-board.test.ts` 断言整个对象。 |
| RAC-659 | `createPrologueCheckpoints` 的拆分是纯搬移：`tests/prologue-checkpoints.test.ts` 与相关的审查、接线用例不改断言照样通过，门禁不再把它列为巨大单元。 |
