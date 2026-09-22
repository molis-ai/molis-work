# Goals 目录：新建行 + 归档/回收站百叶窗

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户真实库、不提交、不发布。

本文件是这次目录工具栏与列表挂载的唯一需求书。它改写：

- `specs/archive/directory-title-toolbar/spec.md` 里 Goals 工具栏仍是一排图标（筛/建/归档/回收站）；
- `specs/archive/chrome-plugin-rail/spec.md` 里「Goals 列表语法不改」。

`/archive`、`/trash` 文档路由、移入归档/回收站、恢复，以及点 Goal 行打开 GoalFrame，仍走既有合同。

## 背景目标

Goals 目录工具栏现在是一排小图标：筛选、新建、归档、回收站。归档和回收站会把整列列表换成另一个集合，当前树看不见。新建只剩 `+`，要靠 tooltip 才知道是创建。

目标：工具栏变成「横向新建 + 右侧筛选」；归档和回收站落到当前树下面，做成可开可合的百叶窗段。完成等级 **3：功能可用**。

## 当前行为与问题证据

- `renderTreeChrome` 把筛选、`data-open-create`、`data-archive-link`、`data-trash-link` 做在同一行图标里。
- 点归档/回收站走 `/archive`、`/trash`，`buildGoalCollectionModel` 用其中一个集合替换整棵树。
- 沉浸式目录把 `.tree-tool > span` 藏掉，新建只显示加号。

## 范围与非目标

做：

- 工具栏一行：左侧横向「新建 Goal」（仍 `data-open-create`，浅色白底灰边），右侧同样风格的筛选图标和原状态筛选面板。外观见 `specs/archive/goals-directory-outline-buttons/spec.md`。
- 当前 Goal 树也是百叶窗段，默认展开；见 `specs/archive/goals-directory-current-fold/spec.md`。
- 树下两段百叶窗：归档、回收站。段头是全宽细条（caret、名称、数量），默认收起；展开后仍是现有 Goal 行。空段保留段头，展开后一句空文案。
- 打开状态按项目记在现有 `data-persist-open` 披露里。当前 URL 或选中项属于该集合时，该段打开。
- 状态筛选只作用于当前树，不把归档/回收站行滤掉。

不做：

- 不删 `/archive`、`/trash` 和 Goal 文档集合路由。
- 不改移入/恢复、确认框、MCP。
- 不改点目录 Goal 行打开 GoalFrame 的合同。
- 不把归档/回收站混进当前树或看板。

## 使用场景

1. 打开 Goals：看到「新建 Goal」横条和右侧漏斗；下面是展开的「当前」段和树；再下面是收着的「归档」「回收站」。
2. 点新建：仍打开现有创建面板。
3. 点筛选：面板仍从该行弹出，只筛当前树。
4. 拉开归档：当前树还在；已归档 Goal 出现在段里。再点行，仍打开对应 Task。
5. 深链 `/archive/goals/:id`：归档段展开，该行选中。

## 方案与关键决策

- 百叶窗用原生 `<details>`，不要再做成会换掉整列的导航按钮。
- 新建按钮不用 `.tree-tool`，避免被图标化规则藏文案。
- 刷新仍替换 `[data-tree-scroll]` 内列表（含两段），工具栏筛选面板继续局部更新。

## 输入输出与依赖

- 输入：`view.goals` / `archived_goals` / `trashed_goals`、当前选中、集合路由。
- 输出：新 chrome HTML、列表内两段、筛选只打当前树。
- 依赖：Goals tree UI/client、Workbench 目录样式与 UI 状态披露。

## 文件 / 模块边界

允许改：`plugins/native/goals/src/tree-ui.ts`、`tree-client.ts`、`tree-en.ts`；Workbench 目录/密度样式；`DESIGN.md` 与 surface 记录中 Goals 目录一句；`tests/goals-tree-ui.test.ts`。

不改：Goal 事件协议、看板、画布算法、用户库。

## 验收标准

1. 工具栏没有归档/回收站图标链接；有可见文案「新建 Goal」的横向按钮；筛选在它右边。
2. 当前树与归档/回收站段同时存在于目录；段默认收起；展开后能看到该集合的 Goal 行。
3. 空归档/空回收站仍有段头；展开后不是空白死区。
4. 状态筛选不隐藏归档/回收站段里的行。
5. `data-open-create` 仍能打开创建面板。
6. `/archive` 与 `/trash` 文档路由仍可用。

## 验证命令

```
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-app-workbench build
node --import tsx --test --test-concurrency=1 tests/goals-tree-ui.test.ts
```

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| 1 chrome 无归档/回收站链接，有「新建 Goal」横条，筛选在右 | 通过 | `tests/goals-tree-ui.test.ts`；4174 实屏：横条 + 右侧漏斗 |
| 2 当前树与两段同时存在，默认收起 | 通过 | 同测试；目录滚到底可见「归档 0」「回收站 0」 |
| 3 空段展开有文案 | 通过 | 拉开归档后出现「没有已归档的 Goal」 |
| 4 筛选只打当前树 | 通过 | 筛选面板只有「已完成 46」，不含 archived/trashed；`filterTree` 限定 `[data-tree-root]` |
| 5 新建仍打开创建面板 | 通过 | 点「新建 Goal」打开右侧「新建目标」 |
| 6 `/archive` `/trash` 路由仍可用 | 通过 | `/archive` HTTP 200，归档段带 `open data-collection-open` |

未运行：本机没有已归档 Goal，展开后的「集合内 Goal 行」只由测试 HTML 覆盖，没有实库行点击。

## 假设与开放问题

- 「百叶窗」= 列表里可开合的段，不是另做抽屉或浮层。
- 点归档行仍走现有 Task 打开路径，不在这次改文档集合 fetch。
