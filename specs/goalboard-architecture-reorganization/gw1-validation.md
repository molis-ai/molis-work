# GW1 Goal Command 事实与 Repository 迁移验收

Goal：`goal-reorg-gw1`  
Contract revision：1  
核对日期：2026-09-02

这份记录证明 Goal、Goal Relation、Policy、Risk 和 Project Guidance 的正式写入规则已经迁入 Goals Module，并通过公开 Contract 与 package 入口提供。迁移保持现有前后端行为，不新增用户功能，也不宣称 Goal 生命周期、Planning Engine 或 Web / CLI / MCP caller 已经完成最终切换；这些分别由 GW2、GW3、GW4 继续处理。

## gw1-boundary

### 公开边界与唯一 owner

| 职责 | 当前 owner / 公开入口 | 旧层只保留什么 |
| --- | --- | --- |
| Goal、Relation、Policy、Risk、Guidance 公共类型与 Command Contract | `packages/contracts/src/modules/goals.ts` | `src/v1/types.ts` 只做兼容类型别名，不再复制定义 |
| Goal / Relation / Policy 写入规则 | `modules/goals/src/goal-commands.ts` | 无第二套写入实现 |
| Risk 写入、状态变化与规范化 | `modules/goals/src/risk-commands.ts` | Coordinator 只提供尚未迁移的 Action / Lifecycle 授权 hook |
| Project Guidance 写入与读取 | `modules/goals/src/guidance-commands.ts`、`modules/goals/src/guidance.ts` | 旧 `src/v1/project-guidance.ts` 已删除 |
| Goals 正式事实读写 | `modules/goals/src/repository.ts` | root Store 只暂时提供数据库连接与尚未迁移模块的能力 |
| Goals 公开组合入口 | `modules/goals/src/index.ts` | Coordinator 方法是兼容 Facade，只逐项委托公开 API |

当前调用链是：

```text
现有 Web / MCP / CLI caller
  → MolisWorkCoordinator 的兼容方法
  → @molis-ai/molis-work-module-goals 公共入口
  → Goals Command
  → GoalsRepository
```

模块之间没有 deep import，也没有跨 owner 导入其他模块的 Store 或复制写入规则。Goals Module 对尚未迁移的能力使用显式 hook：Relation 图校验来自 Planning，Risk Action 授权和状态协调来自 Lifecycle。它们是暂时的依赖边界，不让 Goals Module提前拥有 GW2/GW3 的职责。

`scripts/check-package-boundaries.mjs` 的 Goals Command 所有权检查会拒绝：

- Coordinator 兼容方法重新出现 SQL、Store 写入或第二套业务规则；
- caller 绕过 `@molis-ai/molis-work-module-goals` 公共入口做 deep import；
- Goals package 缺少公开 Contract、Command、Repository 或正确的 partial maturity 声明；
- package 之间出现跨 owner implementation / Store import。

验证结果：

- `pnpm boundary:check`：48 个目标 package、93 个 package source、113 个 import、54 条 workspace dependency edge、30 个 Contract subpath，0 error。
- `pnpm boundary:test`：9/9 通过。
- `CI=true pnpm test` 内含全部 migrated package 与根项目构建，构建通过。

## gw1-legacy-exit

迁移前基线与当前结果：

| Huge file | 迁移前 | 当前 | 本 Goal 移出的职责 |
| --- | ---: | ---: | --- |
| `src/v1/coordinator.ts` | 15,168 行 | 13,920 行 | Goal / Draft / Relation / Policy / Risk / Guidance 的 SQL、校验、幂等、事件和事务编排 |
| `src/v1/types.ts` | 1,238 行 | 963 行 | Goals 公共类型定义，现改为公开 Contract 的兼容别名，并退出千行 Huge Class 范围 |
| `src/v1/project-guidance.ts` | 独立旧实现 | 已删除 | Guidance 规范化、读取和写入规则全部归 Goals owner |

Coordinator 保留的对应公开方法都是单一委托，不再持有这些写入规则。Web、MCP、CLI、demo、migration 和旧测试仍可调用这些兼容方法，因此现有入口不受损；GW4 会把这些 caller 直接切到公开 Goals Command API，再删除兼容 Facade。

Coordinator 中仍存在的 Goal 生命周期、Goal Tree proposal/materialization、Planning 分析、Impact、Claim/Run/Evidence/Review 等 SQL 不属于 GW1。它们已有独立的 GW2、GW3、AR、EX 和最终 cutover Goal，不能在本阶段被 Goals Command 顺手吸收。

文档已经同步：`docs/system/MIGRATION.md`、`docs/system/HUGE-CLASS-MIGRATION.md`、`docs/modules/goals.md`、`docs/SSOT-MATRIX.md`、中英文开发文档，以及 Goals package README。

## gw1-result

### 保持不变的行为

- Goal 和 Draft Goal 的创建、更新、输入校验、版本递增、事件记录和幂等重放保持原语义。
- Goal Relation 的增加、停用、跨 Board 校验、重复关系与图冲突处理保持原语义。
- Project / Goal Policy 的继承、覆盖、校验、版本和事件保持原语义。
- Risk 的创建、更新、状态变化、关联 Goal、Action 授权、事务回滚和 lifecycle reconciliation 保持原语义。
- Project Guidance 的新增、修改、停用、恢复、排序、历史版本、冲突和幂等行为保持原语义。
- 对外错误继续使用既有 `MolisWorkV1Error` code、message 和 details；公开模块通过注入的 error factory 保持兼容。
- 事务仍使用同一个 SQLite 连接和原有 immediate transaction，写入、事件和幂等结果不会被拆成不一致的多段提交。
- 现有 Web、MCP、CLI、Desktop、安装与迁移入口路径没有变化；本期只是把内部 owner 搬正。

### 验证证据

- `tests/goals-command-module.test.ts`：1/1 通过，直接从 Goals package 公共入口覆盖 Goal、Draft、Relation、Policy、Risk、Guidance、错误、幂等和状态副作用。
- `tests/v1.test.ts`：116/116 通过，证明原有 Coordinator 兼容 API 的核心语义未丢失。
- `CI=true pnpm test`：完整 build + 全仓 489/489 测试通过，0 fail、0 skip；覆盖 Web、MCP、CLI、Desktop、安装升级、migration 和跨模块回归。
- `git diff --check`：通过，没有空白或 patch 格式问题。

### 结论

GW1 的三个验收条件均满足：Goals 写入已有唯一公开 owner 与 Repository；旧 Coordinator / types / Guidance 实现中的对应职责已经迁出；所有既有结果、错误、事务和调用入口均有无损回归证据。Goals package 仍标记为 `partial`，因为 Lifecycle、Planning 和 caller cutover 明确留给 GW2–GW4，不在本阶段虚报完成。
