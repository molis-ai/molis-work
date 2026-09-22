# Inbox 详情动作条放到标题下

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

Inbox 详情把「处理任务配置 / 标记已处理 / 忽略」钉在主区底部。点开一条事项后，眼睛在标题，手要拉到窗口最底才能处理，动线太长。

## 当前行为与问题证据

- `renderInboxDetail` 把 `inbox-reference-footer` 放在滚动的 `inbox-reference-body` 后面。
- `DETAIL_READING_STYLES` 用整列 flex 把 footer 钉在视口底。4174 上动作条约在 `top=1021`。

## 范围与非目标

做：

- 标题在上，动作条紧跟标题，处理上下文在下面自己滚。
- 滚上下文时动作条仍留在标题下，不跟内容滚走，也不回到窗口底。
- 三个按钮、状态反馈、窄屏 44px 触控不变。

不做：不改 Feed 行内详情、Artifacts 底栏、Inbox 目录。

## 使用场景

1. 打开 Inbox 一条事项：先看到标题和三个动作，再往下看「为什么进入 / 下一步」。
2. 上下文很长时往下滚，动作条还在标题下面，不必回到窗口底。

## 方案

- `plugins/native/inbox/src/ui.ts`：顺序改为 header → 动作条 → 滚动 body。
- `apps/workbench/src/styles/detail-reading.ts`：动作条 `flex: none` 改到标题下，底部分割线改顶部分割到上下文。

## 验收标准

1. 详情 HTML 里 `inbox-reference-footer` 出现在 `inbox-reference-body` 之前，且在 `feed-detail-header` 之后。
2. 打开 Inbox 详情时，动作条在标题下方，不在主区底部。
3. `tests/inbox-native-plugin.test.ts` 通过。

## 验证命令

```
node --import tsx --test --test-concurrency=1 tests/inbox-native-plugin.test.ts
```
