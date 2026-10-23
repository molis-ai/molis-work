# 各线的会话笔记（2026-10-24 从原机器拷来）

这些是原来那台 Mac 上 ① 到 ⑤ 各会话写的工作笔记。交接时只拷了各线说还有效的那几份。

- **原样拷来，没改**：有的笔记里写「交 ① 批」「待 ① 审」，那是写的时候的状态。批没批、后来怎么定的，看协调日志 `../README.md` 同一天的记录，和对应 PR 的评论。
- **行号以写的时候的 main 为准**：开工前对着现在的代码再核一遍。
- **拷之前扫过**：没有密钥、令牌、私钥、JWT，也没有钥匙串命令。提到「真实 Home」的地方都是流程，没有数据。
- **一处更正**：迁移线清单 A 表第 1 行说 #1093 的门禁提交 `d656dab32`「找不到 ① 的批复」。① 10-24 已经在 #1093 上批了，评论 6369582610。

## 两条线的清单（先读这两份）

| 文件 | 内容 |
| --- | --- |
| `platform-handover-1024.md` | 平台线（②）还没做的：在途 PR、排好的片、BACKLOG 与 PG 行，每条都配了笔记 |
| `migration-line-not-done-1024.md` | 迁移线（③）还没做的：在途 PR、本机没推的两条分支、没开工的片、PG 行、要用户本人做的 |

## 按题目

| 题目 | 文件 | 写的人、时间 | 用于 |
| --- | --- | --- | --- |
| 平台队列与历史裁定 | `platform-queue.md` | ②，10-19 起 | ② 的各片、① 的历次裁定，含「Goals S9 开工前要知道的」 |
| R-25 Esc 链路 | `r25-esc-feed-filter.md` | ②，10-23 | #1099、#1100、#1087 |
| 停用插件的残留回调 | `bl411-stopped-services-design.md` | ②，10-22 | R-13、BL-367，#1096 的前因 |
| `services.connections` 接缝 | `s0b2-connections-seams.md` | ②，10-22 | BL-350、BL-356，PG-045、PG-046，R-20 |
| 工作区变更事件 | `host-workspace-changed-design.md` | ②，10-22 | BL-366 |
| 宿主发起的事件 | `x6-host-events-design.md` | ②，10-22 | BL-366、PG-044 |
| 同一插件双实例 | `s0-dual-instance-plan.md` | ②，10-20 | BL-394、PG-012 |
| typed 宿主能力改成动作 | `pg035-typed-to-action-design.md` | ②，10-22 | BL-364、BL-365、PG-035 |
| 随激活存活的后台作业 | `pg038-activation-jobs-design.md` | ②，10-21 | BL-362 |
| `ui.invalidate` | `pg061-ui-invalidate-design.md` | ②，10-22 | BL-363、PG-061 |
| 可选权限开关调研 | `pg-002-facts.md` | ②，10-19 | PG-002 |
| 项目库服务 | `project-library-plan.md` | ②，10-19 | PG-020～022、BL-395（背景） |
| 登记搬进各包 | `w5-02-pr1-plan.md` | ②，10-19 | PG-065～071、PG-105（背景） |
| 助理执行方 | `c8-executor-design.md` | ②，10-21 | C8-3、PG-036 |
| C8-2 交接 | `c8-2-handover.md` | ③，10-22 | C8-3 的依赖 |
| Coding 离开 HYBRID | `coding-migration-plan.md` | ③，10-21 | C8-3、C9，PG-036、037、054 |
| C7 插件一半 | `c7-plugin-half-plan.md` | ③，10-23 | #1084（S4 一节） |
| Goals 迁移 | `goals-migration-plan.md` | ③ 与 ①，10-19 起 | Goals S4、S8～S12 |
| Goals S7b | `goals-s7b-plan.md` | ③，10-23 | #1093，S9 的过渡改写 |
| Goals S9 前提 | `goals-s9-preconditions-1022.md` | ③，10-22 | Goals S9 |
| Sessions 清理计划 | `sessions-cleanup-plan.md` | ③，10-23 | SC-3～SC-5，D1～D8 |
| Sessions 谁在用 | `sessions-cleanup-inventory.md` | ③，10-23 | SC-4 |
| SC-3 交接 | `sessions-sc3-brief.md` | ③，10-23 | SC-3 |
| SC-3 的 PR 正文 | `sc3-pr-body.md` | ③，10-24 | 本机没推的 `migrate/sessions-sc3-terminal-workspaces` |
| W5-06 余项的 PR 正文 | `w506-pr-body.md` | ③，10-24 | 本机没推的 `migrate/w5-06-shell-plugin-rows`、BL-388 |
| BL-387 页面那一半 | `w506-bl387-page-half.md` | ③，10-23 | BL-387 |
| Shelf S4 交接 | `shelf-s4-handover.md` | ③，10-23 | #1083 |
| 迁插件的通用规矩 | `migration-subagent-rules.md` | ③，10-20 | Feed、Inbox 等迁到 Runtime |
| 删 Alchemist 与创作台 | `deletion-alchemist-builder.md` | ③，10-21 | BL-376、BL-377（防腐收尾以后，删前问用户） |
