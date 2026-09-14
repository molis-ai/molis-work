# 去掉插件目录数量底栏

## 背景目标

各插件目录底部有一条数量统计（「共 12 个目标」「共 N 条」「N 个 Item」「N 个来源」）。它夹在列表和账号栏之间，占用约 32px，且与插件条上的数量重复。用户要求各插件下都去掉这条统计。

完成等级：功能可用。目录仍可扫、筛选、刷新；列表直接接到账号栏。

## 当前行为与问题证据

Goals：`footer.tree-footer[data-tree-footer]`，「共 {count} 个{suffix}目标」。Refresh 片段同样带 footer；`prepareGoalRefresh` 没有 footer 会抛「页面数据不完整」。

Sessions：`footer.tree-footer`，「共 N 条」。

Feed / Inbox：`footer.feed-directory-footer`，「{count} 个 Item」。演示「预览空状态」按钮挂在 footer 的 `<small>` 里。

来源：同款 footer，「{count} 个来源」。

证据：用户选中的 `footer.tree-footer`；`plugins/native/goals/src/tree-ui.ts`、`plugins/native/work/src/ui/render.ts`、`plugins/native/feed/src/ui.ts`。

## 范围与非目标

做：Goals / Sessions / Feed / Inbox / 来源目录底部的数量 footer；刷新不再依赖 footer；筛选不再写计数节点；目录 grid 不再为这条底栏留行。演示空态按钮改放到目录工具区并隐藏，保留现有点击契约。

不做：账号 footer（一骏 / 本地空间 / 插件市场）；插件条「N 个 Goal」副文案；画布或详情里的数量；来源管理弹窗里的来源个数；筛选空态文案。

## 使用场景

打开任一插件目录时，列表滚到底直接看到账号栏，中间没有「共 N 个…」。

## 方案

目录 HTML 不再渲染数量 footer。Refresh HTML 同步去掉。客户端对计数节点改为可选，缺失时不抛错、不更新。Sessions 去掉末行 46px/42px；Goals / Feed / 来源去掉末行 `auto` 计数轨。

## 文件边界

- `plugins/native/goals/src/tree-ui.ts`、`tree-client.ts`、`refresh-client.ts`
- `plugins/native/work/src/ui/render.ts`、`directory-client.ts`、`styles.ts`
- `plugins/native/feed/src/ui.ts`
- `apps/workbench/src/scripts/client/bootstrap.ts`、`navigation-feed.ts`、`events-primary.ts`
- `packages/design-system/src/styles/personal-workbench-v3.ts`、`source-feed.ts`
- `DESIGN.md`、`.impeccable/surfaces/immersive-workbench.md`
- `tests/goals-tree-ui.test.ts`、`tests/feed-native-plugin.test.ts`

## 验收

- Goals / Sessions / Feed / Inbox / 来源目录没有 `tree-footer` / `feed-directory-footer`，也没有「共 N 个目标」「共 N 条」「N 个 Item」「N 个来源」底栏。
- 列表与账号栏之间没有为计数预留的空行。
- 筛选、搜索、Goal 刷新仍可用；刷新不再要求 footer。
- 账号栏、插件条数量、插件市场入口仍在。

## 验证

- `node --import tsx --test tests/goals-tree-ui.test.ts tests/feed-native-plugin.test.ts tests/work-session-ui.test.ts`
- 浏览器走 Goals、Sessions、Feed、Inbox、来源，确认底栏消失且账号栏仍在。

## 假设

沉浸式工作台是主界面；非沉浸式同一套目录 HTML。
