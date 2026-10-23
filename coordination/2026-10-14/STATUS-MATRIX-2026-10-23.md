# 防腐线收口现状矩阵（只读调研）

- 基准：`origin/main` = `8b8ee3131`（含 #1093 Goals S7b），调研日 2026-10-23。一律读 origin/main 版本；交接清单取自 `origin/coordination/handoff-2026-10-14`（`platform-handover-1024.md`、`migration-line-not-done-1024.md`、`RISKS-AND-DEFERRED.md`、`w5-02-pr1-plan.md`、`goals-migration-plan.md`）。
- 判定口径：「已完成」= 路线图该项在 main 上无剩余工作；「部分完成」= 有合入证据且仍有具体剩余；「未开工」= 没找到合入证据。我没有跑任何构建或测试，代码事实靠 `git show / git grep origin/main` 和 PR 正文，判不准的写了「拿不准」。
- 在途（10-23 夜）：#1099→#1100→#1087→#1098→#1107（W5-06 链）、#1112、#1076→#1083（Shelf）、#1084（PG-062 S4b）、#1109（Git upstream，产品向）；#1093、#1096 已合；SC-3 在远端分支 `migrate/sessions-sc3-terminal-workspaces`（`e1771b511`，没开 PR）。

## 矩阵一　路线图 W5 / W6

### W5-01 逐族（只列还没迁到 Plugin Runtime 的族；已迁的族在最后一行）

对照物（均读 origin/main）：`tests/builtin-plugin-assembly-gate.test.ts` 的 `BUILD_TIME_ASSEMBLED` = alchemist、artifacts、feed、goals、inbox、plugin-builder、sessions（`work` 包）；`NATIVE_PLUGIN_HTTP_FILES` = alchemist、artifact、feed、inbox、personal、shelf；`HYBRID_RUNTIME_PLUGINS` = coding、shelf（`workspace-packages.mjs` 里没有 HYBRID 名单，混合名单只在这个门禁测试里）；`baseline.json` 的 `hostPluginFiles` 10 个（alchemist/artifact/feed/inbox/shelf 的 `*-native-plugin-http.ts`，加 `artifact-actions`、`goals-actions`、`inbox-actions`、`shelf-actions`、`work-actions`）；`project-plugins.ts` 监督器 13 条（schedule、shelf、coding、files、git、diff、text-stats ＋ dataset、form、lingguang、pages、ppt、workflows）；Home 级 runtime 条目 6 个（cognia、images、issues、jelly、shelf〔dual_instance〕、todo）。

| 编号 | 一句话定义 | 现状 | 证据 | 还剩什么 | 依赖 | 体量 | 用户决定？ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W5-01·Goals | Goals 按标准迁成 Runtime 插件（PG-094，PG094-06..14） | 部分完成 | S1 #812；S5 #1048；S6 #1063；S7a #821、S7b #1093；表声明 S8 #881、L1b #867；`goals-migration-plan.md` | S4（宿主读协调器、`goalTitle` 端口 `project-plugins.ts:37`）；S8 余半（建项目时 `initializeBoard`、项目库身份）；S9 `createGoalsPlugin`＋监督器条目＋删 `goals-actions.ts`＋`web-request.ts` 的 goals 条目＋BL-386＋客户端改打 `/api/plugins/…`；S10 发事件、Inbox 订阅；S11 删手写舞台；S12 删 tab 别名 | S9 要 ② 的 PG-029（可信 `user_action`）、PG-087（services）、journal/幂等服务、PG-012；S10 要 Inbox 上 Runtime；S11 要 W5-06 合完；S12 要 W6-01、PG-004 | XL（S9 单片 L） | 否；共享核心，进集成批 |
| W5-01·Feed | Feed 迁成项目 Runtime 条目（PG-093、087、034、045/046、057、080） | 未开工（没找到 Feed 专门的计划文档，路线图写 "Feed under its own plan"） | 无迁移 PR；host 文件仍在：`feed-application.ts`、`content-action-providers.ts`、`information-actions.ts`、`feed-source-sync-lease.ts`、`feed-native-plugin-http.ts`、`connector-management-service.ts` | 组装 FeedApplication 与来源调度进插件；跨项目读证据改走 Home 聚合；来源同步互斥改平台锁/作业；客户端 `navigation-feed.ts` 离开工作台；`feed-application.ts:118` 直调 `registerVersion` 改服务；`retainActionAuthority` 不再钉 provider（BL-374）；官方集成登记（PG-046）；Feed 依赖的 Module 拆分（§4 l：attention、context-ledger 做平台服务） | PG-046、PG-045 的选账号界面 S0b-2b（BL-350）、PG-087 服务化、PG-030；X-5 与 PG-043 已有 | XL | 否；要先写计划文档（拿不准要不要弹窗） |
| W5-01·Inbox | Inbox 迁成项目 Runtime 条目（PG-089 余项、010、034、033 的 S10） | 未开工 | `inbox-actions.ts`、`inbox-native-plugin-http.ts` 仍在；Schedule、Workflows 同行已迁 | 迁监督器条目；列表/状态不再用 Feed 的应用拼；`/api/inbox/*` 客户端改 `/api/plugins/…`；Functions 默认规则不再钉 inbox id（PG-010，`functions-host.ts:16`） | PG-010、PG-034；与 Goals S10 互为依赖 | L | 否 |
| W5-01·Shelf | Shelf 离开混合名单（PG-090、026、112、113） | 部分完成 | S1 #892、S2 #1051 已合；S3 #1076、S4 #1083 在途（base=main，#1083 叠在 #1076 上） | 合入这两个；桌面壳 `shelf_open_path / copy_files / drag_out` 按路径（PG-113，`shelf_http.rs`）；`runtimes.ts` 本机工具探测进平台服务（PG-112，BL-380）；删 `personal-native-plugin-http.ts` | 无新依赖 | M（剩余） | 真实 Home：`shelf/catalog.json` 1→2 维护归用户（CHECKLIST 4.3） |
| W5-01·Coding | Coding 离开混合名单（PG-036、037、091、086、054、062） | 部分完成 | C1 #932、C2 #938、C3 #905、C4 #935/#955、C5 #949、C6 #926、C7 #1024、C8-1 #960、C8-2 #987、PG038-C #1029、PG-062 第 1–3 片 #1049/#1067/#1071、S4a #1079 | C8-3（助理按 `workExecutorRoleOf` 找执行方，删 `apps/local-host/src/assistant/assistant-coding.ts`）；PG-062 S4b #1084 在途；C9（删 `coding-surface.ts`，Coding 离开 HYBRID，必须同一个 PR）；BL-372、BL-373 | C9 要 W5-06 views 通道（#1087/#1098/#1107）、W5-04 按需打包、设置分区、#1084、C8-3 | L | 否 |
| W5-01·Sessions（`work` 包） | 2026-10-18/21 决定：这一轮清理掉，重做记 BL-177 | 部分完成 | SC-1 #1075、SC-2 #1080；SC-3 在分支（未开 PR，对 main 有 7 文件冲突） | SC-3 合 main 并开 PR；SC-4 整块删 Work 包/会话界面/各名单（120–160 文件，要单独进集成批，R-06）；SC-5 `<home>/sessions/` 存量脚本与清理；BL-383/384/385 | SC-4 要 SC-1..3 与 #1048 | XL（SC-4） | 是：SC-5 删真实 Home 数据先弹窗，且归用户本人执行 |
| W5-01·Artifacts（成果库） | 成果库是平台事实，不再以插件身份登记（PG-077、078、079） | 未开工，且没有 W5 切片 | 只有 spec §1 2026-10-18「四个构建期例外」一行定了方向；privileges.md 阶段 4 排给 ②，交接清单没排 | `kind:"plugin"` 提供方改平台提供方；`services.artifacts / processItems` 由宿主给每个插件现造改平台化；类型声明从工作台拼改 Manifest 驱动；`artifact-actions.ts`、`artifact-native-plugin-http.ts` | 与 PG-087 服务化、W6-01 同批 | L | 拿不准：路线图没给编号，需统筹排片 |
| W5-01·Alchemist、plugin-builder | 2026-10-21 用户定：不迁，防腐收尾后删除再重做（BL-376、BL-377） | 不做（已定）；删除未开工 | 备份分支 `backup/alchemist-plugin-builder-2026-10-21` | 防腐收尾后：删包、宿主 `alchemist-*.ts`、`plugin-builder/`、合同、门禁条目、`pnpm studio:replay` 与 CI 作业；`deletion-alchemist-builder.md` | 要在 W6-01 前或同时，冻结名单才能清零 | L（两个） | 是：用户说"防腐做完再删"，真删前再确认；删时按当时 main 另做备份 |
| W5-01·已迁的族 | — | 已完成 | Todo #684；Issues（W3-06 样板）；Cognia #733；Images＋Jelly #743；Form #551；Dataset/PPT #749/#748；灵光 #729；Pages #847；Workflows #853；Schedule（已在监督器）；Characters 并入 `modules/characters`（CHR-0 #956、CHR-1 #1008）；Git/Files/Diff/TextStats（G0..G5，Git 离开混合名单 #1066） | PG-088 引导流程还用 Pages 的 ProseMirror（`context-onboarding-service.ts`）；BL-378 Characters 提供方名字 | — | — | 否 |

### W5-02 ～ W5-17、W6-01 ～ W6-06

