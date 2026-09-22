# Task 插件：真正工作台，从 Goals 剥离 Frame

状态：已取代。产品撤回独立 Task 对象；见 `specs/archive/remove-task-plugin/spec.md`。下文只作历史记录。

本文件曾是这次行为变更的唯一需求书。它曾取代：

- `PRODUCT.md` 里「叶子 Goal 和 Task 是同一真相节点」；
- `specs/workbench-frame-container/spec.md` 里「Frame 不进左目录、只按 Goal 绑定、不能当插件点」；
- 工作台里「点 Goal 目录项 = 在 Goals 组打开 Goal Frame」。

Goal 关系画布、看板、记录页仍归 Goals。Session / Feed / Inbox / Artifact 领域事实不变。MCP / Goal 事件协议不动。

## 背景与目标

Goal Frame 现在挂在 Goals 插件里：点一条 Goal 就开一块按 `goal_id` 记构图的画布，Session、Feed、Inbox、交付物只是引用。Goals 同时还要管树、关系画布、看板和记录页。用户把 Frame 重新定义为 **Task**：它不是 Goal，是真正干活的工作台。

目标：Task 成为一等内置插件。可以没有 Goal 就创建。Goals 只负责目标展示与管理。打开 Goal 仍然能进到它关联的那条 Task。

## 当前行为与问题证据

- `apps/workbench/src/goals-page-renderer.ts` 把 `data-goal-frame-surface` 和 Goal 画布画在同一页。
- `tab-workspace.ts`：`plugin === "goals" && kind === "item"` 且不是 `goalView=work` 时打开 Frame。
- `frame-container.ts` 用 `goal_id` 当钥匙，构图在 `localStorage`。
- 左目录没有 Task 段；`BUILTIN_PROJECT_PLUGIN_IDS` 没有 `task`。
- 产品合同仍写叶子 Goal 和 Task 是同一节点。

## 范围与非目标

### 做

- 新 Module `modules/task`：Task 身份、可选 Goal 关联、Frame 构图；项目库 SQLite 为权威。
- 新 Native Plugin `plugins/native/task`：目录、母页、Frame 工作面、HTTP。
- 内置插件 id `task`。新项目默认启用 `goals` + `task`。已有带 Goals 的项目迁入时补上 Task。
- 左目录增加 Task 段；右边是 Task 组（母标签「全部」，item 是一条 Task）。
- 点 Goal 目录项：复用或创建该 Goal 的关联 Task，在 **Task 组**打开工作台，不再在 Goals 组开 Frame。
- 目录可直接新建不挂 Goal 的 Task。
- 一条 Goal 最多关联一条 Task；Task 可以 `goal_id = null`。
- 删 Goal 不删 Task，只断开关联（库层 `ON DELETE SET NULL`）。
- 旧 `localStorage` 里按 Goal 存的 Frame 构图，第一次打开对应 Task 时写入该 Task。
- 表面主标记 `data-task-frame-surface`；过渡期同一节点保留 `data-goal-frame-surface` 和 `data-frame-goal`（有关联时），避免无意义改所有截图选择器。

### 不做

- 不把 Goal 记录页 / 时间线 / 终端工作框搬进 Task。
- 不改 MCP、Goal 事件、Claim/Run。
- 不做 Goal–Task 多对多。
- 不把 Task 做成市场可卸载项。
- 不在本期做 Task 归档工作流、指派、截止日期。
- 不发布、不改用户真实库做演示。

## 使用场景

1. 新项目：左边有 Goals 和 Task。点 Task → 母标签「全部」，空态让你新建。点「新建 Task」得到一条没有 Goal 的工作台，能从目录拖 Session / Feed / Inbox / 交付物。
2. 点 Goals 树里的 CORE：若还没有关联 Task，创建一条标题拷自该 Goal 的 Task 并打开；再点一次复用同一条。Goals 组仍停在画布母标签，不出现 Goal item Tab。
3. Task 顶栏：有 Goal 时显示 Goal 标题/状态/结果，以及「打开工作区」「在关系画布中定位」。没有 Goal 时只显示 Task 标题，这两个 Goal 入口隐藏。
4. 关掉 Task 标签：Task 还在目录里。刷新后构图还在（项目库，不只是本机 localStorage）。
5. 已有项目打开：带 Goals 的项目自动出现 Task 段。以前某个 Goal Frame 里摆过的块，第一次打开该 Goal 对应 Task 时还在。

