# Goals 舞台列表：单行对齐列

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件改写 `specs/goals-parallel-views/spec.md` 里「列表行拉宽露出字段」的行内排列，不改三视图切换或 Frame 合同。

## 背景目标

内容区列表已经铺满舞台，但行还是目录树那套：子 Goal 整行缩进，状态/进度/前置挤在同一段可换行 meta 里。扫一眼时，同行字段对不齐，长标题和「1 个前置 / 1 个未完成」还会折行。

## 当前行为与问题证据

- `.tree-children` 用左边距 + 竖线缩进整行，子行的「待开始」和父行不在同一条竖线上。
- `.tree-meta-line` `max-width: 42%`；前置 `summary` 里 `strong` + `em` 各占一块，窄了就上下叠。
- `.tree-entry` 是 flex，缺进度或缺前置时后面的格子会往左塌。
- 实测：选中的前置入口 `height: 30`，文案两行；行高合同是 28px 单行。

## 范围与非目标

做：

- 舞台列表每一行固定 28px，标题/状态/进度/前置都不换行；标题过长省略。
- 行是四列：标题簇（含层级缩进和折叠）| 状态 | 子进度 | 前置。后三列宽度固定，父子行对齐。
- 只有标题簇随 `part_of` 深度缩进；不再用 `.tree-children` 左边距推动整行。
- 编号列始终占位：有 `V1` 这类短码的行显示它，没有的行留空，不把子标题拽到父标题左边。标题永远走编号右边的 `1fr` 列，不能掉进 4.5ch 编号格被省略成一两个字。
- 每一层标题比上一层往右 16px；父更靠左、子更靠右。状态/进度/前置列仍跨层对齐。
- 没有子项或没有前置时仍占住格子，不让后面的列搬家。
- 前置入口收成一条 nowrap 文案（`3 个前置 · 1 个阻塞`）；展开后的依赖名单用浮层，不撑高这一行。
- 可重建 demo 至少有 4 层 `part_of`（根 → 子 → 孙 → 曾孙），用来看多层缩进。不改用户项目。

不做：不改 Goal 关系语义、筛选、创建、画布/看板、目录栏去留、MCP。

## 使用场景

1. 打开 Goals 列表：父行和子行的状态、进度、前置左边缘各自对齐；子 Goal 标题比它的父 Goal 更靠右。
2. 长标题被省略，行高仍是 28px；完整标题在 `title`。
3. 点前置入口展开依赖名单，这一行高度不变。
4. demo 打开列表能看到至少四层缩进，不需要手工造树。

## 方案

- `plugins/native/goals/src/tree-ui.ts`：行结构改成 leading + 状态 + 进度 + 前置；写入 `--tree-depth`；每行都有 `.tree-ref`；前置 summary 合成一条 copy。
- `apps/workbench/src/styles/goal-canvas.ts`：舞台列表用 grid 列；`.tree-leading` 按 `(depth + 1) * 16px` 只缩进标题簇，让根 Goal 相对分类标题再缩一档（见 `specs/goal-list-collection-indent/spec.md`）。
- `apps/local-host/src/demo-seed.ts`：在 WEB 下再挂两层子 Goal。
- 测试：源码行结构与 depth=2；e2e 量 28px、nowrap、跨层状态列对齐、标题 left 随 depth 增加。

## 验收

1. `[data-goal-stage-list] .tree-entry` 高度 28px；标题、状态、进度、前置 `white-space: nowrap`。
2. 同一棵当前树里，所有 `.directory-row-state` 左边缘一致（允许 1px 误差）。
3. 同一棵当前树里，`strong` 标题 left ≈ 根标题 left + depth × 16px（允许 2px 误差）；没有短码的子行不得比带 `V1` 的父行更靠左。
4. 有前置的 summary 是单行；点开后行高仍 28px。
5. 新建 demo 含 `WEB-SCAN` → `WEB-SCAN-ROW`，列表能渲到 `data-tree-depth="4"`。
6. 中英文、深浅色可阅读。完成等级 3。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts tests/goals-kanban-ui.test.ts tests/immersive-directory.e2e.test.ts
```