| 编号 | 一句话定义 | 现状 | 证据 | 还剩什么 | 依赖 | 体量 | 用户决定？ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W5-02 | 声明式登记三个 PR：目录/监督器名单由各包描述生成；设计系统名单、home-sqlite 名单、搜索页签、page-assets 包、initialization 名称、外壳放置提示都派生 | 部分完成 | C #808（登记类型）、P0 #826（Coding 装配进包）、PR-1a #840（26 包自写 `registration.ts`，`builtin-plugins.ts` 生成）；`w5-02-pr1-plan.md` | PR-1b-1（平台读生成物，去掉对 `BUILTIN_PLUGIN_CATALOG` 的 18 个 local-host 点名，PG-105/068）；1b-2（Manifest `summary`、`developer`）；1b-3（Home 路由按 Home 登记，S-31）；1b-4（6 条无端口监督器条目生成，PG-067）；PR-1c（PG-051 Agent 定义一条登记路）；PR-2（PG-069 依赖名单、PG-070 样式/客户端包；翻译归 W5-03）；PR-3（PG-072～076：设置节、按 id 开标签、外壳分组/常驻/默认固定、`MW_PLUGINS` / `PLUGIN_ICON`、手写选项表）；#1098（2b）会顺带删掉 PG-074～076 的一部分 | W5-06 链与 Shelf 合完（枢纽文件 `project-plugins.ts`、`plugin-scope-entries.ts`、`workspace-packages.mjs` 在被改）；W4-04、W4-11 已完成 | XL | 是：§5#7 门禁额度（"新插件在包外被点名" 7→0）要改门禁，先问；PG-051 变行为 |
| W5-03 | 翻译词典按主人分/换稳定键，`en.ts` 去掉对 17 个插件包的 import，删死键 | 部分完成 | Images 样板 #751；BL-118/139；`translationConflictTotal`=191；`en.ts` 仍 27 处 import 插件包 | 其余插件逐个转稳定键（Goals 十来本词典、Todo、Pages、Shelf…）；`en.ts` 去 import；191 处冲突按中文键清；BL-139/141 | 与 W5-04 同包同批做最省；页面体积规则（单资源 >10KB 要问） | XL | 否（决定 #16 已定；不新增界面用词） |
| W5-04 | 浏览器代码一条构建管线：逐插件打包＋类型检查，插件客户端用请求助手；延迟/侧文档/Home 挂载有同样的 `host.request` / `host.reviews` 端口 | 部分完成 | Form 样板 #558；W3-10 请求助手；Coding 装配 #826；`scriptConstantsTotal`=126（97 文件）；`rawFetchInScriptsTotal`=58（32 文件） | 其余插件客户端逐个打包（每插件一 PR），再到工作台客户端分段；#826 评审跟进：评审工厂搬到共享宿主资源，去掉对 `clientUses` 的依赖 | W3-10 已完成；W5-02 PR-1 | XL | 否；新增资源或单资源 >10KB 增长先问 |
| W5-05 | 逐个删旧皮肤并做视觉比对，超阈值给用户看；降页面预算 | 基本完成 | quiet-paper #611、personal-shell #619、personal-workbench-v2 #624、v3 #630、calm-desktop #662、settings-page 规则 #677；比对工具 #550、#600 | 把 `tooling/gates/page-assets.json` 数字按实测降下去（`molis-work-workbench.css` 1.61 MB、`arrival.css` 705 KB 等）；giant 基线随降；`visual-foundation.test.ts`、`chrome-inner-scroll.test.ts` 仍有旧皮肤名（疑为"已删"断言，未逐行核） | 无 | S | 否（没见超阈值的差） |
| W5-06 | UiHost 的通用声明式挂载取代 15 个 Goals 挂载转接；外壳页面渲染器改名 | 部分完成 | 第 1 片 #1085（删 11 个转接，`mountDeclared`）；在途 #1087（第 2 片）、#1098（2b：分组/新建/起点/设置图标）、#1107（第 3 片：运行中实例画舞台）、#1112（标签标题/开标签名单/规格板） | 合入上述 4 个；BL-387 页面那一半（删 `goal-inputs-html.ts` CREATE、`placement.ts` names、`project-home.ts` starts，改读 `creatableKinds` / `homeStarts`，依赖 #1098）；BL-388 `objectTabPlugins()` 读运行时目录；PPT/Dataset/灵光其余手写行（`primitive-catalog.ts`、`global-search.ts`）；BL-430 项目 Runtime 状态页与重启入口；Goals S11；`shell-page-renderer.ts` 改函数名（留 W5-10） | #1099→#1100→#1087→#1098→#1107；#1112 与 #1098 重叠 `plugin-catalog.ts`、`index.ts` | L（剩余） | 否 |
| W5-07 | `handleMolisWorkWebRequest` 变注册表，各 *-http 模块导出 {match, handle} | 基本完成 | #666（有序路由表，快照不变） | 剩余 6 个 `*-native-plugin-http.ts` 随 W5-01 各族删除；`native-plugin-api.ts` 改写随 W6-01 | W5-01 | 无独立工作 | 否 |
| W5-08 | 宿主入口只导出装配接口（15 名、无 `export *`）；各 Module 不再导出 Repository 与 `readonly repository` | 部分完成 | Projects/Governance/Goals/Artifacts/ProcessItems/private-work-context 的 Repository 出口代码上已收（`index.ts` 不再导出；PR 号没查到，标题不带 W5-08；spec 里有 W5-08-MOD/CTX 验收）；`hostEntryExportStarTotal`=11；`typedCapabilitiesTotal`=140 | 8 个 Repository 出口：`modules/feed`（FeedEvidenceContentStore）、`modules/functions`（openFunctionsStore、FunctionsStore）、`modules/private-work-context`（SessionContentStore，随 SC-4 消失）、`modules/shelf`（ShelfStore，随 Shelf 迁移）；`apps/local-host/src/index.ts` 11 处 `export *` 收成 15 个名字（测试入口按"不加 testing 子路径"决定，测试走公开入口）；typed 140 处（PG-035、BL-364/365） | `index.ts` 是枢纽文件，等 Shelf/W5-06/SC-3 合完再动 | L | 否 |
| W5-09 | 拆 contracts `services/agent-host.ts`，修剪 `platform/plugin.ts` 热点；纯移动，API 快照守着 | 部分完成 | `agent-host.ts` 拆分 #591（现 431 行，旁边 12 个 `agent-host-*.ts`） | `platform/plugin.ts`（656 行）热点修剪——拿不准这一半是否有人做过，没找到 PR | 与所有改 `plugin.ts` 的 ② 片串行 | S–M | 否 |
| W5-10 | 其余巨大单元拆分（助理协作者、Pages 编辑器、hoverHandle、commands.ts 等），再按决定搬助理包 | 部分完成 | 基线 153 → 120 个单元；W4-05 #559、W4-07 #549、Pages 若干片（#753 等）；`HUGE-CLASS-MIGRATION.md` | 120 个：`plugins/native` 30、`apps/local-host` 18、`apps/workbench` 13、`horizontal/agent-host` 12、`modules/goals` 8、`design-system` 6、`official-integrations` 6、`plugin-runtime` 4、`private-work-context` 4、`shelf` 3、`im-ui` 3，其余 8；助理包搬迁 | 无硬依赖，但要避开在改的文件 | XL（可拆成十几个小 PR 并行） | 否 |
| W5-11 | 宿主瘦身：各插件 AI 绑定文件改 `services.model`；连接器设置与 OAuth 移入官方集成插件 | 部分完成 | 插件 AI 绑定随各族迁移已基本删光（#743、#847、#853、#1051）；`EXTENSION-POINTS.md` 写明"OAuth 型靠 W5-11；宿主设置写入留作登记过的管理接口，连接器路由以后搬进官方接入插件"（决定 #7） | `connector-api-oauth*.ts`、`connector-oauth-*.ts`、`official-integrations.ts` 的 5 处宿主分支（`definitionFor`、`connector-directory.ts`、`web-connectors-settings.ts`、`feed-connector-sync.ts`、`connector-account-actions.ts`）；`alchemist-prologue.ts` 不迁 | 与 W5-01 Feed、PG-045/046 同做 | L | 拿不准：决定 #7 只定了"写入走 HTTP 登记例外"，OAuth 搬走写在 EXTENSION-POINTS 里但没有切片编号，建议统筹确认 |
| W5-12 | 测试运行器隔离：每文件一份 Home，非浏览器并发 | 已完成 | #497（并行运行器＋每文件一份 Home）、#578（量了前后时间） | — | — | — | 否 |
| W5-13 | 按区域修吞掉的错误；最小结构化日志替 host 的 `console.*` | 部分完成 | #570、#582、#754；TS 空 catch `emptyCatchesTotal`=3 | `consoleCallsTotal`=28（17 文件，`apps/server/src/main.ts` 7、`assistant-http.ts` 2…）；浏览器脚本模板里的空 catch 118 处/49 文件（`emptyCatchesInScripts`，随 W5-04 打包后可去） | 脚本模板部分依赖 W5-04 | M | 否 |
| W5-14 | 代码改名跟术语表（内部名；界面用语按决定） | 未开工 | `GLOSSARY.md` 状态句："第 4 节界面用词等用户批准；第 5 节代码改名尚未执行" | 第 5 节改名清单（R-A 内部名；R-B 合同/持久化名，如 `io.molis.work.native.workflows`、Feed 生产者 id、`boards`）；R-A9 UI 描述 `plugin_id` | 触文件最多，应放到并行最少的窗口（所有迁移之后） | L | 是：第 4 节界面用词要用户批；R-B 属合同变化，按 AGENTS"合同只认现行取值"先经用户确认 |
| W5-15 | 成熟度词表（production/experimental/slice/absent）、清 `legacySources` / `migrationGoals` / 三重 `packageDescriptor`、Manifest 版本重置、切下一版 | 部分完成 | 产品与 26 个内置 Manifest 统一 0.3.0（#595，`POLICY.md`）；`verify-release-versions.mjs` 在 CI | `workspace-packages.mjs` 仍 70 个 `maturity: "partial"`，`SSOT-MATRIX.md` 同步；`legacySources` / `migrationGoals` / `packageDescriptor` 检查还在（该文件第 12–25、174–218 行）；v0.3.0 切版/tag 与 `CHANGELOG`、`v0.3.0.md` 刷新 | `workspace-packages.mjs` 正被 #1098 改；W5-01 收尾后包清单才稳 | M | 是：发版、tag、版本号归用户本人 |
| W5-16 | `molis-work home snapshot --to <dir>`：经常驻宿主静默、每库 SQLite 备份 API、非 SQLite 状态、清单（版本/校验）、恢复拒绝版本不符；测试覆盖每个登记库 | 未开工 | `CHECKLIST.md`、`POLICY.md`、BL-115 都写"现在仓库里没有它"；前置 W4-11 登记表已合 #542；决定 #20 已定 | 全部：`packages/storage` 快照模块、`apps/cli` 命令、宿主静默接口、`HOME-DATA.md` 逐库覆盖、清除（uninstall --purge）按同一张表 | W4-11 已完成；SC-4 会删 `sessions.db`，登记表要跟 | L | 否（决定已定）；是否在真实 Home 上跑由用户 |
| W5-17 | 目录库按 Home＋项目 id 推导项目库路径（catalog v23），加一次性真实 Home 维护 | 未开工 | `modules/projects/src/project-service.ts:58` 仍写 `database_path` 列；spec 2026-10-08「真实 Home 残留物」行 | 去掉 `database_path` 列/字段（改合同：`packages/contracts/src/modules/projects.ts` 与 API 快照）；catalog 基线升 v23（BL-413 的项目库 v8→v9 并存）；`installation-inspection.ts`、`database-paths.ts`；维护脚本演练 | catalog v22 已有；与 SC-3（也改 projects 合同）冲突 | M | 是：真实 Home 维护要用户当次同意；拿不准是否仍要写维护脚本——用户 10-20 说原机器 Home 不再用、开发机没有真实 Home，读取兼容从第一个外部版本起算 |
| W6-01 | 删 `native-plugin-api` 别名和 `/api/<短名>` 路由；AGENTS 改"新内置＝自己的包＋声明"；冻结名单清零或只剩批准例外 | 未开工 | BL-081 余项 | 7 个构建期 id、6 个 http 文件、2 个混合插件全部清掉后才能删；Artifacts 离开目录（见 W5-01·Artifacts）；Alchemist/builder 删除（BL-376/377） | W5-01 全族 | M | 是：名单清零前若要留例外，要用户批 |
| W6-02 | 生命周期测试扩到真实迁移后的生产者（Todo、Pages、灵光、Goals、Alchemist、Jelly），含卸载与升级 | 未开工 | RAC-02、N-04 写"W4-01/W6-02 待做" | **前置 W4-01（探针插件夹具）也没做**：2026-10-15 决定推迟到 W5-02 之后，仓库里没有 probe 夹具、`replay-plugins.mjs`；名单里的 Alchemist 要拿掉 | W5-01、W5-02、W4-01 | L | 拿不准：Alchemist 与"回放 3 份创作台产出"随 BL-376/377 删除，范围要改写 |
| W6-03 | 一次性更新 Skill 与手册（分层、门禁、合同、巨大单元、协作规则），含 BL-130；走查 AGENTS"先读哪里"每个场景 | 未开工 | spec RAC-11 | 收尾做；Skill 改动用创作台回放验证 | W5-02、W1-12 | M | 拿不准：验证法依赖 `pnpm studio:replay`，用户 10-21 定它随创作台删除，要先定替代验证法 |
| W6-04 | 用同样脚本重量 §3 指标，写起止对比 | 未开工 | #774 里有一条 W6-04 备注 | 终点测量 | 所有 W5 | S | 否 |
| W6-05 | 最终回归：全量、场景 5–8（1–4 要真模型）、快照差、build/typecheck/boundary/CI，对比干净基线 | 未开工 | `VERIFY-2026-10-23.md` 的统一验证窗口可作流程样板 | 全部；固定位置记录最新全量数字（N-09 缺口） | 全部 | L | 是：场景 1–4 要真模型；真实 Home 不碰 |
| W6-06 | 汇总交付物 1–23、决策日志、已确认/推断/未验证、完成/在途/待办标注 | 未开工 | — | 全部 | W6-04、W6-05 | M | 否 |

