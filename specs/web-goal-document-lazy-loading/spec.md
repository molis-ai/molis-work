# Goal 文档按需加载与搜索性能修复

## 背景与目标

4173 的项目页把当前集合中每个 Goal 的完整正文、历史与维护表单同时输出到 HTML，并只用 `hidden` 隐藏未选中的文档。当前项目约 60 个 Goal 时，实测首屏包含约 104,115 个 DOM 元素、230 个 `article`、59 个隐藏正文和 7,487,222 个 HTML 字符。树搜索过滤本身很轻，但点击输入框、逐字输入和浏览器绘制会与这棵超大 DOM 及每 4 秒全量同步争用。

目标是保留高密度 Goal Tree 和完整单 Goal 工作台，同时让浏览器在任何时刻只持有当前选中的一份 Goal 文档。

## 当前行为和问题证据

- `renderMolisWorkWeb` 对 `visibleGoals` 执行 `map(renderGoalDocument)`，所有正文与表单进入 DOM。
- `#molis-work-data` 内嵌完整 `MolisWorkWebView`，重复携带全部 Goal 的历史和执行事实。
- `refreshBoard` 每 4 秒请求约 2.7MB 的 `/api/board`；事件游标变化后又请求并解析整页。
- `applySelection` 依赖预渲染文档，只在多个 `[data-goal-view]` 之间切换 `hidden`。

## 范围

- 初始 Goal、归档和回收站页面只渲染当前选中的一份文档。
- 内嵌浏览器状态只保留树导航和同步需要的轻量 Goal 摘要。
- 树节点切换通过项目作用域 API 按需取得单份 HTML fragment，并原子替换当前文档。
- 自动同步先请求轻量事件游标；只有游标变化时才刷新当前页面所需的树、单份正文、对话框选项和计数。
- 搜索聚焦、输入和输入法组合期间延后并合并后台同步；停止输入后恢复同步。
- 项目详情页只保留顶导中的搜索、新建、归档、回收站与状态筛选；移除左侧列表重复的 Goal Tree 标题、搜索和同类按钮。
- 项目选择页与项目详情页使用相同的 58px 顶导高度、品牌尺寸和垂直对齐。
- 保留树搜索、状态筛选、稳定 URL、前进后退、移动端切换、回收站、归档及所有委托表单行为。

## 非目标

- 不改 SQLite、Coordinator 或 Goal Contract 语义。
- 不引入前端框架、虚拟列表或新的客户端状态系统。
- 不删除现有 `/api/board` 完整读取接口。
- 不改变视觉层级、文案或表单字段。
- 不删除 Goal Tree 本身、状态计数、列表底部摘要或移动端 Tree / 正文切换。

## 方案与关键决策

1. 服务端继续用同一 `MolisWorkWebView` 和同一文档 renderer，新增单 Goal fragment 输出，避免页面与按需接口形成两套渲染逻辑。
2. 页面只输出 `selected` 文档；空集合继续输出现有空状态。
3. `molis-work-data` 改为轻量结构：事件游标、项目/Board 身份、当前聚焦 ID，以及当前/归档/回收站集合的 `goal_id`、标题和状态。
4. 新增只读 `GET /api/board/cursor`，直接读取事件游标，不构建或传输完整 Board View。
5. 新增只读 `GET /api/goals/:goal_id/document?view=current|archive|trash`，从同一 Web View 选择并渲染一份 `<article>`；错误集合返回 404。
6. 客户端切换使用请求序号丢弃过期响应；加载失败保留原文档、恢复原选中项并给出错误提示。
7. 自动同步仍以服务端完整页面作为权威补丁来源，但该页面只含一份正文和轻量状态。搜索输入后的 900ms 内以及 IME 组合期间不启动后台同步，只保留一个延后任务。

## 输入、输出与依赖

- 输入：当前项目路由、Goal ID、页面集合类型、Board 事件游标。
- 输出：轻量 cursor JSON、单 Goal HTML fragment、只含一份正文的完整页面。
- 依赖：`SqliteMolisWorkStore.eventCursor`、`buildMolisWorkWebView`、现有 renderer 与事件委托表单。

## 文件与模块边界

- `src/web/render.ts`：单文档渲染出口、轻量客户端状态、按需加载与同步协调。
- `src/web/server.ts`：cursor 与单文档只读路由；不复制领域规则。
- `tests/web.test.ts`：单文档 HTML、API、同步脚本和现有交互回归。
- `DESIGN.md`：补充“正文按需加载、搜索优先于后台同步”的已交付行为。

## 验收标准

1. 约 60 个 Goal 的初始项目页只有一个 `[data-goal-view]`，不存在隐藏的其他 Goal 正文或表单。
2. 实际 4173 页面 DOM 元素和 HTML 体积相对基线显著下降，目标至少下降 70%。
3. 点击任意树节点会加载并显示正确完整文档，更新选中态、标题和稳定 URL；快速连续点击不会显示过期响应。
4. 浏览器前进/后退可恢复对应 Goal 文档。
5. 4 秒轮询只传输轻量 cursor；游标变化才请求当前页面，且搜索输入/IME 期间同步被延后并合并。
6. 搜索框点击和逐字输入无明显卡顿，树过滤即时更新。
7. 当前、归档、回收站三种集合均只渲染一份正文，删除/恢复/归档与所有现有表单保持可用。
8. 项目详情页只有顶导的一套搜索、新建、归档与回收站操作；状态筛选由顶导打开并继续支持多选、清除、关键词组合和 Escape 关闭。
9. 项目选择页与项目详情页的桌面顶导计算高度均为 58px，窄屏均为 52px；品牌图标、名称和正文起始基线一致。
10. `pnpm typecheck`、定向 Web 测试、完整测试和 Impeccable detector 通过。

## 验证命令与步骤

- `pnpm typecheck`
- `node --import tsx --test tests/web.test.ts`
- `pnpm test`
- `node /Users/yijunwang/.agents/skills/impeccable/scripts/detect.mjs --json src/web/render.ts src/web/server.ts`
- 在 4173 实测初始 DOM/HTML、顶导高度、唯一操作入口、状态筛选、搜索逐字输入、Goal 切换、前进后退、回收站与网络轮询。

## 假设与开放问题

- 当前 Tree 约 60 项，不需要虚拟滚动；最大问题是完整正文和表单重复渲染。
- `/api/board` 保持兼容供测试和外部读取使用；页面轮询迁移到 cursor 接口。
- 若服务端在 Goal 切换期间删除或移动该 Goal，客户端保留当前文档并在下一次权威刷新时转到可用集合，而不是静默显示错误集合。