## 方案与关键决策

1. **Task 是独立对象。** 身份 `task_id`。可选 `goal_id`。同一项目同一 Goal 最多一条 Task（部分唯一索引）。
2. **Goals 不再拥有 Frame。** 画布/看板/树/记录页留下。Frame HTML 与构图读写归 Task 插件。
3. **点 Goal = 打开关联 Task。** 不是在 Goals 组再开一张 item。Goal 深链 / `goalView=work` 仍进记录页。
4. **构图进项目库。** `frame_json` 存在 Task 行上。客户端防抖写入；localStorage 只作打开前的迁移源和瞬时缓存。
5. **目录顺序：** Goals → Task → Sessions → Inbox → Feed → Artifacts。Task 图标用已有 `list`。组颜色单独一条，不和 Goals 撞。
6. **Feed「来源任务」名字不改。** 本插件界面标签用英文 **Task**，避免和来源同步任务混谈。

## 输入输出与依赖

- 输入：当前项目、可选 Goal、目录可拖资产、旧 Frame localStorage。
- 输出：Task 记录与构图、目录/标签/Frame 表面、`GET/POST /api/tasks*`。
- 依赖：Goals 只读标题/状态/结果供 Task 顶栏；资产插件继续提供可拖引用。
- Host 装配 Module 与 HTTP；Workbench 只组合 UI。

## 文件 / 模块边界

允许改：

- `packages/contracts/src/modules/task.ts` 与 projects 内置插件列表
- `modules/task/**`、`plugins/native/task/**`
- `modules/projects` 的 plugin CHECK / 新项目默认插件 / catalog 迁移
- `apps/local-host` 项目库迁移、HTTP、WebView
- `apps/workbench` 目录、标签、Frame 容器、Goal 点击入口
- `PRODUCT.md`、`docs/modules`、`docs/SSOT-MATRIX.md`、本 spec 指向的测试

不改：Goal 事件协议、Feed/Inbox/Session 写入语义、官方 Integration。

## 数据

```
tasks (
  task_id TEXT PK,
  board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal_id TEXT REFERENCES goals(goal_id) ON DELETE SET NULL,
  frame_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
UNIQUE (board_id, goal_id) WHERE goal_id IS NOT NULL
```

`frame_json` 与现有 Frame 本地结构一致：`{ camera, blocks, expanded }`。

HTTP（项目前缀下）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/tasks` | 列出当前项目 Task |
| POST | `/api/tasks` | 创建；`title` 必填，`goal_id` 可选 |
| POST | `/api/tasks/open-for-goal` | 按 Goal 复用或创建 |
| PATCH | `/api/tasks/:id` | 改标题或关联 |
| PUT | `/api/tasks/:id/frame` | 保存构图 |

## 验收

1. 无 Goal 可创建 Task；目录出现该行；打开后是 Frame 工作台，顶栏没有 Goal 定位/工作区按钮。
2. 点 Goal 打开或创建唯一关联 Task；再点同一 Goal 复用；Goals 组不因此多一张 Goal item Tab。
3. Task 标签在 Task 组；母标签文案是「全部」。
4. 拖入的引用仍只是引用；关标签不删 Session。
5. 刷新后构图从项目库恢复。
6. 新项目插件列表为 `goals` + `task`。带 Goals 的旧项目迁入后有 `task`。
7. Goal 画布/看板/记录页仍可用。

## 验证

```bash
pnpm --filter @molis-ai/molis-work-contracts build
pnpm --filter @molis-ai/molis-work-module-task build
pnpm --filter @molis-ai/molis-work-plugin-task build
pnpm exec tsx --test --test-concurrency=1 \
  tests/task-module.test.ts \
  tests/task-native-plugin.test.ts \
  tests/project-plugins.test.ts \
  tests/desktop-tui.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts
```

浏览器（若本轮能开）：新项目 → 新建无 Goal 的 Task → 拖一块内容 → 再从 Goal 打开关联 Task → 刷新仍在。

## 假设与开放问题

- 本期不提供 Task 删除 UI；库层可删，产品入口 later。
- Goal 标题事后改名不自动改 Task 标题。
- 分栏里同一 Task 仍可两栏打开，沿用现 tab-workspace 合同。
- 旧 Goals item Tab 的本地标签状态：打开项目时若仍是 `plugin=goals` 的 Frame item，按 `itemId` 当 Goal 去 open-for-goal，改写成 Task 标签。
