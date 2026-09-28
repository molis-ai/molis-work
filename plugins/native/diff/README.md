# @molis-ai/molis-work-plugin-diff

One comparison surface for three interchangeable kinds of input: two snapshots
captured in Files, a change set a Coding Run prepared, and a change already in
the Git working tree.

The change-set Artifact type is owned here, by the consumer, rather than by any
producer. Producers conform to what a comparison needs, which is what keeps one
surface able to render all of them instead of growing a branch per upstream.

Legacy Run change sets carry hunks, so their comparisons remain marked
`partial`. Coding's fixed text-review records preserve both original sides and
use the same bounded text comparison as file snapshots. Repeated edits to one
path are addressed by their original change index. These are saved proposals
with execution receipts, not a claim about the current working tree; command
and external effects are outside this text-review coverage.

The production default binding delivers Coding's selected `changeset` output
to Diff without changing the user's selected input group. An exact Artifact
reference can also be opened independently of the live input group. Coding's
embedded reader adds feedback anchors only after saving a fixed version; no
feedback action authorizes or applies an edit.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：对快照、准备好的变更与 Git 变更的统一比较界面。
- 不负责：产生变更集、读文件、应用变更。
- 公开入口：`@molis-ai/molis-work-plugin-diff`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 三类输入按 `input_groups` 互换，只有选中的一组生效。
  - 比较的是固定版本（带执行回执），不是对当前工作树的断言；反馈锚点只在保存固定版本后添加。
- 改动后必跑：`node scripts/run-tests.mjs tests/diff-plugin.test.ts tests/workspace-plugin-graph.test.ts tests/companion-actions.test.ts`
- 相关手册：[skills/molis-plugin-dev/elements.md](../../../skills/molis-plugin-dev/elements.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
