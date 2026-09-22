# 分屏缝：细线 + 中间拖拽手柄

状态：已落地。完成等级 **3：功能可用**。不改用户真实库、不提交、不发布。

## 背景目标

分屏两块主屏用细线分开，中间留呼吸缝。拖拽时不要把整条缝刷蓝，只在中点出现手柄，对标 Figma 分屏 Resize。

## 当前行为与问题证据

- 缝是 5px 实心 `--line`，hover/active 整条变 `--blue`（`tab-workspace.ts` + `coss-controls.ts`）。
- 一骏 2026-09-19 选中 `.tab-sash`：`width=5`、全高高亮；附图 Figma 是缝里一颗中间胶囊手柄。

## 范围与非目标

做：桌面分屏（横/竖/T 形）8px 画布缝、1px 细线、12px 热区、居中手柄（hover / 键盘焦点 / 拖拽中出现；粗指针常显）。点按、键盘、双击均分仍可用。

不做：不改分屏树、比例、拖标签拆栏、760px 单栏、Goal 工作区方边零 inset。

## 使用场景

1. 左右分屏：两栏之间一条细线，中间空出画布色。
2. 指针靠近缝：中点出现握持手柄，整条线颜色不变。
3. 拖动手柄或缝的热区：比例跟着走；松手后手柄按 hover 规则消失。
4. 上下分屏：手柄横放。键盘左右/上下仍调比例，双击仍 50%。

## 方案与关键决策

- 栏内侧各退 `4px`（合计 8px 缝）。外缘仍贴舞台。
- 缝视觉是 1px `--line`，不是 5px 填色。
- 热区 12px 居中，方便点到。
- `.tab-sash-handle` 用已有 `grip` 图标；竖缝竖握持、横缝转 90°。
- 删掉整条缝刷蓝。

## 输入输出与依赖

无新协议。分屏状态仍是现有 layout tree。

## 文件 / 模块边界

允许改：`apps/workbench/src/styles/tab-workspace.ts`、`apps/workbench/src/scripts/client/tab-workspace.ts`、`apps/workbench/src/tab-split-drop.ts`、`packages/design-system/src/styles/coss-controls.ts`、`tests/tab-split-drop.test.ts`、`DESIGN.md`、本 spec。

## 验收标准

1. 休息态：缝是 1px 线，不是 ≥5px 填色条；相邻栏之间可见空隙 8px ±2。
2. hover/拖拽：手柄在缝中点出现；整条 `.tab-sash` 背景仍透明。
3. 粗指针：手柄常显。
4. 拖动、键盘、双击均分仍可用。完成等级 3。
5. 样式不再出现 `.tab-sash:hover { background: var(--blue) }` 或 COSS 等价规则。
6. 聚焦栏 tab 条顶部不再画 `inset 0 2px var(--line-strong)` 灰线。

## 验证命令

```
npx pnpm --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/tab-split-drop.test.ts
```

4174 打开左右分屏，看细线、缝、中间手柄。

## 假设与开放问题

- 手柄用握持图标，不写 Figma 的英文 Resize。
- 4174 要重启才吃到新 dist。
