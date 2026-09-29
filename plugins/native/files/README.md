# @molis-ai/molis-work-plugin-files

Browses the bound workspace, reads one file at a time, and publishes what it
captured: a collection description, `before`/`after` text snapshots, and the
text the user selected.

Files never reads a directory itself. The Host lists and reads; this Plugin
turns those results into a tree, a preview and the Artifacts other Plugins bind
to. Every interesting case — a directory that failed to list, one that was
truncated, a file that is binary, too large, missing or unreadable — is its own
state with its own sentence, so the user can tell which problem they have.

The declared event subscriptions describe the intended Coding/Git refresh
connection; automatic refresh is not yet wired end to end. The current product
uses explicit refresh and rejects snapshot capture when the displayed file's
fingerprint no longer matches the Host read.

The formal routes expose bound-workspace state, directory reads, file opening
and capture into the existing `before`, `after` and `selection` outputs. The
Host rechecks project membership on every read, rejects symlinks and traversal,
and bounds a directory to 1000 entries and a UTF-8 file to 256 KiB. Reading
position survives restart. Switching workspaces invalidates current outputs
while keeping historical Artifacts. The Workbench mounts the Files directory
and reader through public exports; default bindings feed snapshot Diff and
Text Stats. Generic command availability, standalone plugin entry, Coding
material consumption and automatic refresh remain incomplete.

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

Directory candidates and browsing preferences come from the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md). Files/Git consume `projectSettingsCapabilities.browsingWorkspace`; Coding consumes `workspaces` and keeps its execution directory per session. Manage directories in Project Settings → Workspaces.

## 开发要求

- 负责：工作目录树与阅读器，发布有界的文本快照与选区。
- 不负责：读目录本身（由 Host 提供）、文件系统授权、比较渲染。
- 公开入口：`@molis-ai/molis-work-plugin-files`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 插件自己不读目录，只经 Host 能力。
  - 快照有界并带版本，下游按 Artifact 类型消费，不指定生产者。
  - 自动刷新还没有端到端接通，不要假设内容已刷新。
- 前端目录子树通过 Host 注入的 `mountPluginClient` 管理请求与监听；隐藏取消查询，重新进入读当前状态；已派出的写入不随切页重试。嵌入与独立页面共用此契约。
- 改动后必跑：`node scripts/run-tests.mjs tests/files-plugin.test.ts tests/files-product-http.test.ts tests/files-git-actions.test.ts tests/companion-client-lifecycle.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/elements.md](../../../skills/molis-plugin-dev/elements.md)、[docs/platform/PROJECT-SETTINGS.md](../../../docs/platform/PROJECT-SETTINGS.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。
