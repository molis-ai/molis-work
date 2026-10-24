# 合入后待写进 privileges.md 的状态

状态：2026-10-23 起由统筹维护。片 PR 不改 `privileges.md` 的状态列（SLICE-RULES §2），合入后由统筹攒批开一个文档 PR 写进去；本表记已合入、还没写进去的。表里各行已写进 [#1158](https://github.com/molis-ai/molis-work/pull/1158)（10-24），它合入后删掉这些行。写进去的那批 PR 合入后，从本表删掉对应行。

| PG | 来自 | 合入提交 | 要写的状态 / 描述改动 |
| --- | --- | --- | --- |
| PG-094 | #1146 | `fea1eb0ba` | 状态仍进行中，追加一句：S4（10-23）网页层不再持有 Goals 协调器（RAC-250），宿主剩余持有者与读 Goals 表的文件冻结成清单（RAC-251～253，测试进 Package boundaries 必跑作业）；钉死的提供方（BL-501）与 `goalTitle` 端口（BL-500）不动 |
| PG-031 | #1146 | `fea1eb0ba` | 描述或状态追加：Goals 部分的写死提供方登记为 BL-501，归 `ac-platform` 一片（宿主按能力在共同目录找提供方，`allowed_actions` 精确提供方不放宽；统筹 10-23 裁） |
| PG-056、070、071 | #1145、#1132 | `b1ab81518`、`1dedc1f5c` | 进度追加：Jelly、Issues 已完成（客户端打包成 TS 并类型检查、请求只经共同 request helper、页面文字稳定键）；整条等 W5-03/04 各插件片都合入再标已做 |
| PG-029 | #1117 | `acb8941b0` | 待做（平台一半已做，#1117：内核拒绝处理器里自写的 `user_action`，页面路由入口给 `web`；Goals 转接里手写的 web 与管理出处随 Goals S9 删） |
| PG-030 | #1117 | `acb8941b0` | 已做（#1117；宿主 `system.*` 提供方与 `horizontal/*` 的钉法不在本行范围） |
| PG-012 | #1076、#1083 | `b30325bd5` | 仍进行中，改状态里的 Shelf 一句：Shelf 迁入已完成（S2 #1051、S3 #1076、S4 #1083；宿主 `shelf-actions.ts` 已删，Home 级动作都由 Shelf 声明）；剩 Goals 的个人规划方法（`personal-planning-actions.ts`、`personal-planning-methods.ts`），归 Goals 迁移 |
| PG-026 | #1083 | `b30325bd5` | 仍待做，追加：Shelf 一半做完（落盘经 owner files，S4 删了宿主文件客户端）；剩 Images 删项目时按路径删文件与平台清理（PG-102～104） |
| PG-026-S1 | #1083 | `b30325bd5` | 已做：演示种子经当前调用者的安装授权调 `shelf.sample.seed`，宿主按 `SHELF_OWNER_FILES` 装配的文件客户端与 `openHostShelfFiles`、`openHostShelfStore` 已删（验收 PG-026-S4-01～04） |
| PG-090 | #1076、#1083 | `b30325bd5` | 已做：项目一半的写入口 `receive` 随 S3 删、宿主手写装配随 S4 删；`web-catalog.ts` 还点名的 `SHELF_ACTION_PERMISSIONS` 与设置节 id 归 PG-008、PG-072，不在本行 |

## 等着合入、合入后要写的

- #1147（#1138 已合 10-24）：PG-051 已做（P1 #1124、P2a #1138、P2b #1147）；V-05 由 P1 修好。
- #1130：PG-081、082 收口（含 PG-082 证据列）；PG-053、086 按 SC 收尾核。
- #1139：PG-017 加 P0 一句（仍进行中）。
