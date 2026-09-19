# Feed 主区按来源任务分组

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

本文件覆盖 `specs/feed-stage-directory/spec.md` 里「全部是跨源混流」和 `specs/feed-stage-list-row/spec.md` 里「右边流水」的主区排列。左边来源任务目录、行内详情、筛选合同不变。

## 背景目标

Feed 主区 `.feed-stage-tree` 现在是一条按时间混在一起的 Item 流水。Goal 列表的内容逻辑是：集合头（caret / mark / 标题 / 计数）下面才是条目。用户要求主区参考这套逻辑，分组键改成来源任务。

## 当前行为与问题证据

- `renderFeedStageDirectory` 把全部 Item 平铺进 `[data-feed-list]`。
- 左边已有「全部」fold 和来源任务；点来源只做筛选，主区没有分组头。
- 扫「全部」时，GitHub / Gmail / RSS 的条目挤在同一条时间线上，看不出任务边界。

## 范围与非目标

做：

- 「全部」时主区按来源任务分组；每组用与 Goal 舞台列表相同的 `goal-collection-fold`：caret、来源图标、任务名、条目计数，默认展开。
- 组内仍是现有 28px `feed-stage-entry`；点开仍在同一行下展开详情。
- 左边点某个来源：只显示该组；点「全部」：所有有条目的组都在。
- 搜索 / 筛选 / 排序作用在组内；没有可见条目的组隐藏。对不上任何来源任务的条目进「其他」。
- 没有 Item 时仍是现在的空态，不渲染空组。

不做：不把 Goal 的进度条、前置、创建人头像搬过来；不改左边目录、任务配置、忽略 / Inbox / 升 Goal；不改成「同时只展开一个任务」。

## 使用场景

1. 打开 Feed「全部」：先看到 GitHub 组，下面是它的 PR；再是 Gmail 组、RSS 组。
2. 点左边某个来源：主区只留该组，组头仍在。
3. 搜索没命中某组：该组消失；全部没命中：全局空态「没有符合当前条件的 Item」。
4. 点条目展开正文再收起：仍在该组下面，不切页。

## 方案

- `plugins/native/feed/src/ui.ts`：按 `source_id` 分组渲染；组顺序跟 `model.sources`。
- `apps/workbench/src/scripts/client/navigation-feed.ts`：`filterFeedItems` 只在组内重排，不再把条目抽到列表根上。
- `apps/workbench/src/styles/immersive-directory.ts`：主区分组头对齐 Goal 舞台集合头（32px）。

## 验收标准

1. 两个来源各有条目时，主区有两个 `[data-feed-stage-group]`，条目在对应组内。
2. 组头是 `goal-collection-fold`，含 caret / mark / strong / small。
3. 对不上来源的条目在 `data-feed-stage-group="other"`，标题「其他」。
4. 空列表没有分组头。
5. 筛选后组内排序不把条目移出该组；空组 `hidden`。
6. `tests/feed-native-plugin.test.ts` 通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-feed --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts
```

## 假设与开放问题

- 组顺序跟左边来源任务顺序，不按组内最新条目重排各组。
- 选中单个来源时仍显示该组头，不把主区退回无头平铺。
