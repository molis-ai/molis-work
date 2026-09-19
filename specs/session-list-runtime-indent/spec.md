# Sessions 列表：条目相对 Runtime 分类缩进

完成等级 **3：功能可用**。不改用户库、不提交。

本文件补 `specs/session-stage-list/spec.md`：Runtime 分类是组，Session 是组里的内容，条目不能和「Claude Code / Codex」标题齐平。缩进档位对齐 `specs/goal-list-collection-indent/spec.md`（16px）。

## 背景目标

Sessions 宽列表按 Runtime 分组后，分类 summary（caret + 图标 + 名称）和下面的 Session 行共用 `padding: 0 8px`，标题从同一条竖线起。看起来像又一条分类，而不是分类下面的条目。

## 当前行为与问题证据

- `.session-stage-list .goal-collection-fold > summary` 与 `.mw-dir-row` 都是 `padding: 0 8px`。
- 行直接放在 `details` 里、紧跟 summary，没有树层级，也没有 `padding-inline-start`。
- 用户在舞台列表上指出：item 要在分类之后，齐平视觉很怪。

## 范围与非目标

做：

- Runtime 分组下的 Session 行整体比分类 caret 往右一档（16px）。
- 同一组里标题 / Goal / 状态列仍彼此对齐；宽屏展开藏 Goal 列后，缩进仍在。
- 空列表（没有 Session）不必跟 fold 缩进。

不做：不改 Goals 缩进合同、Session 与 Goal 关系、用户库。Feed / Inbox 见 `specs/plugin-stage-collection-indent/spec.md`。

## 使用场景

1. 打开 Sessions 列表：先看到「Claude Code」，下面的 Session 标题明显缩进。
2. 宽屏点开一行后，左边窄列表里条目仍缩在 Runtime 标题下面。

## 方案

`.session-stage-list .goal-collection-fold > .session-stage-row` 的 `padding-left` 设为 24px：保留行现有 8px 左右边距，再加 Goals 同一档 16px。不改 HTML，不引入目录 `mw-dir-row--nested`。

## 验收标准

1. 分组内 Session 标题 left 比该组 summary 的 caret left 大约 16px（允许 2px）。
2. 同一组内 Goal 列 left 相同；状态列 left 相同。
3. 定向测试通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-work --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/session-web.test.ts tests/work-session-ui.test.ts tests/immersive-directory.e2e.test.ts
```

## 假设与开放问题

- 分类名称本身比 caret 更靠右（中间还有图标），条目只保证相对 caret 缩进一档，不要求标题对齐分类文字。
