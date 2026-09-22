# Goals 目录：当前树也做成百叶窗

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次「当前 Goal 集合」挂载的唯一需求书。归档/回收站段、新建横条和筛选仍走 `specs/archive/goals-directory-collection-folds/spec.md`。

## 背景目标

归档和回收站已经是目录里的 `<details>` 段（caret、名称、数量）。当前正式 Goal 还直接铺在列表上半段，和下面两段不是同一种物件。

目标：当前树也做成同一套百叶窗。完成等级 **3：功能可用**。

## 当前行为与问题证据

- `renderGoalList` 先输出裸的 `data-tree-root` 树，再跟归档、回收站两段。
- 归档/回收站默认收起；当前树没有段头，不能整段开合。

## 范围与非目标

做：

- 当前正式 Goal 包进 `data-goal-collection-fold="current"`，段头文案 **当前** / **Current**，右侧数量，caret 与归档/回收站相同。
- 默认展开。选中项在当前树里、或当前不在 `/archive` `/trash` 集合路由时，服务端带 `open`。
- 空当前树仍有段头；展开后一句「还没有 Goal」。
- 状态筛选空提示仍跟在当前树后面，留在当前段里。筛选继续只打 `[data-tree-root]`。
- 三段顶上都不画分割线；段与段之间也不额外留缝。外观改写见 `specs/archive/goals-directory-fold-divider/spec.md`。

不做：

- 不改归档/回收站默认收起、深链强制展开、路由和移入/恢复。
- 不改新建按钮、筛选面板、点行打开 GoalFrame。
- 不把归档/回收站混进当前树。

## 使用场景

1. 打开 Goals：新建横条下面先是展开的「当前 N」，树在段里；再下面是收着的归档、回收站。
2. 点「当前」段头可以合上（下一次带选中项的刷新仍会按现有 fold 合同拉开含选中行的段）。
3. 深链 `/archive`：归档段展开；当前段可以合上，段头仍在。
4. 筛选只影响当前段里的行；归档/回收站行仍在。

## 方案与关键决策

- 复用 `renderCollectionFold`，增加 `current`。当前树仍挂 `data-tree-root`，不用 `data-collection-tree`。
- 打开条件：选中项属于 `view.goals`，或当前不是 archive/trash 视图。
- 空文案用新句，不复用「当前没有进行中的 Goal」（那是进行中状态空，不是整棵树空）。

## 输入输出与依赖

- 输入：`view.goals`、选中 id、archive/trash 视图标志。
- 输出：三段百叶窗 HTML；当前段默认 `open`。
- 依赖：Goals tree UI、现有 `data-persist-open` / `syncGoalCollectionFolds`。

## 文件 / 模块边界

允许改：`plugins/native/goals/src/tree-ui.ts`、`tree-en.ts`；Workbench 目录样式；`DESIGN.md` 与 surface 一句；`specs/archive/goals-directory-collection-folds/spec.md` 的当前树描述；`tests/goals-tree-ui.test.ts`；必要时 `tests/immersive-directory.e2e.test.ts`。

不改：Goal 事件协议、看板、画布、用户库。

## 验收标准

1. 目录列表里有 `data-goal-collection-fold="current"`，段头可见「当前」和当前树数量。
2. 普通 Goals 视图该段带 `open`；归档、回收站段默认仍不带 `open`。
3. 当前树仍是 `data-tree-root`，点行、筛选、新建行为不变。
4. 空当前树展开后有「还没有 Goal」，不是空白死区。
5. `/archive` 仍强制展开归档段。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/immersive-directory.e2e.test.ts
```

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 1 当前段头「当前」+ 数量 | 通过 | `tests/goals-tree-ui.test.ts`；4174：`当前 46` |
| 2 普通视图当前展开，归档/回收站默认收起 | 通过 | 同测试；实屏可合上当前后立刻看到归档、回收站 |
| 3 `data-tree-root`、筛选、新建不变 | 通过 | e2e 仍量当前树行；新建按钮仍在 |
| 4 空当前树有「还没有 Goal」 | 通过 | 单元测试空目录 HTML |
| 5 `/archive` 仍展开归档段 | 通过 | 归档视图 HTML 带 `data-goal-collection-fold="archive" open` |

## 假设与开放问题

- 「当前」是相对归档/回收站的集合名，不引入「正式」二字。
- 含选中行的段在 `syncGoalCollectionFolds` 里仍会被拉开，与归档合同相同。
