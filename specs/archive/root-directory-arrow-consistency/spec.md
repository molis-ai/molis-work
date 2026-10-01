# 项目根目录入口尾部样式一致性

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。项目根目录列表已由 craft-finish 统一底栏取代。没有剩余事项。

## 背景与目标

项目根目录列表中的 `Goals` 以右箭头表达“进入下一层”，而 `Inbox`、`Sessions`、`工作目录`、`Feed`、`来源` 在相同位置显示数量。整行实际都是可进入的导航入口，尾部语义和视觉表现不一致。

本任务达到 Level 3「功能可用」：所有可进入模块统一使用与 `Goals` 相同的右箭头，并保持现有导航行为不变。

## 当前行为与问题证据

- `Goals` 的尾部由 `chevron-right` 图标渲染。
- `Inbox`、`Sessions`、`工作目录`、`Feed`、`来源` 的尾部由数字 `<em>` 渲染。
- 同一层级、同一交互类型的入口因此呈现两套尾部语义。

## 范围

- 将 `Inbox`、`Sessions`、`工作目录`、`Feed`、`来源` 的数字尾部替换为 `chevron-right`。
- 保留 `Goals` 现有箭头和副标题中的 Goal 数量。
- 保留各模块详情页、目录页中的数量信息。
- 保留 `Promotion` 与 `可视化工作区` 的“规划中”标签；它们不是本次可进入目录入口的同类状态。

## 非目标

- 不修改列表标题、副标题、图标、排序、点击行为或当前项样式。
- 不重做项目根目录布局或响应式结构。
- 不调整模块内部的计数展示。

## 方案与模块边界

- `src/web/render.ts`：统一 `Inbox`、`Feed`、`来源` 的尾部图标，并删除仅用于这些尾部数字的计数计算。
- `src/web/project-session-workspaces.ts`：统一 `Sessions`、`工作目录` 的尾部图标。
- `tests/web.test.ts`、`tests/session-web.test.ts`、`tests/desktop-tui.test.ts`：补充根目录尾部语义的回归断言。

## 验收标准

1. `Inbox`、`Goals`、`Sessions`、`工作目录`、`Feed`、`来源` 的最后一个视觉元素均为 `chevron-right` 图标。
2. 上述六个入口不再以数字 `<em>` 作为尾部元素。
3. `Promotion` 与 `可视化工作区` 仍显示“规划中”。
4. 所有入口的导航目标、`aria-current` 与选中状态保持不变。
5. 桌面和窄屏下箭头右对齐，列表无横向溢出。

## 验证

- `./node_modules/.bin/tsc --noEmit -p tsconfig.json`
- `node --import tsx --test tests/web.test.ts tests/session-web.test.ts tests/desktop-tui.test.ts`
- Impeccable layout detector 检查相关文件。
- 本地启动后检查桌面与窄屏项目根目录列表。

## 假设与开放问题

- 用户所说“都改成 goal 这样”指统一尾部进入箭头，而不是把副标题或模块内容改成 Goals 的形式。
- 当前没有阻塞实现的开放问题。
