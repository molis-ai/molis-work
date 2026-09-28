# EX4 执行验收入口切换验收记录

日期：2026-09-02  
Goal：`goal-reorg-ex4`  
完成等级：内部完整（无损架构迁移，无用户功能增删）

## 1. 这次真正完成了什么

- Web、CLI、MCP 三个入口现在都通过各自的薄 Adapter 调用同一套公开执行验收 API，不再各自直接调用 Coordinator 的 Claim、Run、Evidence、Review 实现。
- `src/v1/execution-validation-application.ts` 只负责组合公开 owner API；Claim、Run、Evidence/Review 命令分别进入独立文件，原先堆在 Coordinator 里的执行验收方法已经退出。
- Goals Native Plugin 接管 Action Projection：它根据 Goal、Claim、Run、Evidence、Review 和 Decision 的事实，统一判断下一步是执行、补证据、评审还是等待用户。
- Workbench 接管 Claim、Run、Evidence、Review 的 UI Contribution；`src/web/render.ts` 只负责挂载，不再保存这些界面的业务判断和表单规则。
- 新增一条真实跨入口链路测试：CLI 开始工作，MCP 完成 Run，Workbench 提交 Evidence 和 Review，最终得到同一个 satisfied 状态。

## 2. 无损边界

- 保留原有 Web、CLI、MCP 的路径、payload、权限、幂等、错误码、恢复行为和持久化事实，没有迁移用户数据，也没有新增业务字段。
- 权限拒绝和恢复路径纳入跨入口测试：错误 actor 不能报告别人的 Run，过期 action token 会被拒绝，同一 Run 能在其他入口继续完成。
- Goal、Execution、Evidence、Governance 仍各自维护自己的正式事实；本次只组合公开 API，没有把 Store 合并，也没有复制业务规则。
- Draft Dialogue 与 Goal Tree Proposal/Decision 的“澄清和建树入口”不属于 EX4 接受的 Claim → Run → Evidence → Review/Decision 验收链。本次没有假装迁走；它继续作为后续 caller cutover 范围。

## 3. 旧职责退出记录

- 已删除旧根路径：
  - `src/v1/action-projection.ts`
  - `src/v1/contract-revisions.ts`
  - `src/v1/human-review.ts`
  - `src/v1/parent-completion.ts`
- `src/v1/coordinator.ts` 从 EX3 后的 11,515 行降至 9,752 行；不再暴露 Claim、Run、Evidence、Review、Work State 与 Action Projection 的 public facade 方法。
- `src/web/render.ts` 不再包含 Claim、Run、Evidence、Review 的渲染函数，现由 `apps/workbench/src/execution-validation-ui.ts` 提供。
- `src/mcp/server.ts`、`src/v1/cli.ts` 和 Web caller 只把 execution-validation API 交给各入口 Adapter，不直接访问其 query/command 内部结构。

当前新增实现均未形成新的超大文件：

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `src/v1/execution-validation-application.ts` | 78 | 组合公开 owner ports |
| `src/v1/execution-validation-claim-commands.ts` | 874 | Claim 与选择工作 |
| `src/v1/execution-validation-run-commands.ts` | 406 | Run 生命周期 |
| `src/v1/execution-validation-verification-commands.ts` | 695 | Evidence、Review 与 rework |
| `plugins/native/goals/src/action-projection.ts` | 901 | 下一步动作投影规则 |
| `apps/workbench/src/execution-validation-ui.ts` | 200 | Workbench 执行验收 UI |

## 4. 验证证据

| 检查 | 结果 |
| --- | --- |
| 跨入口执行验收定向测试 | 1 / 1 通过 |
| Workspace / package boundary | 48 packages、176 source files、338 imports、61 dependency edges、30 Contract subpaths、14 compatibility allowlist entries、10 legacy huge files、0 errors |
| Workspace build / typecheck | 48 个 workspace package 与 root TypeScript 全部通过 |
| 全量 `CI=true pnpm test` | 511 / 511 通过，0 失败；包含 build、安装升级、Web/PTY、CLI、MCP、并发、权限、恢复和历史迁移回归 |
| `git diff --check` | 通过 |

Web/PTY 回归需要绑定本机 `127.0.0.1`，因此全量测试在允许本地端口的执行环境中运行。

## 5. 验收条件对照

- `ex4-boundary`：通过。WorkBench、CLI、MCP 只有公开 Adapter；Action Projection 由 Goals Native Plugin 提供；边界门禁拒绝 deep import、跨 owner Store、旧调用方式和新 Huge Class。
- `ex4-legacy-exit`：通过。Coordinator 的执行验收 public facade 与旧 Action Projection 辅助文件已删除；Web render 的执行验收 UI 规则已退出；caller inventory 门禁确认没有旧调用回流。
- `ex4-result`：通过。跨入口测试走完 Claim → Run → Evidence → Review，并同时验证权限拒绝、过期 token、统一状态和 UI；511 项全量回归确认迁移前后功能无损。

## 6. 后续边界

- EX4 完成的是执行与验收链的入口切换，不代表整个根 package 已经退役；剩余 Huge Class 由后续 Goal 按 owner 继续拆除。
- Draft Dialogue、Goal Tree Proposal/Decision 的入口切换需要由后续 Goal 明确承接，不能被含糊算入 EX4。
- 最终 Cutover 仍需在所有 caller 清零后验证安装、升级、发布物与旧路径退出。
