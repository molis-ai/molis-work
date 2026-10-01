# GoalTree 展开父节点自动紧凑

> 归档（2026-10-01，合入后梳理）：判定为**已被取代**。src/web/render.ts 已删除，Goal 树由 Goals 插件重做。没有剩余事项。

完成等级：3（功能可用）

## 背景与目标

桌面 GoalTree 的父节点在折叠时允许标题自然换行，并显示子 Goal 完成进度；这是折叠状态下理解隐藏内容所需要的信息。节点展开后，子 Goal 已经直接可见，但父节点仍保留原来的多行标题与进度行，导致深层 GoalTree 被重复摘要撑高、阅读节奏松散。

本任务让父节点在展开后自动收紧为单行标题高度，并在再次折叠时恢复完整标题和进度摘要。

## 当前行为与问题证据

- `src/web/render.ts` 的展开交互只切换 `.tree-item.is-collapsed`，没有缓存或重设固定高度。
- `src/web/visual-foundation.ts` 只用该状态隐藏 `.tree-children` 和旋转箭头；标题始终 `white-space: normal`，父节点进度始终占据第二行。
- 因此这不是动画残留或测量缓存，而是展开态缺少独立布局规则。

## 范围

- 桌面 Goals 目录中，拥有直接子树且处于展开状态的父节点标题收紧为一行，过长内容使用省略号，完整标题继续由现有 `title` 提示保留。
- 展开父节点隐藏“已完成子项比例”摘要，因为子项已经可见；折叠后恢复该摘要。
- 没有前置依赖的展开父节点移除空的第二行，使节点高度随内容重新计算。
- 若父节点同时有前置依赖，依赖入口继续可见，不为了追求单行高度隐藏执行门禁信息。
- 补充真实浏览器布局测试，覆盖折叠 → 展开 → 再折叠的可逆状态。

## 非目标

- 不修改 GoalTree 数据、排序、层级、筛选、选择或状态持久化。
- 不改变叶子 Goal 的多行标题、前置依赖或状态展示。
- 不改变移动端目录、Goal 正文、推进态势和全局密度设置。
- 不引入 JavaScript 高度测量、固定像素缓存或展开动画。

## 方案与模块边界

- `src/web/visual-foundation.ts`：基于已有 `.is-collapsed` 与直接 `.tree-children` 结构定义展开父节点布局；浏览器每次状态切换后由 CSS 自动重排。
- `tests/web.test.ts`：在现有 Headless Chrome GoalTree 布局夹具中测量同一父节点折叠和展开后的行数、高度及进度可见性。
- `tests/visual-foundation.test.ts`：锁定展开父节点只影响直接父行、保留依赖元信息的样式契约。

## 验收标准

- [x] 折叠父节点的长标题可显示多行，子项进度可见。
- [x] 展开同一父节点后标题为一行，节点高度小于折叠态，子项进度不再重复显示。
- [x] 再次折叠后多行标题和子项进度恢复，不出现残留固定高度。
- [x] 叶子 Goal 的长标题行为不变；父节点的前置依赖仍然可见。
- [x] 定向测试、受影响文件类型检查、差异检查及真实界面检查通过；不能通过的全量检查明确说明原因。

## 验证

- `node --import tsx --test --test-name-pattern="Goal Tree" tests/web.test.ts`
- `node --import tsx --test tests/visual-foundation.test.ts`
- 受影响文件 TypeScript 检查。
- `git diff --check`
- 真实桌面 GoalTree 检查：长标题父节点折叠、展开、再折叠；有无前置依赖；深层子树。

## 假设与开放问题

- “自动 compact”理解为只收紧已经展开的父节点；折叠节点继续提供更完整的隐藏子树摘要。
- 前置依赖属于执行门禁信息，优先级高于强制单行高度，因此展开父节点若存在依赖入口仍允许保留元信息行。

## 验证结果

- Headless Chrome 布局回归：GoalTree 分栏宽度、叶子长标题不裁切、父节点自动紧凑 3 / 3 通过。
- 新增样式契约测试：1 / 1 通过。
- 本次修改的 `src/web/visual-foundation.ts` 独立严格 TypeScript 检查：通过；测试文件已由 `tsx` 实际执行。
- Impeccable layout detector：0 项发现。
- Footballnia 真实数据：目标「让团队对 Footballnia 的核心体验与完整边界形成同一理解」折叠时标题 3 行、行高约 73.8px、进度可见；展开时标题 1 行、行高 30px、进度隐藏；再次切换结果可逆。
- 同时拥有子树和 64 个前置依赖的父节点：展开标题保持单行，子项进度隐藏，前置依赖入口仍显示。
- 完整 `tests/visual-foundation.test.ts` 当前还有 4 个与本任务无关的既有失败，分别来自工作区内尚未收口的颜色 token、工作区宽度、关系图 Goal ID 样式契约；本任务新增用例通过且未修改这些区域。
- 全量 `pnpm typecheck` / `pnpm build` 未作为本任务通过证据：当前工作区内另有未完成的跨模块改动；最近一次扩大到 Web 渲染依赖图的检查被 `src/web/project-session-workspaces.ts` 的参数数量与缺失 `renderWorkspaceSurface` 错误阻塞。
