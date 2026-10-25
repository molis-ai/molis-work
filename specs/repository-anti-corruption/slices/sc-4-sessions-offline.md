# SC-4：Sessions 下线

状态：2026-10-23 已实现，待评审与统筹集成批（分支 `migrate/sessions-sc4-offline`，叠在 SC-3 的 #1113 上）；第 1 节的保留机制（D6 方案 A）用户 2026-10-23 确认（统筹会话弹窗，选「确认方案 A（推荐）」），代码里没有任何读旧数据、迁移或兼容逻辑。

依据：用户 2026-10-18 定 Sessions 这一轮只做清理、重做另开需求（BL-177）；2026-10-23 定 D2（首页「说一句」随 Sessions 下线，入口一起删）、D6 方案 A（见第 1 节）。对应 `privileges.md` 的 PG-081、PG-082 收尾。总计划与清点在协调分支 `notes/sessions-cleanup-plan.md`、`notes/sessions-cleanup-inventory.md`。

## 1. 保留机制：`<home>/sessions/` 退役存储（D6 方案 A，用户 2026-10-23 确认）

**要登记的一条**（写进 `specs/repository-anti-corruption` 的保留机制，用户 2026-10-23 确认（统筹会话弹窗）方案 A）：

- 是什么：Home 下的 `sessions/` 目录（`sessions.db`、`content/`、`content.key`）是已退役的存储。SC-4 之后没有业务代码打开它；只有两处还认得这个目录——备份集（`home-stores.ts` 的登记，备份要同一时点包含 db 与 content）和 `uninstall --purge-user-data`（经同一份登记删除）。W5-16 的持锁离线技术链按该纯字面声明用 SQLite backup API、核原 owner/meta 版本 7 与完整性，不查询业务表、不解密正文；密封 blob 原字节保存，原 key 仅留同 Home 依赖引用。
- 没有的：没有业务 reader，没有迁移，没有升级路径，没有按版本分支，没有「兜底读旧数据」。离线技术备份不恢复 Sessions 功能，未知版本/坏库/缺必要 key 拒绝，也不允许正常 Host 首次启动或重启打开它。删项目不再有 `sessions` 这个 owner，所以删掉的项目留在这个目录里的行不会被清；这是已知的、被接受的残留，直到下面的删除条件成立。
- 怎么登记：`home-stores.ts` 里这一条的 owner 由 `modules/private-work-context` 改成 `apps/local-host`（模块不再拥有它），旁边注释写明无业务 reader；仅该条静态节点给出离线库/严格 meta/密封 content 和原 key 依赖。RAC-212 检测器只移除经过 AST 验证的这一个纯字面声明，再对所有其余源码保持禁止；同文件额外 opener、声明内调用与外部 opener 仍拒绝。不用 `legacy`、`compat`、`@deprecated`、`backfill` 字样，不增加兼容标记计数。
- 删除条件：真实 Home 跑完 SC-5 的维护（只在备份拷贝上只读列出，结果交统筹，由统筹弹窗问用户，真实 Home 上执行归用户）后，删掉这条登记和 `home-stores.ts` 里的这一行。
- 为什么要留：用户 10-18 定「删真实 Home 的数据之前先弹窗问」；现在不留登记，备份和卸载清除就会漏掉这个目录。

否决的做法：B（直接从 `home-stores` 删掉、留在盘上）会让备份漏掉数据、`--purge-user-data` 留下用户内容；C（启动时删）是未经许可删用户数据。

## 2. 目标与范围

目标：Sessions 这个插件和它在平台里的所有接线整块下线；工作区设置与 Goal 终端（SC-3 已搬出）照常工作。

删除：

