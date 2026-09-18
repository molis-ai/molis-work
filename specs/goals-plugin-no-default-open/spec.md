# Goals 插件打开时不默认打开 Goal

完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

点左侧 Goals 插件会进入插件舞台。当前实现会把第一条（或拼出来的默认）Goal 当成已打开：工作区展开、正文预载。用户只要列表/画布/看板总览，点某一条再打开。

## 当前行为与问题证据

- 无明确 Goal URL 时，`buildGoalCollectionModel` 回退到 `visibleGoals[0]`。
- `buildGoalsDocumentCollection` 在 Board 没有 `active_goal_id` 时，用进行中/等待/可继续/第一条冒充 active。
- 客户端 `goalWorkspaceMode` 默认 `focus`；打开 Goals 母标签会按这个模式展开已选 Goal。
- `tests/immersive-directory.e2e.test.ts` 已在插件打开后主动收起展开态，说明这是已知干扰。

## 范围与非目标

做：

- 打开 Goals 插件只进入 Board（默认列表），不展开 Goal 工作区。
- 没有请求 ID、也没有真实 `active_goal_id` 时，不选中第一条。
- 点某一条 Goal、直达 `/goals/:id`、用户已经打开过再切回，行为保持。

不做：不改 Claim/Run、不改 `boards.active_goal_id` 的生命周期语义、不改画布节点的默认居中高亮。

## 方案

1. 当前集合只接受「请求的 Goal」或 Board 真实 active；归档/回收站仍可在无请求时选集合内第一条。
2. 文档集合不再把第一条写成 `active_goal_id`。
3. 未打开过 Goal 时，工作区模式默认 `graph`。

## 验收标准

1. 从首页打开 Goals 插件：列表可见，`data-expanded` 不是 true，工作区隐藏。
2. 没有真实 active 时，当前列表没有任何 `aria-pressed="true"` 行。
3. 点击一条 Goal 仍展开该 Goal；直达 `/goals/:id` 仍打开指定 Goal。
4. 用户已展开某条后再切走 Sessions 再点 Goals，仍恢复那条（不是第一条）。

## 验证

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/desktop-tui.test.ts
```

有 Chrome 时再跑 `tests/immersive-directory.e2e.test.ts` 中打开 Goals 插件的路径。
