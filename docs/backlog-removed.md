# 已删除或不在 main 的 BL 编号

本表只做墓碑，不重新打开事项。现行文档引用历史编号时先查这里；`specs/backlog/` 下没有对应文件，不代表事项仍未处理。

上半张表是关键历史编号和替代关系；末尾「缺失编号速查」是完整允许名单，按当前活文档生成，不是新的待办。两者重复的编号以替代关系为准。

| 编号 | 处置 | 依据 / 替代 |
| --- | --- | --- |
| BL-tests-umask | 已完成并删除 | 2026-11-19：离线恢复与运行时备份测试夹具显式设置权限，在 `umask 077` 与 `022` 下均通过原权限断言（`apps/local-host/src/installer/runtime-installation-files.ts`、`tests/fixtures/home-restore.ts`、`tests/fixtures/runtime-config-backups.ts`、`tests/home-snapshot-cli.test.ts`、`tests/security-invariants-home-restore-recovery.test.ts`、`tests/security-invariants-runtime-backups.test.ts`），由 [#2171](https://github.com/molis-ai/molis-work/pull/2171)（`9d25c9d1cd`）合入，正式交付项 [73-3](../specs/post-anticorruption-roadmap/reference/batches/73.md#batch-73-item-3) 离线恢复回归切片；条目 2026-11-20 删除 |
| BL-981 | 已完成并删除 | 2026-11-19：知识检索不可读原因与模型所选理由按完整字符边界截断（`horizontal/knowledge/src/errors.ts`、`tests/knowledge-locate-budget.test.ts`），由 [#2177](https://github.com/molis-ai/molis-work/pull/2177)（`4f2bd4e5f5`）合入；条目 2026-11-20 删除 |
| BL-985 | 已完成并删除 | 2026-11-19：Images 五个输入框与服务端共用同一套按字符计数和上限校验（`plugins/native/images/src/limits.ts`、`plugins/native/images/src/browser/limits.ts`、`tests/images-input-limits.e2e.test.ts`），由 [#2177](https://github.com/molis-ai/molis-work/pull/2177)（`4f2bd4e5f5`）合入；条目 2026-11-20 删除 |
| BL-1033 | 已完成并删除 | 2026-11-21 核对后结清：第 06 批 N13 由 [#2009](https://github.com/molis-ai/molis-work/pull/2009)（`a720834a09`，2026-11-13）合入。Dataset 请求改用 SDK `pluginRequest`，带页面 `scope` 与 `readRefusal`（`plugins/native/dataset/src/browser/request.ts`）。表格离开后，传输中或保存中的请求会被取消（`AbortError`）。正文晚到时不会刷进已卸载的旧页面，也不会弹出确认框。宿主以 403 `actions.scope_mismatch` 拒绝读取时，页面显示「无权读取此内容」并给重试。证据：`tests/dataset-actions.e2e.test.ts` 的「BSH-09 BL-1033」transport／body／save 三条，在 main `af56e57e52` 用隔离 Home 与测试浏览器重跑，全文件 6/6 通过 |
| BL-1039 | 已完成并删除 | 2026-11-21 核对后结清：第 27 批 action-copy 片由 [#2010](https://github.com/molis-ai/molis-work/pull/2010)（`539d2d7d46`，2026-11-12）合入。首次使用「资料已经准备好」在没连模型时，重试按钮叫「连好后继续整理」，英文叫「Continue after connecting」；连上后叫「继续整理／Continue」（`apps/workbench/src/scripts/context-onboarding.ts`）。本次一并删掉词包里已没有引用的旧键 `workbench.context-onboarding.connected-continue`（「已连接，继续整理」／「Connected — continue」）。证据：`tests/context-onboarding-action-copy.e2e.test.ts`（ACTCOPY-01／02）在中英文、深浅色、1440／1024／390 下逐一核对无障碍树的按钮名，并断言旧文案不出现；在 main `af56e57e52` 用隔离 Home 与测试浏览器重跑 1/1 通过。本人验收随 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md) ⑦ |
| BL-975 | 已完成并删除 | 2026-11-21：Feed 入库的标题（300）与摘要（2 000）、手工捕获的摘要（240）、来源同步预览的摘要（320）与正文（1 600）、错误摘要（400）各按原上限改用 SDK `cutHead`，边界上的两单元字整个保留或整个舍去，保存读取后不再有半个字（`tests/feed-whole-units.test.ts`），由 [#2195](https://github.com/molis-ai/molis-work/pull/2195) 合入。 |
| BL-982 | 已完成并删除 | 2026-11-21：RAC-2711 的 capture 替身按端口合同返回 `write` 的结果，断言分成「调用方同步收到原拒绝对象」与「拒绝前写入的 source_rule 条目回滚」两组；Feed 的调用级拒绝改用 SDK 公开的 `actionErrorKind`，拒绝表去掉已由 forbidden 覆盖的 `actions.forbidden`、`actions.plugin_permission`，权限语义不变（RAC-2712 仍逐码钉住）。成果线被占的 `artifacts.plugin_denied` 仍按 forbidden，等实际案例另定。由 [#2195](https://github.com/molis-ai/molis-work/pull/2195) 合入。 |
| BL-959 | 已完成并删除 | 2026-11-20：`AgentStepReportAuthor` 从 `@molis-ai/molis-work-contracts/services/agent-host` 公开导出，API 快照随之更新；Coding 步骤详情的 `StepReportAuthor` 改为直接引用它，包外调用者从该子路径 `import type` 编译通过；由 [#2193](https://github.com/molis-ai/molis-work/pull/2193) 合入，原属 [53-1](../specs/post-anticorruption-roadmap/reference/batches/53.md#batch-53-item-1) 的 Backlog 验收，53-1 其余照旧 |
| BL-967 | 已完成并删除 | 2026-11-20：宿主 `PluginHostExecutorOptions.databaseFor` 的注释按 `homeLibraryFor` 改写——它是宿主给启动名单上定义的库声明，决定怎样开库而不决定有没有库；不在名单上的（或沙箱的）按安装记录在台账下开 Manifest 声明的库，只拒绝声明 `project_rows` 与缺少或不符的安装记录；行为未变，来源 [#1210 评审](https://github.com/molis-ai/molis-work/pull/1210#issuecomment-6384193830)，由 [#2193](https://github.com/molis-ai/molis-work/pull/2193) 合入 |
| BL-974 | 已完成并删除 | 2026-11-21：助理分段发送材料只在完整字符之间切。普通轮（`chunked`）与评论线程（`threadReplyMaterials`）共用 `apps/local-host/src/assistant/assistant-material-parts.ts`：每段至多 18,000 个 UTF-16 单元，跨边界的 🟢 整个进下一段，每段能单独解码，按序拼回即原文，段号与总段数照旧；子任务交回材料的截断改用 `cutHead`。`docs/platform/PLUGIN-DEVELOPMENT.md` 写明评论上下文 `text` 至多 100,000 个单元、超出宿主拒收。回归在 `tests/assistant-business-gateway.test.ts` 与 `tests/assistant-thread-reply.test.ts`（真实 Host + Prologue），修复前在「每段能单独解码」处失败 |
| BL-1006 | 已完成并删除 | [93-1](../specs/post-anticorruption-roadmap/reference/batches/93.md#batch-93-item-1) 由 [#2148](https://github.com/molis-ai/molis-work/pull/2148)（`59ab3bf6fd`，2026-11-19）合入。普通离开、带收尾动作的离开和撤权时，同页每个在途请求都获得自己的错误对象和正确原因码。 |
| BL-browser-socket-close-pending-bind | 已完成并删除 | [93-2](../specs/post-anticorruption-roadmap/reference/batches/93.md#batch-93-item-2) 由 [#2149](https://github.com/molis-ai/molis-work/pull/2149)（`a87afa196b`，2026-11-19）合入。侧栏连接关闭后会释放已有监听，晚到的项目检查不会再挂监听。 |
| BL-973 | 已完成并删除 | 2026-11-18：图片插件 README 的浏览器回归命令补列 `images-result-whole-characters.e2e.test.ts`（下载链接、实际文件名与 Shelf 留存回执里的两单元字），由 [#2144](https://github.com/molis-ai/molis-work/pull/2144) 合入，正式交付项 [92-1](../specs/post-anticorruption-roadmap/reference/batches/92.md#batch-92-item-1)；条目 2026-11-20 删除 |
| BL-1017 | 已完成并删除 | 2026-11-18：Goals 两份测试的夹具关闭即使前一步抛错也依次清完本次 Host 与临时目录并报首个异常（`tests/fixtures/ordered-cleanup.ts`），由 [#2146](https://github.com/molis-ai/molis-work/pull/2146) 合入，正式交付项 [92-3](../specs/post-anticorruption-roadmap/reference/batches/92.md#batch-92-item-3)；条目 2026-11-20 删除 |
| BL-964 | 已完成并删除 | 2026-11-20：Plugin Runtime 的路由分发与撤下贡献共用一处「是不是流」的判断 `streamsLines`（`packages/plugin-runtime/src/routes.ts`），即 Manifest 现行唯一允许的 POST `"ndjson"`；`offered-contributions.ts` 不再把任一已声明的 `stream` 当成流。撤下贡献时等着的普通请求立即答 403，进行中的流不被这个 403 截断、由路由的实例监视取消（499）且晚到的尾巴不写；见 `tests/plugin-route-stream-lifecycle.test.ts` 的 W5-01-STREAM-06 |
| BL-960 | 已完成并删除 | 2026-11-20：补 RAC-181 等待期间撤权的拒绝测试。`tests/agent-host-actions.test.ts` 先等到 `agent.run.wait` 已在跟这一轮（Runtime 的订阅数可见为 1），再经人的权限开关 `PluginRuntime.regrant` 关掉一项可选权限（撤下发起调用的那次激活），之后让这一轮变化：调用方收到 `actions.forbidden`、拿不到轮次视图、拒绝里不带轮次内容，调用记录只留代码，订阅放掉。拒绝来自调用方的插件身份在处理器返回后的最终授权检查；不需要改产品代码 |
| BL-project-membership-revision-read | 已完成并删除 | 2026-11-20：项目插件成员的版本化读取（`ProjectPluginMembershipService.readSnapshot`）改由项目库主人一条语句读出成员、隐藏项与最近一次成员增删事件（`modules/projects/src/project-records-repository.ts` 的 `pluginMembershipFacts`），不再另查 `project_events`；常开、个人插件的列表与隐藏规则和不带版本的读取共用同一套，revision 计算口径不变，加了又删回原样仍按事件检出。见 `tests/project-plugin-membership-revision.test.ts` 以这个编号开头的用例与 `tests/project-plugin-membership-http.test.ts` |
| BL-015、BL-1048、BL-b16-capsule-native-verification | 随胶囊删除，并入 BL-capsule-redo | 第 44 批第 7 项（2026-11-17）删掉桌面工作胶囊（PEQ-13）；仍成立的要求由 [BL-capsule-redo](../specs/backlog/BL-capsule-redo.md) 承接 |
| BL-report-rounds-auto-cap | 已完成并删除 | 第 97 批 97-1（2026-11-19）：宿主为没有对话来源的任务起的只汇报一轮在轮次上记 `report_only`，两处上限（接续起跑、委托交回）共用 `roundsOnItsOwn`，跳过汇报轮、不加也不清零；标记存在库里，重启后照样分得出。用户定不升助理库版本、不迁移：标记之前存下的汇报轮照旧计数。见 [97.md](../specs/post-anticorruption-roadmap/reference/batches/97.md#batch-97-item-1) |
| BL-work-line-report-batch | 已完成并删除 | 第 97 批 97-2（2026-11-19）：`AssistantTaskReports` 把一次读取里同一项目结束的行交成一批，`AssistantReportRounds.report` 起一轮列出全部结果（一件时措辞照旧），忙时整批等下一次空闲；每件任务仍各一条提醒、按任务去重。见 [97.md](../specs/post-anticorruption-roadmap/reference/batches/97.md#batch-97-item-2) |
| BL-set-output-revision | 已完成并删除 | 2026-11-20：插件页面设输出目录（`UiPageWorkspaces.setOutput`）与打开说明文件时，外壳把确认框读到的目录 `revision` 随请求交给 Host（`apps/workbench/src/browser/plugin-frame/workspaces.ts`），Host 按它调 `projects.directories.set_output@1` / `set_instructions@1`，不再在写入请求里重读（`apps/local-host/src/plugin-page-workspaces.ts`）；期间别处改过目录就按 `actions.conflict` 拒绝，页面得到「项目的文件夹刚在别处改过」的提示，别处的选择保留，再问一次按最新目录确认即可。两窗口回归见 `tests/plugin-page-workspaces.e2e.test.ts`「BL-set-output-revision」 |
| BL-375 | 已完成并删除 | 第 98 批（2026-11-19）：几个插件可以声明同一种过程项类型，每份记着平台写下的生产插件；接收方 `services.artifacts.listConsumable()` 取全部有权读取的，或按 `producer_plugin_id`、`artifact_type_id` 只取某一家、某一类；成果类型仍按 S-82 一个属主。开工前检查、合同与验收 BL375-01～07 见 [98.md](../specs/post-anticorruption-roadmap/reference/batches/98.md#batch-98-item-1-check) |
| BL-feed-sql-driver-name、BL-feed-run-now-missed-again、BL-missed-runs-never-expire | 已完成并删除 | 第 95 批（2026-11-18）：Feed 连接工厂改名 `fromProjectConnection`；「现在做」把来源放回错过的那一刻并在错过记录上留决定，睡眠或重启后照做一次、不再问；Feed、定时任务、助理跟进错过的事都从 `due_at` 起留七天，到期没处理的自动跳过（一次性提醒与任务一并结束），运行面板与首页汇总一次，「知道了」记在 `run/expired-seen.json`；见 [95.md](../specs/post-anticorruption-roadmap/reference/batches/95.md) |
| BL-schedule-one-off-detail、BL-schedule-view-refresh-followups | 已完成并删除 | 第 96 批后续（2026-11-20）：编辑一次性任务时，表单不再给「每天」的时间，改写一行它哪天几点跑（详情渲染出的 `data-schedule-task-once` 带上格式化的运行时间，浏览器用例从真正建出的一次性任务进入）；Schedule 的每个命令动作（页面、助理、MCP、提醒与定时操作的唤醒）结束后都推页面版本（调用方仍有权限时），页面首次核对也重读，页面重读按先后编号、晚回来的旧答复不再画，后台重读不标已读，对账在授权清理之后出错时也补推；见 `tests/schedule-isolated-page.e2e.test.ts`、`tests/schedule-task-grants.test.ts` 里以这两个编号开头的用例 |
| BL-schedule-update-task-lookup | 已完成并删除 | 第 96 批 96-1（2026-11-19）：`schedule.tasks.update@1` 按编号只读这一项（Schedule 端口 `getTask`），没写重复规则时保留原规则，别的项目、已归档的编号答「定时任务不存在」；见 [96.md](../specs/post-anticorruption-roadmap/reference/batches/96.md) |
| BL-schedule-detail-refresh-after-failed-round | 已完成并删除 | 第 96 批 96-2（2026-11-19）：一轮写回与后台停下任务、改下次时间时 Schedule 调 `services.ui.invalidate()`，开着的详情经 `scope.watchRevision` 就地显示刚没跑成的一轮和原因，重读期间保留用户的新选择；余项 BL-schedule-view-refresh-followups；见 [96.md](../specs/post-anticorruption-roadmap/reference/batches/96.md) |
| BL-home-library-second-statement | 已完成并删除 | 2026-11-19：插件的 Home 库一次给两句时不再只跑第一句、悄悄丢第二句——客户端的关键字过滤（`apps/local-host/src/project-statement-protocol.ts`）跑项目库同一个扫描 `readSqlStatementShape`，宿主里跑的（`services.database`）与沙箱的（`services.database_statements`）都抛 `more than one statement`，两句都不执行，尾部只有空白和注释照常；见 [SQLite 第二步 §3.3](../specs/sqlite-driver-switch/spec.md) |
| BL-plugin-cli-dev-uncoded-errors | 已完成并删除 | 2026-11-19：`molis-work plugin dev` 被拒时各给自己的码，不再一律报 `plugin.manifest_invalid`：普通非空状态目录 `host.plugin_development_directory_occupied`（目录原样不动）、标记不认得 `host.plugin_development_directory_unsupported`、漏写 `--allow-unsigned-development` 为 `plugin.unsigned_development_required`、dev 其余无码失败兜底 `plugin.development_failed`；`plugin.manifest_invalid` 兜底只留给 `validate`，手册与 Skill 的「误报」说明已删。归入 [48-1](../specs/post-anticorruption-roadmap/reference/batches/48.md#batch-48-item-1) 的 CLI 子项，已由 [#2152](https://github.com/molis-ai/molis-work/pull/2152)（`517c2c6716`）合入；48-1 其余照原排期。 |
| BL-attention-404-by-code | 已完成并删除 | 2026-11-19：宿主只在目录库说没有这个项目时回 404 并带 `catalog.project_not_found`，目录库读失败不再报成 404，不指向项目的地址仍是不带码的 404；工作台提醒（`attention.ts`）的读取与事件流只在这个码上停读，别的 404 当普通失败、照原节奏重连并自行恢复。归入 [56-1](../specs/post-anticorruption-roadmap/reference/batches/56.md#batch-56-item-1) 的提醒子项，已由 [#2160](https://github.com/molis-ai/molis-work/pull/2160)（`a462bf81f2`）合入；56-1 其余照原排期。 |
| BL-1065 | 已完成并删除 | 2026-11-19 用户决定：动态与研究正文继续加密，同一个 Home 共用一把钥匙。`packages/storage/src/adapters/evidence-content.ts` 的 `keySharingRoots` 一处列出共用目录（`feed/evidence` 与每个 `alchemist/projects/*/search-content`），缺钥时任一处有旧正文就保留、拒绝新写入（`storage.evidence_content.key_unavailable`）、不铸替代钥，全部为空才在首次保存时建钥；Feed 同步（`host.source_pull.evidence_key_missing`）与研究搜索（`alchemist.research_evidence_key_missing`）缺钥时先停下说明，不取数。隔离 Home 回归 `tests/security-invariants-evidence-shared-key.test.ts`（S-12） |
| BL-desktop-same-version-install | 已完成并删除 | 第 94 批（2026-11-19）：开发机重装同版本 App 后，打开就换上新构建——桌面在版本相同时比两边构建指纹 `dist/.molis-work-build.json` 的 `created_at`，只装更晚的构建，回退保留照旧先判（`apps/desktop/adapters/tauri/src/web_service.rs`）；隔离 Home 实操 DSV-01～05 见 [94.md](../specs/post-anticorruption-roadmap/reference/batches/94.md) |
| BL-knowledge-restore-partial-catalog | 已完成并删除 | 第 73 批 73-3 知识卡切片（2026-11-18）：Search 的 `indexedCatalog` 给出 `unsettled()`（主人登记但索引里没有完整一遍的来源），`KnowledgeOrganizer.reconcile` 不按这些来源判卡不在，打开卡片与后台整理两条入口都保住卡的行号、正文、手改与排除，不重复花额度；完整列过且主人确实删了的照旧清理。本项验收「恢复 Home、搜索索引还没追齐时保住知识卡，用缺失条目稍后重新出现的样本回归」由回归 `tests/knowledge-cards.test.ts`、`tests/knowledge-fresh-catalog.test.ts` 覆盖（条目在来源追齐前缺席、追齐后重新出现）；见 [73.md](../specs/post-anticorruption-roadmap/reference/batches/73.md#batch-73-item-3) |
| BL-980 | 已完成并删除 | 2026-11-18：`openHomeSqliteFile`（`packages/storage/src/home-sqlite.ts`）的注释分开写只读与可写两种打开——只读遇缺失文件报错且不建文件，可写会建空库，`file:` URL 带 `mode=rw` 不建；行为未变，来源 [#1255 评审](https://github.com/molis-ai/molis-work/pull/1255#issuecomment-6392998821) 不挡合并第 4 项。归入 [92-2](../specs/post-anticorruption-roadmap/reference/batches/92.md#batch-92-item-2)，已由 [#2145](https://github.com/molis-ai/molis-work/pull/2145) 合入。 |
| BL-917 | 已完成并删除 | 第 61 批（2026-11-18）：Feed 账号来源扩到 Home 能按账号拉取的每个服务——平台 `services.sourcePull.accounts()` 答已连接、能否拉取与服务名，Feed「其他服务的账号」一处选服务；见 [服务矩阵 §3](../specs/assistant-service-connections/service-matrix.md) |
| BL-action-card-outcome-text、BL-work-brief-source-name-text | 已完成并删除 | 2026-11-17：动作卡片结果与 Work Brief 来源名改存文字引用（`OwnedTextRef`），助理库 1→2、项目库 4→5、Work Brief 库 1→2 把旧句子转成 `{ literal }`（见 `docs/system/CONTRACT-CHANGES.md`「存下的句子改成文字引用」） |
| BL-359、BL-360 | 已完成并删除 | 第 39 批（2026-11-16）：`AgentReviewQueue` 在拒绝、取消、到期与结算后释放执行闭包与宿主签发 caller（`horizontal/agent-host/src/reviews.ts`、`apps/local-host/src/plugin-callers.ts`、`tests/agent-review-lifecycle.test.ts`、`tests/prologue-git.test.ts`）；待审投影携带 `AgentReviewDecisions` 可决定性，恢复或撤权后不再提供无效批准按钮且保留草稿与焦点（`tests/agent-review-decisions.test.ts`、`tests/agent-review-http.test.ts`、`tests/agent-review-presenters.e2e.test.ts`）；见 [39.md](../specs/post-anticorruption-roadmap/reference/batches/39.md) |
| BL-328 | 已完成并删除 | 第 30 批「最小真实评测路径」补齐隔离 Home 可复现评测命令 `pnpm eval:run`（`scripts/run-evaluation.mts`），严拒 `~/.molis-work`、默认 stand-in 可复现校验并支持 Gemini 在线模式内联读取密钥跑完删 Home；见 [30.md](../specs/post-anticorruption-roadmap/reference/batches/30.md) |
| BL-051、BL-182、BL-222、BL-540 | 已完成并删除 | 第 33 批（2026-11-14）：子任务尝试预算与「再给 3 次」、子任务重试带 `source: "host"`、命令未知结局与四节收尾报告及步骤进度扣除、Coding 经宿主公开启动时刻判断中断（不再调 `process.uptime()`）；实物走查集中收成 [BL-batch33-acceptance](../specs/backlog/BL-batch33-acceptance.md) |
| BL-041、BL-102、BL-112、BL-138、BL-910、BL-958 | 第 27 批验收集中跟踪 | 第 27 批 #2010 收成 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md)；原条目删除 |
| BL-091、BL-096、BL-103、BL-131、BL-367、BL-569、BL-701、BL-803、BL-819、BL-821、BL-901、BL-911、BL-913、BL-914、BL-915、BL-918、BL-919、BL-920 | 已完成并删除 | 第 27 批 #2010（`539d2d7d46`，2026-11-12）；验收余项见 BL-batch27-acceptance |
| BL-plugin-dev-state-dir-before-locale-check、BL-catalog-specimen-default-margin | 已完成并删除 | 第 14 批登记的两条小缺口，2026-11-13 14／27 收口 PR 修掉；见 [14.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/14.md#实现进度与合入记录) |
| BL-166 | 已完成并删除 | 第 42 批（2026-11-16）：通用技能「改一份我的」记住来源，`~~` 占位符换成自己用的，采用时可关掉原来的，原来的出新版时可看差别、带进草稿或先不管；见 [42.md](../specs/post-anticorruption-roadmap/reference/batches/42.md)。连接 MCP 仍在连接设置里做，技能只声明工具 |
| BL-goals-methods-as-skills | 已完成并删除 | 第 41 批第 2 项：规划与拆解方法是随系统自带的技能包，Goals 不再有方法库；见 [41.md](../specs/post-anticorruption-roadmap/reference/batches/41.md) |
| BL-376 | 已并入 BL-377 | [BACKLOG.md](../specs/BACKLOG.md) 顶部说明；Alchemist 由 [BL-377](../specs/backlog/BL-377.md) 整体重做，编号不复用 |
| BL-928 | 已完成并删除 | 真实 Home 干净重建，2026-11-07 #1914（`d125b36f5c`） |
| BL-linux-ci-browser-reds | 已完成并删除 | 2026-11-13 #2044 放宽首页截止、#2046 修其余 Linux 浏览器用例；批次 15 已记「BL 已删」 |
| BL-side-files-merged-reads | 已完成并删除 | 第 06 批 N52 已并入并完成；批次 06 与依赖表保留历史说明 |
| BL-b12-coding-executor-reads、BL-b12-secret-names-and-cut | 已完成并删除 | 第 12 批合后审计整改：Coding 执行改一次 `projectDirectories` 读、`shapes.ts` 改用合同类型、`readInstructions` 把回执带回页面；`contextFileSkip` 与 Rust 副本补常见密钥文件名，并钉住 vendored SDK 的截断句；2026-11-14 |
| BL-b12-onboarding-take-followups | 已完成并删除 | 第 12 批合后审计整改：承接失败/不可用时完成页说明原因并提供去插件页；2026-11-14 |
| BL-1074 | 已完成并删除 | [#2029](https://github.com/molis-ai/molis-work/pull/2029) 修复跨进程插件框架不跟随页面 reduced-motion；原生 Linux no-fail-fast full suite [43546443501](https://github.com/molis-ai/molis-work/actions/runs/43546443501) 的 shard 21 首轮 `coding-question-card.e2e` 6/6，无 CDP 超时；该 run 整体仍红在 shard 7／17（合并基线既有）与 shard 26 的 `workbench-frame-container.e2e`（该用例没有设页面 reduce，新逻辑只多一次页面读取，重试仍红，需在合并后的 main 上另核）；2026-11-14 删除 |
| BL-golden-prompt-uses-flaky、BL-materials-object-link | 已完成并删除 | 第 06 批合后审计（2026-11-13）：golden-prompt 偶发由生成期屏蔽知识整理 2 秒定时器稳定（`tests/golden-home.test.ts` 42/42）；资料对象链接恢复（`tests/appearance-side-windows.e2e.test.ts` 3/3，页面资源许可 +155 B）；见 [06.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/06.md#batch-06-audit) |
| BL-1071 | 已关闭；两个历史事项曾同号 | 2026-11-07 #1921 删除 S-102 的条目；Memory 的 SDK 采用随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入。编号不再复用 |
| BL-memory-p0-closure | 已完成并删除 | Memory P0 经 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；继续跟踪的事项已列在 [BACKLOG](../specs/BACKLOG.md) |
| BL-memory-p1-contract | 已完成并删除 | 第 31 批「SDK 窗口一」完成 Memory P1 合同四问拍板并落地 SDK / Host 接线（① 20 版计数历史覆盖整理撤销窗口且每条自动改动记结构化 `policy` + `trigger_evidence`；② `memory/memory.db` `2 → 3` 正文单一写主人；③ Export v2 嵌于 Molis 信封 v1 并整包拒绝旧 `goal_ids`；④ 适用条件切为通用对象引用 `applies.objects`）；见 [31.md](../specs/post-anticorruption-roadmap/reference/batches/31.md) |
| BL-1076、BL-1077 | 已按用户决定关闭 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入；[本人走查](../specs/backlog/BL-memory-own-app-walkthrough.md)另列，历史真实 Home 影响仍未知 |
| BL-161、BL-164 | 已完成并删除 | 第 12 批第一项（`4d8bc20bf2`）：计划卡与任务板按位置编号、「未开始」统一为「等待前一步」；见 [12.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/12.md) |
| BL-feed-wake-resets-page、BL-assistant-card-press-scrolls | 已修复并删除 | 随 [#2020](https://github.com/molis-ai/molis-work/pull/2020) 合入，Feed FBR-07/FSS-35 与助理 AC-05 在[最终 Linux 全量](https://github.com/molis-ai/molis-work/actions/runs/43467505571)首轮通过 |
| BL-skill-hand-and-tools-consumers | 已关闭并删除 | 第 41 批：`find-skills`／`read-skill` 没有消费者，从 Molis 工具目录删掉，原因记在 `RUNTIME_TOOLS_NOT_OFFERED`；见 [Skill 策略 §10](../specs/prologue-strategies/skill.md) |
| BL-coding-skill-auto | 已完成并删除 | 2026-11-11 第 09 批审计整改补做，见 [specs/README](../specs/README.md) 与 [第 09 批](../specs/post-anticorruption-roadmap/reference/batches/09.md) |

其余在 git 历史中曾经出现、后来随事项完成或总表迁移删除的编号，按同一规则处理：先查对应 PR/提交，不为历史编号新建文件，也不复用编号。

## 已并入 BL-b16-server-text-residue

BL-455、BL-456、BL-457、BL-459、BL-460、BL-461、BL-462、BL-463、BL-464、BL-545、BL-546 已合并为 [BL-b16-server-text-residue](../specs/backlog/BL-b16-server-text-residue.md)。第 16 批 #2031（`206884b447`，2026-11-12）删除了所有 `plugins/native/*/src/en.ts`；旧条不再单独跟踪，残留服务端文案按新条逐插件核。

## 缺失编号速查（2026-11-13）

共 176 个编号在非归档文档里被引用，但 main 的 specs/backlog 没有对应文件。

| 编号 | 引用文件数 | 处置 |
| --- | ---: | --- |
| BL-915 | 13 | 已完成/并入/验收条目；见上表 |
| BL-411 | 11 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-701 | 11 | 已完成/并入/验收条目；见上表 |
| BL-491 | 10 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-910 | 10 | 已完成/并入/验收条目；见上表 |
| BL-1071 | 9 | 历史已删，Memory 分支复用；见上表 |
| BL-108 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-321 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-376 | 9 | 已完成/并入/验收条目；见上表 |
| BL-530 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-628 | 9 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-914 | 9 | 已完成/并入/验收条目；见上表 |
| BL-1076 | 8 | 只在 #2020 分支；见 BL-memory-p0-closure |
| BL-157 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-301 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-303 | 8 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-911 | 8 | 已完成/并入/验收条目；见上表 |
| BL-144 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-309 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-803 | 7 | 已完成/并入/验收条目；见上表 |
| BL-901 | 7 | 已完成/并入/验收条目；见上表 |
| BL-912 | 7 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-928 | 7 | 已完成/并入/验收条目；见上表 |
| BL-102 | 6 | 已完成/并入/验收条目；见上表 |
| BL-131 | 6 | 已完成/并入/验收条目；见上表 |
| BL-145 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-149 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-156 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-352 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-367 | 6 | 已完成/并入/验收条目；见上表 |
| BL-543 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-544 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-569 | 6 | 已完成/并入/验收条目；见上表 |
| BL-588 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-596 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-645 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-680 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-880 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-900 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-937 | 6 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-041 | 5 | 已完成/并入/验收条目；见上表 |
| BL-096 | 5 | 已完成/并入/验收条目；见上表 |
| BL-138 | 5 | 已完成/并入/验收条目；见上表 |
| BL-146 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-152 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-163 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-180 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-183 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-493 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-595 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-700 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-791 | 5 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-819 | 5 | 已完成/并入/验收条目；见上表 |
| BL-918 | 5 | 已完成/并入/验收条目；见上表 |
| BL-919 | 5 | 已完成/并入/验收条目；见上表 |
| BL-958 | 5 | 已完成/并入/验收条目；见上表 |
| BL-coding-skill-auto | 5 | 已完成/并入/验收条目；见上表 |
| BL-091 | 4 | 已完成/并入/验收条目；见上表 |
| BL-103 | 4 | 已完成/并入/验收条目；见上表 |
| BL-1058 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1077 | 4 | 只在 #2020 分支；见 BL-memory-p0-closure |
| BL-112 | 4 | 已完成/并入/验收条目；见上表 |
| BL-150 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-154 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-221 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-323 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-350 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-455 | 4 | 已并入 BL-b16-server-text-residue |
| BL-490 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-492 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-501 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-521 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-646 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-713 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-790 | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-821 | 4 | 已完成/并入/验收条目；见上表 |
| BL-assistant-card-press-scrolls | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-feed-wake-resets-page | 4 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-side-files-merged-reads | 4 | 已完成/并入/验收条目；见上表 |
| BL-121 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-130 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-141 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-143 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-151 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-172 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-181 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-300 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-354 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-356 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-366 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-379 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-388 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-403 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-404 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-459 | 3 | 已并入 BL-b16-server-text-residue |
| BL-470 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-545 | 3 | 已并入 BL-b16-server-text-residue |
| BL-546 | 3 | 已并入 BL-b16-server-text-residue |
| BL-581 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-583 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-589 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-691 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-710 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-711 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-715 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-802 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-814 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-913 | 3 | 已完成/并入/验收条目；见上表 |
| BL-920 | 3 | 已完成/并入/验收条目；见上表 |
| BL-935 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-936 | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-browser-site-decisions-unreadable | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-composer-source-refresh | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-linux-ci-browser-reds | 3 | 已完成/并入/验收条目；见上表 |
| BL-golden-prompt-uses-flaky | 3 | 已完成/并入/验收条目；见上表 |
| BL-materials-object-link | 1 | 已完成/并入/验收条目；见上表 |
| BL-memory-p0-closure | 3 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-083 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-088 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1036 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1067 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-1074 | 2 | 已完成并删除；见上表 |
| BL-114 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-132 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-147 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-155 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-158 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-159 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-18 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-311 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-322 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-353 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-355 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-363 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-372 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-386 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-393 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-396 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-456 | 2 | 已并入 BL-b16-server-text-residue |
| BL-457 | 2 | 已并入 BL-b16-server-text-residue |
| BL-460 | 2 | 已并入 BL-b16-server-text-residue |
| BL-461 | 2 | 已并入 BL-b16-server-text-residue |
| BL-462 | 2 | 已并入 BL-b16-server-text-residue |
| BL-463 | 2 | 已并入 BL-b16-server-text-residue |
| BL-464 | 2 | 已并入 BL-b16-server-text-residue |
| BL-481 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-494 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-555 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-559 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-615 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-616 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-618 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-714 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-755 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-780 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-781 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-916 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-926 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-939 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-956 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-background-inherits-page-locale | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-catalog-specimen-default-margin | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-coding-write-check-row-acceptance | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-computer-records-shape | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-contract-comment-stale-versions | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-first-screen-gate-prework | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-json-parse-copies | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-local-protection-version-check | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-memory-p2 | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-model-preference-save-overwrite | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-phone-home-tools-stay-visible | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-plugin-dev-state-dir-before-locale-check | 2 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-020 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-090 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-099 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
| BL-100 | 1 | 历史/旧总表；按 git 历史或 PR 查，不新建同号 |
