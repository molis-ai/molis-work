# SC-4：Sessions 下线

状态：2026-10-23 起草，实施中（分支 `migrate/sessions-sc4-offline`，叠在 SC-3 的 #1113 上）；第 1 节的保留机制由统筹转用户确认，确认前代码里不写任何读旧数据、迁移或兼容逻辑。

依据：用户 2026-10-18 定 Sessions 这一轮只做清理、重做另开需求（BL-177）；2026-10-23 定 D2（首页「说一句」随 Sessions 下线，入口一起删）、D6 方案 A（见第 1 节）。对应 `privileges.md` 的 PG-081、PG-082 收尾。总计划与清点在协调分支 `notes/sessions-cleanup-plan.md`、`notes/sessions-cleanup-inventory.md`。

## 1. 保留机制：`<home>/sessions/` 退役存储（D6 方案 A，待用户确认）

**要登记的一条**（写进 `specs/repository-anti-corruption` 的保留机制，用户 2026-10-23 经统筹确认方案 A）：

- 是什么：Home 下的 `sessions/` 目录（`sessions.db`、`content/`、`content.key`）是已退役的存储。SC-4 之后没有任何代码打开它；只有两处还认得这个目录——备份集（`home-stores.ts` 的登记，备份要同一时点包含 db 与 content）和 `uninstall --purge-user-data`（经同一份登记删除）。
- 没有的：没有读它的代码，没有迁移，没有升级路径，没有按版本分支，没有「兜底读旧数据」。删项目不再有 `sessions` 这个 owner，所以删掉的项目留在这个目录里的行不会被清；这是已知的、被接受的残留，直到下面的删除条件成立。
- 怎么登记：`home-stores.ts` 里这一条的 owner 由 `modules/private-work-context` 改成 `apps/local-host`（模块不再拥有它），旁边一行注释写明「退役：没有代码打开它」。不用 `legacy`、`compat`、`@deprecated`、`backfill` 字样，不增加兼容标记计数。
- 删除条件：真实 Home 跑完 SC-5 的维护（只在备份拷贝上只读列出，结果交统筹，由统筹弹窗问用户，真实 Home 上执行归用户）后，删掉这条登记和 `home-stores.ts` 里的这一行。
- 为什么要留：用户 10-18 定「删真实 Home 的数据之前先弹窗问」；现在不留登记，备份和卸载清除就会漏掉这个目录。

否决的做法：B（直接从 `home-stores` 删掉、留在盘上）会让备份漏掉数据、`--purge-user-data` 留下用户内容；C（启动时删）是未经许可删用户数据。

## 2. 目标与范围

目标：Sessions 这个插件和它在平台里的所有接线整块下线；工作区设置与 Goal 终端（SC-3 已搬出）照常工作。

删除：

- 包 `plugins/native/work` 整个删除（Manifest、`registration`、15 个 `sessions.*` 与 3 个 `sessions.message.*` 动作、HTTP 路由 `/api/sessions*`、`/api/session-*`、`POST /api/workspaces/:id/sessions`、会话目录界面、登记会话的 PTY 录制）。
- `modules/private-work-context` 里属于 Session 的部分（注册表、记录、事件、交接、消息、关联、内容库、`project-data.ts` 的 `purgeSessionsProject`、`sessionsProjectData`）；只留运行上下文绑定（模块不改名，BL-383 后做）。合同 `private-work-context.ts` 里的 Session 类型与 `sessionErrors` 删除，`session-messages.ts` 合同随之删除。
- 宿主装配：`session-runtime-resources`、`session-registry`、`work-actions`、`work-goal-contract`、`web-session`、`web-work-session`、`local-owner-permissions` 里的 Work 权限、`web-request` 的 sessions 路由、`index.ts` 的转出；删项目的 `sessions` owner；目标页的会话区（`web-goals-read.ts`）；演示种子里的 Session。
- 首页「说一句」（`home.talk.prepare`、`home-talk-actions.ts`、`home-dock-http.ts` 里的接线，工作台的 `home-talk.ts` 与入口按钮）。
- 工作台：会话界面与 `work-ui`；各名单里的 `sessions`（钉选、导轨、primitive、标签、全局搜索）；画布的会话块；`page-assets` 里的会话脚本与样式。
- 门禁与快照：`actions.tsv` 的 18 行、`host-actions.tsv` 的 `home.talk.prepare`；API 快照、`error-owners`、`baseline` 跟着降；`workspace-packages`、`check-package-boundaries`、`source-counts`、`browser-programs`；冻结名单去掉 `sessions`。
- 测试：只属于 Session 的用例整个删；混合用例去掉会话部分。
- 文档：PRODUCT.md、SSOT、HOME-DATA、GLOSSARY、`docs/product-operations/`、`skills/molis-plugin-dev/examples.md`、反腐 spec 与 BACKLOG（BL-177 只剩重做的需求书）。

不做：SC-5（删 `<home>/sessions/` 存量，真实 Home 一律不碰）、BL-383（模块改名）、BL-384（`/api/goals/:id/panels` 改名）、Sessions 重做（BL-177）。

## 3. 验收

号段 RAC-210～219；证明它的测试在测试名或注释里写出编号。

- **RAC-210**　包 `plugins/native/work` 不存在；目录、`registration`、监督器、`BUILD_TIME_ASSEMBLED` 和冻结名单里都没有 `sessions`。
- **RAC-211**　`modules/private-work-context` 只剩运行上下文绑定；合同里没有 Session 类型和 `sessionErrors`。
- **RAC-212**　产品代码里没有任何地方打开 `<home>/sessions/` 下的库或内容库；`home-stores.ts` 只在退役登记里提到它。
- **RAC-213**　备份集和 `uninstall --purge-user-data` 仍然认得 `sessions/`；删项目不再有 `sessions` owner。
- **RAC-214**　首页没有「说一句」：没有 `home.talk.prepare`、没有入口按钮、没有对应脚本。
- **RAC-215**　工作区设置（选目录、关联、修复、解除）和 Goal 终端面板照常工作，路由路径不变；`POST /api/workspaces/:id/sessions` 与 `/api/sessions*` 不再存在（404）。
- **RAC-216**　动作合同快照少 `sessions.*` 18 行与 `home.talk.prepare` 1 行，其余不变；公开 API 快照随删除的导出变小。
- **RAC-217**　钉选、导轨、primitive、标签、全局搜索、画布、目标页里不再有 `sessions`。
- **RAC-218**　门禁数字只降：巨大单元少 5 个以上、`registerProvider` 少 2 行、点名内置插件包名的文件数降、冻结名单少一项。
- **RAC-219**　PRODUCT.md、SSOT、HOME-DATA、GLOSSARY 和产品运营文档都写「Sessions 已下线，重做见 BL-177」。
