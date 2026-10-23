# Sessions 清理：谁在用（③ 清点，2026-10-23，origin/main 6b9eec545）

只读清点，配 `sessions-cleanup-plan.md` 读。路径相对仓库根。(a) = 只属于 Session；(b) = 工作区、项目文件夹、终端面板（PG-082）；(c) = 其他共用（运行上下文绑定）。

## 1. 插件本身

- 包 `@molis-ai/molis-work-plugin-work`（`plugins/native/work`），导出 `.`、`./registration`、`./terminal`、`./terminal-client`；依赖 contracts、design-system、xterm。
- Manifest `src/manifest.ts`：`io.molis.work.sessions`，短名 `sessions`，0.3.0，`official-sessions-binding`；一个 UI 贡献、一个视图（directory/navigator「Sessions」，order 20）；无 artifacts。
- 登记 `src/registration.ts:8-17`：catalog_order 7，贡献 `workUiContribution` 与 `workTerminalUiContribution`。两个贡献的 plugin_id 写的是 `io.molis.work.native.work`（PG-098）。
- 动作（都 v1、项目级、subject `session`）：`src/actions.ts:38-94` 的 15 个 `sessions.*`（home.events、subject.read、search.entries、directory.read、list、content.read、resume、archive、associations.update、discover、create、handoffs.prepare/update/send/cancel），`src/message-actions.ts:21-29` 的 `sessions.message.send/read/retry`。权限 `sessions:read/resume/message/manage`。动作快照 `tooling/gates/actions/actions.tsv:520-537` 共 18 行。
- 错误：`work.sessions.*`、`work.workspace.*`（`workspace-actions.ts:21`）、contracts `private-work-context.ts:400` 的 `sessionErrors`（`work.session.*`）。
- HTTP（`src/http/*`，闸门 `http/index.ts:10`）：
  - (a) `/api/sessions`（列表、内容、恢复、discover、创建）、`/api/sessions/:id/messages`、`/api/session-messages/:id[/retry]`、`/api/sessions/:id/handoffs`、`/api/session-handoffs/:id[/send|/cancel]`、`/api/sessions/:id/associations`、`/api/sessions/:id/archive`。
  - (b) `http/workspaces.ts`：`POST /api/workspaces/pick`、`POST /api/workspaces`（→ `projects.workspaces.add`）、`PATCH /api/workspaces/:id/path`、`POST /api/workspaces/:id/unlink`、`POST /api/workspaces/:id/sessions`（→ `sessions.create`）。
  - (b) `http/panels.ts:47-51`：`GET /api/goals/:id/advance-prompt`、`GET/POST /api/goals/:id/panels`、`DELETE /api/panels/:id`、`POST /api/panels/:id/exited|reopen`；调 `host.sessionIds`、`host.recordSessions`。

## 2. 文件分类

`plugins/native/work/src`
- (a) `actions.ts`、`message-actions.ts`、`content.ts`、`directory.ts`、`handoff*.ts`、`messages.ts`、`registry-fallback-adapter.ts`、`tui-recorder.ts`、`types.ts`、`http/{content,create,messages,handoff,associations,public-records}.ts`、`ui/` 下的会话目录界面（contribution、render、read-model、types、en、styles、browser、各 `*-client.ts`）。
- (a/b) `http/index.ts`（两类路由一起挂）、`http/types.ts`。
- (b) `http/workspaces.ts`、`http/panels.ts`、`workspace-actions.ts:27-129`（repair/unlink，含 `registry.reassignWorkspaceSessions` 与回滚）、`terminal/*`（xterm 通道、面板、自动填充）、`ui/terminal.ts`（目标页 TUI 窗格）。
- (c) `manifest.ts`、`registration.ts`、`index.ts`。

