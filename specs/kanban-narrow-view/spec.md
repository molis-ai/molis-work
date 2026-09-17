# 看板窄布局只在看板视图触发

状态：已完成。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件收紧 `specs/goal-kanban-view/spec.md` 里「看板面板窄于 840px 时收成分组列表」：这条窄布局只属于看板视图。

## 背景目标

Goals 舞台共用一个 `goal-board` 容器。舞台窄于 839px 时，看板应收成按状态分组的纵向列表。列表和画布在同样宽度下仍是自己的布局，不能被看板窄态盖住。

## 当前行为与问题证据

`@container goal-board (max-width: 839px)` 里有 `.goal-canvas-shell .goal-kanban { display: block }`，没有要求 `data-board-view="kanban"`。分屏或窗口把舞台拉到约 770px 时，列表/画布也会把看板堆叠层显示出来。

## 范围与非目标

做：

- 839px 堆叠（分组折叠、36px 行、整表纵滑）只在 `data-board-view="kanban"` 时生效。
- 同一舞台宽度下，列表仍是列表，画布仍是画布；看板节点保持 `display: none`。

不做：不改六列合同、卡片字段、Frame、筛选/新建位置、MCP、用户库。不改 760px 工作台窄屏导航。

## 使用场景

1. 舞台约 770px，停在列表或画布：看不到看板分组列表。
2. 同一宽度切到看板：六组状态纵向排列。
3. 再切回列表或画布：堆叠看板消失，对应视图回来。

## 方案与关键决策

容器仍在 `.goal-canvas-shell`。窄态选择器全部挂在 `[data-board-view="kanban"]` 下，不再用未限定的 `.goal-canvas-shell .goal-kanban { display: block }`。

## 文件 / 模块边界

- `apps/workbench/src/styles/goal-canvas.ts`
- `tests/goals-kanban-ui.test.ts`、`tests/goal-kanban.e2e.test.ts`

## 验收标准

1. 舞台宽度 `< 839px` 且当前是列表或画布：`[data-goal-kanban]` 计算样式 `display: none`，列表或画布可见。
2. 同一宽度切到看板：`.goal-kanban-board` 的 `flex-direction` 为 `column`。
3. 桌面整宽看板仍是六列横排。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-kanban-ui.test.ts tests/goal-kanban.e2e.test.ts tests/attention-journey.e2e.test.ts
```

再在 4180 把舞台拉窄，切列表 / 画布 / 看板对照。
