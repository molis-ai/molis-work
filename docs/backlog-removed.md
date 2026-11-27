# 已删除或不在 main 的 BL 编号

本表只做墓碑，不重新打开事项。现行文档引用历史编号时先查这里；`specs/backlog/` 下没有对应文件，不代表事项仍未处理。

上半张表是关键历史编号和替代关系；末尾「缺失编号速查」是完整允许名单，按当前活文档生成，不是新的待办。两者重复的编号以替代关系为准。

| 编号 | 处置 | 依据 / 替代 |
| --- | --- | --- |
| BL-b44c-psd01-remainder | 已按批准口径验证 | 从完整插件集合逐一拔除、冷启、投递新提醒并还原备份，分别验证移除 Git 图标及执行器不可用。两份旧 Attention 声明分别拒绝、随后实际同步。109-2 验证后续 Git 迁移。[44C 收尾](../specs/post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-remediation) |
| BL-b44c-g1-exception-kinds | 具名决定已落实 | 一骏于 2026-11-26 批准五处上游工具名和一处历史记忆键。后者已随决定 69 删除并退出名单。跨设备演示按能力发现操作，移除五行共八处命中。[具名决定](../specs/plugin-specials-demotion/spec.md#2026-11-26-整改决定) · [演示实现](../server/tooling/continuity-demo.mts) |
| BL-b44-psd03-sample-plugin | 单包九项完成 | 一个固定签名的应用包安装一次，项目实例提供工作能力，Home 实例提供个人来源。真实收件、检索、场景采用与审查批准均有读回。[签包回归](../tests/plugin-sample-equal-standing.test.ts) · [助理交互](../tests/fixtures/signed-tool-review.ts) · [整改合同](../specs/post-anticorruption-roadmap/reference/batches/44c.md#batch-44c-remediation) |
| BL-sdk-home-aggregate-query-export | 已完成并删除 | 2026-11-26：第 108 批（V17）删除首页聚合与 `home_aggregate` 标记，SDK 不再导出 `isHomeAggregateQuery`；接替它的 `isProjectReadQuery` 是项目面板与事项线（`horizontal/mainline`）共用的只读项目查询判定，随 SDK 根入口导出（[108](../specs/post-anticorruption-roadmap/reference/batches/108.md)） |
| BL-jelly-command-readers | 已完成并删除 | 2026-11-26：它留着 Jelly 表驱动处理器的读值函数与 `store` 那层的 `as`，因为全部命令共用一个 `JellyCommand`（值是 `unknown`）。第 112-2 批删掉了 `JellyCommand` 与共用处理器，18 个动作各自由 schema 推导输入（[112](../specs/post-anticorruption-roadmap/reference/batches/112.md#batch-112-closeout)，[#2338](https://github.com/molis-ai/molis-work/pull/2338)） |
| BL-b36-review-followups | 已完成并删除 | 2026-11-26。主线按事项保存修订号，新事项从 1 起算。改名、转换及来源版本变化会更新读取修订号。空名字统一报错，重复完成保留排列版本，两处共用下一步合同。两处提供方身份已由 [44C #2333](https://github.com/molis-ai/molis-work/pull/2333) 统一。[事项合同](../specs/work-mainline/contract-design.md) |
| BL-work-line-event-card-line-read | 已完成并删除 | 2026-11-26。事件卡按本人权限、对象种类及时间窗口核对是否在线，每次核对只发现一次目录，只问声明了该对象种类的登记方，任务总表读取次数为 0。[事件卡合同](../specs/work-line/spec.md#44-点一个事件) |
| BL-122 | 不再适用并删除 | 2026-11-26：它要把 `jelly-whisper` 的 SwiftPM 包构建改成挡合并；第 112-1 批连根删除了 `jelly-whisper`（WhisperKit、626 MB 语音模型下载链）和 CI 里那一步 `continue-on-error`，Swift 检查只剩挡合并的类型检查（[112](../specs/post-anticorruption-roadmap/reference/batches/112.md#batch-112-item-1)） |
| BL-398 | 不再适用并删除 | 2026-11-26：关对话框停不下本机语音模型的下载与转写；第 112-1 批删除了本机转写与模型下载，音视频导入只保存原件，这条下载不再存在（[112](../specs/post-anticorruption-roadmap/reference/batches/112.md#batch-112-item-1)） |
| BL-639 | 不再适用并删除 | 2026-11-25：它问的是 `databases.home` 按项目拆的分区库升级后怎么办；第 107 批删掉了那个复用器，分区库改为每个分区一份 `databases.partition`，版本按库声明的一份现行结构开（[107](../specs/post-anticorruption-roadmap/reference/batches/107.md)） |
| BL-1055 | 已完成并删除 | SDK 与设计系统共用折叠组件，Images、Goals 已接入，Files 旧面板随 #2009 退役。[SCF-01](../specs/archive/shared-ui-folds/spec.md#验收标准) |
| BL-1061 | 已完成并删除 | 连接行、原处连接卡和设计系统的自然高度折叠共用选择器函数。[SCF-02](../specs/archive/shared-ui-folds/spec.md#验收标准) |
| BL-schedule-reads-actions-render-alert | 已完成并删除 | 日程读取失败使用共享提示的动作槽，点击重试会再次读取。[SCF-03](../specs/archive/shared-ui-folds/spec.md#验收标准) |
| BL-coding-write-check-batch-read | 已完成并删除 | Coding 时间线按轮读取写后检查，逐写入匹配回执，并保留成功缓存与 30 秒重试。[请求与回放次数](../specs/archive/coding-checks-and-run-endings/spec.md#bl-coding-write-check-batch-read) |
| BL-run-terminal-cleanup | 已完成并删除 | 五种终态覆盖资源释放、页面、等待中调用、观测及重启后的工作步骤；补齐记忆历史分页验证。[终态对照与验收](../specs/archive/coding-checks-and-run-endings/spec.md#bl-run-terminal-cleanup) |
| BL-921 | 已完成并删除 | 记录槽在存储层拒绝普通换绑，明确换用核对原账号。[实现与回归](../specs/archive/record-bindings-and-mcp-relogin/spec.md) |
| BL-1050 | 已完成并删除 | 连接页经项目 MCP 目录汇总 Coding 配置的用途，自动换用另属 BL-1045。[实现与回归](../specs/archive/record-bindings-and-mcp-relogin/spec.md) |
| BL-1051 | 已完成并删除 | 自定义 MCP 重登预填认证方式，令牌和客户端密钥框留空。[实现与回归](../specs/archive/record-bindings-and-mcp-relogin/spec.md) |
| BL-1000 | 已完成并删除 | 2026-11-23：修复模型和 HTTP 替身的逐块 UTF-8 转换，真实 HTTP 分别切开中文和 emoji，逐字核对收到的正文。[验收记录](../specs/archive/test-fixture-utf8-linux-head/spec.md#bl-1000) |
| BL-linux-repro-source-head | 已完成并删除 | 2026-11-23：Linux 回归取源、检出失败即停，在构建和测试前核对并记录实际提交。[验收记录](../specs/archive/test-fixture-utf8-linux-head/spec.md#验收记录) |
| BL-989 | 已修复并删除 | 2026-11-24。项目设置读取与永久删除交错时，目录库确认项目已不存在后，设置请求返回 404（`catalog.project_not_found`）。目录库仍有项目时保留数据库打开失败的诊断。回归核对目录库记录、项目文件和同一删除请求的回执。 [#2283](https://github.com/molis-ai/molis-work/pull/2283) |
| BL-secret-entry-storage-code | 已修复并删除 | 2026-11-24。本机凭据条目格式错误和解密失败分别返回 `storage.secret_entry_invalid` 和 `storage.secret_entry_decryption_failed`。MCP 调用保留对应的错误码和恢复提示。凭据快照沿用其完整性错误码。 [#2283](https://github.com/molis-ai/molis-work/pull/2283) |
| BL-1040 | 已完成并删除 | 第 27 批 [#2010](https://github.com/molis-ai/molis-work/pull/2010) 已在没有远端时隐藏「建 PR…」，三种 Git 状态提示均为普通文字。2026-11-23 在隔离 Home 复验并补上无远端时中英文无障碍树都没有 PR 入口、已有暂存文件仍可本地提交的断言（`tests/git-source-controls.e2e.test.ts`）。 |
| BL-1037 | 已完成并删除 | 2026-11-23 在主干 `8192cc7b10` 的 Goals 调用链打开空项目的 Goals 与画布，没有新增 `goals.stage.read` 输入不合法的「未执行」记录。`tests/goals-momentum.e2e.test.ts` 直接读取隔离 Home 的调用记录并断言这一点。 |
| BL-coding-change-reader-narrow-toolbar | 已完成并删除 | 2026-11-23 Coding 固定变更阅读器的工具条随可用宽度换行，选中的长路径在行内省略，底色收在清单框内。`tests/code-diff-reader.e2e.test.ts` 在中英文、明暗色下检查横向边界，并在 390 px 验证「设为变更输出」可用 Tab 到达且点击会发出请求。 |
| BL-1032 | 已完成并删除 | 2026-11-24。设备接续演示的固定文档从运行中的 Pages 声明取成果格式、来源对象类型、版本和签名。启动器回归读到第 2 版文档并完成交接、同请求重试与重启回读。隔离 Home 另从 Inbox 选材料并提交一次，直接打开可编辑的 Pages 草稿，原事项保留待确认。 |
| BL-1047 | 已完成并删除 | 2026-11-24。组件板、问卷导出的填写页和宿主侧栏错误页共用内联图标声明。`tests/page-reads-quiet.e2e.test.ts` 在独立 Chrome 核对三个响应分别为 200、200、404，`/favicon.ico` 请求数均为 0。 |
| BL-1068 | 已完成并删除 | 2026-11-24。[插件同步手册](../skills/molis-plugin-dev/sync.md) 说明旧 Work 会话和交接同步已移除，并写明外部 AI 会话的本机索引、读取许可和原文按需读取边界。以 Host 同步目录和外部会话服务的实际接线为准。 |
| BL-golden-generation-nondeterministic | 已完成并删除 | 2026-11-23。生成时暂停 Prologue 队列未来任务的唤醒，保留待执行记录。常速和模拟慢机两条字节比较通过，签名金样 `0.1.1-dev.8` 重生成一致。 [#2273](https://github.com/molis-ai/molis-work/pull/2273) · [验证结果](../specs/archive/golden-determinism-computer/spec.md#验证结果) |
| BL-golden-computer-settings | 已完成并删除 | 2026-11-23。`0.1.1-dev.8` 经助手设置保存 `computer/settings.json`，macOS 设置入口读回。模拟 Linux 结果明确为 `not-run`。三份金样回放及覆盖门禁通过。 [#2273](https://github.com/molis-ai/molis-work/pull/2273) · [验证结果](../specs/archive/golden-determinism-computer/spec.md#验证结果) |
| BL-feed-precise-wakeup | 已完成并删除 | 2026-11-23，[#2257](https://github.com/molis-ai/molis-work/pull/2257)（`404b0842f7`）：Feed 运行时唤醒改按所有启用自动拉取来源的最早下次到期时刻精确登记，无自动拉取来源时清除唤醒作业，覆盖启动/恢复、来源增删改/启停/暂停恢复、拉取完成/失败/退避与错过决定重算，并清理历史 30 秒周期唤醒作业，恢复 Feed 项目空闲休眠；见 [103.md](../specs/post-anticorruption-roadmap/reference/batches/103.md) |
| BL-resting-readings-persistence | 已完成并删除 | 2026-11-23，[#2254](https://github.com/molis-ai/molis-work/pull/2254)（`1aa131f035`）：新增 `RestingReadingsStore` 为休眠项目的首页聚合读数（后台任务、运行概览）持久化轻量只读摘要投影并校验存储空间/项目身份/授权指纹（`packages/plugin-runtime` 只读 `readPluginConsents`），宿主重启后首页直接读取而不再后台逐个拉起休眠项目运行时，不升库版本并同步修订 `docs/system/security-invariants/S-49.md`；见 [103.md](../specs/post-anticorruption-roadmap/reference/batches/103.md) |
| BL-project-sqlite-opens-and-ro-pool | 已完成并删除 | 2026-11-23，[#2253](https://github.com/molis-ai/molis-work/pull/2253)（`55113d7952`）：将 `packages/storage/src/sqlite-baseline.ts` 的 `heldHomeSqlite` 演进为按 Home 空间归属的 RO/RW 分槽连接池（覆盖离线恢复/回滚与独立目录关闭释放），按目录与插件成员版本复用项目只读快照并将 `HomeLine` 纯只读查询与 `ProjectLine` 并发口径对齐，同步按实测严格向下收紧 `tooling/gates/call-budget.json`（总 `projectPluginReads` 113→6、总 `sqliteOpens` 118→4）；见 [103.md](../specs/post-anticorruption-roadmap/reference/batches/103.md) |
| BL-discover-one-mcp-and-assistant | 已完成并删除 | 2026-11-23，[#2255](https://github.com/molis-ai/molis-work/pull/2255)（`86318acd55`）：为 `AgentActionClient`、常驻动作网关（`/api/internal/action-service`）与 `ActionService` 贯通原生 `discoverOne` 点查，去掉 `mcp-server.ts` 每次调用前的 `ensureCatalog()`（保留重名冲突检查），清理 `horizontal/agent-host`、`plugin-sdk/src/action-cards.ts` 与 `packages/kernel` 剩余按精确引用 `discover().find(...)` 热路径，并在 `@molis-ai/molis-work-contracts/platform/actions` 统一收口 `findExactActionView`（同步结清 `BL-mr21-review-followups` 第 ② 项）；见 [103.md](../specs/post-anticorruption-roadmap/reference/batches/103.md) |
| BL-sync-conflict-keep-one-press | 已完成并删除 | 2026-11-23：手动采用远端版本时，一次确认逐批传完待保留的本机附件，比较窗口显示进度。35 个附件、断网与重开协调器的定向回归，以及创作台单次确认均在隔离 Home 通过。见[规格与验证](../specs/archive/sync-conflict-keep-one-press/spec.md)。 |
| BL-memory-shared-scene-session-binding | 已完成并删除 | 2026-11-22（排入[第 63A 批](../specs/post-anticorruption-roadmap/reference/batches/63a.md) 前置并当场收口）：按用户拍板方案 A，非助理插件会话目标 `MemorySessionTarget` 及 `memorySessionTargetSchema` 必带精确 `plugin_id` 与 `provider_id`（助理会话禁止携带），阶段一原位收严 `format.memory.session-clear-plan = 1`（不升版本、无旧格式兜底）；受保护插件会话 HTTP 入口改为 `/projects/:project_id/api/memory/sessions/:kind/:plugin_id/:id/*`（可选 query `memory_session_provider`），设置页 S-47 白名单补 `memory_session_plugin` / `memory_session_provider`，会话总览与项目页失败重试均按宿主核实后的所属插件清晰标注归属（`packages/contracts/src/services/memory-session.ts`、`horizontal/memory/src/session-clear.ts`、`apps/local-host/src/memory/memory-session-binding.ts`、`apps/local-host/src/memory/memory-host.ts`、`apps/local-host/src/memory/memory-runtime-policy.ts`、`apps/workbench/src/settings-memory.ts`、`plugins/native/coding/src/ui.ts`）。同步修掉双插件同场景实装暴露的四处阻断：非内置插件学习记忆被 `reaches !== true` 误拒、同项目双插件注册 `memory.learning.run` 冲突（支持插件命名空间 `<prefix>.memory.learning.run@1` 严格合同匹配）、同场景跨插件待审候选来源 `session_id` 串入另一插件 `assert_memory_sources_current` 回调，以及 `PluginPlatform` 未登记非内置插件 `memory_scene`。真实双插件实装（Coding + `Alt Coder` 同项目共报 `memory_scene: "coding"`、同业务 `session_id` 碰撞）全流程验证记忆形成、来源会话读取、真实 Chrome 管理页打开/归属展示/项目重试分流、跨插件隔离与停用/撤权拒绝，见 `tests/memory-session-binding.test.ts`、`tests/memory-session-management.e2e.test.ts`、`tests/memory-session-settings.test.ts` 与 `docs/system/CONTRACT-CHANGES.md`。 |
| BL-b44-shared-styles-plugin-names | 已完成并删除 | 2026-11-22 第 44 批复核阶段 5（[#2258](https://github.com/molis-ai/molis-work/pull/2258)）提前结清（PEQ-08）：平台共用样式（`packages/design-system/src/`、`apps/workbench/src/styles/`）中的 `.goal-*` / `.inbox-*` / `.shelf-*` / `.coding-*` / `.git-*` / `.form-tabs` / `[data-feed-*]` 等插件点名全部泛化为平台中性名（`.mw-object-status`、`.mw-collection-*`、`.mw-tree`、`.mw-reference-*`、`.mw-detail-context`、`.mw-stage-tabs`、`[data-stage-custom-layout]`、`[data-stage-danger]`、`[data-mw-plain-input]`、`[data-craft-land]`、`[data-craft-focal]`、`[data-record-owner]`）或迁回所属插件样式表；`scripts/gates/plugin-styles.mjs` 新增 `findSharedStylePluginSelectors` 永久门禁并在 `tests/plugin-styles-gate.test.ts` 补齐变异测试（原 #2259 / #2251 规划于第 91/91B 批的同类去插件名清理已提前落实，`44B`/`91-0c`/`91B` 只需承接容器/布局升级、G1 门禁协同与预算复核） |
| BL-project-arrival-goals-direct-read | 已完成并删除 | 2026-11-22 第 44 批复核结清：`goalsHostActions` 已删除；`apps/local-host/src/project-arrival-http.ts` 改为经动作目录发现通用 `isResumeSummaryAction` 并读平台项目指导 `pinnedProjectGuidanceRead`（第 44 批 #2155 / #2187 / #2192） |
| BL-memory-session-kinds | 已完成并删除 | 2026-11-22 第 44 批复核结清：`packages/contracts/src/services/memory-session.ts` 已改用通用 `MemoryScene`/`MEMORY_SESSION_SCENE_SCHEMA`，`apps/local-host/src/memory/memory-session-binding.ts` 与 `memory-learning.ts` 已按 `isMemorySessionBindingAction` + `pluginMemoryScene` 泛化发现（第 44 批 44-5 与 #2209） |
| BL-637 | 已由平台通用工作终端替代并删除 | 2026-11-22 第 44 批复核结清：第 44 批 44-4（PEQ-17）已删除 `startGoalTerminalClient`，改为平台通用对象工作终端 `startWorkTerminalClient()`（`apps/workbench/src/terminal-client.ts`，任何声明 `work_terminals` 的插件共用）；`/desktop/pty-client.js` 按需加载仍由 [BL-first-screen-pty-client](../specs/backlog/BL-first-screen-pty-client.md) 跟踪 |
| BL-178 | 已完成并删除 | 2026-11-22 第 44 批复核结清：第 44 批 44-5（PEQ-09）已将平台材料模型缓存迁至独立平台目录 `{home}/materials/models`（`MATERIALS_HOME_STORE`，`apps/local-host/src/material-home.ts`），不再使用 `lingguang/models` |
| BL-1015 | 已修复并删除 | 2026-11-22 第 44 批复核结清：`plugins/native/goals/src/browser/momentum.ts`（原 `momentum-client.ts`）在未选中 Goal 时不再拼接空 `goal_id=`；`document-routes.ts:30` 与 `stage-action.ts:98` 对空 `goal_id` 亦安全归为空串而非返回 400 |
| <a id="bl-risk-sync"></a>BL-risk-sync | 已完成并删除 | 2026-11-22，M1-B1 随 [#2223](https://github.com/molis-ai/molis-work/pull/2223) 将项目风险接入个人空间同步。Risk 拥有 `risks` 集合及其版本 1 的便携格式，传递项目内风险、业务状态、历史和带类型的引用。项目目录负责项目的身份和删除。Schedule 管理复查任务和执行状态，接收风险只写风险记录、引用和历史。[AC-M1-01](../specs/personal-cloud-sync/plugin-replication.md#verification) 在两个隔离的个人 Home 上验证了首次接收、增量更新、并发冲突、显式解决和删除标记，以及收到无效字段、重复历史事件或跨项目标识时保留原记录和历史。[Risk 回归用例](../tests/risk-plugin.test.ts#L13)。2026-11-23 用户确认结项。 |
| BL-586 | 已完成并删除 | 2026-11-22：第 47 批 47-1（子分支 `47/one-platform`）。用户定范围为「Home 一份＋项目一份」：另一位发布者用同一插件编号签的包是另一个插件，范围按「插件编号＋发布者」记（S-80），项目页的舞台、目录、语言文件与「隐藏」各按自己的安装；验收用例 `tests/home-installed-plugins.test.ts`「BL-586 …」。同一范围里两家并存另记 BL-same-id-same-range |
| BL-1064 | 已完成并删除 | 2026-11-23 随 [#2275](https://github.com/molis-ai/molis-work/pull/2275) 合入 `ae014586f4`。macOS 插件沙箱按 dyld 实际加载的文件逐个授权。缺失或越界的 Node 动态库在启动插件前拒绝，安装入口提示换用官方 Node。已在临时 Homebrew 24.22.2 安装上通过 CLI 签名插件安装和 Seatbelt 回归。路径与验证见 [BL-1064 规格书](../specs/archive/bl-1064-node-sandbox/spec.md)。 |
| BL-generated-plugin-prompt-binding-baseline | 同因，随 BL-1064 结清 | 2026-11-23：同一干净基线 `5bfd52b87b` 上，官方 Node 24.15.0 通过，Homebrew 24.22.2 在首次安装时失败；修复后两份 Node 均通过提示词绑定回归。macOS 用例排程继续由 [BL-seatbelt-tests-unrun](../specs/backlog/BL-seatbelt-tests-unrun.md) 跟踪。 |
| BL-925 | 随决定 66 退役并删除 | 2026-11-22，[决定 66](../specs/post-anticorruption-roadmap/reference/decisions.md#decision-66)（[特殊逻辑平民化](../specs/plugin-specials-demotion/spec.md)、[统一工作分区](../specs/unified-partition-plugins/spec.md)）：Shelf 收归纯平台 `modules/shelf`（`system.shelf`），`dual_instance` 双实例机制整体废除归零，「第 3 个双实例插件出现时重评 Manifest 实例分节」的触发条件永不成立，直接关闭删除。 |
| BL-plugin-release-module-source | 已完成并删除 | 2026-11-21 第 103 批 103-1（[#2205](https://github.com/molis-ai/molis-work/pull/2205)，`1faf24dbf0`）：`HOST_BUILD_TRUST` 内置插件在 `persistReleaseArtifact` 不再捕获与写入 `module_source`（仅保留 Manifest），第三方原生安装包仍保留 `module_source` 与回退恢复，旧库既有行继续合法读取不做迁移；见 [103.md](../specs/post-anticorruption-roadmap/reference/batches/103.md) |
| BL-skill-settings-installed-plugin-scenes | 已完成并删除 | 2026-11-22，[#2248](https://github.com/molis-ai/molis-work/pull/2248)（技能与能力包负责人，`system.skills` / `horizontal/kit` / 技能设置页）：技能设置与能力包场景候选改读宿主运行时当前作用域有效登记（内置插件 + 已安装且运行中、健康、未撤权的签名第三方插件），停用／卸载／撤权即时移除并拒绝新绑定，沙箱清单校验（`sandboxPluginManifest` / `readSandboxPackage`）同步承接 `memory_scene`，公开 API／动作快照／路由表快照与 `OBSERVATION_COVERAGE_PLAN` 已同步；真实签名第三方沙箱包生产路径集成与浏览器测试见 `tests/skill-catalog-runtime.test.ts`、`tests/security-invariants-skill-import.test.ts`、`tests/security-invariants-kit-catalog.test.ts`、`tests/skill-settings.e2e.test.ts`。 |
| BL-home-lead-capability | 已完成并删除 | 2026-11-22：用户定删掉（路线书决定 62 ③）。`presentation.overview.lead`、`surfaces.compose@1` 的 `lead` 组、首页页面数据的 `lead` 与外壳收养、归还插件主区页面的代码一并删除；还写着它的 Manifest 与描述被拒（`tests/surface-home-contracts.test.ts`）。登记见 `docs/system/CONTRACT-CHANGES.md` 第 8 节。 |
| BL-b44-shell-goals-state | 已完成并删除 | 2026-11-21：通用的页面客户端接口 `workbench.pageClient` 取代第 44 批的 `pageClients`（[页面客户端生命周期](../specs/page-client-lifecycle/spec.md)），Goals 的页面数据、选中项、画布与看板框、归档与回收站视图、后台刷新与决定回执从外壳搬回 Goals，写成 `plugins/native/goals/src/browser/` 里带类型的 TypeScript 并由 esbuild 打包；外壳页面脚本不再点名 Goals（PCL-02），剩下几处记 [BL-shell-goals-leftovers](../specs/backlog/BL-shell-goals-leftovers.md) |
| BL-1062 | 已完成并删除 | 2026-11-22：第 36A 批动效项（36A-7）给连接页的折叠补了逐帧断言：高度与箭头同一时钟（同时长、同延迟、同曲线，时长等于 `--dur-move`），五个时刻上裁切层与折叠同高、高度进度与箭头进度一致且单调（`tests/connections-page.e2e.test.ts`）。 |
| BL-b44-coding-scene-enum | 已完成并删除 | 2026-11-21，[#2209](https://github.com/molis-ai/molis-work/pull/2209)（用户经弹窗定）：合同不再写 `"coding"`，场景是插件在 Manifest `memory_scene` 申报的名字，平台只有 `assistant`、`common`、`agent`、`both`；Coding 申报 `coding`，已存取值不变、不升库版本；名单在 Host 启动时从内置插件与留存包读，运行中新装的新场景重启后生效、安装预览会说。合同改动记在 `docs/system/CONTRACT-CHANGES.md` 第 8 节 |
| BL-b44-information-plan-to-feed | 已完成并删除 | 2026-11-21，[#2209](https://github.com/molis-ai/molis-work/pull/2209)：动作改为 Feed 的 `feed.information.plan@1`，提示词键改到 Feed 名下，人改过的提示词由 Agent 定义库 1→2 的升级步骤搬过去（`CONTRACT-CHANGES.md`「当前保留机制」） |
| BL-b44-feed-home-dir-and-styles | 已完成并删除 | 2026-11-21，[#2209](https://github.com/molis-ai/molis-work/pull/2209)：Home 的 `feed/`（密钥与证据）升级时整目录改名为 `security/`；共用列表类名改 `mw-`，只属于 Feed 的规则搬进 Feed 样式表；别的插件的同类问题与门禁另记 BL-b44-shared-styles-plugin-names |
| BL-feed-product-version-replay | 已完成并删除 | 2026-11-22 修复产品升版后的 Feed 重放。重放同内容时沿用已有成果，捕捉内容变化才追加版本。发布清单的前置项随之删除。见[需求与回归](../specs/feed-product-version-replay/spec.md)。 |
| BL-127 | 已完成并删除 | 2026-11-21：第 36A 批壳层对话批（36A-3）把细指针窗口里对话栏的键、信息栏的标签与动作、分段选择和下一步按钮落到 28px，对话里的复制键保持 22px 的样子、可点范围补到 28px（`DESIGN.md`「控件高度」、`apps/workbench/src/styles/work-line.ts`、`tests/touch-targets.e2e.test.ts`「BL-127」断言）；合入号随下一批补。 |
| BL-tests-umask | 已完成并删除 | 2026-11-19：离线恢复与运行时备份测试夹具显式设置权限，在 `umask 077` 与 `022` 下均通过原权限断言（`apps/local-host/src/installer/runtime-installation-files.ts`、`tests/fixtures/home-restore.ts`、`tests/fixtures/runtime-config-backups.ts`、`tests/home-snapshot-cli.test.ts`、`tests/security-invariants-home-restore-recovery.test.ts`、`tests/security-invariants-runtime-backups.test.ts`），由 [#2171](https://github.com/molis-ai/molis-work/pull/2171)（`9d25c9d1cd`）合入，正式交付项 [73-3](../specs/post-anticorruption-roadmap/reference/batches/73.md#batch-73-item-3) 离线恢复回归切片；条目 2026-11-20 删除 |
| BL-981 | 已完成并删除 | 2026-11-19：知识检索不可读原因与模型所选理由按完整字符边界截断（`horizontal/knowledge/src/errors.ts`、`tests/knowledge-locate-budget.test.ts`），由 [#2177](https://github.com/molis-ai/molis-work/pull/2177)（`4f2bd4e5f5`）合入；条目 2026-11-20 删除 |
| BL-985 | 已完成并删除 | 2026-11-19：Images 五个输入框与服务端共用同一套按字符计数和上限校验（`plugins/native/images/src/limits.ts`、`plugins/native/images/src/browser/limits.ts`、`tests/images-input-limits.e2e.test.ts`），由 [#2177](https://github.com/molis-ai/molis-work/pull/2177)（`4f2bd4e5f5`）合入；条目 2026-11-20 删除 |
| BL-1033 | 已完成并删除 | 2026-11-21 核对后结清：第 06 批 N13 由 [#2009](https://github.com/molis-ai/molis-work/pull/2009)（`a720834a09`，2026-11-13）合入。Dataset 请求改用 SDK `pluginRequest`，带页面 `scope` 与 `readRefusal`（`plugins/native/dataset/src/browser/request.ts`）。表格离开后，传输中或保存中的请求会被取消（`AbortError`）。正文晚到时不会刷进已卸载的旧页面，也不会弹出确认框。宿主以 403 `actions.scope_mismatch` 拒绝读取时，页面显示「无权读取此内容」并给重试。证据：`tests/dataset-actions.e2e.test.ts` 的「BSH-09 BL-1033」transport／body／save 三条，在 main `af56e57e52` 用隔离 Home 与测试浏览器重跑，全文件 6/6 通过 |
| BL-1038 | 已完成并删除 | 2026-11-23：[清点 F-17](../specs/archive/accessible-editor-controls/spec.md) 的六个插件已由 [#2010](https://github.com/molis-ai/molis-work/pull/2010) 补齐控件名称及标签。本次补齐项目设置的双语插件行名称和组件板图标按钮标本，锁定名称必填类型，并在测试浏览器与隔离 Home 逐项核查。 |
| BL-1039 | 已完成并删除 | 2026-11-21 核对后结清：第 27 批 action-copy 片由 [#2010](https://github.com/molis-ai/molis-work/pull/2010)（`539d2d7d46`，2026-11-12）合入。首次使用「资料已经准备好」在没连模型时，重试按钮叫「连好后继续整理」，英文叫「Continue after connecting」；连上后叫「继续整理／Continue」（`apps/workbench/src/scripts/context-onboarding.ts`）。本次一并删掉词包里已没有引用的旧键 `workbench.context-onboarding.connected-continue`（「已连接，继续整理」／「Connected — continue」）。证据：`tests/context-onboarding-action-copy.e2e.test.ts`（ACTCOPY-01／02）在中英文、深浅色、1440／1024／390 下逐一核对无障碍树的按钮名，并断言旧文案不出现；在 main `af56e57e52` 用隔离 Home 与测试浏览器重跑 1/1 通过。本人验收随 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md) ⑦ |
| BL-1052 | 已完成并删除 | 2026-11-23。390px 英文组件板的滚动区回到 366px，Compose 筛选可在视口内完整打开，表格仍可在自己的滚动区到达末列。回归覆盖四节及整板。见 [DTC-01](../specs/archive/d-track-ui-closeout/spec.md#验收标准) |
| BL-note-onboarding-migrate | 已完成并删除 | 2026-11-23。新手引导的普通和警告提示复用 `renderNote`，删除 `.ob-note` 副本，长授权按钮在窄屏内换行。Sessions 授权引导已对照中英、浅深色和三宽度的前后截图。见 [DTC-02](../specs/archive/d-track-ui-closeout/spec.md#验收标准) |
| BL-stagger-token-adoption | 已完成并删除 | 2026-11-23。页面和助理的首显阶梯统一使用 `--dur-stagger`，最多四项按 60ms 错开，减少动态效果时延迟为零。见 [DTC-03](../specs/archive/d-track-ui-closeout/spec.md#验收标准) |
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
| BL-work-line-held-review-on-card | 已完成并删除 | 2026-11-23，事项线卡片从原待审队列读提案并记录本人同意或拒绝，核对项目、插件安装、会话和版本，沿用计算机操作静默期。见 [规格与验收](../specs/archive/work-line-held-reviews/spec.md)。 |
| BL-work-line-bundle-duplicate-sdk-text | 已完成并删除 | 2026-11-23，工作栏并入项目首页浏览器入口，共用 SDK 文字和渲染。工作台脚本净减 17,858 字节，现行路由预算扣回等量字节。见 [体积实测](../specs/archive/work-line-held-reviews/spec.md#体积实测)。 |
| BL-set-output-revision | 已完成并删除 | 2026-11-20：插件页面设输出目录（`UiPageWorkspaces.setOutput`）与打开说明文件时，外壳把确认框读到的目录 `revision` 随请求交给 Host（`apps/workbench/src/browser/plugin-frame/workspaces.ts`），Host 按它调 `projects.directories.set_output@1` / `set_instructions@1`，不再在写入请求里重读（`apps/local-host/src/plugin-page-workspaces.ts`）；期间别处改过目录就按 `actions.conflict` 拒绝，页面得到「项目的文件夹刚在别处改过」的提示，别处的选择保留，再问一次按最新目录确认即可。两窗口回归见 `tests/plugin-page-workspaces.e2e.test.ts`「BL-set-output-revision」 |
| BL-coding-changeset-deleted-kind | 已完成并删除 | 第 99 批 99-1（2026-11-21，[#2207](https://github.com/molis-ai/molis-work/pull/2207)）：宿主读一轮审批时也带上以这一轮为来源、同一插件与同一安装发起的整合审批；Coding 把经批准并确认生效的子任务整合带回的文件（新增、修改、删除）列进本轮固定变更，会话自己独立工作树的整合、普通删除命令以及结果未知／失败／被拒／待审都不列。固定变更版本不升、旧清单照常重开。命令直接删文件留 [BL-coding-command-path-receipts](../specs/backlog/BL-coding-command-path-receipts.md)。见 [99.md](../specs/post-anticorruption-roadmap/reference/batches/99.md#decisions) |
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
| BL-340 | 已完成并删除 | 2026-11-23，[#2256](https://github.com/molis-ai/molis-work/pull/2256)（QA-024 第二片，[PTG-06](../specs/plugin-tab-groups/spec.md#验收标准)）：Pages 目录和灵光列表各有一个 Tab 停靠点，方向键移焦点，空格切换多选，⌘/Ctrl+A 加选当前可见条目。Pages 文件夹、文档和行内按钮用 treegrid 表达，列表刷新时保留同组同条目的焦点。键盘多选接入原有的 Pages 多来源和灵光批量操作，浏览器回归见 `tests/plugin-tab-groups.e2e.test.ts` 与 `tests/lingguang-plugin.e2e.test.ts`。 |
| BL-051、BL-182、BL-222、BL-540 | 已完成并删除 | 第 33 批（2026-11-14）：子任务尝试预算与「再给 3 次」、子任务重试带 `source: "host"`、命令未知结局与四节收尾报告及步骤进度扣除、Coding 经宿主公开启动时刻判断中断（不再调 `process.uptime()`）；实物走查集中收成 [BL-batch33-acceptance](../specs/backlog/BL-batch33-acceptance.md) |
| BL-041、BL-102、BL-112、BL-138、BL-910、BL-958 | 第 27 批验收集中跟踪 | 第 27 批 #2010 收成 [BL-batch27-acceptance](../specs/backlog/BL-batch27-acceptance.md)；原条目删除 |
| BL-091、BL-096、BL-103、BL-131、BL-367、BL-569、BL-701、BL-803、BL-819、BL-821、BL-901、BL-911、BL-913、BL-914、BL-915、BL-918、BL-919、BL-920 | 已完成并删除 | 第 27 批 #2010（`539d2d7d46`，2026-11-12）；验收余项见 BL-batch27-acceptance |
| BL-plugin-dev-state-dir-before-locale-check、BL-catalog-specimen-default-margin | 已完成并删除 | 第 14 批登记的两条小缺口，2026-11-13 14／27 收口 PR 修掉；见 [14.md 合入记录](../specs/post-anticorruption-roadmap/reference/batches/14.md#实现进度与合入记录) |
| BL-166 | 已完成并删除 | 第 42 批（2026-11-16）：通用技能「改一份我的」记住来源，`~~` 占位符换成自己用的，采用时可关掉原来的，原来的出新版时可看差别、带进草稿或先不管；见 [42.md](../specs/post-anticorruption-roadmap/reference/batches/42.md)。连接 MCP 仍在连接设置里做，技能只声明工具 |
| BL-b42-followups | 已完成并删除 | 2026-11-23：[#2271](https://github.com/molis-ai/molis-work/pull/2271) 完成六项。① 起草、修订、回放和 Feed 的信息方案共用宿主文字回执记账；② 关闭原技能失败有独立提示；⑤ 采用条说明多草稿覆盖；⑥ 标出已删技能的草稿；⑦ 删除后可「只恢复内容」；⑧ 按当前技能版本统计使用次数。原 ③④ 随 #2101 合入。逐项验收见[第 42 批余项](../specs/archive/bl-b42-followups/spec.md) |
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
| BL-onboarding-language-node-retention | 已完成并删除 | 2026-11-23 完成。FSS-37 的欢迎区保留由 [#2123](https://github.com/molis-ai/molis-work/pull/2123) 先行恢复，这次补齐晚到重绘时的「继续」节点保留和问候语言。整份引导回归 16/16，见 [OPENFIX-01](../specs/archive/onboarding-language-503/spec.md#验收) |
| BL-blank-503-notice | 已完成并删除 | 2026-11-23 完成。工作台项目页遇到本机服务 503 时展示双语原因和重试，服务恢复后可回到原地址。见 [OPENFIX-02](../specs/archive/onboarding-language-503/spec.md#验收) |
| BL-ui-client-scope-watch-revision | 已完成并删除 | 2026-11-23，公开 `UiClientScope` 补上宿主已有的 `watchRevision` 签名，Git、Coding、Schedule 共用。见 [SCC-01](../specs/archive/sdk-contract-closeouts/spec.md#验收标准)。 |
| BL-artifact-sdk-handler-binding | 已完成并删除 | 2026-11-23，成果 SDK 的八个动作按现行 schema 推导输入并共用 `bindActionHandler`，Shelf 直接使用平台给的可消费列表。见 [SCC-02、SCC-03](../specs/archive/sdk-contract-closeouts/spec.md#验收标准)。 |
| BL-coding-changeset-view-shared | 已完成并删除 | 2026-11-23，Coding 和 Diff 通过 SDK `/diff-view` 的 `compareCodingChangeSet` 读取固定变更视图。见 [SCC-04](../specs/archive/sdk-contract-closeouts/spec.md#验收标准)。 |
| BL-b47-prompt-register-newest-fallback | 已修复并删除 | 2026-11-26，同一签名插件跨项目运行时登记在用的最高版。新版退出后恢复旧版默认文字和条目，保留用户改动。旧版无声明时清空登记。最后一个实例停用后可继续编辑，卸载后清除。见[签名包回归](../tests/generated-plugin-prompt-binding.test.ts)和[纯内容包回归](../tests/prompt-registration.test.ts)。 |

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
