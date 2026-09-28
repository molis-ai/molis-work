# @molis-ai/molis-work-plugin-git

Shows what is in the working tree, publishes each change as a comparable change
set, and holds the decision to take a Coding Run's changes into the workspace.

This Plugin never runs `git`. The Host runs it; the parse of porcelain v1 lives
here so that renames, every conflict letter pair, and awkward paths are testable
without a repository — which is exactly where a hand-rolled split goes wrong.

Accepting a Run's changes is a **decision a person makes**, never a consequence
of the Run finishing. This Plugin decides only whether the decision is still
offerable: it refuses when a file moved since the change was prepared, when a
conflict is open, and when the changes already landed.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

Directory candidates and browsing preferences come from the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md). Files/Git consume `projectSettingsCapabilities.browsingWorkspace`; Coding consumes `workspaces` and keeps its execution directory per session. Manage directories in Project Settings → Workspaces.

## 开发要求

- 负责：工作树变更、提交草稿与已接受的变更集。
- 不负责：运行 git、批准操作、渲染比较。
- 公开入口：`@molis-ai/molis-work-plugin-git`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 插件从不运行 `git`；写操作经 Host 与审查。
  - 接受一轮变更是人的决定，不是自动后果；插件只判断该决定是否仍然适用。
- 改动后必跑：`node scripts/run-tests.mjs tests/git-plugin.test.ts tests/git-operations.test.ts tests/git-operation-review.test.ts tests/git-worktrees.test.ts tests/git-writer-integration.test.ts`
- 相关手册：[skills/molis-plugin-dev/elements.md](../../../skills/molis-plugin-dev/elements.md)、[docs/horizontal/agent-host.md](../../../docs/horizontal/agent-host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
