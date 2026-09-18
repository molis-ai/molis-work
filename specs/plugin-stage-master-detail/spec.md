# 插件列表统一成 Goals 舞台主从

状态：可验收。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次体验变更的唯一需求书。它覆盖 `specs/feed-stage-directory/spec.md` 里「主区不再拆列表|正文」、`specs/feed-stage-source-groups/spec.md` 里「左边另有任务目录」、以及 Inbox / Artifacts 仍占第二栏的合同。Sessions 已按 `specs/session-stage-list/spec.md` 落地，这次把同一条路径铺到 Feed、Inbox、Artifacts。

## 背景目标

Goals / Sessions：点插件条没有第二栏，内容区默认铺满列表；点一行，宽屏列表收成 `--tree-width`，右边出详情。

Feed 仍左右重复分类：左边来源任务目录筛源，右边再按源分组、行内展开详情。Inbox / Artifacts 进插件就开第二栏，并且默认选中第一条。

用户要求：所有带列表的插件走同一条路径；Feed 的分类变成左边那种纯目录（集合头），任务状态变成勾和三角画在分组 mark 上；Inbox、Artifacts 同样整合，不要两套目录。

## 当前行为与问题证据

- Feed 仍贡献 `data-directory-panel="feed"`；主区 `feed-stage-group` 的 mark 是来源类型图标，不是任务状态；详情在 `.feed-stage-item-detail` 行内。
- 空任务不进分组，左边目录能力一旦拿掉就会丢。
- Inbox 贡献 `data-directory-panel="inbox"`，待处理/历史是筛选芯片，进页自动选第一条。
- Artifacts 在树里挂 `data-directory-panel="artifacts"`，进插件就开第二栏；列表扁平，没有集合头。
- 插件条 Inbox / Artifacts 仍带 `data-directory-open`。Shelf 按 DropAgent 合同不在这次范围。

## 范围与非目标

做：

- Feed、Inbox、Artifacts 不再贡献第二栏 panel。点插件只开工作面，`is-plugin-directory-empty` 为 true。
- 默认内容区是铺满的舞台列表。分类是 `goal-collection-fold`：caret + 状态 mark + 标题 + 计数。点分组头只开合，不筛掉其他组，不自动打开第一条。
- 宽屏单击一行：`data-expanded="true"`，列表收成 `--tree-width`，右边是该条详情。窄屏列表藏起，正文铺满；返回按钮回到铺满列表。
- 打开插件不自动选中第一条。
- Feed：每个已配置来源都是 fold，包括 0 条 Item 的空任务；`status_kind === active` 用勾（`check`），其余用三角（`alert`）。任务配置仍从该 fold 的 trailing 进入。行内详情搬到右栏。
- Inbox：待处理（三角）和历史（勾）两个 fold 同时在列表里，不再用筛选芯片切页。
- Artifacts：按 `artifact_type_id` 分组；可用勾、不可用/归档三角。点版本进右栏，语义仍是精确版本。

不做：

- 不改 Shelf（DropAgent 工作台，不是 Coss 列表）。
- 不把 Goals 第二栏加回来；首页 / 市场 / 用户收起目录仍按内容收窄。
- 不改 Feed 拉取、Inbox 注意力状态机、Artifact 精确版本 / 导出。
- 不把来源管理升成第三个插件；`data-directory-panel="sources"` 仍可隐藏存在。
- 不改用户真实库。

## 使用场景

1. 点 Feed：左边只有插件条；内容区是各来源任务 fold，健康的勾、要处理的三角。空任务也在。点一条 Item，宽屏左边留下窄目录，右边出正文。
2. 点 Inbox：待处理和历史都是 fold。不自动打开第一条。点一行才出详情。
3. 点 Artifacts：按结果类型分组。点一个版本才出详情；返回回到铺满列表。
4. 窄屏点插件进铺满列表，点行后只看正文，返回回列表。

## 方案与关键决策

- Host：Inbox / Artifacts 与 Goals / Sessions / Feed 一样，插件条不带 `data-directory-open`；没有 panel 就不打开第二栏。
- 共享舞台壳：`plugin-stage-shell` + `plugin-stage-list` + `plugin-stage-workspace`，宽屏展开 grid 为 `var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr)`。Sessions 已有同类壳，不强制改名。
- Feed 不再用左边任务行筛选主区；来源筛选仍在舞台 chrome。点「查看来源」只打开并对齐对应 fold。
- 集合头 mark 只表达需要不需要盯：勾 = 安好/已处理/可用；三角 = 要盯。

## 输入输出与依赖

输入：现有 Feed Source/Item、Inbox Attention、Artifact 精确版本。输出：同一套选中、详情、动作 API。依赖：Host 按 panel 有无开第二栏、Goals/Sessions 主从列宽合同。

## 文件 / 模块边界

- `plugins/native/feed/src/ui.ts`、`plugins/native/inbox/src/ui.ts`、`plugins/native/artifacts/src/browser-ui.ts`
- `apps/workbench/src/styles/plugin-stage.ts`、`immersive-shell.ts`、`goals-page-renderer.ts`、`scripts/client/navigation-feed.ts`、`navigation-inbox.ts`、`plugin-workbench.ts`、`events-secondary.ts`
- 测试：`tests/feed-native-plugin.test.ts`、`tests/inbox-native-plugin.test.ts`、`tests/desktop-tui.test.ts`、`tests/project-plugins.test.ts`、`tests/artifact-browser.test.ts`、相关 e2e

## 验收标准

1. 点 Feed / Inbox / Artifacts：工作区带 `is-plugin-directory-empty`，没有对应 `data-directory-panel`；插件条没有 `data-directory-open`。
2. 未点行时没有可见详情；Feed 空任务仍有 fold；分组 mark 是 `check` 或 `alert`，不是来源类型图标。
3. 宽屏单击后列表仍可见且宽度等于目录列；对应详情在右侧且 `hidden === false`。
4. 点返回后 `data-expanded` 不是 true，详情隐藏。
5. Inbox 待处理和历史同时作为 fold 出现；打开 Inbox 不选中第一条。
6. Artifacts 按类型分组；点版本后右栏是该精确版本。
7. Shelf 仍可开第二栏。完成等级 3。不改用户真实库。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-plugin-inbox --filter @molis-ai/molis-work-plugin-artifacts --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/inbox-plugin.test.ts tests/desktop-tui.test.ts tests/project-plugins.test.ts tests/artifact-browser.test.ts tests/goal-decision-attention.test.ts tests/chrome-inner-scroll.e2e.test.ts
```

## 假设与开放问题

- 假设 4174 + `~/.molis-work` 仍是内部试用入口。
- Shelf 排除已写入非目标；若要改成同一路径，另开 spec。
