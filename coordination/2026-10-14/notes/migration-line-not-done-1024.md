# 防腐线 ③（迁移线）还没做的（2026-10-24 交接给 yijunw0212）

写这份时 main 在 `50c8ae30a`。

- 「笔记」一列的文件都在这份清单旁边，① 会拷进协调分支的 `coordination/2026-10-14/notes/`。其中五份是 ③ 从自己的笔记文件夹拷过来的：`goals-s7b-plan.md`、`shelf-s4-handover.md`、`w506-bl387-page-half.md`、`w506-pr-body.md`、`sc3-pr-body.md`。
- 笔记写于 10-19 到 10-23，行号以当时的 main 为准，开工前要对着现在的代码再核一遍。
- R-xx 指协调分支里 `coordination/2026-10-14/RISKS-AND-DEFERRED.md` 的行。

这台机器上没有真实 Home。凡是要动真实 Home 的项，代码和演练都在隔离 Home 里做，真正执行由用户本人来。

## A. 在途 PR（照每个 PR 上 ⑤ 01:21 的说明和 ③ 10-24 的补充做）

| 序 | 项 | 位置 | 卡在哪、下一步 | 依赖 | 笔记 |
| --- | --- | --- | --- | --- | --- |
| 1 | #1093 Goals S7b（PG094-09） | privileges PG-094 | 等 batch-1023-11 的结果；门禁改动 `d656dab32` 找不到 ① 的批复，合入前要 ① 或用户确认 | — | `goals-s7b-plan.md` |
| 2 | #1076 Shelf S3 | PG-026、PG-090 | 合 main（`page-assets.json` 相邻行冲突）；R-12 看 #1096 | — | 只看 PR 正文和评论 |
| 3 | #1083 Shelf S4 | PG-026-S1、PG-090 | 按 squash 感知的方式合 #1076 的最终头和 main；删掉 `error-owners.json` 里的 `apps/local-host/src/shelf-*`（Verify 红的唯一原因）；本地的 `67d1dd96b` 已过时，丢掉 | #1076 | `shelf-s4-handover.md` |
| 4 | #1084 PG-062 S4b（Coding 交互） | PG-062 | 按 squash 感知的方式合 main（#1071 已合，5 个文件冲突）；动了 S-56，要手看 Security invariants | — | `c7-plugin-half-plan.md`（S4 一节） |

## B. 已推到远端同名分支（用户 10-24 批准推送）

