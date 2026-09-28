# GW4 Goals 写入口切换验证

日期：2026-09-02  
Goal：`goal-reorg-gw4`  
完成等级：功能可用且迁移前后行为无损；本切片不是完整重组的最终 Cutover。

## gw4-boundary

- `packages/contracts/modules/goals` 公开 `GoalsApplicationApi`，稳定组合 `commands`、`lifecycle`、`planning` 三个端口。
- `MolisWorkCoordinator.goals` 只公开 Contract 类型；Web、MCP、CLI 分别通过 `apps/workbench`、`apps/mcp`、`apps/cli` 的薄 adapter 绑定。
- 三个 App adapter 不导入 Goals implementation、Store、SQLite 或 Coordinator implementation，也不复制业务判断。
- `pnpm boundary:check`：48 个 package、108 个 package source files、180 个 imports、54 条依赖边、30 个 Contract subpath、18 条 compatibility allowlist、14 个 legacy huge files，0 error。
- `pnpm boundary:test`：9/9 通过；覆盖 deep import、跨 Module implementation/Store、Plugin implementation 互相导入、App 直连数据库、回流 legacy root、越界 relative import、公开 Contract、import 提取和依赖环。
- `pnpm workspace:check`：48/48 package 清单通过，0 error。

## gw4-legacy-exit

- `MolisWorkCoordinator` 的 Goal write、Lifecycle、Planning 旧公开转发方法已经删除；内部 Goal mutation/analysis 也调用 `coordinator.goals` 公开端口。
- Web、MCP、CLI、demo、migration 和 Feed promotion 不再调用已删除 Facade；边界门禁会阻止旧调用重新出现。
- 零 caller 的 `src/planning/goal-graph.ts`、`method-catalog.ts`、`method-packs.ts` 与 `src/v1/goal-decomposition-validation.ts` re-export 已删除。
- `src/v1/coordinator.ts` 从重组基线 15,168 行降至 12,423 行；本切片没有把原实现整体搬进另一个 Huge Class。
- 文档对账发现原责任图把 Goals Native Plugin UI/文案错误归给 GW4。已提交待用户决定的 `GW5 Goals Native Plugin UI 与文案迁移` Candidate：`candidate-1dbbef41-f270-42d9-bb40-8c643c06687d`；当前 `plugins/native/goals` 继续如实标为 `contract-only`，没有把尚未迁移的 UI 伪装成完成。

## gw4-result

- 新增 `tests/goals-app-adapters.test.ts`，验证 Workbench、MCP、CLI 绑定同一公开端口，三入口创建结果、幂等重放和 `goal.title_required` 错误一致。
- 定向 Module/adapter/Planning 测试：19/19 通过。
- Web/MCP/CLI/V1 跨入口回归：208/208 通过。
- `CI=true pnpm build`：通过。
- `CI=true pnpm test`：494/494 通过，0 failed、0 skipped；覆盖前后端、MCP、CLI、安装、迁移、Plugin、Feed、Goals、Planning、Session、Desktop 与 Web 行为。
- `git diff --check`：通过。
- 本切片不改数据结构、不重写已有事实、不改变 payload、权限、错误码、幂等或结果语义。剩余 Execution/Evidence/Governance 编排、Query 兼容委托、Goals UI 和最终 Local Host/Cutover 均保留给已经登记的后续 Goal。
