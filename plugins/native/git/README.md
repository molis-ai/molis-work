# @molis-ai/molis-work-plugin-git

Shows what is in the working tree and publishes each change as a comparable
change set.

This Plugin never runs `git`. The Host runs it; the parse of porcelain v1 is the
plugin SDK's `parsePorcelainStatus`, the same one the Host's workspace Git service
reads with, so renames, every conflict letter pair, and awkward paths are testable
without a repository — which is exactly where a hand-rolled split goes wrong.

Taking a Coding Run's changes into the workspace does not go through Git: a Run
in the main workspace writes each file only after a person reviews that write,
and a parallel writer's result comes back through Coding's integration review
(`review:git-integration`).

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

Directory candidates and browsing preferences come from the [current-project settings protocol](../../../docs/platform/PROJECT-SETTINGS.md). Files/Git consume `projectSettingsCapabilities.browsingWorkspace`; Coding consumes `workspaces` and keeps its execution directory per session. Manage directories in Project Settings → Workspaces.

## 开发要求

- 负责：工作树变更与提交草稿。
- 不负责：运行 git、批准操作、渲染比较。
- 公开入口：`@molis-ai/molis-work-plugin-git`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`（伙伴舞台的外壳 `renderCompanionBrowserStage`）、`@molis-ai/molis-work-plugin-sdk`（`bindOwnerPluginAction`、`bindPluginActionRoute`、`parsePorcelainStatus`）。方向：只依赖合同、SDK 与声明过的 Module/Service/UI 包；不导入另一个插件的实现（[包边界规则](../../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 插件从不运行 `git`；写操作经 Host 与审查。
  - 页面重新读取由插件自己调 `services.ui.invalidate()`，只在事件回调和宿主的操作回执监听里调；监听在 `stop` 一开始就清掉（BL-411）。
- 前端目录子树通过 Host 注入的 `mountPluginClient` 管理请求与监听；隐藏取消查询，重新进入读当前状态；已派出的写入不随切页重试。嵌入与独立页面共用此契约。
- 页面的客户端是 `src/browser/` 下的 TypeScript：`tsconfig.browser.json` 做类型检查，构建时 esbuild 从 `src/browser/factory.ts` 打成 `dist/git-client.js`（banner/footer 包成 `(host, sentences, git) => { … return git }`，`--minify`）；`src/client.ts` 读这个包，把宿主句模板表 `GIT_SENTENCE_TABLE` 作为 `sentences` 交给它，所以包里没有词典。页面状态在一个 `GitPage` 对象里（`page.ts`），改动列表、结果历史、diff、源码控制块（分支、提交、推送、PR）和冲突编辑各是一个部件；请求只在 `request.ts` 经工作台的 `molisWorkRequest` 发：Git 自己的页面走 `host.pluginRoute`，Coding 的面板里（Coding 交来 `openResult`、`closeResult`）同样的事改问 Git 的页面动作，读 Diff 画好的比较也是页面动作；`mount.ts` 管 Git 在自己页面还是在 Coding 的面板里，评审列表用宿主的 `host.reviews`。宿主与动作写的句子只经 `page.S` 一处说成页面的语言（`src/say.ts`）。`tests/git-client-bundle.test.ts`（RAC-167、RAC-168）钉住。Git 的包是它自己的 `/assets/molis-work-plugins/git.js`，Coding 的页面在挂载前把它装在自己旁边（登记的 `clientUses`）。
- 改动后必跑：`node scripts/run-tests.mjs tests/git-plugin.test.ts tests/git-porcelain.test.ts tests/git-operations.test.ts tests/git-operation-review.test.ts tests/git-worktrees.test.ts tests/git-writer-integration.test.ts tests/git-product-http.test.ts tests/git-client-bundle.test.ts tests/diff-git-english-sentences.test.ts tests/companion-client-lifecycle.e2e.test.ts`
- 相关手册：[skills/molis-plugin-dev/elements.md](../../../skills/molis-plugin-dev/elements.md)、[docs/horizontal/agent-host.md](../../../docs/horizontal/agent-host.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

Git 在 Manifest 订阅宿主事件 `host.review.settled@1`：Git 发起、人批准的操作（`review:git-index`、`review:git-operation`）执行完、结果定下后，宿主只发给 Git 这个安装（S-54）；Git 在 `onEvent` 里发布 v1 `operation-updated` 并刷新自身视图，Files 消费同一通知。Coding 发起的工作树与整合审查只发给 Coding，不经 Git；Git 另外订阅广播的 `host.workspace.changed@1`，本项目里任何插件发起、人批准的工作区操作执行完（不论结果）都重读页面，但不为它发 `operation-updated`（BL-379）。失败/未知不冒充成功，读取历史和恢复出来的审查不产生事件；宿主事件不落库、不重投，停着的安装就收不到。客户端可见时跟随 Host revision 重新读取状态，固定差异保持原版本。