| 序 | 项 | 位置 | 下一步 | 依赖 | 笔记 |
| --- | --- | --- | --- | --- | --- |
| 5 | SC-3 终端与工作区离开 Work 包（PG-082） | 分支 `migrate/sessions-sc3-terminal-workspaces`，提交 `e1771b511`（含 SC-1 的提交，merge-base `a259350ac`） | 已推（远端 = `e1771b511`），**没开 PR**（用户只批了推送）。下一步：先合 main，再开 PR。对 main `8f49a77ff` 预览合并，有 7 个文件冲突：`ui-composition.ts`，Work 包的 `panels.ts`、`workspaces.ts`，`privileges.md`，两个测试，`error-owners.json`。PR 正文草稿的「本机延后验证」一节还空着 | SC-1 #1075、#1049 都已合 | `sessions-sc3-brief.md`、`sc3-pr-body.md`、`sessions-cleanup-plan.md` |
| 6 | W5-06 余项第一片（PG-060，带 BL-387、BL-388 两行） | 分支 `migrate/w5-06-shell-plugin-rows`，提交 `b4597815d`、`0c0c0039d`（merge-base `9ad4b12db`） | 已推，开了草稿 PR [#1112](https://github.com/molis-ai/molis-work/pull/1112)（base 是 main，不叠在别的 PR 上）。下一步：先合 main，`specs/BACKLOG.md` 与 `page-assets.json` 冲突；合完重新构建，再量 page-assets；`full` 命中 assembly、spans-packages，要进集成批次 | — | `w506-pr-body.md` |

推送前两条分支都过了 `secrets:check`（对 main `8f49a77ff`）。

## C. 没开工的片（按先后排）

| 序 | 项 | 位置 | 内容 | 依赖 | 笔记 |
| --- | --- | --- | --- | --- | --- |
| 7 | BL-387 页面那一半 | BL-387（在第 6 项的分支里） | 删 `goal-inputs-html.ts` 的 `CREATE`、`placement.ts` 的 `names`、`project-home.ts` 的 `starts`，改读 ② 的 `creatableKinds`、`homeStarts` | ② 的 #1098、第 6 项（#1112）都合入 | `w506-bl387-page-half.md` |
| 8 | BL-388 | BL-388（在第 6 项的分支里） | `objectTabPlugins()` 改读运行时目录，开发中和第三方插件声明的 `accepts_objects` 也算进去 | ② W5-06 2b 的运行时目录 | `w506-pr-body.md`（「局限」一段） |
| 9 | SC-4 Sessions 下线（PG-081、PG-082 收尾） | R-06 | 整块删 Work 包、会话界面和各名单里的 sessions；D2 已批，首页「说一句」连入口一起删；第一个提交先把 D6 的保留机制写进 `specs/repository-anti-corruption`。共 120～160 个文件，单独进集成批次（R-06） | SC-1～SC-3、#1048 都合入 | `sessions-cleanup-plan.md`（SC-4、§3 D1～D8）、`sessions-cleanup-inventory.md` |
| 10 | SC-5 `<home>/sessions/` 的存量 | R-05 | 在隔离 Home 里写维护脚本并演练；只在备份拷贝上只读列出，结果交 ①，弹窗问过用户才删。**在真实 Home 上执行归用户本人** | SC-4 | `sessions-cleanup-plan.md`（SC-5、D6） |
| 11 | R-17：删项目时不清 `character_runs` | BL-385；R-17 | 让 Characters 在 `ProjectDeletionService` 里声明自己要清的数据 | SC 系列之后 | 只看 BL-385 那一行 |
| 12 | 模块 `private-work-context` 改名 | BL-383（号已留给 ③，行还没写） | 机械改名；README 重写成「运行上下文绑定」 | SC-4 之后 | `sessions-cleanup-plan.md`（D5） |
| 13 | `/api/goals/:id/panels` 改名 | BL-384（号已留给 ③，行还没写） | 改路由名 | SC-3 之后 | `sessions-cleanup-plan.md`（D7） |
| 14 | Goals S4（PG094-06） | privileges PG-094 | 宿主不再直接读协调器，去掉钉死的提供方 | #1093；`goalTitle` 端口那部分等 T1 | `goals-migration-plan.md`（§2） |
| 15 | Goals S8 剩下的一半（PG094-10） | PG-094、PG-021 | 项目库的身份不再是 Goals 看板 | ② 的 X-5 | `goals-migration-plan.md` |
| 16 | Goals S9（PG094-11），连带 BL-386 | PG-094 | `createGoalsPlugin`，路由进 Manifest；删 S7b 的过渡改写和 `goals-actions.ts`；goals-command-owner 门禁跟着改 | S4、S8；② 的 PG-029、PG-087、journal 与幂等服务；T1；PG-012 | `goals-s9-preconditions-1022.md`、`goals-s7b-plan.md`（§3）、`goals-migration-plan.md` |
| 17 | Goals S10～S12（PG094-12～14） | PG-094 | 发事件、Inbox 订阅（PG-033 剩下的部分）；删手写舞台；删 tab 别名 | S10 等 S9 和 Inbox 上 Runtime；S11 等 W5-06；S12 等 W6-01、PG-004 | `goals-migration-plan.md` |
| 18 | Coding C8-3：助理按角色找执行方（PG-036） | privileges PG-036 | 助理用 `workExecutorRoleOf` 在目录里找 Coding 发布的执行方角色；删 `apps/local-host/src/assistant/assistant-coding.ts`（main 上还在） | C8-1 #960、C8-2 #987 已合 | `c8-2-handover.md`（「给 C8-3」）、`coding-migration-plan.md`（C8） |
| 19 | Coding C9：离开 HYBRID | PG-060 的 Coding 行、PG-091 | 删 `coding-surface.ts`；HYBRID 名单去掉 coding，必须和删文件在同一个 PR | ② 的 W5-06 views 通道、W5-04 按需打包、设置分区；#1084；C8-3 | `coding-migration-plan.md`（C9） |
| 20 | Feed、Inbox 迁到 Runtime | PG-093、PG-089 | 迁成项目监督器条目 | ② 的 X-5、PG-046 等 | `migration-subagent-rules.md`（迁插件的通用规矩） |

## D. privileges.md 里归 ③、还没排进切片的行

PG-031、PG-052（创作台部分不做）、PG-056、PG-057、PG-058（Alchemist 部分不做）、PG-080、PG-088、PG-089、PG-091 余项、PG-093、PG-099、PG-100、PG-107、PG-111。

有几行的状态已经过时（比如 Pages、Workflows 已经上了 Runtime），开工前要对着代码核。Alchemist 和创作台不迁，防腐收尾后删掉重做（BL-376、BL-377），笔记是 `deletion-alchemist-builder.md`。

## E. 要用户本人在真实 Home 上做的（只算这条线的）

- SC-5：删 `<home>/sessions/`。先弹窗问用户。
- R-04：Characters 库 `characters.sqlite` 1 → 2（SC-2，#1080 已合）。装新版前要先维护一次，见 `docs/releases/CHECKLIST.md` 第 3 节。
- Shelf 目录 `shelf/catalog.json` 1 → 2（#1076）：见 CHECKLIST 4.3。

## 不用拷的笔记（已过时）

- `migration-todo.md`、`migration-slice-tips.md`：10-18 到 10-22 的进度，已经被后来的 PR 盖过。
- `git-hybrid-exit-plan.md`：Git 的 G0～G5 都已合入（#1066、#1068）。
- `sessions-sc1-sc2-files.md`：SC-1、SC-2 都已合入。
- ③ 文件夹里 Shelf S2、S3 的计划和设计：S3 的内容都在 #1076 的正文和评论里。
