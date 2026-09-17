# Feed 目录「全部」对齐 Goal 集合头

状态：已落地。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件覆盖 `specs/feed-directory-goal-list/spec.md` 里「全部只是带计数的 compact 选中行」的约定。添加仍在顶部，见 `specs/feed-directory-add-top/spec.md`。点来源行/配置合同不变。

## 背景与问题

Feed 目录「全部」是 `mw-dir-row` 选中页：`aria-current=page`、计数挤在标题槽、没有 caret。Goal 列表「当前」是 `goal-collection-fold`：caret、mark、标题、`<small>` 计数，点 summary 开合，选中在子项。

## 范围与非目标

范围：Feed directory「全部」的 HTML / 样式 / 点击；`setFeedTask("all")` 仍能回到混流；来源行仍在集合里。

非目标：Goal 树、主区 Item 行、添加对话框、Inbox/Sessions、跨会话记住折叠。

## 方案

1. 「全部」改成与 Goal 相同的 `<details class="goal-collection-fold">`：caret、rss mark、`<strong>全部</strong>`、`<small>` 流水计数；默认展开。
2. 来源任务放进 fold 体内，仍是 compact 缩进行 + 行尾配置。
3. 交互对齐 Goal 集合头：caret 只开合；点标题/计数切回全部流水且不收起；来源行仍 `setFeedTask(source)`。集合头不用 `mw-dir-row is-selected` 左边竖标。
4. 没有任务时 fold 内显示空文案，不把「全部」变回普通行。

## 验收

1. Feed directory「全部」是 `goal-collection-fold`，含 caret / mark / strong / small，不是 `mw-dir-row is-selected`。
2. 来源行在 fold 内，仍有 `mw-dir-row--nested` 和 `data-feed-task-config-open`。
3. `data-feed-add-toggle` 仍在 `data-feed-task="all"` 之前。
4. 点「全部」标题切回混流；点 caret 只开合；点来源仍筛选主区。

## 验证

```
node --import tsx --test --test-concurrency=1 tests/feed-native-plugin.test.ts
```

隔离预览 `127.0.0.1:4180 --home /Users/didi/.molis-work`。
