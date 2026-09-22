# 撤回 Task 插件，GoalFrame 回到 Goals

状态：功能可用（完成等级 3）。未发布，允许删除数据与代码。不改用户真实库做演示，不发布。

本文件是这次行为变更的唯一需求书。它取代 `specs/archive/task-plugin/spec.md`。

Feed「来源任务」、Goal 规划里的 TaskBoard 派生视图、叶子 Goal 作为可交付节点，都不是本对象，不删。

## 背景与目标

Task 曾被做成一等插件：独立身份、可无 Goal 创建、点 Goal 去 Task 组打开关联工作台。产品判断改回：点 Goal 就是在 Goals 里处理这条 Goal；干活的无限画布仍是 **GoalFrame**，按 `goal_id` 绑定，不是独立对象。

目标：删掉 Task 的 entity、Module、Native Plugin、HTTP、目录入口和测试。GoalFrame 回到 Goals 组 item Tab。

## 当前行为与问题证据

- 内置插件含 `task`；新项目默认 `goals` + `task`。
- 点 Goal 走 `/api/tasks/open-for-goal`，在 Task 组打开 Frame。
- 构图存在项目库 `tasks` 表；客户端还有 `data-task-frame-surface`。
- 左目录、插件轨道、市场都有 Task。

## 范围与非目标

### 做

- 删除 `modules/task`、`plugins/native/task`、`packages/contracts/src/modules/task.ts` 及所有装配。
- 项目库已有 `tasks` 表则 DROP；新库不再建。
- Catalog 去掉 `task` 插件行和 CHECK；新项目默认只有 `goals`。
- 点 Goal / 卡片 Frame 按钮：在 Goals 组打开或聚焦该 Goal 的 GoalFrame。
- 构图按 `goal_id` 回 localStorage（`:goal:` 键），不再写 Task HTTP。
- 本地已打开的 `plugin=task` 标签：有关联 Goal 的改写成 Goals item；没有 Goal 的丢掉。
- 清理 Host、Workbench、文档、SSOT、测试里的 Task 插件痕迹。

### 不做

- 不改 MCP / Goal 事件协议。
- 不改编排 TaskBoard、Feed 来源同步任务。
- 不把 GoalFrame 做成可卸载市场插件。
- 不迁移无 Goal 的孤立 Task 构图。
- 不发布。

## 使用场景

1. 点 Goals 树里的 CORE：Goals 组出现这条 Goal 的 item Tab，主区是 GoalFrame。再点一次聚焦同一张。
2. 关系画布上点 Frame 按钮：同样打开该 Goal 的 GoalFrame。
3. 「打开工作区」仍是同一张 Goal Tab 的内层记录页（`goalView=work`）。母标签仍是关系画布。
4. 左边没有 Task 段。新项目插件列表只有 `goals`，之后按需加 Sessions / Feed 等。
5. 从目录拖 Session / Feed / Inbox / 交付物进当前 GoalFrame，关 Tab 不删资产；刷新后构图从本机 `:goal:` 恢复。

## 方案与关键决策

1. **没有 Task 对象。** 工作台身份就是 `goal_id`。
2. **Frame 仍是工作面能力，挂在 Goals 组。** HTML 回到工作台 Goals 页；读写回 `frame-container` + localStorage。
3. **点 Goal = 打开 GoalFrame。** 不是只在画布上选中卡片，也不跳插件。
4. **未发布，直接删。** 不做兼容层、不保留空包、不把 Task 改名留下。

## 输入输出与依赖

- 输入：当前项目、Goal 目录点击、卡片 Frame 按钮、可拖资产、旧 `:goal:` 构图。
- 输出：Goals item Tab + GoalFrame 表面；Catalog / 项目库不再有 Task。
- 依赖：Goals 标题/状态/结果供 Frame 顶栏；资产插件继续提供引用。

## 文件 / 模块边界

允许改：

- 删除 `modules/task/**`、`plugins/native/task/**`、`docs/modules/task.md`、`packages/contracts/src/modules/task.ts`
- `modules/projects` 内置插件列表与 Catalog 迁移
- `apps/local-host` 项目库迁移、HTTP 装配、WebView
- `apps/workbench` 目录、标签、Frame 容器、Goal 点击入口
- `PRODUCT.md`、`docs/SSOT-MATRIX.md`、`docs/modules/README.md`、workspace 包清单、相关测试
- 本 spec；`specs/archive/task-plugin/spec.md` 标为已取代

不改：Goal 事件协议、Feed 来源任务、Session 写入语义。

## 验收

1. 插件轨道、目录、市场没有 Task。
2. 点 Goal 在 Goals 组打开 GoalFrame；`data-plugin=goals` 的 item Tab；`data-frame-goal` 为该 Goal。
3. Goals 母标签仍是画布；`goalView=work` 记录页仍可用。
4. 无 `/api/tasks*`；项目库无 `tasks` 表。
5. 新项目插件列表为 `["goals"]`。带 Goals 的旧 Catalog 迁完后没有 `task`。
6. 拖入引用仍是引用；关 Frame Tab 不删 Session。
7. 刷新后 GoalFrame 构图从 `:goal:` localStorage 恢复。

## 验证

```bash
pnpm --filter @molis-ai/molis-work-contracts build
pnpm --filter @molis-ai/molis-work-module-projects build
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-local-host build
pnpm exec tsx --test --test-concurrency=1 \
  tests/project-plugins.test.ts \
  tests/desktop-tui.test.ts \
  tests/session-web.test.ts \
  tests/i18n.test.ts \
  tests/workbench-tab-workspace.e2e.test.ts \
  tests/workbench-frame-container.e2e.test.ts
```

仓库内不再存在 `@molis-ai/molis-work-module-task` / `@molis-ai/molis-work-plugin-task`。

## 假设与开放问题

- 无 Goal 的孤立 Task 构图丢弃，不迁。
- 历史 Catalog 迁移 12→13 仍会短暂写入 `task` 再被 13→14 删掉，只为走完旧版本链。
- 分栏里同一 Goal 仍可两栏打开，沿用现 tab-workspace 合同。