前置项：W4-01（探针插件夹具、`replay-plugins.mjs`）未交付，W6-02 靠它；W4-03 的 13 行绑定表余项（BL-087/D-04），第 1、2 片 #565、#584 已合，其余随 PG-005/PG-072 一并看，没单独核。

## 矩阵二　privileges.md 每一行 PG-NNN

读法：「判定」是我对照 origin/main 的代码与 PR 后的结论；"状态过时需核" = 状态列与现状不符，多数可直接改成已做。privileges.md 在 origin/main 上本身已更新到 #1093。共 114 行（PG-001～PG-113 加 PG-026-S1）。

### 先答你点名的行

| 行 | 结论 | 依据 |
| --- | --- | --- |
| PG-003 | 可标"已做"（规则）；开关界面是 PG-002 | #741 改 `bundledGrants` / `recordToFollow`，POLICY 7.8、S-15、`plugin-release-artifact` 测试同一 PR；该行"修法"三项全含 |
| PG-018 | 可标"已做" | #762：项目调用者只管本项目（`connector-project-mcp.ts` 按调用者项目过滤，列表同过滤），有拒绝用例 `security-invariants-connector-scope` |
| PG-019 | 可标"已做" | #762：`requireConnectorInitiator` 被 local.execute、cli.install、cli.connect、setup.execute 四个动作共用，统一拒 `connector.setup.foreign_request` |
| PG-048 | 可标"已做" | #743（Images 出图走 `services.imageGeneration`）、#744（图片输入/回执）；最后一条"Shelf 带图调用"由 Shelf S2 #1051 做完，`shelf-ai.ts` 已不在 main |
| PG-050 | 可标"已做" | #846 加 `services.materials.readDocuments`（`materials:read`，S-39，有拒绝用例）；Pages #847 已用 |
| PG-052 | 状态过时需核 | `pages-actions.ts`、`workflows-actions.ts` 已不存在；剩创作台两个 Agent（`builtin-instructions.ts` 的 BUILDER_*），随 BL-377 删 |
| PG-058 | 部分；Alchemist 部分不做 | Pages/Dataset/PPT/Workflows/Form 已迁；Goals 路由已声明（S7b）但宿主仍改写；Shelf #1076 在途；Feed、Inbox、Artifacts、Sessions 未动 |
| PG-083、084、101 | 不做（用户 10-21 已定），随 BL-377 创作台删除 | 三行整行属创作台，"待用户确认"只剩删除时点 |
| PG-008、017、023、025、045、066、092、095、099、108 | 含 Alchemist/创作台的部分已划出，其余照旧 | 见各行备注 |

### 全表

