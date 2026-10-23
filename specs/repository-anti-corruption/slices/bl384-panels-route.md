# BL-384：终端面板的路由不再放在 Goals 的 `/api/goals/` 下

状态：已实现（2026-10-24，迁移线 ac-sc3 片，叠在 BL-383 的分支上，PR 等 SC-4 合入后再开）。依据：Sessions 清理计划 D7，PG-082 原文。

## 1. 目标

Goal 终端面板的路由是 `/api/goals/:id/panels`，路径点名了 Goals，但这条路由不属于 Goals 插件：它由宿主的终端面板处理（`web-panel-routes.ts`），面板属于哪条 Goal 只是它的一个参数。D7 原先说「等 W6-01 删短名别名时一起改」，统筹 2026-10-24 把它排进本轮，W6-01 之前就做。

## 2. 范围

- 路径：`GET|POST /api/goals/:id/panels` → `GET|POST /api/panels?goal_id=<id>`。缺 `goal_id`（或为空）带码 `actions.input_invalid` 拒绝（400）；旧路径不再回答（404）。
- 改：`apps/local-host/src/web-panel-routes.ts`（`goal-panels` 条目换成 `panels`，Goal 编号从查询里取）、客户端 `apps/workbench/src/terminal/panels.ts` 的 `goalPanelsPath`、`tests/desktop-tui.test.ts`、`tests/fixtures/web-route-table.snapshot.json`（`GET <project>/api/panels` 由 404 变 400）。
- 不改：同文件里的 `GET /api/goals/:id/advance-prompt`、`/api/panels/:id` 一族（面板自己的编号）、Goals 包自己的 `/api/goals/:id/panels/progress` 等（那是 Goals 页面的进度面板，另一回事）。`advance-prompt` 现在不动（统筹 10-23 裁），S9 时和别的 Goals 路由一起进 Goals Manifest 声明的路由。
- 没有动作、Manifest、MCP 工具名、数据格式的变化；页面资源只变了一个字符串字面量（`page-assets` 门禁对 merge-base 不升）。

## 3. 验收

- **RAC-260**：`POST|GET /api/panels?goal_id=<id>` 开面板、列面板，行为与原路径相同；缺 `goal_id` 带码 `actions.input_invalid` 拒绝；旧地址 `/api/goals/:id/panels` 404；路由快照里 `GET <project>/api/panels` 是 400 加码。（`tests/desktop-tui.test.ts`、`tests/web-route-table.test.ts`）

## 4. 对调用方的影响

宿主网页 API 的路径变了：唯一的调用方是工作台的终端面板（`apps/workbench/src/terminal/panels.ts`），同一个改动里已改。没有外部调用方，也没有 MCP 工具、动作或 Manifest 受影响。按 `docs/system/CONTRACT-CHANGES.md` 现在不留兼容期，旧路径直接删。
