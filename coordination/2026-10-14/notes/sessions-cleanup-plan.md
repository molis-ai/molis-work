# Sessions 清理计划（③，2026-10-23，草稿，交 ① 批）

谁在用什么，逐条带行号，见同目录 `sessions-cleanup-inventory.md`（main 6b9eec545）。

## 0. 依据与完成标准

依据：
- 用户 10-18 定（防腐 spec §1 第 1147、1148 行）：Sessions 这一轮只清理，文档留记录，重做另开需求（BL-177）。
- 清理前要查清谁在用：工作区动作、Coding、`sessionsProjectData`、真实 Home 的存量。
- 用到的能力挪给平台或它的主人。
- 删真实 Home 的数据之前，先弹窗问用户。
- 对应 privileges 的 PG-081（③）和 PG-082（②）。

完成标准：
1. 包 `plugins/native/work` 整个删除。目录里没有 `sessions` 条目，`BUILD_TIME_ASSEMBLED` 去掉 `sessions`。
2. `modules/private-work-context` 只剩运行上下文绑定，也就是清单里标 (c) 的部分；Session 的部分（a）全部删除。合同 `private-work-context.ts` 里的 Session 类型和 `sessionErrors` 删除。
3. 工作区设置（add、repair、unlink、选目录）和终端面板（目标页 TUI 窗格、`/api/goals/:id/panels`、xterm 通道）都还能用，但不再住在插件包里：
   - 路由和动作在宿主；
   - 终端客户端在工作台。
   这就是 PG-082。
4. 没有代码再读写 `<home>/sessions/`。存量怎么处理按 D6。
5. 门禁数字只降：
   - 巨大单元少 5 个以上；
   - 冻结名单少一项；
   - `registerProvider` 少一行。
6. PRODUCT.md、SSOT、HOME-DATA、GLOSSARY 和产品运营文档都改成「Sessions 已下线，重做见 BL-177」。

## 1. 现状要点

- Coding 不依赖 Sessions：
  - 它不 import Work；
  - 不用 `/api/sessions`，也不用面板路由；
  - 它的会话面和 `coding.sessions.*` 是它自己的。
- 往 `sessions.db` 写东西的不只 Sessions，还有：
  - 终端面板：桌面和 MCP 的面板链接、`web-server.ts:236-245` 的 PTY 录制；
  - MCP 的目标生命周期（`apps/mcp/src/session-activity.ts`）；
  - Characters 本地 Agent 执行（`character-native-execution.ts:51-110`）：执行记录、输出、按面板 id 幂等重连，全靠 Session 注册表；
  - 演示种子。
- 首页「说一句」（`home.talk.prepare`、`home-talk.ts`）完全建在 Sessions 的动作上。
- 工作区和终端代码住在 Work 包里（PG-082）。它们挂着三处 Session 钩子：
  - repair、unlink 时改挂会话；
  - `POST /api/workspaces/:id/sessions` 起会话；
  - 面板登记会话。
- 巨大单元按文件路径记。搬到新文件的，按新增算：
  - `startWorkTerminalClient` 431 行、`createTerminalPanels` 365 行、`handleWorkPanelHttp` 163 行；
  - 搬家时必须拆到 150 行以下。
  - 不改门禁。

## 2. 切片（每片一个 PR，只用 merge）

### SC-1 不再往 Session 里写（③，可以先开）

宿主、MCP、终端停止往注册表写。这一片不删插件：

1. 删 PTY 录制：`web-server.ts:236-245` 和 Work 的 `tui-recorder.ts`。
2. 删面板登记会话：`panel-sessions.ts`、`runtime-panel-session.ts`、`mcp-server.ts:103,240`，面板路由的 `recordSessions`、`sessionIds` 端口。
3. 删 MCP 往会话写活动：
   - `apps/mcp/src/session-activity.ts`；
   - `runtime-session.ts` 的写入；
   - `mcp-server.ts:277-280`。
4. 删 MCP 上下文里读会话的部分：
   - `context-presentation.ts` 的 `session_registry` 块；
   - `resume-view.ts` 的 `session_focus`。
   - 这两处要先核：它们只读 Sessions 的事实，删了之后 Agent 的上下文少一块。
5. 工作区 repair、unlink 不再改挂会话：
   - `project-workspace-actions.ts`、Work `workspace-actions.ts` 去掉 `reassignWorkspaceSessions`；
   - `current()` 不再扫注册表。
