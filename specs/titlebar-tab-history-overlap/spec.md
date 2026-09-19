# 标题栏标签不要盖住返回前进

## 背景目标
工作区第一枚标签「项目首页」会滑到标题栏 ← → 下面，看起来像被挡住。标签只能出现在历史按钮右侧的滚动条里。

## 当前行为与问题
- 标签多了之后，`scrollIntoView({ inline: "nearest" })` 把当前标签滚进视口，项目首页只剩图标露在 ← → 旁边。
- `.tab-item` 的布局盒仍伸进历史按钮区域；检查器选中项目首页时蓝框盖住箭头。
- 实测：`workspace-history` 在 294–354px，项目首页在 287–459px，重叠约 60px；`scrollLeft` 为 75。

## 范围与非目标
范围：标题栏 tab strip 的滚动方式和历史按钮的层叠/裁切。
非目标：不改历史栈语义、标签开合、分屏、钉住规则。

## 使用场景
打开多个工作区标签后再点项目首页：整枚标签出现在 ← → 右侧，箭头上点不到标签。

## 方案与关键决策
- 用滚动容器把目标标签完整收进 `.tab-scroll`，不再对标签调用 `scrollIntoView`。
- 若滚动后左侧还剩半枚标签，继续对齐：能完整露出就露出，否则整枚滚出滚动区；滚不动时在滚动区末端加空隙，避免「项目首页」只剩图标贴在 ← → 旁边。
- 历史按钮用标题栏底色并压在上层，滚动区 `overflow-clip-margin: 0`，避免标签画到箭头上。

## 输入输出与依赖
输入：现有标题栏 DOM（chrome、history、tab-scroll）。
输出：标签与 ← → 无命中重叠；当前标签完整落在滚动区内。
依赖：`tab-workspace.ts`、`immersive-navigation.ts`。

## 文件 / 模块边界
允许：workbench 标题栏样式与 tab 滚动脚本、对应 e2e。
禁止：改插件路由、历史记录内容。

## 验收标准
1. 项目首页为当前标签时，其左缘不小于历史按钮右缘，也不小于 `.tab-scroll` 左缘。
2. 在 ← → 中心 `elementFromPoint` 命中历史按钮，不命中 `.tab-item`。
3. 多个标签后点项目首页，整枚标签回到滚动区内。
4. 任意标签的布局盒不与 `.workspace-history` 相交；滚动区左缘不允许半枚标签。

## 验证命令
- `pnpm --filter @molis-ai/molis-work-app-workbench build`
- `node --import tsx --test --test-concurrency=1 tests/workbench-tab-workspace.e2e.test.ts`
- 浏览器：多标签后看 ← → 与项目首页；点项目首页应完整露出。

## 假设与开放问题
非当前标签仍可能在滚动区左缘被裁切，这是标签条的正常行为；不允许画到箭头上。
