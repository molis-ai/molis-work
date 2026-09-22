# Goals 列表：Goal 相对分类标题缩进

完成等级 **3：功能可用**。不改用户库、不提交。

本文件补 `specs/archive/goals-stage-list-row/spec.md` 与 `specs/archive/goals-directory-collection-folds/spec.md`：分类是组，Goal 是组里的内容，根 Goal 不能和「当前 / 归档 / 回收站」标题齐平。

## 背景目标

Goals 列表里，「当前」这类分类标题和下面的根 Goal caret 在同一条竖线上，选中的 Goal 看起来像又一条分类，而不是分类下面的条目。用户要求 Goal 有缩进，不能和分类标题对齐。

## 当前行为与问题证据

- `.goal-stage-list .goal-tree { padding: 0 }`，根行 `--tree-depth: 0`，标题簇相对分类 summary 没有额外缩进。
- 分类 summary 是 caret + 图标 + 名称；Goal 行是 caret + 标题。两边 caret 齐平，扫一眼分不出组头和条目。
- 空分类文案已经有左内边距（舞台 32px / 目录 22px），有 Goal 时反而顶格。

## 范围与非目标

做：

- 舞台列表和 Goals 目录里，分类下面的 Goal 树整体比分类标题往右一档（16px，沿用现有层级步长）。
- 子 Goal 仍按 `part_of` 深度再缩 16px；状态 / 进度 / 前置列彼此对齐，不改列合同。
- 空分类文案跟有 Goal 时的树起点一致。

不做：不改画布、看板、Goal 关系语义、用户库。Feed / Inbox 条目缩进见 `specs/archive/plugin-stage-collection-indent/spec.md`。

## 使用场景

1. 打开 Goals 列表：先看到「当前」，下面的根 Goal 明显缩进；再往下的子 Goal 更靠右。
2. 空的归档 / 回收站展开后，空文案也缩在分类标题下面，不是和标题齐平。

## 方案

`.goal-stage-list .tree-leading` 按 `(depth + 1) * 16px` 缩进标题簇：分类下面的根 Goal 先缩一档，子 Goal 再按 `part_of` 加深。全宽列表里状态 / 进度 / 前置列仍跨层对齐。Goals 目录里的分类树同样 `padding-inline-start: 16px`。空文案左内边距改到同一起点。

## 验收标准

1. 舞台当前树根 Goal 的折叠按钮 / 占位，比分类 summary 的 caret 更靠右，差距约 16px（允许 2px）。
2. 同一棵树里，标题 left ≈ 根标题 left + depth × 16px（允许 2px）。全宽列表（未打开 Goal 分屏）时状态列仍跨层对齐；分屏窄列表状态列是 `auto`，不要求 left 相同。
3. 空分类文案左缘不比有 Goal 时的树更靠左。
4. 定向测试通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-kanban-ui.test.ts tests/immersive-directory.e2e.test.ts
```
