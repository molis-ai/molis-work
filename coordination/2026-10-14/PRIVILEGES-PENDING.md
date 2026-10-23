# 合入后待写进 privileges.md 的状态

状态：2026-10-23 起由统筹维护。片 PR 不改 `privileges.md` 的状态列（SLICE-RULES §2），合入后由统筹攒批开一个文档 PR 写进去；本表记已合入、还没写进去的。写进去的那批 PR 合入后，从本表删掉对应行。

| PG | 来自 | 合入提交 | 要写的状态 / 描述改动 |
| --- | --- | --- | --- |
| PG-082 | #1113（SC-3） | main，10-23 21:3x | 状态改「进行中」：SC-3 把终端面板路由搬进宿主（`apps/local-host/src/web-panel-routes.ts`）、项目文件夹的关联、修复、解除与选择窗口搬进宿主的项目设置（`apps/local-host/src/project-workspace-http.ts`），终端客户端与画面搬进工作台（`apps/workbench/src/terminal/`），路由路径不变；只剩在文件夹里启动会话（`POST /api/workspaces/:id/sessions`）留在 Work，随 SC-4（#1130）一起删。证据列的旧路径（`plugins/native/work/src/workspace-actions.ts`、`http/workspaces.ts`、`http/panels.ts`）等 SC-4 删包时一起改 |

## 等着合入、合入后要写的

- #1123：PG-039、040（一半）、041、042。
- #1138 + #1147：PG-051 已做（P1 #1124、P2a #1138、P2b #1147）；V-05 由 P1 修好。
- #1117：PG-029、030。
- #1130：PG-081、082 收口（含 PG-082 证据列）；PG-053、086 按 SC 收尾核。
- #1083：PG-012 的 Shelf 一半、PG-026、026-S1、090；PG-113 归 `ac-platform`。
- #1146：PG-094 加 S4 一句（仍进行中）；PG-031 的 Goals 部分指向 BL-501（`ac-platform`）。
- #1139：PG-017 加 P0 一句（仍进行中）。