`modules/private-work-context/src`
- (a) `session-registry.ts`（`:64-69` 开 `<home>/sessions/sessions.db` 与 `content/`）、`session-schema.ts`（owner `molis-work-session-registry-v1`、v7，`:75` 只认 v7）、`session-records|events|handoffs|messages.ts`、`session-associations.ts`、`handoff-associations.ts`、`content-store.ts`、`contract-aliases.ts`、`session-host-signals.ts`、`project-data.ts`（`purgeSessionsProject`、`sessionsProjectData`）。
- (a/b) `session-surfaces.ts`（面板、绑定、Character 的会话登记）。
- (c) `context-bindings.ts`、`context-binding-references.ts`、`binding-errors.ts`、`project-binding-*.ts`、`project-resolution.ts`、`project-setup.ts`、`project-suggestions.ts`、`runtime-context-module.ts`：表在目录库（`apps/local-host/src/catalog-schema.ts:16-18`），用方 `project-catalog.ts`、`managed-project-*.ts`、`demo-project-lifecycle.ts`、`apps/mcp/src/runtime-context-tools.ts`。
- 合同 `packages/contracts/src/modules/private-work-context.ts`（417 行）把 (a) 的 WorkSession/Handoff 类型、`sessionErrors` 和 (c) 的 RuntimeContextBinding、RuntimeGoalSessionActivity、RuntimeSessionReadResult 混在一个文件。

## 3. 两个包之外的用方

`apps/local-host/src`
- 装配：`project-host.ts:148`（`SessionRuntimeService`）、`:175`（`workActionProvider`）、`:176`（`projectWorkspaceActionProvider(... this.sessions)`）、`:384-396`；`session-runtime-resources.ts:21-78`；`session-registry.ts:7,12`；`work-actions.ts:7-17`；`local-owner-permissions.ts:29`；`web-request.ts:194-198,278,284,290`；`web-composition.ts`、`web-route-table.ts`；`index.ts:9-12,166-178` 公开转出。
- (b) `project-workspace-actions.ts:19-74`（`system.project-workspaces` 的 add/repair/unlink；`current()` 扫注册表里的会话）；`web-work-session.ts:12-56`；`web-panel.ts:24-105`；`panel-sessions.ts`；`runtime-panel-session.ts`。
- Home 对话（首页「说一句」）：`home-talk-actions.ts:13-29`（`home.talk.prepare` 要 `sessions.directory.read@1`，钉 `io.molis.work.sessions`），接线 `home-actions.ts:51,179`、`home-dock-http.ts:41`。
- 删项目：`project-deleted-owners.ts:67`（`sessions`，survivesRebuild）。Home 存储：`home-stores.ts:29`（卸载 `--purge-user-data` 经它删 `sessions/`）。
- 目标页：`web-goals-read.ts:162-170`（启用 sessions 时拼会话区）；`web-session.ts`。
- MCP：`mcp-server.ts:84,103,109,240,277-280`（读会话、面板链接、目标生命周期写会话活动）；`runtime-session.ts:7-76`。
- PTY：`web-server.ts:236-245` 把每个 PTY 的输出和退出交给 `SessionTuiRecorder`。
- Characters：`character-native-execution.ts:51-110`（本地 Agent 执行记录存成 Session：`runs()` 列表、输出取会话事件、按 `character-<request_id>` 面板 id 幂等重连），接线 `characters-host.ts:14,94`；动作 `characters.runs`（`modules/characters/src/action-handlers.ts:101`）。
- 演示数据：`demo-plugin-seed.ts:209-240`。

`apps/mcp/src`：`session-activity.ts:11-23,82-106`（goals.* → 会话事件表）、`context-presentation.ts:49-58`（`session_registry` 块）、`resume-view.ts:23-28`（`session_focus`）。没有 `session_*` 工具。

`apps/workbench/src`
- `builtin-plugins.ts`（生成物）、`work-ui.ts`、`page-assets.ts:20,89,107`、`ui-composition.ts:179-184`、`renderer.ts:301-320`（TUI 窗格）、`goals-page-renderer.ts:203`（默认启用含 sessions）。
- (b) `terminal-client.ts:2,8`（`startWorkTerminalClient`，和 Shelf、Character 终端一起）；`character-terminal-client.ts:1`（Work `/terminal`）；`project-settings.ts:39,42`（平台设置页调 Work 发的 `/api/workspaces*`）。
- 点名 sessions 的表：`plugin-catalog.ts:110`、`immersive-shell.ts:87`、`primitive-catalog.ts:18,36`、`tab-workspace-ops.ts:13`、`tab-workspace.ts:207,321-337`、`global-search.ts:31`。
- 首页说一句：`project-home.ts`、`home-talk.ts:47-107`；画布会话块 `frame-container.ts:145,190`；`immersive-navigation.ts:89-138`、`events-secondary.ts:301`、`refresh-decisions.ts:24`（`data-tui-*`）；样式 `styles/base.ts`、`responsive.ts`、`goal-canvas.ts:533-588`、`project-home.ts:195-317`。

