# 合入后待写进 privileges.md 的状态

状态：2026-10-23 起由统筹维护。片 PR 不改 `privileges.md` 的状态列（SLICE-RULES §2），合入后由统筹攒批开一个文档 PR 写进去；本表记已合入、还没写进去的。写进去的那批 PR 合入后，从本表删掉对应行。

| PG | 来自 | 合入提交 | 要写的状态 / 描述改动 |
| --- | --- | --- | --- |
| PG-082 | #1113（SC-3） | main，10-23 21:3x | 状态改「进行中」：SC-3 把终端面板路由搬进宿主（`apps/local-host/src/web-panel-routes.ts`）、项目文件夹的关联、修复、解除与选择窗口搬进宿主的项目设置（`apps/local-host/src/project-workspace-http.ts`），终端客户端与画面搬进工作台（`apps/workbench/src/terminal/`），路由路径不变；只剩在文件夹里启动会话（`POST /api/workspaces/:id/sessions`）留在 Work，随 SC-4（#1130）一起删。证据列的旧路径（`plugins/native/work/src/workspace-actions.ts`、`http/workspaces.ts`、`http/panels.ts`）等 SC-4 删包时一起改 |
| PG-039 | #1123、#1131 | `b3f2f4b18` | 已做（#1123 宿主一侧补齐；#1131 删进程内 `PluginWakeupIndex` 与无安装的 `register()`，BL-481 关）。依据行号 `index.ts:70-98,200-202` 已过时，一并改 |
| PG-040 | #1123 | `b3f2f4b18` | 待做（部分完成，#1123）：Schedule 一半已做（30 秒定时钟是平台的，到点每个唤醒以插件安装身份调自己的动作）；Feed 一半随 PG-093、Inbox 一半随 PG-089；三处都改为各自安装身份才关。依据 `web-project-schedulers.ts:65-73` 改 `:65-70` |
| PG-041 | #1123 | `b3f2f4b18` | 已做（#1123；描述里的 `schedule-reminders.ts` 等已不存在；V-12：宿主在跑就送达） |
| PG-042 | #1123 | `b3f2f4b18` | 已做（#1123；`services.agents.run`；`schedule-task-runner.ts` 已不存在） |
| PG-093 | #1123 | `b3f2f4b18` | 描述追加：Feed 来源 tick 与 `workflow-events` 的采集、首页和插件通知入 Feed 后的判断触发，迁移后用 Feed 自己的安装身份；这是关 PG-040 的前置 |
| PG-089 | #1123 | `b3f2f4b18` | 描述追加：Inbox 下一步判断触发不再借用 `workflow-events`，用 Inbox 自己的安装身份；这是关 PG-040 的前置 |

## 等着合入、合入后要写的

- #1138 + #1147：PG-051 已做（P1 #1124、P2a #1138、P2b #1147）；V-05 由 P1 修好。
- #1117：PG-029、030。
- #1130：PG-081、082 收口（含 PG-082 证据列）；PG-053、086 按 SC 收尾核。
- #1083：PG-012 的 Shelf 一半、PG-026、026-S1、090；PG-113 归 `ac-platform`。
- #1146：PG-094 加 S4 一句（仍进行中）；PG-031 的 Goals 部分指向 BL-501（`ac-platform`）。
- #1139：PG-017 加 P0 一句（仍进行中）。