6. `POST /api/workspaces/:id/sessions` 留到 SC-3 和 Sessions 一起删。

- 体量：估计 25～35 个文件，测试见清单 §4 的 (b) 和混合项。
- 和在途 PR：只在枢纽文件（baseline、privileges）重叠。

### SC-2 Characters 的本地执行记录自己存（③）

`character-native-execution.ts` 改用 `modules/characters` 自己的一张表（按 D3）：
- 记执行 id、面板 id、请求 id、任务、引用、工作目录、时间、状态行。
- 幂等重连照旧按面板 id 查。
- `characters.runs` 的形状按 D3 定：去掉 `output`，或改由 Characters 自己记。

其他：
- 表进 Characters 的 Home 库（`characters/characters.sqlite`）。
- 在 `table-owners` 里只归 Characters。
- 要走库的版本号和维护：现在的 Characters 库有没有版本表，开工时核。
- 体量：估计 10～15 个文件。
- 和在途 PR：#1048 改了 `characters-host.ts`，本片不用碰它（接线不变，端口照旧）。

### SC-3 工作区和终端面板离开 Work 包（PG-082；按 D1，③ 做，② 审放哪）

搬到哪里：

| 搬什么 | 搬到 |
| --- | --- |
| `http/workspaces.ts`、`workspace-actions.ts` | 宿主（`project-workspace-*.ts`，和 `projects.workspaces.*` 动作放在一起） |
| `http/panels.ts` | 宿主 `web-panel.ts` |
| `terminal/*`、`ui/terminal.ts` | 工作台 `apps/workbench/src/terminal/` |

- Shelf、Character 终端改从工作台取。
- 路由路径不变，`/api/goals/:id/panels` 改名另记（D7）。
- 三个巨大函数在搬家时拆到 150 行以下。
- Goals `event-document-client.ts:64` 对 `[data-tui-pane]` 的依赖照旧，因为属性名不变。
- 体量：估计 30～40 个文件，「拆巨大函数」和「搬家」放在同一片，因为门禁按路径记，拆不开。
- 和在途 PR：`page-assets`（#1049）。等 #1049 合入再开。

### SC-4 Sessions 下线（③）

整块删除：
- `plugins/native/work` 剩下的全部；
- 模块里的 (a)；
- 合同里的 Session 部分。

宿主：
- 删这些装配：`session-runtime-resources`、`session-registry`、`work-actions`、`work-goal-contract`、`web-session`、`web-work-session`；
- 删 `local-owner-permissions` 里的 Work 权限、`web-request` 的 sessions 路由、`index.ts` 的转出；
- 删项目时去掉 `sessions` owner；Home 存储按 D6 处理；
- 首页「说一句」按 D2；
- 删演示种子里的 Session；
- 删目标页的会话区（`web-goals-read.ts:162-170`）。

工作台：
- 删会话界面、`work-ui`；
- 删各名单里的 `sessions`：钉选、导轨、primitive、标签、全局搜索；
- 删画布的会话块；
- 删 `page-assets` 里的会话脚本和样式。

门禁与快照：
- `actions.tsv` 删 18 行，`host-actions.tsv` 删 `home.talk.prepare`；
- API 快照、`error-owners`、`baseline` 跟着降；
- `workspace-packages`、`check-package-boundaries`、`source-counts`、`browser-programs`；
- 冻结名单去掉 `sessions`；
- 删测试：清单 §4 的 (a)。

文档：
- 完成标准第 6 条列的几份；
- `skills/molis-plugin-dev/examples.md:55`；
- privileges 的 PG-081、PG-082 标「已做」，写明由哪几个 PR 完成；
- BL-177 改成只剩「重做的需求书」。

其他：
- 体量：大，估计 120～160 个文件。PARALLEL-DEVELOPMENT §4 认「删除整块旧代码」这个例外，所以 PR 描述里写明为什么拆不开：插件、动作快照、目录、冻结名单必须同一个 PR 变。
- 要进集成批次：它动了宿主装配和合同。
- 和在途 PR：#1048 改了 `web-goals-read`、`demo-plugin-seed`、`immersive-*`、`frame-container`，所以等 #1048 合入再开。这时间正好和 Goals S7b 的回切重合，两条在同一个工作树里先后做。

### SC-5 存量数据（按 D6）