其他：Goals `event-document-client.ts:64` 对 `[data-tui-pane]` 设 inert。Coding 不 import Work、不用 `/api/sessions`、不用面板路由（它的 sessions 面和 `coding.sessions.*` 是自己的）。desktop、cli 无引用。`skills/molis-plugin-dev/examples.md:55` 描述了 Sessions。

## 4. 测试

- (a)：session-content、session-content-privacy、session-directory、session-handoff、session-handoff-recovery、session-messages、session-resume、session-adapters、session-registry、session-associations-atomic、session-project-actions、session-tui-capture、session-web、session-workspace.e2e、session-association-journey.e2e、work-session-actions、work-session-mcp、work-session-ui、handoff-ledger、home-talk-actions、home-talk.e2e、mcp-session-activity、mcp-resume-view 与 runtime-context-entry 的会话部分、private-work-context-module、private-work-context-boundaries.test.mjs、historical-sql-fixture.ts（类型）。
- (b)：workspace-directory（`:24` 回滚经注册表、`:140` 会话改挂）、workspace-directory-picker、workspace-project-actions（`:13` 经 `/api/workspaces/:id/sessions` 起会话、`:139` 没有 Sessions 也能用）、project-workspaces-settings.e2e、work-terminal-client、desktop-tui、panel-sessions。
- 混合：project-deletion-owners、home-backup-recovery（`createSessionContentStore`）、characters-native-execution（`SessionTuiRecorder`）、moved-on-error-kinds、session-project-binding-router（c）、mcp、builtin-plugin-assembly-gate。

## 5. 数据

- `<home>/sessions/sessions.db`（WAL，v7，无升级路径）：session_meta、sessions、session_events、session_handoffs、session_messages，加 Ledger 注入的 context_edges（scope personal/private-work-context）。
- `<home>/sessions/content/blobs/**` 与 `content.key`（AES-256-GCM）。`docs/system/HOME-DATA.md:28,45-46,159-163` 有记录：备份要同一时点包含 db 与 content。
- 写入方：Sessions 自己、Characters 执行、演示种子、桌面与 MCP 的面板链接、MCP 目标生命周期、PTY 录制。
- 没有维护脚本开 sessions.db；维护途径只有删项目的 owner、备份集、卸载清除。`table-owners.json` 无 Sessions 条目。

## 6. 门禁与名单

- `tests/builtin-plugin-assembly-gate.test.ts:47-50` 的 `BUILD_TIME_ASSEMBLED` 含 `sessions`。
- `project-host.ts:175-176` 两条 `registerProvider`；`home-actions.ts:51,179`。
- 动作快照：`actions.tsv:520-537`（18 行）、`host-actions.tsv:87`（home.talk.prepare）、`:147-149`（projects.workspaces.*）。
- API 快照：`tooling/gates/api/contracts/modules/private-work-context.txt`、`projects.txt`、`workspace-action-schemas.txt`、`workspace-artifacts.txt`；`tooling/gates/api/services/runtime-host.txt`。
- `error-owners.json:316-324`（owner `work`）；`baseline.json` 里的巨大单元（RuntimeProjectBindingCommands、SessionHandoffRepository、SessionRecordRepository、MolisWorkSessionRegistry、createWorkActionHandlers 169、handleWorkPanelHttp 163、startWorkTerminalClient 431、createTerminalPanels 365、renderWorkSessionSurface 342）及 testImports、rawFetchInScripts、moduleRepositoryExports 等。
- 脚本：`scripts/workspace-packages.mjs:58,98`、`check-package-boundaries.mjs:1169`、`gates/source-counts.mjs:18`、`gates/browser-programs.mjs:371`、根 `package.json:101,131`。
- 文档：`docs/SSOT-MATRIX.md:9,89,97,155`；`PRODUCT.md:20,31,33,55,132-136,160`；`docs/modules/private-work-context.md`、`GLOSSARY.md:264,410`、`RUNTIME-MIGRATION.md:31`、`HOME-DATA.md`；`docs/product-operations/` 四份。