- 包 `plugins/native/work` 整个删除（Manifest、`registration`、15 个 `sessions.*` 与 3 个 `sessions.message.*` 动作、HTTP 路由 `/api/sessions*`、`/api/session-*`、`POST /api/workspaces/:id/sessions`、会话目录界面、登记会话的 PTY 录制）。
- `modules/private-work-context` 里属于 Session 的部分（注册表、记录、事件、交接、消息、关联、内容库、`project-data.ts` 的 `purgeSessionsProject`、`sessionsProjectData`）；只留运行上下文绑定（模块不改名，BL-507 后做）。合同 `private-work-context.ts` 里的 Session 类型与 `sessionErrors` 删除，`session-messages.ts` 合同随之删除。
- 宿主装配：`session-runtime-resources`、`session-registry`、`work-actions`、`work-goal-contract`、`web-session`、`web-work-session`、`local-owner-permissions` 里的 Work 权限、`web-request` 的 sessions 路由、`index.ts` 的转出；删项目的 `sessions` owner；目标页的会话区（`web-goals-read.ts`）；演示种子里的 Session。
- 首页「说一句」（`home.talk.prepare`、`home-talk-actions.ts`、`home-dock-http.ts` 里的接线，工作台的 `home-talk.ts` 与入口按钮）。
- 工作台：会话界面与 `work-ui`；各名单里的 `sessions`（钉选、导轨、primitive、标签、全局搜索）；画布的会话块；`page-assets` 里的会话脚本与样式。
- 门禁与快照：`actions.tsv` 的 18 行、`host-actions.tsv` 的 `home.talk.prepare`；API 快照、`error-owners`、`baseline` 跟着降；`workspace-packages`、`check-package-boundaries`、`source-counts`、`browser-programs`；冻结名单去掉 `sessions`。
- 测试：只属于 Session 的用例整个删；混合用例去掉会话部分。
- 文档：PRODUCT.md、SSOT、HOME-DATA、GLOSSARY、`docs/product-operations/`、`skills/molis-plugin-dev/examples.md`、反腐 spec 与 BACKLOG（BL-177 只剩重做的需求书）。

不做：SC-5（删 `<home>/sessions/` 存量，真实 Home 一律不碰）、BL-507（模块改名）、BL-508（`/api/goals/:id/panels` 改名）、Sessions 重做（BL-177）。

## 3. 验收

号段 RAC-210～219；证明它的测试在测试名或注释里写出编号。

- **RAC-210**　包 `plugins/native/work` 不存在；目录、`registration`、监督器、`BUILD_TIME_ASSEMBLED` 和冻结名单里都没有 `sessions`。
- **RAC-211**　`modules/private-work-context` 只剩运行上下文绑定；合同里没有 Session 类型和 `sessionErrors`。
- **RAC-212**　普通 Host 首次启动/重启及全部业务路径不打开 `<home>/sessions/` 下的库或内容库；仅 `home-stores.ts` 原条目内的纯字面离线元数据可被持锁的通用快照技术链消费，严格核 owner/meta 版本 7，不读取业务事实或正文。检测器保留全源码拒绝，只移除经 AST 验证的这一个声明节点；内夹调用、同文件额外 opener、外部 opener 均必须失败。
- **RAC-213**　备份集和 `uninstall --purge-user-data` 仍然认得 `sessions/`；删项目不再有 `sessions` owner。
- **RAC-214**　首页没有「说一句」：没有 `home.talk.prepare`、没有入口按钮、没有对应脚本。
- **RAC-215**　工作区设置（选目录、关联、修复、解除）和 Goal 终端面板照常工作，路由路径不变；`POST /api/workspaces/:id/sessions` 与 `/api/sessions*` 不再存在（404）。
- **RAC-216**　动作合同快照少 `sessions.*` 18 行与 `home.talk.prepare` 1 行，其余不变；公开 API 快照随删除的导出变小。
- **RAC-217**　钉选、导轨、primitive、标签、全局搜索、画布、目标页里不再有 `sessions`。
- **RAC-218**　门禁数字只降（对 SC-3 的 #1113 分支）：巨大单元 117 → 112，点名内置插件包名的文件数 317 → 298，宿主入口 `export *` 11 → 10，模块导出的 Repository/Store 8 → 6，以内置插件命名的宿主文件 10 → 9，测试引用包内部 448 → 442，浏览器脚本里的裸 `fetch` 50 → 40，冻结的旧路径插件名单少 `sessions` 一项；`registerProvider(` 行数不变（17，原先在测试里的几行随用例一起删）。`pnpm health:check` 自己保证只降。
- **RAC-219**　PRODUCT.md、SSOT、HOME-DATA、GLOSSARY 和产品运营文档都写「Sessions 已下线，重做见 BL-177」。

## 4. 主线同步与 Home 隔离回归（2026-10-23）

#1130 本次普通合并固定 main `585b159794ef61714c717d324bc8e89345e3dd5f`，保留 SC-4 生产语义与主线变更；冲突仅为三份产品运营文档和生成的健康基线。文档同时保留角色已移至宿主、首页后台刷新与 Sessions 下线，基线由 `check-health-gates --update --base` 重算。API 与动作快照重生成无变化，页面预算与实测一致；未新增门禁放宽。