- 这台机器没有真实 Home。
- 维护脚本先在隔离 Home 里写好、演练，列出 `sessions/` 下有什么，再按 10-18 的要求弹窗问用户。
- 维护脚本不进本轮的必做项，看 D6。

## 3. 待 ① 裁

**D1　PG-082 由谁做。**
- 推荐 ③ 做（SC-3），② 审「放哪」（宿主还是工作台，设置节怎么挂）。
- 理由：
  - 代码在 ③ 要删的包里；
  - ② 手上有 S0-2b-3、C8-3、BL-411、S0b-2；
  - 不做这一片，SC-4 删不了包。

**D2　首页「说一句」。**
- 推荐和 Sessions 一起下线（SC-4）：它的准备读的是 `sessions.directory.read`，发送就是 `sessions.message.send`，没有 Sessions 就没有对象可发。
- 首页的入口按钮一起去掉。
- 用户 10-18「Sessions 这一轮清理掉」是否覆盖到它，请 ① 判断。要另问用户的话，我把问法写好交 ①。

**D3　Characters 本地执行的记录。** 现在存成 Session，输出来自 PTY 录制。
- 推荐 A：Characters 自己记执行（SC-2），不再记终端输出。
  - `characters.runs` 去掉 `output`，按合同改法升 v2；
  - 界面上「过往输出」那一栏改成「在终端里看」。
- B：Characters 自己录 PTY 输出。这要把录制钩子挪进 Characters，Characters 就开始碰终端进程。
- C：不留执行记录，只留幂等重连。

**D4　面板、MCP、PTY 往会话写的那几处，全部删除，不搬去别处（SC-1）。**
- 推荐删除：它们只为 Sessions 的目录服务。
- MCP 上下文里的 `session_registry`、`session_focus` 也一起删。

**D5　运行上下文绑定（c）的去处。**
- 推荐留在 `modules/private-work-context`，模块不改名，README 重写成「运行上下文绑定」。
- 改名是机械改动，另记一条 BL（③ 的 383），以后单独做。

**D6　`<home>/sessions/` 的存量。**
- **2026-10-23 用户确认方案 A**（经 ①）：保留机制条目写进 `specs/repository-anti-corruption`（用户 10-23 确认；只有备份和 `--purge-user-data` 认这个目录，没有代码打开它；删除条件：真实 Home 跑完 SC-5 的维护后删掉这条登记），放在 SC-4 的 PR 里、改 `home-stores.ts` 之前的第一个提交。SC-5 只在备份拷贝上只读列出，结果交 ①，由 ① 弹窗问用户；真实 Home 上执行归用户。
- 推荐 A：SC-4 在 `home-stores.ts` 把它留成「已退役的存储」。
  - 不再有代码打开它；
  - 备份集和 `uninstall --purge-user-data` 仍然认得它；
  - 再写一个维护步骤，列出后删除，真跑要用户弹窗同意（SC-5）。
  - 这个「已退役」的写法要避开兼容标记计数（不用 legacy、compat 字样）。
- B：直接从 `home-stores` 删掉，留在盘上，以后由维护清。
- C：启动时删。不推荐，因为删用户数据要先问。

**D7　`/api/goals/:id/panels` 路径点名了 goals（PG-082 原文提到）。**
- 推荐 SC-3 不改路径。
- 面板路由改名是合同变化，另记一条 BL（③ 的 384），等 W6-01 删短名别名时一起做。

**D8　门禁。**
- 不改门禁。巨大函数在搬家时拆小（SC-3）。
- 如果 ① 认为「`git mv` 之后的同名单元」应该认作同一个，那要改门禁，得问用户。我不推荐这样做。

## 4. 先后

- SC-1 可以立刻开：和在途 PR 只在枢纽文件上重叠。
- SC-2 可以和 SC-1 同时开：文件不重叠。
- SC-3 等 #1049 合入，并要 D1。
- SC-4 等 SC-1～SC-3、#1048 合入，并要 D2、D3、D6。
- SC-5 等 SC-4。
- #1048、#1063 一合入，我按 ① 的安排先切回 Goals S7b → S4；Sessions 剩下的片排在 Goals 两片后面，或者穿插做（请 ① 定）。

## 5. 不在本计划里

- Sessions 重做（BL-177 的需求书）。
- `/api/goals/:id/panels` 改名（D7）。
- 模块改名（D5）。
- PG-098 的其他插件。
- PG-073 的其他名单项：只删 sessions 这一项。