| PG | 一句话 | 状态列原文（80 字内） | 判定 | 归属线 | 对应 W5/W6/BL | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
| PG-001 | 只有「随宿主发布」和「创作台生成」两条安装路 | 待做；创作台生成这条安装路随创作台删除（用户 10-21，BL-377），统一的安装确认照旧 | 未做 | ② | W5-01 前置；§5#1 | 需用户：安装确认设计稿先弹窗；`verifyPluginPackage` 在 apps 里仍无调用方 |
| PG-002 | 没有「插件权限」设置入口，也没有改授权的动作，现在只有默认授权 | 待做 | 未做 | ② | BL-353、BL-362 | 交接 ②第 9 项；#741 只做了规则 |
| PG-003 | 随宿主发布的插件在安装和每次启动时，都会拿齐 Manifest 声明的全部权限，可选权限关不掉（`bundled | #741（Runtime 的规则；开关界面是 PG-002） | 状态过时需核 | ② | — | #741 已做规则（必需∪已持有∩声明∪新声明）；该行"修法"三项（同一套授权、S-15/POLICY 7.8、测试）#741 全含；开关界面单列 PG-002。可标"已做" |
| PG-004 | 只有随宿主发布的插件能声明 `always_on`（S-34） | 待做 | 未做 | ② | §5#1；PG094-14、W6-01 | 需用户 |
| PG-005 | 默认连线和默认输入组只在两端都随宿主发布（`shipsWithHost`）时生效 | 待做 | 未做 | ② | §5#3 | 需用户；`plugin-default-bindings.ts` 仍用 `shipsWithHost` |
| PG-006 | Goals 的 contract、state、progress、receipt 四个读动作，只放行进程里登记过的 | #812 | 已做 | ③ | W5-01 Goals | #812 |
| PG-007 | 本机所有者自动持有全部 `kind:"native"` 目录条目的动作权限，另加一份点名 Shelf、Work  | #788（阶段 2 路由层；阶段 4 收尾待做） | 部分 | ② | W5-01 平台 | #788 路由层已做；阶段 4 收尾（本人权限按宿主提供方给 + 拒绝测试）待做 |
| PG-008 | 有些路由把权限手写好交给动作网关，不按 Manifest 和安装授权去求 | 待做；创作台那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-377） | 未做 | ② | W5-01 | 创作台那部分不迁 |
| PG-009 | 审查服务按插件 id 字面量（`io.molis.work.git`、`io.molis.work.coding | 已完成（C5，2026-10-21，一个 PR 两半：平台一半——Manifest 声明 `review:<kind>`，种类只有平台列出的四种；宿主从发起调用 | 已做 | ② | W5-01 C5 | #949（C5）；状态列已写"已完成" |
| PG-010 | Functions 模块替 Inbox 和 Feed 种下 3 条默认规则，宿主用 `"io.molis.wor | 待做 | 未做 | ② | W5-01 Inbox 前置 | `functions-host.ts:16` 仍钉 `io.molis.work.inbox` |
| PG-011 | Home 级 Runtime 只装目录里写了 `runtime.scope:"home"` 的条目，而且全部是  | 待做 | 未做 | ② | W5-01 | — |
| PG-012 | 一个插件的 Home 级和项目级两部分没法一起声明 | 在做：授权按库取记录 #877、只兑现自己的一半 #882、声明与装配 S0-2b-2（#891）、端到端夹具 S0-2c（#893）已合；之后 S0-2b-3 | 状态过时需核 | ② | W5-01；BL-394 | S0-2b-3 已合 #1050（交接 ②§6），状态列仍写"之后 S0-2b-3"；Shelf 迁入随 #1076/#1083；BL-394 未做 |
| PG-013 | `projectPlugin` 遇到个人插件条目返回 null，于是项目里隐藏了的个人插件，动作还能照常调 | 待做 | 未做 | ② | BL-088 | — |
| PG-014 | Todo 按 audience 自己判断能不能读全部项目（路由 `all=1`），读取范围不是平台给的 | 待做 | 未做 | ② | W5-01 Todo | `plugins/native/todo/src/client.ts:904` 仍发 `all=1` |
| PG-015 | S-32 的对象种类排序里写着「内置在前」 | 待做（统筹已定，见 §4） | 未做 | ② | —（S-32） | 统筹已定（§4 c） |
| PG-016 | 随宿主发布的插件跟着宿主的构建升降版本（`recordToFollow`、`followBundledBuild | 待做（统筹已定，见 §4） | 未做 | ① | W5-15 | 归①；统筹已定记为安装信任，主要是文档；Runtime 已 followBundledBuild |
| PG-017 | 数据库、模型、材料、插件指令都只给宿主自己运行的插件，沙箱插件一样也拿不到 | 待做；创作台生成的插件随创作台删除（用户 10-21，BL-377），沙箱插件这一项照旧 | 未做 | ② | BL-395 | 创作台生成插件那部分随 BL-377 |
| PG-018 | 带项目作用域的调用者能管别的项目的 MCP（S-36） | #762 | 已做 | ② | W5-01 连接器 | #762（修法逐条对上） |
| PG-019 | `connectors.local.execute`、`cli.install`、`cli.connect` 不 | #762 | 已做 | ② | W5-01 连接器 | #762（四个动作共用 `requireConnectorInitiator`） |
| PG-020 | 插件的表由宿主的项目库基线建，版本跟着宿主走：Goals 看板、Feed 出口规则、Schedule 三组五张表 | 进行中（2026-10-20）：L1a 有 Manifest 的 `databases.project`、账本和打开函数；L1b（待审，与 S8 同批）项目库基 | 部分 | ② | W5-01 项目库 X-5；BL-413 | L1a #857、L1b #867、S8 #881 已合；插件运行时自己读写（L2）未做 |
| PG-021 | 建项目库时调 `GoalProjectApplication.initializeBoard`，项目库的身份就是 | 进行中（2026-10-20）：L1b（待审）起项目库的身份是 `project_root`（`modules/projects`，一库一行），11 张表的外键 | 部分 | ② | PG094-10 | L1b 起身份=`project_root`；`initializeBoard` 仍在建项目时由宿主调，S9 删 |
| PG-022 | 数据库和私有文件要宿主替插件声明才拿得到 | 待做 | 状态过时需核 | ② | W5-01 | L1a/#883 后项目库与 Home 分区库已走 Manifest 声明；私有文件/owner_files 仍只给宿主条目（=PG-102）。拿不准整行是否可改"部分" |
| PG-023 | 11 个插件包依赖私有的 `@molis-ai/molis-work-storage`，按路径自己开 Home  | 待做（T0 已核，见 §8）；Alchemist 那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-376） | 未做 | ② | W5-01 | Alchemist 部分不迁 |
| PG-024 | 删项目时只清目录条目声明过的插件数据，宿主进程直接跑插件包里的 purge | 待做（统筹已定，见 §4） | 未做 | ② | W5-02 PR-1（project_data 进各包） | 阶段 1 设计、阶段 4 删名单 |
| PG-025 | Home 级 Runtime 不给成果、端口和事件（`HomePluginExecutor.start` 直接抛 | 待做（统筹已定，见 §4）；Alchemist 那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-376） | 未做 | ② | W5-01 | Alchemist 部分不迁；#883 给了 Alchemist 的项目分区库，但成果/端口/事件仍无 |
| PG-026 | 私有文件服务已经有了（#738、#745），#743 也把 Images 的写入改走 `services.fil | 待做（T0 已核，见 §8）；Shelf 的落盘已改走 owner-files 客户端，客户端由宿主装配，见下一行 PG-026-S1 | 部分 | ② | W5-01 Shelf/Images | Images #743、Shelf S1 #892/S2 #1051 已合；Images 删项目时自删文件等收尾；Shelf S3/S4 在途 |
| PG-026-S1 | 过渡：演示数据的种子（`demo-plugin-seed.ts` 往架子里放示例）仍用宿主按 `SHELF_OW | 过渡中（动作 S2 已换；演示种子随 Shelf S4 删） | 部分 | ③ | W5-01 Shelf | 在途 #1083（演示种子走 `shelf.sample.seed`，删 `shelf-actions.ts`） |
| PG-027 | 宿主把带用户授权的 ActionClient 交给几个插件：discover 只留本安装的动作，invoke 只 | 待做（T0 已核，见 §8） | 状态过时需核 | ② | W5-01 | `actions:delegate` + `plugin-action-delegation.ts`（S-43，#853/#744）已在 main；状态列还写"待做"。可标"已做" |
| PG-028 | 插件调自己的动作时，丢了外层调用的受众 | 待做（统筹已定，见 §4） | 未做 | ② | W5-01 | 统筹已定（§4 d） |
| PG-029 | 决定、管理、配置类动作要求 `caller.user_action`（来源和时间），但没有平台给的可信来源 | 待做 | 未做 | ② | W5-01；Goals S9 前置 | `goals-actions.ts:51,56` 仍由宿主拼 `user_action` |
| PG-030 | 处理器嵌套调用时，`retainActionAuthority` 要求写出提供方，Feed 只好把自己的 `pr | 待做 | 未做 | ② | BL-374 | Feed `content-actions.ts:37`、`item-actions.ts:90` 仍钉 `provider_id` |
| PG-031 | required_actions、授权校验和各个入口钉死别的插件的 provider_id，或者从插件包 imp | 待做（T0 已核，见 §8） | 未做 | ③ | W5-01 | — |
| PG-032 | 放置服务写死关联类型 `goal`，按字符串调 `goals.inputs` | 待做 | 未做 | ② | W5-01 | — |
| PG-033 | 每次页面请求和每次 Inbox 列表之前，宿主都调 Goals 协调器把决定提醒对一遍 | 进行中（2026-10-23）：第一步是 PG-094 的 S6（PG094-08）。每个请求上的三处对账已删；Goals 写提案后自己结算提醒，项目打开时补对 | 部分 | ③ | PG094-12（S10） | S6 #1063 已删每请求对账；改发事件、Inbox 订阅待 S10 |
| PG-034 | Feed、Inbox 在 Manifest 里声明了 `action_scenes`，场景判断的实现却在宿主里 | 待做 | 未做 | ② | W5-01 Inbox/Feed | — |
| PG-035 | git index/operation/results、draftText、writer 目录这些还是 type | 部分已做（PG035，2026-10-22）：宿主一种东西一个登记口，`registerAction` 只收动作、`register` / `registerC | 部分 | ② | W5-08（typed 140）；BL-364、BL-365 | #999、G3 #1014、G4 #1019 已做；typed 仍 140 处引用 |
| PG-036 | 助理代码按插件名分支：`assistant-service.ts` 里有 31 处 `executor.kind | #845（部分：规则按页面 id、只认已装插件的页面，宿主和设置页不再列插件名；按动作选执行方与 `kind:"coding"` 的维护等 W5-10；创作台装 | 部分 | ② | W5-10；C8-3；BL-372、BL-373 | #845、C8-1 #960、C8-2 #987 已做；C8-3（助理按角色找执行方）未做，`assistant/assistant-coding.ts` 仍在 |
| PG-037 | 项目插件平台由 Coding 界面的 `ensureStarted` 拉起，running 和 error 都取 | 部分（2026-10-21，C6 平台一半）：分发、升级候选、事件恢复挪进 `project-plugin-http.ts` 的 `handleProjectP | 部分 | ② | W5-01 Coding C9 | C6 平台一半 #926；`coding-surface.ts` 的 `codingRouteHooks` 随 C9 |
| PG-038 | 后台作业服务已经有了（#742），Images 的作业也迁过去了（#743），但还没收尾：没有按项目停 | 已做（平台一半 C4 已做：执行记着受理它的项目，删项目按项目停，没有项目数据、只有后台作业的 Home 插件也有一步；PG038-P（2026-10-21）补 | 已做 | ② | BL-362（可见性另算） | 平台 C4 #935、PG038-P #963、Coding 一半 #1029 |
| PG-039 | 唤醒只投给同一进程里登记过的处理器（`PluginWakeupIndex`），现在只有宿主登记 | 待做 | 状态过时需核 | ② | W5-01 Schedule | Schedule 已在 Runtime，Manifest 有 `wakeups`；`project-clock.ts` 仍建 `PluginWakeupIndex`。拿不准是否仍是宿主登记 |
| PG-040 | 每 30 秒一次的 `projects.schedules` 轮询由宿主替 Feed 和 Schedule 手写 | 待做 | 未做 | ② | W5-01 | `workflow-feed-options.ts:19` 仍用 `workflow-events` 宿主名；未逐行核 |
| PG-041 | 「提醒」「定时操作」本是给所有插件用的服务，现在由 Schedule 插件和宿主实现 | 待做 | 状态过时需核 | ② | W5-01 Schedule | `schedule-runtime.ts`、`schedule-reminders.ts` 已不存在 |
| PG-042 | 定时对话任务由宿主替 Schedule 起 Prologue Agent 会话，还从工作台 import `BU | 待做 | 状态过时需核 | ② | W5-01 Schedule | `schedule-task-runner.ts` 已不存在 |
| PG-043 | 首页聚合和跨项目查询，都是宿主逐个打开每个项目库替插件查 | 部分完成（平台一半 C4 已做，2026-10-21：查询动作声明 `home_aggregate`，首页按 `output_type` 只在打开的项目里逐个调 | 部分 | ② | W5-01 | 平台 C4 #935、Coding 一半 #955 已做；其余插件的聚合查询按声明接 |
| PG-044 | 工作区的变化和操作结果经宿主钩子通知插件 | 部分已做（平台一半 X-6，2026-10-22：宿主事件 `host.review.settled@1`，审查结算只发给发起它的安装，S-54；Git 改成在 | 部分 | ② | W5-01 Git；BL-366 | X-6 #1013、#1028、G1 #1025、G2a #1015、G2b #1023、G5 #1066 已做；BL-366（Agent 写入也发 changed）未做 |
| PG-045 | 宿主给插件手写连接绑定和取钥，平台还没有 `services.connections`：Feed 由宿主取凭据引 | 平台服务已有（S0b-2，2026-10-23，S-57：`services.connections`，宿主在平台定的来源上加凭据，插件拿不到令牌）；Feed  | 部分 | ② | W5-11；BL-350（S0b-2b）、BL-356 | `services.connections` #1081 已合；Feed 改走它、选账号界面未做 |
| PG-046 | 只认三个写死的官方集成，每个来源各跑一个内存 Runtime | 待做 | 未做 | ② | W5-01 Feed | — |
| PG-047 | `services.model` 的「列出模型、每次选模型、判断能不能用」#743、#744 已经补上，Home | 部分做完：Coding 的模型列表由迁移线 C2 做完（W5-01-CODING-23–25，V-13 已关）；`validateResult()` 一项待做（ | 部分 | ② | W5-01 | `validateResult()` 一项待做（§4 p） |
| PG-048 | 模型服务不支持图片输入、长超时和 token 上限（T0 核过：超时和 token 上限从 `87bb55054 | #743、#744；Shelf 那条随 Shelf S2 做完 | 状态过时需核 | ② | W5-01/W5-11 | #743、#744 + Shelf S2 #1051 已合，`shelf-ai.ts` 已不存在。可标"已做" |
| PG-049 | `cognia.directory.scan` 读用户选中的本机目录，读之前不经同意流程 | 待做（统筹已定，见 §4） | 未做 | ② | §5#6 | 需用户（同意流程属信任边界变化） |
| PG-050 | 导入 docx 和 zip 要靠宿主的 `readMaterialUploads` 解析成结构 | #846（② 的项，③ 执行） | 状态过时需核 | ② | W5-01 Pages | #846 已加 `readDocuments`（S-39）；修法一行已满足。可标"已做" |
| PG-051 | Agent 定义有两条登记路：运行中的定义只登记指令和方法，角色是 `roles: []` | 待做 | 未做 | ② | W5-02 PR-1c | 变行为；另起计划 |
| PG-052 | 插件的提示词和角色登记在宿主里：创作台的两个 Agent，还有 Pages、Workflows 注入的 `hos | 待做（T0 已核，见 §8）；创作台那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-377） | 状态过时需核 | ③ | W5-11；BL-377 | `pages-actions.ts`、`workflows-actions.ts` 已不存在（#847、#853）；剩创作台两个 Agent，随 BL-377 删 |
| PG-053 | 终端是手工接起来的：终端包手列 Work、Shelf、Characters 三个客户端 | 待做 | 未做 | ② | W5-01；与 PG-082 同批 | 终端手工接线；SC-3 分支部分涉及 |
| PG-054 | 新会话、方法与 MCP 设置、委派和整合，都把运行时写死成 `"prologue"` | #844（部分：新会话、方法、MCP、委派、整合都改从运行时目录里选；还剩项目怎么选运行时，以及 Character 相关的三处写死，见 BL-372） | 部分 | ② | BL-372 | #844 已做运行时目录；项目怎么选运行时、Character 三处写死未做 |
| PG-055 | 20 个插件包依赖私有的 design-system，从那里取舞台外壳 `renderPluginStageSh | 待做 | 未做 | ② | W5-04 | SDK 无界面部件；`issues`、`todo` 等仍 import design-system |
| PG-056 | 各插件的客户端各自包一层 fetch，没有用 `molisWorkRequest`（基线里 `rawFetchI | 待做 | 部分 | ③ | W5-04 | Goals #821 已做；`rawFetchInScripts` 仍 58 处/32 文件 |
| PG-057 | 客户端和桌面壳直接调宿主的私有 HTTP 和旧路由（`/api/feed` 23 处、`/api/inbox`  | 待做 | 未做 | ③ | W5-01 Feed/Inbox；W6-01 | — |
| PG-058 | 路由不写在 Manifest 里：宿主把 `/api/plugins/<id>/` 改写成 `/api/<短名> | 待做（T0 已核，见 §8）；Alchemist 那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-376） | 部分 | ③ | W6-01 | Pages/Dataset/PPT/Workflows/Form 已迁；Goals 路由已声明（S7b）但宿主仍改写；Shelf #1076 在途；Feed/Inbox/Artifacts/Sessions 未动。Alchemist 部分不迁 |
| PG-059 | Dataset、PPT 的客户端不走 `host.route`，打的是根路由，`project_id` 从请求里 | #748、#749 | 已做 | ③ | W5-01 | #748、#749 |
| PG-060 | 项目页就是 Goals 页，宿主和工作台逐个插件拼舞台：好几个具名的拼装函数、10 张 surface→slot | 进行中：W5-06 第 1 片（10-23）去掉 9 张 Goals 的 surface→slot 表与 11 个转接文件，`render*Contributi | 部分 | ② | W5-06；BL-387、BL-388 | 第 1 片 #1085 已合；第 2/2b/3 片 #1087/#1098/#1107 在途；余项 #1112 在途 |
| PG-061 | 「该重新读了」要靠宿主端口去调 `platform.invalidateView` | 部分已做（PG061，2026-10-22）：`services.ui.invalidate()` 已有，只推自己的 revision，声明了 `ui.view | 部分 | ② | BL-363 | `services.ui.invalidate` 与 Files/Git 删端口已做；`ui.commands` 接通=BL-363 未做 |
| PG-062 | 宿主在路由结果上替 Diff、Text Stats 补 html | 部分（2026-10-22，C7 平台一半）：脱敏、富文本、代码着色只在插件 SDK 里有一份——根入口 `redactSecrets`，子路径 `/rich- | 部分 | ② | W5-01 Coding C7 | 平台一半 #1024；插件一半第 1–3 片 #1049/#1067/#1071 已合，S4a #1079 已合；S4b #1084 在途 |
| PG-063 | 工作台一看到 `data-make-todo` 属性，就按 Todo 的输入格式把内容交给 Todo | 待做 | 未做 | ② | W5-02 PR-3 / 工作台 | `events-secondary.ts:95`、`plugin-frame/todo.ts` 仍按 `data-make-todo` |
| PG-064 | 工作台成了插件实现交给宿主的二传手 | 待做 | 未做 | ② | W5-01 阶段 4 | — |
| PG-065 | 26 条手写的目录条目，每条把 Manifest 和实现绑一次 | 部分：PR-1a 各包自写登记、目录由生成器写，`pnpm health:check` 核它；字段进 Manifest 在 PR-1b | 部分 | ② | W5-02 PR-1b | PR-1a #840（登记自写、目录生成）已合；字段进 Manifest 未做 |
| PG-066 | 删项目时宿主遍历目录的 `project_data` | 部分：PR-1a 改成生成（写在各插件的登记里）；平台按声明删在 PG-024；Alchemist 那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL- | 部分 | ② | W5-02；PG-024 | PR-1a 已改生成；平台按声明删在 PG-024 |
| PG-067 | 11 条项目级监督器条目全是手写，其中 6 条没有端口（Dataset、Form、灵光、PPT、Diff、Tex | 待做（T0 已核，见 §8） | 未做 | ② | W5-02 PR-1b-4 | — |
| PG-068 | 门禁按手写名单数：冻结名单里 RUNTIME_ASSEMBLED 9 条、BUILD_TIME_ASSEMBLE | 部分：PR-1a 门禁改读各包登记（`scripts/gates/catalog-entries.mjs`，手写和生成两种目录都认）；PR-1b-1 只认生成的 | 部分 | ② | W5-02 PR-1b-1；§5#7 | PR-1a 门禁读各包登记；"额度 7→0"要用户批 |
| PG-069 | 加一个插件要手改 4 处依赖：workbench 的 extra 依赖列了 26 个插件包，local-host | 待做 | 未做 | ② | W5-02 PR-2 | `scripts/workspace-packages.mjs` 额外依赖手写；#1098 也改该文件 |
| PG-070 | 样式拼进公共样式表，客户端发布成 `/assets/molis-work-plugins/<id>.js`，4  | 待做 | 未做 | ② | W5-02 PR-2；W5-04 | — |
| PG-071 | 插件的英文要经工作台 import 才生效：`i18n/en.ts` 从 17 个插件包 import 28 本 | 待做 | 未做 | ② | W5-03 | `en.ts` 仍 import 27 次插件包 |
| PG-072 | 设置节由宿主按贡献 id 分支拼，Coding 设置页的模型也是宿主拼的 | 待做（统筹已定，见 §4） | 未做 | ② | W5-02 PR-3 | 统筹已定（§4 i） |
| PG-073 | 哪些插件能「按 id 开一张标签」，由手写名单决定 | 待做 | 未做 | ② | W5-02 PR-3 | — |
| PG-074 | 外壳里的分组、常驻和默认固定都是手写的，名单外的插件统统落进同一组 | 待做 | 未做 | ② | W5-02 PR-3 | #1098（2b）会删外壳分组表，可能带走一部分 |
| PG-075 | design-system 的 `MW_PLUGINS`（28 条，缺 issues）和 `PLUGIN_ICO | 待做 | 未做 | ② | W5-02 PR-3 | #1098 删设置图标表，部分重叠 |
| PG-076 | 还有几张手写的选项清单：助理设置的 SURFACES、目标输入的 CREATE、Pages 的 searchRo | 待做 | 未做 | ② | W5-02 PR-3 | #1098/#1112 重叠 CREATE、SURFACES 表 |
| PG-077 | 成果库还以插件身份登记（`kind:"plugin"`、有目录条目、提供方 `io.molis.work.art | 待做（T0 已核，见 §8） | 未做 | ② | 平台事实；W6-01 | Artifacts 去插件身份 |
| PG-078 | `services.artifacts` 和 `processItems` 由宿主给每个插件现造 | 待做（T0 已核，见 §8） | 未做 | ② | 平台事实 | — |
| PG-079 | 成果类型名、续写者、引用者，以及「没声明就拒写」，都由工作台目录和宿主拼 | 待做 | 未做 | ② | 平台事实 | — |
| PG-080 | 宿主直接调 `artifacts.commands.registerVersion`，替 Pages、Feed  | 待做 | 部分 | ③ | W5-01 Feed | Pages 已迁；Feed 的 `feed-application.ts:118` 仍直调 `registerVersion` |
| PG-081 | Sessions 的注册表由宿主打开 Home 的 sessions.db 后持有，再交给工作区动作和 HTTP | 进行中：SC-1 删了 MCP 的「Goals 能力→Session 活动」表（`apps/mcp/src/session-activity.ts`）和面板、M | 部分 | ③ | SC-1..SC-5；BL-177 | SC-1 #1075、SC-2 #1080 已合；SC-4 未做 |
| PG-082 | 项目文件夹设置和终端面板本是平台的事，却实现在 Work 插件里：平台动作 `system.project-wo | 待做 | 部分 | ② | SC-3（分支已推，没开 PR） | `migrate/sessions-sc3-terminal-workspaces` `e1771b511`；对 main 有 7 文件冲突 |
| PG-083 | 生成的插件跑在每个项目另建的第二个插件平台上（`home: null`），拿到的服务也不一样：Manifest  | 不迁；防腐收尾后删除，再重做（用户 10-21，BL-377） | 不做（用户 10-21 已定） | ② | BL-377 | 创作台随删 |
| PG-084 | 创作台以插件身份进了目录和冻结名单，自己又另造了一个平台：存储伪造了一个安装上下文（`requireGrant( | 不迁；防腐收尾后删除，再重做（用户 10-21，BL-377） | 不做（用户 10-21 已定） | ② | BL-377 | 创作台随删 |
| PG-085 | Characters 名义上是 Runtime 插件，业务却都经宿主端口打开 module-characters | 已做（存量安装记录走维护，见 `docs/releases/CHECKLIST.md`）。CHR-0（RAC-63～69）：动作处理器、发布核对、本机导入与预览 | 已做 | ③ | W5-01 Characters | CHR-0 #956、CHR-1 #1008；BL-378 余名字 |
| PG-086 | Coding 读角色要经宿主造的 `codingCharacterPorts`（Coding 这半 C2 已做： | 部分做完：Coding 这半由迁移线 C2 做完（W5-01-CODING-28–30，S-15 两条拒绝）；运行记录由 Sessions 收尾 SC-2 做完 | 部分 | ③ | W5-01 | Coding 半 C2 #938、运行记录 SC-2 #1080 已做；助理/agent-host 使用（C2b）待做 |
| PG-087 | Feed 的业务落在 module-feed、attention、sources、signals 等模块里，由宿 | 待做（统筹已定，见 §4）。D3 的宿主一半已做（S5，2026-10-22）：Artifacts、ProcessItems 由项目运行时开一份，宿主动作和插件 | 部分 | ② | W5-01 Feed/Goals | D3 宿主一半（S5 #1048）已做；包成 services 待做 |
| PG-088 | Pages 是构建期装配，走 `/api/<短名>` | 待做（T0 已核，见 §8） | 状态过时需核 | ③ | W5-01 Pages | Pages 已迁（#847）；剩引导流程仍用 Pages ProseMirror（`context-onboarding-service.ts` 在） |
| PG-089 | Schedule、Workflows、Inbox：宿主把原始项目库、调度器和安装记录库直接交给插件 | 待做（T0 已核，见 §8） | 状态过时需核 | ③ | W5-01 Inbox | Schedule（早）、Workflows（#853）已迁；Inbox 未迁（`inbox-actions.ts`、`inbox-native-plugin-http.ts` 在） |
| PG-090 | Shelf 本是 Runtime 插件，宿主又手写装配了一遍：替它列 Coding 的成果和过程项再写入（C3  | 部分完成（Coding 半边 C3 已做；带图调用与 Home 一半由 Shelf S2 做完；剩项目一半的写入口 `receive` 与宿主装配，随 Shel | 部分 | ③ | W5-01 Shelf | S3 #1076、S4 #1083 在途 |
| PG-091 | Coding 一族：宿主直接拿原始库（C1 已做：Coding 的会话库经 `services.project_ | 部分做完：原始库一项由迁移线 C1 做完（W5-01-CODING-15–21）；目标标题一项由迁移线 C2 做完（W5-01-CODING-26、27）；C3 | 部分 | ③ | W5-01 Coding C9 | C1/C2/C3 已做；伙伴页装配（`coding-surface.ts`）归 C9 |
| PG-092 | Alchemist：宿主建服务和提供方（手写 `registerProvider`），替插件开库和目录、绑定连接 | 不迁；防腐收尾后删除，再重做（用户 10-21，BL-376） | 不做（用户 10-21 已定） | ③ | BL-376 | Alchemist 随删 |
| PG-093 | Feed：宿主组装 FeedApplication 和来源调度，还跨项目库读证据 | 待做 | 未做 | ③ | W5-01 Feed | — |
| PG-094 | Goals：包里没有 Runtime 入口，Manifest 是 `native` 且不声明路由 | 进行中（2026-10-20）：S8 做了表的一半（Goals 的表由它的 Manifest 声明，基线不再带，`board.title` 删掉，`goals. | 部分 | ③ | W5-01 Goals（PG094-06..14） | S1/S5/S6/S7/S8 表半已做；S4、S8 余半、S9..S12 未做 |
| PG-095 | Alchemist、Images、Jelly、Shelf 的插件合同（含 `SHELF_ADMIT_ACTION | 待做（T0 已核，见 §8）；Alchemist 那一部分不迁，防腐收尾后删除再重做（用户 10-21，BL-376） | 未做 | ② | W5-01 阶段 4 | Alchemist 合同不迁；Images/Jelly/Shelf 合同待搬 |
| PG-096 | 平台事件表里有一个插件专用的前缀 `"molis-shelf-"` | 待做 | 未做 | ② | W6-01 / 阶段 4 | `dom-events.ts:37` 仍有 `"molis-shelf-"` |
| PG-097 | 平台的存储和资源用插件命名：Home 级的密钥库、锁和证据内容库放在 `{home}/feed`，素材助手用 J | 待做 | 未做 | ② | 阶段 4；§5#5 | 改 `{home}/feed` 等路径=动真实 Home，需用户 |
| PG-098 | UI 贡献里写的 plugin_id 是 `io.molis.work.native.*`，和 Manifest | 待做 | 未做 | ② | 阶段 3 | — |
| PG-099 | 死代码：宿主替插件渲染目录和舞台的旧函数还在（`git-status.ts` 只在 `index.ts` 里导出 | Git 的部分已删：`git-status.ts` 与它在 `index.ts` 的转出随 GS（S-53）删掉，`coding-surface.ts` 里没人 | 部分 | ③ | W5-01 | Git/Files 的已删（G0、GS）；Alchemist 自带守卫不迁 |
| PG-100 | 灵光的 `fateLabel` 写死了别的插件的对象种类（goal、todo、pages） | 待做 | 未做 | ③ | W5-01 | 灵光 `fateLabel` |
| PG-101 | 创作台的 Manifest consume 了一组 typed agent-host 能力，代码里一处都没用到 | 不迁；防腐收尾后删除，再重做（用户 10-21，BL-377） | 不做（用户 10-21 已定） | ② | BL-377 | 创作台随删 |
| PG-102 | `services.files`（#738）、`owner_files`（#745）、`services.mod | 待做（统筹已定，见 §4） | 未做 | ② | W5-01 | 统筹已定（§4 m、n）：合并两套私有文件服务 |
| PG-103 | `initialize_owner_files` 是只有内置目录条目能用的启动钩子：插件启动时，宿主拿着 wri | 待做（统筹已定，见 §4） | 未做 | ② | W5-01 | 同上；`initialize_owner_files` 改 Manifest 声明 |
| PG-104 | 有两套私有文件服务，授权规则不一样：`files` 读的时候不要求动作作用域，写的时候接受插件自己拼的 cont | 待做（统筹已定，见 §4） | 未做 | ② | W5-01 | 同上（§4 n） |
| PG-105 | 平台层直接 import 手写的内置目录：`BUILTIN_PLUGIN_CATALOG.flatMap(... | 待做 | 未做 | ② | W5-02 PR-1b-1 | `plugin-scope-entries.ts` 仍 import `BUILTIN_PLUGIN_CATALOG` |
| PG-106 | `PluginAppContribution.onProjectDeleted` 是 #743 新加的 Runt | 已做（C4，2026-10-21）：钩子已从合同、宿主与 Images 删掉；删项目在同一轮里先按项目停后台执行，再关库、purge。已开始的调用仍由分区清理答 | 已做 | ② | W5-01 C4 | C4（#935） |
| PG-107 | 认插件身份的口径有两套：成果的 `head`、`readOwn` 只比 `producer_plugin_id` | 待做 | 未做 | ③ | W5-01 | 先归③后② |
| PG-108 | `alchemist.runs.continue` 声明的权限是空的，运行时却按任务类别另要 `alchemis | 不迁；防腐收尾后删除，再重做（用户 10-21，BL-376） | 不做（用户 10-21 已定） | ③ | BL-376 | Alchemist 随删 |
| PG-109 | 宿主私路的残留：`creative-artifacts.ts` 仍导出 PPT 的三个旧端口，并 import  | #779 | 已做 | ③ | — | #779 |
| PG-110 | 动作网关不核对插件调用者是不是宿主发的：插件受众的调用和带 `host_plugin` 的调用，上下文写对就放行 | #812 | 已做 | ③ | W5-01 Goals | #812 |
| PG-111 | PG-095 那四个以外，其余插件的合同也放在平台的 contracts 里 | 待做 | 未做 | ③ | W5-01（随各插件迁） | — |
| PG-112 | Shelf 的 Home 实例在插件进程里读宿主的环境变量（`PATH`、`MOLIS_WORK_SHELF_A | 待做（BL-380） | 未做 | ② | BL-380 | — |
| PG-113 | 桌面壳的 `shelf_open_path`、`shelf_copy_files`、`shelf_drag_ou | 待做（只剩桌面壳按路径；Shelf 侧 S2 已改） | 未做 | ② | Shelf S4 后 | 桌面壳 `shelf_*` 仍按真实路径 |

### PG-094 子行（PG094-xx，出处 `goals-migration-plan.md` 的 S 片表）

| 子行 | 对应片 | 判定 | 证据／还剩 |
| --- | --- | --- | --- |
| PG094-01 | S1（网关只认宿主发的插件调用者，删内置名单） | 已做 | #812 |
| PG094-02..05 | S2/S3（外部会话回执、对话输入到 ledger 边，⑥ 的 RCPT 验收） | 拿不准 | 我读到的文件里没有这四个号的定义，验收号是 RCPT 编号；本调研没核 |
| PG094-06 | S4（宿主不再直读协调器、不钉提供方、`goalTitle` 端口） | 未做 | 等 T1（已解冻）；与 Coding C9 同动 `project-plugins.ts` |
| PG094-07 | S5（Goals 类收进包内工厂，Artifacts/ProcessItems 提到 runtime） | 已做 | #1048 |
| PG094-08 | S6（删每请求对账，项目打开时补对一次） | 已做 | #1063 |
| PG094-09 | S7（客户端用请求助手；HTTP 处理器成 Runtime 路由形状） | 已做 | S7a #821、S7b #1093 |
| PG094-10 | S8（Goals 声明自己的项目库） | 部分 | 表半边 #881（L1b #867）；项目库身份不再是 Goals 看板的一半留到 S9（`initializeBoard`） |
| PG094-11 | S9（`createGoalsPlugin`，路由进 Manifest，监督器条目，删 `goals-actions.ts`、BL-386） | 未做 | 依赖见矩阵一 Goals 行 |
| PG094-12 | S10（发事件、Inbox 订阅） | 未做 | 等 S9、Inbox 上 Runtime |
| PG094-13 | S11（删工作台手写 Goals 舞台） | 未做 | 等 W5-06 合完 |
| PG094-14 | S12（删 tab 别名，常开改声明） | 未做 | 等 W6-01、PG-004 |

### 状态列过时清单（建议在下一次 privileges.md 刷新时一次改）

PG-003、PG-018、PG-019、PG-048、PG-050（可标已做）；PG-012（S0-2b-3 #1050 已合）；PG-027（`actions:delegate`＋`plugin-action-delegation.ts` 已在 main）；PG-039、PG-041、PG-042（Schedule 已在 Runtime，`schedule-runtime.ts`、`schedule-reminders.ts`、`schedule-task-runner.ts` 已不存在，PG-039 的 `project-clock.ts` 仍建 `PluginWakeupIndex`，要核）；PG-052、PG-088、PG-089（Pages、Workflows 已迁）；PG-022（项目库与 Home 分区库已走 Manifest，私有文件仍宿主条目）。这些我只抽查了代码，没有逐行核全部要求，标"需核"的行请 ① 复核后再改。

## 矩阵三　现在就能从 main 开工、互相不改同一批文件的片

在途 PR 会改的文件（`gh pr diff --name-only`），按"枢纽"归并：

| 在途 | 主要动的文件 |
| --- | --- |
| #1076（Shelf S3）、#1083（Shelf S4，叠在 #1076 上） | `plugins/native/shelf/**`、`modules/shelf/**`、`packages/contracts/src/modules/shelf.ts`、`apps/local-host/src/{index,web-catalog,web-request,personal-native-plugin-http,shelf-native-plugin-http,shelf-actions,demo-plugin-seed,local-owner-permissions,plugin-scope-entries,web-project-settings}.ts`、`apps/desktop/adapters/tauri/src/shelf_http.rs`、`apps/workbench/src/side-panel-computer.ts`、大量 `tests/shelf-*`、`tests/web-route-table.test.ts` |
| #1087、#1098、#1107（W5-06 链）、#1099、#1100 | `apps/workbench/src/{declared-stages,shell-page-renderer,plugin-catalog,plugin-settings-catalog,index,renderer,ui-composition,immersive-shell,i18n/arrival-en,i18n/onboarding-en}.ts`、`apps/workbench/src/scripts/client/{events-primary,initialization,navigation-feed}.ts`、`apps/local-host/src/{project-plugins,project-plugin-stages,web-goals-read,home-plugin-http,home-plugin-executor,plugin-executor,plugin-host-services,plugin-stopped-services,plugin-builder-surface,coding-surface,artifact-document-import}.ts`、`packages/contracts/src/platform/ui.ts`、`packages/plugin-runtime/src/{action-scope,stopped-services,index}.ts`、`packages/plugin-sdk/src/{manifest,view-placement-declarations}.ts`、`packages/ui-host/src/view-registry.ts`、**所有 `plugins/native/*/src/manifest.ts`**、`plugins/native/goals/src/tree-client.ts`、`scripts/workspace-packages.mjs`、根 `package.json`、`pnpm-lock.yaml` |
| #1112 | `apps/workbench/src/{index,plugin-catalog,primitive-catalog,tab-workspace-ops}.ts`、`scripts/client/{global-search,initialization}.ts`、9 个插件 `manifest.ts` |
| #1084（PG-062 S4b） | `plugins/native/{coding,diff}/src/**`、`packages/plugin-sdk/src/{diff-view,unified-diff}.ts`、`apps/local-host/src/{coding-surface,plugin-interaction,project-plugin-http,index}.ts`、`apps/workbench/src/i18n/renderer-gap-en.ts` |
| SC-3 分支 | `plugins/native/work/**`、`apps/workbench/src/terminal/**`、`apps/workbench/src/{renderer,ui-composition,i18n/en,i18n/terminal-en}.ts`、`apps/mcp/src/**`、`apps/local-host/src/{project-host,index,web-request,mcp-server,runtime-*,web-panel*,web-session,web-work-session,project-workspace-*}.ts`、`packages/contracts/src/modules/{private-work-context,projects}.ts` |
| 所有在途 PR 的共同热点 | `specs/repository-anti-corruption/{privileges,spec}.md`、`specs/BACKLOG.md`、`tooling/gates/{baseline,page-assets}.json`、`tooling/gates/actions/*.tsv`、`tests/fixtures/web-route-table.snapshot.json` |

### 现在就能开的片（各片文件集互不相交，也避开上表）

| 片 | 内容 | 主要动的文件／目录 | 体量 | 备注 |
| --- | --- | --- | --- | --- |
| R1 | W5-16 `home snapshot` 命令＋清单＋恢复＋覆盖全部登记库的测试 | `packages/storage/src/**`（新增快照模块，读 W4-11 登记表）、`apps/cli/src/**`、`docs/system/HOME-DATA.md`、`docs/releases/{CHECKLIST,POLICY}.md`、新测试 | L | 决定 #20 已定；宿主静默入口若必须挂 `web-request.ts`，改走现有动作/常驻宿主转发，避免碰枢纽文件；SC-4 之后登记表要跟着删 sessions |
| R2 | W5-17 目录库路径推导（catalog v23）＋演练夹具 | `modules/projects/src/{project-service,repository,database-paths,installation-inspection}.ts`、`packages/storage`（catalog 基线）、`tests/fixtures/*maintenance*`、`docs/system/HOME-DATA.md` | M | `packages/contracts/src/modules/projects.ts` 与 SC-3 重叠，合并顺序放在 SC-3 之后；要先确认是否仍写真实 Home 维护脚本（见矩阵一） |
| R3 | W5-13 收尾：`console.*`→host 日志、其余吞掉的错误 | `apps/server/src/main.ts`、`apps/cli/**`、`apps/local-host/src/assistant/assistant-http.ts`、`apps/desktop/**`（排除 W5-06 链碰的 workbench 脚本） | M | 浏览器脚本模板里的空 catch 先不动，等 W5-04 |
| R4a | W5-10：`packages/design-system` 6 个巨大单元 | `packages/design-system/src/**` | M | 纯移动，API 快照守着；W5-02 PR-3 之后才动 `MW_PLUGINS`，不冲突 |
| R4b | W5-10：`plugins/official-integrations` 6 个 | `plugins/official-integrations/**` | M | 与 W5-11 的 OAuth 搬迁同目录，先拆后搬 |
| R4c | W5-10：`horizontal/{memory,placement,search,scheduler,listener-host}`、`packages/im-ui` | 对应目录 | M | 含 `scheduler` 与 R10 同目录，R10 开了就合进 R10 |
| R4d | W5-10：Pages 编辑器余下单元（`mount`、`hoverHandlePlugin`、`commands.ts`） | `plugins/native/pages/src/**` | M–L | 与 R6 的 Pages 条互斥，二选一先后做 |
| R5 | `modules/feed`＋`modules/functions` 一条线：W5-08 两个 Repository 出口、PG-010（Functions 默认规则不再钉 inbox id）、两包的巨大单元 | `modules/feed/**`、`modules/functions/**`、`apps/local-host/src/functions-host.ts` | M | 为 Inbox 迁移清前置；Feed 迁移之前做，之后 Feed 迁移会再动 `modules/feed` |
| R6 | W5-03＋W5-04 按插件一片：Todo、Issues、Cognia、Jelly、Images、灵光、Dataset、PPT、Form、Workflows、Schedule、Pages（每插件一个 PR，互不相交） | 各自 `plugins/native/<x>/src/**`（含 `registration.ts`、客户端、词典）＋ `apps/workbench/src/i18n/en.ts` 删一行 import | 每片 S–M，合计 XL | 避开 `manifest.ts`（#1098 全改）；`en.ts` 与 SC-3 同改一个文件但行不同；页面资源体积要在 PR 里写账（>10KB 先问）；Goals、Coding、Shelf、Feed、Inbox 不在内 |
| R7 | PG-029／PG-030／BL-374：可信 `user_action` 来源，`retainActionAuthority` 不再要求写 provider；Goals S9 前置 | `packages/kernel/src/**`、`packages/plugin-sdk/src/{index,actions…}`（不碰 `manifest.ts`、`view-placement-declarations.ts`）、`packages/contracts/src/platform/actions.ts`、`plugins/native/{feed,lingguang,cognia}/src/*actions.ts` | M–L | 共享核心，进集成批；`plugins/native/{lingguang,cognia}` 与 R6 重叠，先做 R7，或把这两处并进 R6 对应插件 |
| R8 | PG-051（Agent 定义一条登记路，W5-02 PR-1c）＋PG-035 余项／BL-364、365（typed 140 处改动作）＋ agent-host 的 12 个巨大单元 | `horizontal/agent-host/**`、`packages/contracts/src/services/agent-host*.ts`、`apps/local-host/src/agent-definitions/**`、`agent-host-composition.ts`、`packages/kernel` | L | 同一目录，一条线串行；PG-051 变行为，要先写计划；与 R7 的 `packages/kernel` 文件要错开（R7 先） |
| R9 | BL-395：沙箱项目库语句的时间与大小上限（须在第一条给沙箱开项目库的生产路径之前） | `packages/plugin-sandbox/**`、`packages/plugin-runtime/src/` 里项目库相关文件（不碰 `index.ts`、`action-scope.ts`、`stopped-services.ts`） | S–M | 补拒绝测试，进 S 表 |
| R10 | PG-039～042：Schedule 唤醒、Feed 每 30 秒轮询用的宿主名字、提醒/定时服务；先核哪几行其实已做 | `apps/local-host/src/{project-clock,workflow-feed-options}.ts`、`plugins/native/schedule/src/**`（不碰 `manifest.ts`）、`horizontal/scheduler/**` | M | 开工第一步是核代码，状态列过时（见上）；若 Feed 轮询要等 Feed 迁移，就只做 Schedule 部分 |
| R11 | PG-063／PG-064：`data-make-todo` 改成通用内容交接，工作台不再替 Todo 认格式 | `apps/workbench/src/scripts/client/events-secondary.ts`、`apps/workbench/src/browser/plugin-frame/todo.ts`、`plugins/native/todo/src/**`、SDK 内容交接 | M | 与 R6 的 Todo 条互斥，建议并进 R6 的 Todo 片；#1099 只改 `events-primary.ts`，不冲突 |

### 暂时不要开（碰在途 PR 的文件）

| 事项 | 要等什么 | 原因 |
| --- | --- | --- |
| W5-02 PR-1b-1..4、PR-2、PR-3 | #1087→#1098→#1107、#1112、#1076→#1083 合入 | `project-plugins.ts`、`plugin-scope-entries.ts`、`workspace-packages.mjs`、`plugin-catalog.ts`、`plugin-settings-catalog.ts`、所有 `manifest.ts` 都在被改 |
| W5-06 余项（BL-387 页面一半、BL-388、BL-430、Goals S11） | #1098、#1107、#1112 | BL-387 明说依赖 #1098；BL-430 依赖三片合入 |
| PG-002／PG-003 设置里的可选权限开关、BL-353、BL-362 | #1098 | `plugin-settings-catalog.ts`、`plugin-runtime/index.ts` 在改 |
| BL-367（`stop` 钩子时限）、BL-394（双实例标记）、BL-366 | #1098（改 `plugin-executor.ts`、`home-plugin-executor.ts`、dual-instance 测试）；BL-366 另等 #1084 | 同文件 |
| W5-15 成熟度重贴标 | #1098 | `scripts/workspace-packages.mjs` 在改；也宜等 W5-01 收尾后包清单稳定 |
| PG-102～105 私有文件服务合并、PG-026 收尾、PG-113 | #1076、#1083 | `plugin-scope-entries.ts`、`local-owner-permissions.ts` |
| W5-08 的 `index.ts` `export *` | Shelf、#1084、SC-3 合入 | `apps/local-host/src/index.ts` 四方都在改 |
| Goals S4／S9，Coding C8-3／C9，Feed／Inbox 迁移，SC-4 | 见矩阵一各行的依赖 | 都碰 `project-plugins.ts`、`web-request.ts`、`project-host.ts` |
| W5-14 全部改名 | 所有迁移之后＋用户批界面用词与合同改名 | 触文件最多 |
| 页面预算降值（W5-05 余项）、privileges.md 状态列大刷新 | W5-06 链与 Shelf 合完 | `page-assets.json`、`privileges.md` 是每个 PR 都改的热点 |

### 建议的合并/依赖主线

`#1099 → #1100 → #1087 → #1098 → #1107`（同时 #1076 → #1083、SC-3 开 PR、#1112、#1084 各自合 main）→ W5-02 PR-1b 与 W5-06 余项 → Goals S9 前置（R7 + ② 的 PG-087 服务化）→ Goals S9、Inbox 迁移（R5 已先做）→ Feed 迁移（要先写计划）→ SC-4 → Coding C8-3／C9 → Artifacts 去插件身份 → Alchemist／创作台删除（BL-376／377）→ W6-01 → W4-01、W6-02、W6-03 → W6-04、W6-05、W6-06。R1～R11 可以和主线并行起步。

## 需要用户拍板的汇总

1. W5-02：门禁额度"新插件在包外被点名"7→0（改门禁）；PG-051 改 Agent 定义的行为；PG-001/004/005 的统一安装确认、常开、默认连线同意（privileges §5 #1、#3，先出设计稿再问）。
2. W5-14：界面用词清单（GLOSSARY 第 4 节）和合同/持久化名改动（第 5 节 R-B）。
3. W5-15：发版、tag、版本号归用户本人；成熟度词表改名本身不需要。
4. W5-17：是否仍要写真实 Home 维护脚本、是否真实执行（用户 10-20 说开发机没有真实 Home）。
5. SC-5、R-04（Characters 库 1→2）、Shelf catalog.json 1→2、BL-413、BL-126：真实 Home 维护都归用户本人。
6. Alchemist／创作台真删时点（用户 10-21 说"防腐做完再删"）；`pnpm studio:replay` 随之消失后 W6-03 用什么验证。
7. PG-049 Cognia 读本机目录的同意流程（privileges §5 #6）。
8. 拿不准、建议统筹先定的：Artifacts 去插件身份没有 W5 编号；W5-11 的 OAuth 搬迁没有切片编号；Feed 迁移要不要先弹窗确认计划；W5-09 `platform/plugin.ts` 热点是否做过。
