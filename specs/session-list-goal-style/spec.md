# Sessions 列表对齐 Goal 行样式

完成等级：3 · 功能可用

## 背景目标

左侧 Sessions 列表现在是偏卡片的两行条目：标题、Runtime、时间和「可查看」挤在一起，和 Goals 的单行树不一致。把它改成 Goal 同一套行语法。

## 当前行为与问题证据

Goals 行：`tree-row` + `tree-entry`，单行约 32px，左标题截断，右侧 `goal-status` 胶囊。

Sessions 行：`project-record-row`，桌面 `min-height: 92px`，沉浸式约 76px；标题、Runtime、时间分两行，状态像操作文字。

## 范围与非目标

做：只改 Sessions 目录行的 HTML/CSS 和选中/筛选所需的 data 属性；状态仍是「可查看 / 已归档」，做成与 Goal 相同的状态胶囊。

不做：不把 Session 按 Goal 编成树；不改详情、筛选语义、添加/归档 API；不改 Feed 列表。

## 方案

行结构复用 Goal：`tree-item` / `tree-row` / `tree-guide` / `tree-entry` / `tree-node` / `directory-row-state` + `goal-status`。没有子节点，用 `tree-guide` 占位，标题列与 Goals 对齐。整行可点选，详情仍按现有 `data-operation-select` 打开。

## 验收

- Sessions 行是单行：标题在左且 `nowrap` 截断，右侧是状态胶囊，不再出现第二行时间或「查看」操作。
- 沉浸式工作台里 Sessions 行高与 Goals 行一致（32px）。
- 点击行、键盘上下、Runtime/状态筛选、打开详情仍可用。
