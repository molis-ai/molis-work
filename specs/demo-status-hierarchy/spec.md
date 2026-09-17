# 示例项目：状态、层级与布局

状态：已实现。完成等级 **3：功能可用**。不宣称可发布。不改用户项目。重建只动 `regenerable_demo`。

本文件是本次体验数据变更的唯一需求书。它覆盖 `apps/local-host/src/demo-seed.ts`，并补在 `specs/goals-stage-list-row/spec.md` 的四层树约定之上。

## 背景目标

打开示例项目时，Goal 列表几乎全是「待开始」，归档折是空的，回收站只有一条。列表、画布、看板看不出状态差、缩进差和跨分支依赖。用户要求新一套示例数据，凸显各种状态、布局和层级。

## 当前行为与问题证据

- `seedDemoBoard` 只给 CORE 做了完成收尾，其余 Goal 停留在创建后的待开始。
- 只有 `AUTO-CONNECT` 在回收站；没有任何已归档 Goal。
- 最深层级是 `V1 → WORKSPACE → WEB → WEB-SCAN → WEB-SCAN-ROW`（`data-tree-depth="4"`）。
- 测试锁住：board 标题、`V1` / `INTERFACES` 标题、`CORE` 事件归属、`INTERFACES` 安全说明笔记、`AUTO-CONNECT` 回收站、`WEB-SCAN-ROW` 深度 4。

## 范围与非目标

做：

- 同一套可重建 demo：保留锁住的 ID / 标题 / CORE 收尾 / INTERFACES 笔记 / AUTO-CONNECT 回收站 / 四层 WEB-SCAN。
- 当前树同时出现：待开始、正在推进、需要你决定、受阻、已完成、已取消。
- 归档折有已完成并归档的 Goal；回收站仍只有 `AUTO-CONNECT`。
- 再下一层 `WEB-SCAN-NEST`，列表能渲到 `data-tree-depth="5"`。
- 跨分支 `depends_on` 让画布有向连线，列表有「前置」格子。
- 打开示例项目仍落在 `V1`。

不做：

- 不改用户项目，不改 Session registry（现有 Runtime 会话仍挂在同一 project_id）。
- 不改 Feed / Inbox / Artifacts 种子。
- 不改 Goal 状态机或 UI 组件。
- 不把 `waiting` 看板列硬造出来（生产投影目前不会从事件状态写出这一档）。

## 使用场景

1. Goals 列表：一眼看到多种状态，子 Goal 比父 Goal 更靠右，至少五层。
2. 点开「归档」看到已完成退出日常列表的 Goal；点开回收站仍是自动选项目那条。
3. 画布：父子树 + 跨分支依赖箭头。
4. 看板：待开始 / 正在推进 / 需要你决定 / 受阻 / 已完成 各有真实卡片。

## 方案

在现有 `createIntent` 树上追加 `DECIDE`、`RISK`、`DROPPED`、`WEB-SCAN-NEST`。用现有事件 API 写入进展、决定、Concern、完成、取消，再 `setArchived(GRAPH)`。

## 文件边界

- `apps/local-host/src/demo-seed.ts`
- `tests/project-catalog.test.ts` 补状态/层级断言
- 测试仍依赖的 ID / 标题保持不变

## 验收

1. 新 seed 的当前树含 `continue` / `in_progress` / `waiting_user` / `blocked` / `completed`。
2. `GRAPH` 已归档；`AUTO-CONNECT` 仍在回收站；没有新增回收站 Goal。
3. 存在 `data-tree-depth="5"` 且 `WEB-SCAN-ROW` 仍是 depth 4。
4. `tests/project-catalog.test.ts` 通过。渲染确认 `WEB-SCAN-ROW` 仍是 depth 4，且存在 `data-tree-depth="5"`。
5. 重建 `~/.molis-work` 的示例项目后，4180 列表/画布/看板能看到上述差。归档 `GRAPH` 后画布会提示「部分关系不完整」，节点和跨分支箭头仍可读。

## 验证命令

```
tsc -p apps/local-host --pretty false
node --import tsx --test --test-concurrency=1 tests/project-catalog.test.ts tests/desktop-tui.test.ts
node --import tsx examples/seed-demo.mts --force --home /Users/didi/.molis-work
```