统筹确认 batch-19 的 `web-home-isolation` 失败属于 RAC-212：该用例还把配置 Home 中存在 `sessions/sessions.db` 当成成功。当前合并头本机修前复现为 6/7，仅旧存在断言失败。修复只改测试名称及这一处预期，并追加服务重启后旧库仍不存在的断言；Catalog、连接、Feed 密钥、控制令牌、重启后保持和默认 Home 不回落的断言全部保留。`tests/web-home-isolation.test.ts` 现在以 RAC-212 命名，真实首次启动及重启均证明不创建退役的 Sessions 库；没有改生产实现或降低隔离要求。

补修后 `web-home-isolation` 7/7、`sessions-offline` 9/9 通过。机械同步阶段已通过的 14 个非浏览器文件 110 项与 3 个浏览器文件 8 项继续适用；去重后为 18 个文件 125 项。整体构建、健康门禁、包边界、API/动作快照和资源检查已通过；这次只追加测试及验证记录，无需重复构建未变的生产源码。原始日志在本机 `/tmp/molis-verify-2026-10-23/pr1130-main-sync/`，包含 `home-isolation-before.log` 和 `home-isolation-after.log`。全量仍由统筹安排的集成批承担，本片不改 #1157、不启动或取消全量，也不碰真实 Home；新头独立评审、CI 和集成适用范围交专职会话核对。

同一批次另发现 `home-offers.e2e` 仍测已删除的 Talk 按钮位置。RAC-214 补修在专用浏览器上先复现 0/1（第 91 行读取不存在按钮的 `getBoundingClientRect`），再将异步 offers 加载前后改为两次明确断言旧入口不存在；没有恢复入口，也没有另造布局参照控件。其余加载状态、五项 offer、未知插件真实写入与回执、Inbox、移动端、响应丢失及停用恢复断言原样保留。完整文件修后 1/1，通过后的有效定向证据去重为 19 个文件 126 项；红绿日志为 `home-offers-before.log`、`home-offers-after.log`。这次追加仍只改必要测试及本记录，已通过的前一轮证据继续适用。

## 5. 收尾（SC-4b，叠在 SC-4 上的第二个 PR）

SC-4 留下的三项没有调用方、没有提供者的残留，单开一个 PR 清掉，不留兼容（`docs/system/CONTRACT-CHANGES.md` 第一阶段：同一个 PR 改掉所有生产者与消费者，PR 里写影响）：

- `horizontal/runtime-host`：删 Codex 会话适配器与路由（`RuntimeHostRouter`、`CodexRuntimeSessionAdapter`、`CodexAppServerTransport`、`assertCompleteRuntimeSessionCapabilities`），合同 `services/runtime-host` 删 `RuntimeSession*` 一组类型与 `RuntimeHostApi`、`RuntimeProviderDescriptor`、`RUNTIME_SESSION_CAPABILITIES`，只留 PTY 的三个类型；`packageDescriptor` 去掉 `runtime.codex.v1`；`tests/codex-transport.test.ts` 与两个只测适配器的用例（`runtime-host.test.ts` 的两条、`live-product-integration` 的 live Codex 一条，它还在调已删的 `/api/sessions`）一起删。
- `ActionSubjectContext.session_id`：合同接口与输出 schema 里删；所有 `subject.read` 提供者不再返回它（23 个动作的输出形状变了，动作快照的哈希随之变；它们都是 `@1`，不留带 `session_id` 的旧形状）；消费者——助理的「所在会话」一行、首页判断的 `revision` 哈希输入——一并去掉。首页判断的 `revision` 因此对同一份正文换了一个值，已缓存的判断会被当作过期重新算一次，不是数据损坏。
- `modules/private-work-context/package.json`：`better-sqlite3` 只被 `import type` 引用，从 `dependencies` 去掉（类型仍由 devDependency `@types/better-sqlite3` 提供）；描述字段本来就对。

验收不另立编号：由 `pnpm api:update`、`pnpm actions:update`、`pnpm boundary:check`、`action-contract-snapshot` 与 `runtime-host`、`artifact-subject-context`、`system-search`、`assistant-work-continuity` 等用例证明。
