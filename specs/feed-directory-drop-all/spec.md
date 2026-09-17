# Feed 目录去掉「全部」，来源行带图标

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

本文件覆盖 `specs/feed-directory-all-fold/spec.md` 的「全部」集合头，以及 `specs/feed-directory-goal-list/spec.md` 里「来源行无图标、缩进为子项」。主区按来源分组见 `specs/feed-stage-source-groups/spec.md`。

## 背景目标

左边 Feed 目录第一项是「全部」fold，下面来源任务缩进、没有行首图标。主区已经按来源任务分组，「全部」在目录里重复；来源行看起来不像可点的任务。

## 当前行为与问题证据

- `renderFeedDirectory` 用 `goal-collection-fold` 包「全部」+ 来源。
- 来源行是 `mw-dir-row--nested`，没有 `icon`。
- 点「全部」才 `setFeedTask("all")`。

## 范围与非目标

做：

- 目录不再渲染「全部」。添加任务仍在顶部。
- 来源任务是一级 compact 行，行首用 GitHub / Gmail / RSS 图标，行尾健康标和配置不变。
- 没有任务时仍显示「还没有拉取任务」。
- 点某个来源仍筛选主区；再点已选中的来源，或点 Feed 插件入口，回到全部组。
- 主区工具条在全部范围时标题仍可写「全部」。

不做：不改主区分组、任务配置、添加对话框。

## 使用场景

1. 打开 Feed：左边是添加 + 来源任务（带图标）；主区三组都在，没有来源行被选中。
2. 点 Gmail：该行选中，主区只留 Gmail 组。
3. 再点 Gmail，或点左边/轨道上的 Feed：回到全部组。

## 方案

- `plugins/native/feed/src/ui.ts`：去掉 fold；`renderDirectoryRow` 传入 `sourceIconName`。
- `apps/workbench/src/scripts/client/events-secondary.ts`：来源行再点一次清筛选；点 Feed 插件入口 `setFeedTask("all")`。

## 验收标准

1. 目录没有 `data-feed-collection-fold`、没有 `data-feed-task-toggle="all"`。
2. 有来源时行含 `mw-dir-row__icon`，没有 `mw-dir-row--nested`。
3. `data-feed-add-toggle` 仍在第一个 `data-feed-task` 之前。
4. 空目录仍有「还没有拉取任务」。
5. `tests/feed-native-plugin.test.ts` 通过。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts
```
