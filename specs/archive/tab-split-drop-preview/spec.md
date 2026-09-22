# 分屏拖拽预显与落点对齐

状态：已实现。完成等级 **3：功能可用**。不改用户库、不提交。

## 背景目标

把标签拖到栏的左 / 右 / 上 / 下边缘可以拆出新栏。预显必须画在松开后新栏会占据的位置和大小上：看见的就是释放后的真实格子，不能画成热区那条细带，也不能在已分栏后再拖时还按整屏一半来猜。

## 当前行为与问题证据

- `splitPane` 的 `ratio` 是 `0.5`，松开后新栏占**当时那一栏**的一半。
- 热区仍是内容区左右 22%、上下 24%。上一轮把预显也收成这条热区，看起来像四分之一，和真实二分对不上。
- 已有左右两栏时，复制再拆只占当前栏一半；若把源栏最后一张 move 到邻栏边缘，空源栏会关掉，新栏会撑成整屏一半。预显必须跟这套结果走。
- 单栏标签在 titlebar 时，预显不能再空出一截不存在的栏内标签高度。
- 命中相对整栏（含标签条）时，上/下预显会和内容区错位。

## 范围与非目标

做：

- 预显按 `splitPane` / `moveTab` 之后的真实布局，用 `[data-tab-panes][data-split-drop-preview]::after` 画在松开后焦点栏的位置上，包含源栏被关掉后撑满的结果。
- 只有指针落在热区里才出拆栏预显；中间是进栏，松手不拆。进栏时条上用标签空位预显顺序（`specs/archive/tab-reorder-preview/spec.md`），不再铺一层整栏蓝框。
- 热区仍相对内容区 `[data-tab-pane-body]`，22% / 24%；角落左右优先。

不做：

- 不改分栏后标签放 titlebar 还是栏内。
- 不改拆栏 copy/move、窄屏不分栏、默认 1:1 比例、最后一张在本栏 move-split 是 no-op。

## 使用场景

1. 拖到内容左侧热区：预显覆盖整栏左半，松手后新栏就在这块。
2. 指针在栏中间：不画拆栏蓝框；条上出现标签空位，松手只是进这一栏。
3. 已经左右分屏，**复制**拖到右栏左/右/上/下：预显是**这一栏**的一半，不是整块主屏的一半。
4. 已经左右分屏，**复制**拖到右栏下缘：变成三栏，右列上下各约原右栏一半，和预显一致。
5. 已经左右分屏，把左栏**最后一张** move 到右栏左缘：左栏关掉，预显是整屏左半，不是右栏内侧 1/4。
6. 已经左右分屏，把左栏最后一张 move 到右栏下缘：左栏关掉后变成上下两栏，预显是整屏下半。
7. 已经左右分屏，把左栏最后一张 move 到右栏中间：不拆；条上的空位在右栏，松手后左栏关掉。
8. 已经左右分屏，把左栏最后一张 move 到自己的左缘：原行为 no-op，预显覆盖当前这一栏。
9. 源栏还有别的标签时 move 到邻栏边缘：源栏留下，预显是邻栏被切开后的那一半。
10. 已经三栏后再复制拆右下栏左侧：预显仍是指针所在那一小格的一半。
11. 拖到左上角：按拆到左侧的半栏来画。

## 方案与关键决策

- `TAB_SPLIT_RATIO = 0.5` 与 `splitPane` 的 `ratio: .5` 同一事实。
- 热区 `--tab-split-edge-x/y` 只给不可见的 `data-tab-edge` 和 `dropTarget`。
- `focusedPaneBoxAfterDrop` 克隆当前 state，跑和松手同一套 `splitPane` / `moveTab`，再用 `layoutPaneBoxes` 把焦点栏写成 `--split-preview-*` 像素变量；框本身是 panes 上的 `::after`，避免进 flex/grid 子节点被拉满。
- `dropTarget` 仍用 `[data-tab-pane-body]` 算 22%/24%。
- `.tab-drop-edges` 铺在内容上；分栏时 `top: var(--tab-strip-h)`。

## 输入输出与依赖

输入：拖中的 `clientX/Y`、当前栏、是否按复制修饰键。输出：`data-drop-preview` 与 overlay 盒子。拆栏布局仍是 `ratio: .5`。

## 文件 / 模块边界

允许改：`apps/workbench/src/tab-split-drop.ts`、`apps/workbench/src/tab-workspace-ops.ts`、`apps/workbench/src/scripts/client/tab-workspace.ts`、`apps/workbench/src/styles/tab-workspace.ts`、相关测试、本 spec。不把 workbench 预显选择器放进 design-system。

## 验收标准

1. `splitDropEdge(0.1, 0.5) === "left"`，`splitDropEdge(0.4, 0.5) === null`，`splitDropEdge(0.1, 0.1) === "left"`。
2. `TAB_SPLIT_RATIO === 0.5`；预显盒子来自松开后焦点栏的百分比布局，不跟热区 22% 走。
3. 单栏拖到内容左侧 10%：`data-drop-preview=left`，预显宽度约为栏宽的一半。
4. 单栏拖到内容水平 40%：`data-drop-preview=center`，没有拆栏蓝框，松手不拆栏。
5. 复制拖到左缘拆开后，新栏宽度与拖时左半预显接近。
6. 已有左右两栏时，复制拖到右栏左/右/上/下：预显约是右栏的一半，左栏没有预显标记。
7. 已有左右两栏时，复制拖到右栏下缘：变成三栏，右列上下各约原右栏一半。
8. 已有左右两栏时，复制拖到右栏中间：不增加栏。
9. 已有左右两栏时，把左栏最后一张 move 到右栏左缘：预显约是整屏左半。
10. 已有左右两栏时，把左栏最后一张 move 到右栏下缘：预显约是整屏下半。
11. 已有左右两栏时，把左栏最后一张 move 到自己左缘：预显覆盖左栏（no-op）。
12. 三栏后再复制拆右下格左侧：预显约是那一格的一半。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 \
  tests/tab-split-drop.test.ts \
  tests/tab-split-drop-preview.e2e.test.ts
```

## 验收结果

- 通过：`pnpm --filter @molis-ai/molis-work-design-system --filter @molis-ai/molis-work-app-workbench build`
- 通过：`node --import tsx --test --test-concurrency=1 tests/tab-split-drop.test.ts tests/tab-split-drop-preview.e2e.test.ts`

## 假设与开放问题

- 热区保持 22%/24%，只决定会不会拆；预显画松开后的真实格子。
- 栏里只剩一张标签时，对本栏默认 move-split 不会拆（原行为）；要拆需复制修饰键或点边缘按钮。
- 源栏若还有 plugin 默认视图（`viewPlugin`）且没有标签，move 走空不会关栏；预显按留下的嵌套半栏来画。
- Chrome 合成 `DragEvent` 时 `altKey` 不可靠；e2e 用 `document.body.dataset.tabDragCopy` 作为 copy 缝，真实用户仍靠 Alt。
