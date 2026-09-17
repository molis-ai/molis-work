# Goal 信息开关放进右侧栏

状态：已完成。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

工作区顶栏右侧的「Goal 信息与时间线」开关和标题栏分屏按钮叠成两颗同类图标，看起来像连在一起。开关属于右侧栏，不应占 Runtime 顶栏。

## 当前行为与问题证据

- `[data-goal-details-toggle]` 画在 `.goal-node-toolbar .goal-node-actions`，顶栏最右。
- 标题栏已有布局/分屏图标；两颗面板类图标上下相接。
- 单击仍能收起/展开 `.document-pane`；收起后 `hidden === true`，工作区只剩 Runtime。

## 范围与非目标

做：

- 从 Goal 工作区顶栏拿掉该按钮。
- 按钮改到右侧栏（`.goal-details-aside`）：栏展开时在侧栏顶部；栏收起时侧栏收成约 32px 窄轨，按钮仍可点开。
- 收起/展开语义、`aria-expanded`、按 Goal 记住开关，保持不变。

不做：不改 Frame、列表主从、时间线内容、分屏菜单。

## 使用场景

1. 打开工作区：Runtime 顶栏只留返回和标题；右侧栏顶有信息开关。
2. 点开关：右侧栏收成窄轨，Runtime 变宽；再点窄轨上的按钮，栏回来。
3. 窄工作区（<840px）仍是侧栏盖在 Runtime 上；收起后同样留窄轨。

## 方案与关键决策

- 用 `aside.goal-details-aside` 包住 `[data-document-pane]` 和开关；`document-pane.hidden` 合同保留，方便现有测试。
- 顶栏 `.goal-node-actions` 删除。

## 验收标准

1. 工作区顶栏不再有 `[data-goal-details-toggle]`。
2. 开关在 `[data-goal-details-aside]` 内；展开时侧栏可见，收起时 `document-pane.hidden === true` 且 aside 仍显示窄轨。
3. `tests/goal-canvas-workspace.e2e.test.ts` 里开关路径仍通过。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goal-canvas-workspace.e2e.test.ts
```

## 验收对照

1. 工作区顶栏不再有 `[data-goal-details-toggle]`。**通过**（e2e 断言；4180 CDP：`toolbarToggle: false`）。
2. 开关在 `[data-goal-details-aside]` 内；展开约 300px，收起 `document-pane.hidden` 且 aside ≈ 32px。**通过**（e2e；4180 展开宽 330、收起宽 32）。
3. `tests/goal-canvas-workspace.e2e.test.ts` 开关路径。**通过**（2026-09-17）。

4180 宽屏：顶栏只留返回和标题；开关在右侧栏顶，不再和标题栏分屏图标叠在一起。
