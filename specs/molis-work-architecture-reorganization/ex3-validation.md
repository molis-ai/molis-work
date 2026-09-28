# EX3 Governance 与 Collaboration 迁移验收记录

日期：2026-09-02  
Goal：`goal-reorg-ex3`  
完成等级：内部完整（架构迁移，无用户功能增删）

## 1. 本次真正迁走了什么

- `packages/contracts/src/modules/governance-collaboration.ts` 成为 Review、Proposal、Candidate、Rewire、Goal Tree Decision 和用户确认来源的公开类型/API SSOT。
- `modules/governance-collaboration` 接管 8 组正式表、历史 migrations 3/9/10/14/27/28、Review contract revision 升级、Repository、Review obligation lifecycle、Proposal/Decision 状态机和跨 owner 原子物化边界。
- `src/v1/store.ts` 不再维护 Governance schema、migration、mapping 或 snapshot SQL；启动迁移和 Board snapshot 只组合 Module 的公开入口。
- `src/v1/coordinator.ts` 不再持有 Governance 表 SQL 或具体 Repository；正式 Review、Proposal、Candidate、Rewire 和 Decision 写入全部经过 `GovernanceApplicationApi`。
- `src/v1/types.ts` 的重复 Governance 类型改为 public Contract 别名。Planning 仍只做分析和校验，不保存正式 Proposal 或 Decision。

## 2. 明确保留与未纳入

- Web、CLI、MCP 的路径、payload、权限、幂等和错误语义保持兼容；EX4 再把这些入口以及 Action Projection 脱离 Coordinator Facade。
- Coordinator compatibility layer 仍负责 action token、actor 权限、幂等 Receipt 和跨 owner 用例编排。Governance 接收已经授权的上下文，不复制 Identity/Team/Access 规则。
- 被接受的 Goal、Relation、Risk 和 Policy 仍由 Goals owner 的公开 Command 写入；Governance 不直接访问其 Store。
- Draft Dialogue 的会话事实与执行验收组合 read model 没有被吸收到 Governance，继续由 EX4 迁移。
- 本次不增加新用户功能、Team Server 同步、Plugin 数据交换或新的治理策略。

## 3. Huge Class 对账

| 文件 | EX2 后 | EX3 后 | 已退出职责 |
| --- | ---: | ---: | --- |
| `src/v1/coordinator.ts` | 11,778 | 11,515 | Review 写入、Proposal/Candidate/Rewire/Decision 正式 SQL、确认来源持久化和状态机 |
| `src/v1/store.ts` | 1,872 | 1,316 | Governance schema、migrations、mapping 和 snapshot SQL |
| `src/v1/types.ts` | 862 | 589 | Governance 重复 public types |

新的 Governance 实现按 `schema.ts`、`migrations.ts`、`repository.ts`、`mappers.ts`、`review-lifecycle.ts`、`record-store.ts`、`state-machine.ts` 与公共 `index.ts` 拆分。最大单文件 260 行，没有把旧 Coordinator 或 Store 整段换名搬入新包。

## 4. 原子性与归属

- Proposal/Decision 先在 Governance 中保持 pending；只有经过调用方授权的 Decision 才能进入正式状态迁移。
- `decisions.materializeAtomically` 在同一个 SQLite transaction 中记录 Decision 并调用目标 owner Command。目标写入、Decision 或 Proposal item 任一步失败，整次操作回滚。
- 确认记录保存 `actor_id`、`authority_source`、`runtime_actor_id`、`conversation_ref` 和 `message_ref`；接收方不需要从日志猜测用户确认来源。
- Review obligation 的满足基于最新执行后不同 actor 的 passing Review；`needs_changes` 会重开已满足 obligation。

## 5. 验证证据

| 检查 | 结果 |
| --- | --- |
| Contracts / Governance Module / root TypeScript | 通过 |
| Workspace inventory | 48 packages、30 Contract subpaths、0 errors |
| Package boundary | 168 source files、298 imports、56 dependency edges、15 compatibility allowlist entries、11 legacy huge files、0 errors |
| Governance public Module 定向测试 | 2 / 2 通过 |
| Governance + V1 定向回归 | 118 / 118 通过 |
| 全量 `CI=true pnpm test` | 510 / 510 通过；包含 build、安装升级、Web/PTY、CLI、MCP、并发与历史迁移回归 |
| `git diff --check` | 通过 |

Web/PTY 回归需要绑定本机 `127.0.0.1`，因此全量测试在允许本地端口的执行环境中运行。

## 6. 验收条件对照

- `ex3-boundary`：通过。Governance 只有 public package entrypoint 和 Contract-typed `GovernanceApplicationApi`；边界扫描拒绝 deep import、跨 owner Store、旧 Governance SQL 回流和超过 400 行的新 owner 文件。
- `ex3-legacy-exit`：通过。Review、Proposal、Candidate、Rewire、Decision 的正式类型、schema、migration、Repository 和状态机已退出 Coordinator/Store；Planning 只保留分析。
- `ex3-result`：通过。定向测试固定 Review、Proposal/Decision provenance、冲突/非法迁移和跨 owner 原子回滚；510 项全量回归确认 Web/CLI/MCP、历史 migration、权限、幂等和用户可见行为无损。

## 7. 后续边界

- EX4 组合 Execution + Evidence + Governance Query，切换 Web、CLI、MCP 与 Action Projection，并删除剩余 Coordinator compatibility facade。
- AR1/AR2 分别迁 Artifact 与 Context Ledger；Governance 不吸收它们的正式事实。
- 最终 Cutover 仍需在 caller 清零后验证安装、升级与发布物，本次不提前宣称整个旧根 package 已 retired。
