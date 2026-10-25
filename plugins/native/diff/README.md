# @molis-ai/molis-work-plugin-diff

One comparison surface for three interchangeable kinds of input: two snapshots
captured in Files, a change set a Coding Run prepared, and a change already in
the Git working tree.

The change-set process-item type (`diff.changeset.v1`) is defined around this
consumer rather than by any producer. Producers conform to what a comparison needs, which is what keeps one
surface able to render all of them instead of growing a branch per upstream.

Coding change sets that carry only hunks, without both original sides, remain
marked `partial`. Coding's fixed text-review records preserve both original sides and
use the same bounded text comparison as file snapshots. Repeated edits to one
path are addressed by their original change index. These are saved proposals
with execution receipts, not a claim about the current working tree; command
and external effects are outside this text-review coverage.

The production default binding delivers Coding's selected `changeset` output
to Diff without changing the user's selected input group. An exact change-set
reference can also be opened independently of the live input group. Coding's
embedded reader adds feedback anchors only after saving a fixed version; no
feedback action authorizes or applies an edit.

Diff's workbench file buttons carry the original change index, including
separate occurrences of the same path. The existing state action reads that
index from the fixed Coding input; refresh and hiding/reopening the surface
retain the selection, and late responses cannot replace a newer choice. The
file list remains available when the chosen file has no text rows. Coding's
embedded reader keeps its own selector rather than rendering duplicate buttons.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：对快照、准备好的变更与 Git 变更的统一比较界面。
- 不负责：产生变更集、读文件、应用变更。
- 公开入口：`@molis-ai/molis-work-plugin-diff`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/diff-client.js`（`(host) => { … }`，`--minify`），`src/client.ts` 读这个包，登记成 Diff 自己的 `clientFactory`。页面读 Diff 自己的 `/state`（`host.pluginRoute`），换文件重读，页面文字是 `src/messages.ts` 的稳定键；样式 `DIFF_STYLES` 也登记在 Diff 自己的 `stylesheet`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-plugin-sdk`（逐行比较 `compareTexts` 等从 SDK 取，Diff 不再转出它们；比较视图的模型与画法 `compareChange`、`compareHunks`、`renderDiff`，unified diff 的读写 `parseUnifiedDiff`、`unifiedPatch` 都从 SDK 的 `/diff-view` 取，2026-10-23 从 Diff 搬过去，Diff 不再导出它们）、`@molis-ai/molis-work-design-system`（页面上的转义与图标）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 三类输入按 `input_groups` 互换，只有选中的一组生效。
  - 三类输入都可读取过程项或成果库里明确选定的固定版本；读取仍遵守 Manifest 消费类型与当前授权，固定输入失效时不改读最新版本。回归见 [plugin-fixed-input-sdk.test.ts](../../../tests/plugin-fixed-input-sdk.test.ts)。
  - 比较的是固定版本（带执行回执），不是对当前工作树的断言；反馈锚点只在保存固定版本后添加。
  - `diff.state` 被页面调用时，自己按页面的语言用 `DIFF_MESSAGES` 画好 `html` 一起返回；模型、工作流、MCP 只得 `{ view }`。宿主不替 Diff 画（PG-062，[companion-state-html.test.ts](../../../tests/companion-state-html.test.ts)）。
  - 三类输入各自变成通用的改动（两份全文或一段 unified diff）交给 SDK 比较，Diff 只管输入组、固定版本与文案；比较视图的每个标签用 `DIFF_MESSAGES` 里的哪个键列在 `DIFF_LABELS`（`src/ui.ts`），带值的句子（含 `parseUnifiedDiff` 拒绝时的三句）列在 `DIFF_TEMPLATES`（PG062-08..10，[plugin-sdk-subpaths.test.ts](../../../tests/plugin-sdk-subpaths.test.ts)）。
- 改动后必跑：`node scripts/run-tests.mjs tests/diff-plugin.test.ts tests/workspace-plugin-graph.test.ts tests/companion-actions.test.ts tests/companion-state-html.test.ts tests/git-product-http.test.ts tests/coding-changeset-http.test.ts tests/coding-companion-inputs.test.ts tests/diff-patch.test.ts tests/diff-git-english-sentences.test.ts tests/plugin-sdk-subpaths.test.ts tests/companion-client-lifecycle.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/elements.md](../../../skills/molis-plugin-dev/elements.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
