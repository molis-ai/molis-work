# 画布空状态不再重复「新建 Goal」

状态：已完成。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

Goals 舞台左上已经有 `[data-open-create]`「新建 Goal」。空画布再放一颗主按钮「创建 Goal」，同一动作出现两次，空纸看起来像缺入口。

## 当前行为与问题证据

- 无 Goal 时 `.goal-canvas-empty` 渲染 `<h2>还没有目标</h2>` 加 `mw-btn--primary` `data-open-create`。
- 舞台 chrome 已有同一 `data-open-create`（`specs/archive/goals-stage-chrome/spec.md`）。
- 列表空集合只有一句 `还没有 Goal`，看板空列只有 `暂无 Goal`，都不重复创建按钮。

## 范围与非目标

做：

- 空画布只陈述「还没有目标」，不再放创建按钮。
- 创建仍只走舞台 chrome 的 `[data-open-create]`。
- 空文案保持安静，不再用大标题配主按钮。

不做：不改创建 dialog、列表/看板空文案、缩放控件、有 Goal 时的画布。

## 使用场景

1. 打开空项目的 Goals 画布：左上仍是「新建 Goal」；纸面只有「还没有目标」。
2. 点左上「新建 Goal」仍打开创建面板。
3. 已有 Goal 的画布不变。

## 方案与关键决策

- `renderGoalMomentum` 空节点只输出 `.goal-canvas-empty` 文案。
- 空状态用一段 muted 说明，不用二级标题 + 主按钮。

## 文件 / 模块边界

- `plugins/native/goals/src/momentum-ui.ts`
- `apps/workbench/src/styles/goal-canvas.ts`
- `tests/goals-momentum-ui.test.ts`
- `DESIGN.md` 画布空状态一句

## 验收标准

1. 空画布 HTML 有「还没有目标」，没有 `.goal-canvas-empty` 内的 `data-open-create` / `mw-btn`。**通过**（`tests/goals-momentum-ui.test.ts` 4/4；隔离页 `.goal-canvas-empty` 只有 `<p>还没有目标</p>`，`emptyCreate: 0`）。
2. 舞台 chrome 仍有且仅有一处可见的 `[data-open-create]`。**通过**（`chromeCreate: 1`，可见文案只有「新建 Goal」）。
3. 点 chrome 新建仍打开创建 dialog。**通过**（隔离页点左上「新建 Goal」，焦点进「目标名称」，dialog 提交仍是「创建 Goal」）。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-momentum-ui.test.ts
```

再在隔离 Home 打开空项目 Goals 画布核对。

## 假设与开放问题

- 列表「还没有 Goal」与画布「还没有目标」文案暂不统一。后续居中与文案见 `specs/archive/goals-canvas-empty-center/spec.md`。
