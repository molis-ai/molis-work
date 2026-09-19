# 空画布文案居中，并说明这张图是什么

状态：已完成。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

承接 `specs/goals-canvas-empty-no-create/spec.md`：创建入口仍只在舞台 chrome。本轮只改空画布文案的位置、措辞和样式。

## 背景目标

「还没有目标」贴在左上，和「新建 Goal」抢同一块。空画布是一张关系图，空状态应落在图的正中，说明这里会画出什么，而不是再指路去点按钮。

## 当前行为与问题证据

- `.goal-canvas-empty` 绝对定位 `top: 56px; left: 20px`，12px muted 单行「还没有目标」。
- 用户点选该节点：不要在这里，放到画布中心，打磨文案和样式。

## 范围与非目标

做：

- 空文案叠在画布正中（避开左上 chrome 和右下缩放）。
- 主句与列表一致：「还没有 Goal」。
- 补一句说明：目标和依赖会作为节点出现在这里。
- 居中两行层级，不放按钮、不放大图标。

不做：不改创建 dialog、列表/看板空文案、缩放、有 Goal 时的画布。不把创建 CTA 放回空状态。

## 使用场景

1. 打开空项目画布：左上仍是「新建 Goal」；点阵中央是两行空状态。
2. 窄屏同样居中，不贴左上。
3. 已有 Goal 的画布没有这块空状态。

## 方案与关键决策

- 空状态仍是 `.goal-canvas-map` 上的 overlay，不跟节点一起平移。
- `pointer-events: none`，空白处仍可拖动画布。
- 用 `mw-empty` 的字号层级（strong + p），位置由 `.goal-canvas-empty` 居中。

## 文件 / 模块边界

- `plugins/native/goals/src/momentum-ui.ts`
- `plugins/native/goals/src/workspace-en.ts`
- `apps/workbench/src/styles/goal-canvas.ts`
- `tests/goals-momentum-ui.test.ts`
- `DESIGN.md`

## 验收标准

1. `.goal-canvas-empty` 在画布可视区域中心附近，不与 `[data-goal-stage-chrome]` 重叠。**通过**（桌面水平偏差 0、相对中心偏上 22px；与 chrome/缩放无重叠。390 同）。
2. 文案为「还没有 Goal」+「目标和依赖会作为节点出现在这里」；没有空状态按钮。**通过**（单元测试 4/4；隔离页无 empty 按钮）。
3. 英文为 `No Goals yet` + 对应说明。**通过**（`tests/goals-momentum-ui.test.ts`）。
4. 点左上「新建 Goal」仍打开创建面板。**通过**（隔离页焦点进「目标名称」）。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-momentum-ui.test.ts
```

隔离 Home：桌面与 390 空画布居中；深色同样可读。

## 假设与开放问题

- 列表空行仍是左对齐的「还没有 Goal」，不跟画布居中套同一布局。
