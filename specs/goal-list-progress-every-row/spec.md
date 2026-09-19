# 列表每一行都有进度

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

本文件补 `specs/goals-stage-list-row/spec.md` 的进度列：格子一直在，但只有父 Goal 画出 `N/M`。

## 背景目标

Goals 列表里，父行能看到 `1/2` 这种完成数和短条；叶子行同一列是空的。扫一眼分不出叶子自己做到哪。用户要求每个 Goal 都有这个进度，不只父 Goal。

## 当前行为与问题证据

- `renderTreeChildProgress` 在没有 `part_of` 子项时输出 `.tree-progress.is-empty`。
- 舞台 CSS 把空进度 `visibility: hidden`，列还在，但看不见数字和条。
- 父行语义不变：已完成子 Goal / 子 Goal 总数。

## 范围与非目标

做：

- 舞台列表每一行都画出可见的 `N/M` 和短条。
- 有子 Goal：仍按直接子项完成数，阻塞仍标红。
- 没有子 Goal：按本 Goal 是否已收尾，显示 `0/1` 或 `1/1`；自己受阻时条标红。
- 行高、列对齐、前置列、创建日期/头像不变。

不做：不改画布节点、看板卡片、详情里「子 Goal 进度」文案、关系语义、用户库。

## 使用场景

1. 打开 Goals 列表：父行仍是 `1/2`；已完成的叶子是 `1/1`；未完成的叶子是 `0/1`。
2. 受阻的叶子进度条是红色，和父行里有阻塞子项时一样。

## 方案

`plugins/native/goals/src/tree-ui.ts`：没有子项时用本 Goal 自己当唯一计数单位，不再输出空进度。

## 验收标准

1. 渲染结果不再出现 `.tree-progress.is-empty`。
2. 无子项且未完成：`0/1`；无子项且已完成：`1/1`。
3. 有三个子项、一个完成、一个阻塞：仍是 `1/3`，aria 含阻塞。
4. `tests/goals-tree-ui.test.ts` 通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts
```
