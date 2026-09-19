# 拖标签时实时让位

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

把一张工作区标签在条上拖来拖去时，其它标签要马上让出落点，动效跟着手走。看见的顺序就是松开后的顺序，不要等松手才跳。

## 当前行为与问题证据

- `moveTab` 只在 `drop` 时改 state，`dragover` 只给分栏画半栏框，条上的标签原地不动。
- 指针在栏中间时，整栏还盖着一层拆栏用的蓝框，看不出会插到哪两张之间。
- 参考：Chrome / VS Code 的标签重排——被拖的那张跟着指针，其余标签滑过去腾出空位。

## 范围与非目标

做：

- 拖在标签条上（或栏中间、表示进这一栏）时，按即将执行的 `moveTab` 在落点画一个等宽空位，其它标签用 FLIP 滑过去。
- Move：源标签从条上收起（浏览器拖影仍跟着指针）。Copy（Alt/Option）：源标签留着，只在落点多一个空位。
- 拖到左/右/上/下拆栏热区时，空位收掉，仍用现有半栏预显。
- `prefers-reduced-motion: reduce` 时空位仍出现，但不做位移。

不做：

- 不改 `moveTab` / `splitPane` 的落点规则、分组 gather、钉选顺序。
- 不改分栏后标签在 titlebar 还是栏内。
- 不把半栏预显做成标签让位。

## 使用场景

1. 条上有首页和一张 Goal。把首页拖到 Goal 左半：Goal 滑开，空位出现在 Goal 前面。
2. 继续拖到 Goal 右半：空位滑到 Goal 后面。
3. 按住 Alt 复制：首页还在原位，落点多一个空位。
4. 拖到内容区左缘：空位消失，出现左半栏预显。
5. 松手或 Esc/`dragend`：空位和源标签收起样式都清掉，真正的 `apply()` 才改 DOM。

## 方案与关键决策

- 预显顺序用克隆 state 跑同一套 `moveTab`，和拆栏预显同一原则：看见的就是释放后的结果。
- 不在拖的过程中 `apply()`，也不把被拖节点挪出文档（会掐断 HTML5 drag）。源标签 `position: absolute` 抽离 flex；空位是 `[data-tab-reorder-slot]`。
- 位移只做 `translateX` FLIP（190ms / `--ease-out`），不动画 width。空位用身份色 10% 洗底，不用拆栏那道蓝框。

## 输入输出与依赖

输入：现有 `dropTarget` 的 `paneId` / `beforeId` / `edge` 与 copy。输出：条上的空位与位移。无新持久化。

## 文件 / 模块边界

允许改：`apps/workbench/src/tab-reorder.ts`、`scripts/client/tab-workspace.ts`、`styles/tab-workspace.ts`、`styles/linear-density.ts`（空位高度跟上标签）、`specs/tab-split-drop-preview/spec.md` 里「栏中间铺满」的句子、`DESIGN.md` / surface 一句、相关测试、本 spec。

## 验收标准

1. 拖在条上时存在 `[data-tab-reorder-slot]`，宽度等于被拖标签在 `dragstart` 时的宽度，位置对得上 `moveTab` 之后那张的下标。
2. Move 时源标签带 `is-tab-drag-source` 且不占 flex 宽；Copy 时不带这个 class。
3. 拖到拆栏热区时没有空位，仍有 `[data-split-drop-preview]`。
4. 栏中间不再画整栏蓝框。
5. reduced-motion 下空位仍在，factory 里 FLIP 时长为 0。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/tab-reorder.test.ts \
  tests/tab-split-drop.test.ts \
  tests/tab-reorder-preview.e2e.test.ts \
  tests/tab-split-drop-preview.e2e.test.ts
```

## 验收结果

- 通过：`pnpm --filter @molis-ai/molis-work-app-workbench build`；`tests/tab-reorder.test.ts`、`tests/tab-split-drop.test.ts`、`tests/tab-reorder-preview.e2e.test.ts`、`tests/tab-split-drop-preview.e2e.test.ts` 共 11 项。
- 单栏 titlebar 拖 Goal 到 Home 左半：源标签 `is-tab-drag-source`，空位在 Home 前、宽度等于 `--tab-reorder-width`，无半栏框。
- 拆栏热区：空位消失，仍有 `[data-split-drop-preview]`。栏中间不再铺整栏蓝框。
- 未运行：真实指针拖拽的观感（e2e 开了 reduced-motion，FLIP 时长为 0）。

## 假设与开放问题

- 分组在松手时仍会 `gatherGroup`；预显按 `moveTab` 后的 id 序插空位，不在拖的过程中把别的标签搬进别的 group 容器。
