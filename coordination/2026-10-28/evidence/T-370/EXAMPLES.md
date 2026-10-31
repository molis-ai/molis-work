# 70 PR 样本中的新增插件与动作实例（作者核读，修订2）

这些是两个不同日期窗口的具体实例，不以文件数推断新增功能或并行冲突率。候选由逐 PR 第一父 diff 的 A/M 事件触发，再对父树与结果树源码核读；不将旧能力的普通调用改动算作新增动作。

## B · 70 PR 窗口

- **新增插件：PR #98，`2e8f60dee6d82245f80b16b80ff05275d8275786`，第一父 `5c6a81741067693914c9ce79d99183fcb5312b6c`。** `plugins/native/todo/package.json`、`src/manifest.ts`、`src/actions.ts` 等为 A；结果树 manifest 声明 `todoManifest`、`actions: [...TODO_ACTIONS]`，父树无该插件包。Host 新增 `apps/local-host/src/todo-actions.ts`，其 provider 从 manifest 取动作声明；工作台 `apps/workbench/src/builtin-plugins.ts` 新接入 todoManifest/客户端/样式。公共合同新增 `packages/contracts/src/modules/todo.ts`。同 PR 也改大量非插件文件；不能把 296 个文件事件全部归因于待办插件。
- **新增动作族：PR #130，`2510098ff0e0b8b01bf2a934aae5b30b7fc3a54c`，第一父 `09aaf91e55b93123e2d8437b0d021e90bdae2376`。** `packages/contracts/src/services/memory.ts` 为 A，含 `memory.recall@1`、`memory.write@1` 等定义；`apps/local-host/src/memory/memory-host.ts` 为 A，在 `registerMemoryHost` 中给 `memoryActions` 逐项处理器并通过 `actionRegistry().registerProvider` 登记。`apps/local-host/src/agent-host-composition.ts` 等 M 为消费/装配位置。该 PR 不是新增插件包；工作台文件未改。列表只展示实例，不把所有 memory 动作当独立 PR。

## M · 70 PR 窗口

- **新增插件包：未找到。** 此窗口的逐 PR 文件事件无新建 `plugins/*/package.json` 连同 manifest/registration 的组合；不从改动现有插件推断“新增插件”。
- **新动作版本：PR #1644，`94c49fa1bdb0afcee6f6ed15bd73d2bbbe1bd51f`，第一父 `0ed9970bc5527090f613ffaf013a9aeaa0d68212`。** `plugins/native/feed/src/item-actions.ts` 把 `feed.items.promote` 从 v1 改为 v2，并在 offers 中引用 v2；`item-route-handlers.ts`、`goal-promotion.ts` 同片修改处理路径。Host `apps/local-host/src/web-panel-routes.ts`、工作台 `apps/workbench/src/terminal/client.ts` 等为 M；公共合同包未改。这是现有能力的合同版本更换，不是新增 capability ID 或插件包。

所有路径与状态均可由 `revision-2/run-1/{B,M}-pr-files.json` 及对应 `git diff-tree` 回查。未核实外部部署、用户体验或这些 PR 的完整产品验收。
