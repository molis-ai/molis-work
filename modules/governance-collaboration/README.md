# 结构提案与可信决定

保存当前结构提案、决定和确认来源，回答“谁依据什么确认了哪个具体变化”；同时保留旧澄清、提案和 Review 的原始历史。

包名：`@molis-ai/molis-work-module-governance-collaboration`。工作区内部包，通过仓库构建和 Host 装配使用。

## 一次典型调用

Native Goals 通过 `records` 保存有限 Goal/Relation 结构提案，使用 `decisions` 在同一事务内记录决定并调用实际数据 owner。`eventDecisions` 保存受保护入口产生的可信用户决定，供当前约定与要求验收引用。`query` 和只读 `clarification` 提供历史记录。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/index.ts](src/index.ts) | 模块服务与公开查询 |
| [src/record-store.ts](src/record-store.ts) | 当前结构提案的记录入口 |
| [src/decision-transactions.ts](src/decision-transactions.ts) | 决定、幂等和事务边界 |
| [src/event-decisions.ts](src/event-decisions.ts) | 可信用户决定与具体授权范围 |
| [src/state-machine.ts](src/state-machine.ts) | 提案/决定状态转换 |
| [src/clarification-store.ts](src/clarification-store.ts) | 历史澄清会话及轮次读取 |

可对照现有调用方 [apps/local-host/src/goal-project-application.ts](../../apps/local-host/src/goal-project-application.ts) 阅读装配方式。

## 接入与边界

Governance 不替代 Goals/Artifacts/Projects 的写入接口，也不自行宣布 Goal 完成。Runtime 不能用自填身份或文字确认伪造用户授权。旧 Contract/Candidate/Rewire、Review 和澄清写协议已退役，原记录与来源仍能通过历史查询读取。

由 Local Host 装配数据库与协作端口；跨 Module 协作使用公开 Contract，不从另一 Module 深层导入实现。完整依赖见 [package.json](package.json)。

## 本地开发

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-module-governance-collaboration typecheck
pnpm --filter @molis-ai/molis-work-module-governance-collaboration build
```

当前树提案与事件决定可参考 [goal-tree-event-flow.test.ts](../../tests/goal-tree-event-flow.test.ts)、[goal-events-state.test.ts](../../tests/goal-events-state.test.ts)。完成仓库构建后运行：

```bash
node --import tsx --test --test-concurrency=1 tests/goal-tree-event-flow.test.ts tests/goal-events-state.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：结构提案、决定与确认来源，以及旧澄清、提案、Review 的历史。
- 不负责：直接修改 Goal、Artifact、Project 事实。
- 公开入口：`@molis-ai/molis-work-module-governance-collaboration`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/modules/governance-collaboration`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖 contracts/modules、contracts/services 与 kernel；不导入另一个 Module 的实现或 Store（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 记录谁在什么来源下批准了哪一项变化，不替 Goals 计算完成。
  - Runtime 不能用自填的 `actor_kind=user`、`user_confirmed` 或对话摘要作为授权；不同范围的授权不能互相复用。
  - 跨 owner 写入走实际的决定事务，UI 与 MCP 不另写批准或完成规则。
  - 历史 self-verifier 不能展示为用户验收，旧决定不能变成当前任意变更的授权。
- 改动后必跑：`node scripts/run-tests.mjs tests/governance-collaboration-module.test.ts tests/governance-provenance.test.ts tests/draft-dialogue-application.test.ts`
- 相关手册：[docs/modules/governance-collaboration.md](../../docs/modules/governance-collaboration.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/modules/governance-collaboration.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/modules/governance-collaboration`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ex3`, `goal-reorg-ex4`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
