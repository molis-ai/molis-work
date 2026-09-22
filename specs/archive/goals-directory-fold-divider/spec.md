# 去掉 Goals 百叶窗之间的分割线

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/archive/goals-directory-current-fold/spec.md` 里「归档段与当前段之间留一条分割线」。

## 背景目标

「当前 / 归档 / 回收站」已经是同一组百叶窗。归档段顶上还有 1px `--line` 和额外上边距，把同一列表切成两块。用户点 `.goal-list-view` 要求去掉这条线。

## 当前行为与问题证据

- `base.ts` 与 `immersive-directory.ts`：`.goal-collection-fold[data-goal-collection-fold="archive"]` 写了 `border-top: 1px solid var(--line)` 和 6–8px `margin-top`。

## 范围与非目标

做：去掉归档段顶边和为这条线留的额外上边距，三段用同一套 `margin: 0; border-top: 0`。

不做：不改段开合、数量、筛选、新建按钮。

## 验收标准

1. 浅色 Goals 目录里，`[data-goal-collection-fold="archive"]` 计算 `border-top-width` 为 `0px`。
2. 当前 / 归档 / 回收站仍在，默认开合不变。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/immersive-directory.e2e.test.ts
```
