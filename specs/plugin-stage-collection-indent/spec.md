# 插件舞台列表：条目相对分类缩进

完成等级 **3：功能可用**。不改用户库、不提交。

本文件补 `specs/plugin-stage-master-detail/spec.md`，缩进档位对齐 `specs/goal-list-collection-indent/spec.md` 与 `specs/session-list-runtime-indent/spec.md`。

## 背景目标

Goals / Sessions / Artifacts 的条目已经缩在分类下面。Feed 和 Inbox 同样用 `goal-collection-fold`，但条目和「待处理 / Solidot」这类组头齐平，看起来像又一条分类。

## 当前行为与问题证据

- `.plugin-stage-list .goal-collection-fold > :is(.feed-stage-item, …)` 要求条目是 fold 的直接子元素。
- Feed / Inbox 把行包在 `.feed-stage-group-body` / `.inbox-stage-group-body` 里，选择器打不中；`.feed-stage-entry` 仍是 `padding: 0 8px`，和 summary 同一条竖线。
- Artifacts 行改为 `feed-stage-entry`，走同一条缩进。Sessions 走自己的舞台列表规则，已生效。
- 空任务文案 `padding-left: 32px`，有条目时反而顶格。
- Shelf 行是 `.shelf-row`，进舞台后要和 Feed 同一档缩进。

## 范围与非目标

做：

- Feed、Inbox、Artifacts 分组内的条目相对分类 caret 往右一档（16px）：行保留 8px 边距，再加 16px，合计 `padding-left: 24px`。
- 空分类文案起点与有条目时的标题簇一致（24px）。
- Shelf `.shelf-row` 在 `plugin-stage-list` 里同样 `padding-left: 24px`；子项再加一档。

不做：不改拉取 / 注意力 / Artifact 版本语义 / Shelf Job 语义、不改用户库。Sessions / Goals 已有合同，不重做。舞台 IA 见 `specs/plugin-stage-master-detail/spec.md`。

## 使用场景

1. 打开 Feed：先看到来源任务名，下面的 Item 明显缩进。
2. 打开 Inbox：「待处理 / 历史」下面的事项缩进；空组文案不比条目更靠左。
3. Artifacts / Shelf / Sessions 条目相对集合头缩进一档。

## 方案

给 `.plugin-stage-list .goal-collection-fold .feed-stage-entry` 和 `.shelf-row` 写 `padding-left: 24px`。空文案左内边距 24px。选择器要比 `body.immersive-workbench .feed-stage-entry { padding: 0 8px }` 更具体。

## 验收标准

1. Feed / Inbox 分组内条目标题（或 leading）left 比该组 summary caret left 大约 16px（允许 2px）。
2. 空任务文案左缘不比有条目时的标题簇更靠左。
3. Artifacts / Shelf 分组内标题相对 caret 仍约 16px。
4. 定向测试通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/chrome-inner-scroll.test.ts tests/feed-native-plugin.test.ts tests/inbox-native-plugin.test.ts tests/artifact-browser.test.ts
```
