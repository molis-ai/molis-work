# 重组续接点

2026-09-06。仓库交接不代替 Molis Work；生命周期只用 host 提供的 molis_work_v1 MCP。

## 最新可信进度

2026-09-08 最终 Cutover：现有代码迁移、统一用户 E2E、四个实测缺陷修复、最终包安装与 Native App 验证、测试 Home 清理和初始架构审计已完成。结果见 [最终架构审计](final-architecture-audit.md) 与 [统一验证记录](cutover-validation.md)。

最终生产代码上完整 755 项运行为 754 pass/1 旧断言 fail；修正断言后定向 1 pass；类型、包边界及 23 项反例测试通过。旧混合目录退出，根仅 6 个启动/SDK 文件，0 兼容豁免。新包未升级现用 Home，原 4173 服务已恢复；测试 4197 已停，临时 Home 和其中通知副本/测试凭据已删除。无 commit/push。Outbox、Team/Server 与公开发布继续按既有边界后置。

正式验收已完成：Cutover valid/satisfied/completed，Review review-fbec8d02-b66f-4903-af65-892e8eb135fe；根 Goal valid/satisfied/verified，但仍有历史 coverage_revision_stale 提示，UI continue，未强行消除。均无 active Claim/Run。

## 历史执行记录（以下阶段待办与租约已过时）

- **最后入口与SDK迁移完成，进入全量自动回归（2026-09-08）**：卸载6/0/0、MCP44/0/0+真实stdio、CLI11/0/0、SDK/V1/迁移/边界139/0/0全部通过。Root只剩SDK index/store/types和CLI/MCP/Web入口，旧v1/Desktop目录删除；内部caller使用公开owner，根SDK保留本版本旧读方法/名称和唯一owner类型alias。MCP App tool-dispatch、Host身份/资源、Desktop Catalog注入；CLI App command-dispatch和顶层dispatch、Host存储/本机服务装配。边界719源码2784imports101边0errors、0compatibility豁免。当前 `NODE_NO_WARNINGS=1 pnpm test` 全量构建已完成、测试运行中（log `/private/tmp/molis-work-cutover-full-regression.log`）；不修改生产源码或build输入直到该轮结束。初步只读全仓体积扫描发现ClaimCommands835、WorkState727、Verification667等需要在清理/总审判断职责，不能把旧Huge计数0当全仓无Huge。下一步完整回归问题处理→统一真实UI/后端E2E→清理复验→初始架构总审；仍未关Cutover。Claim原到10:29:49.887UTC，按实际Contract续租。


- **Web完整退出与Host主装配迁移（2026-09-08）**：root Web仅57行命令/资源路径，Desktop web-host提供平台，Host按routing/catalog/request/server/composition/types分开，Native Goals拥有8组写请求。完整Web/desktop-tui/Session/Workspace98/0/0通过，Host/Desktop/root build、707源码2701imports100边0errors，旧Huge清单0（尚非最终全仓审查）。V3导入Native映射+Module末事件/指针、Host装配，8迁移回归；唯一Host composition改公开包、30入口回归；规划5+1、读页面8+4、引导3、Plugin完整CLI样例1通过。现无运行中测试。下一步旧CLI/MCP装配与uninstall/SDK最后残留退出，再执行原定完整E2E→清理→复验→初始架构总审。Claim到10:29:49.887UTC cursor1330。

- **Session与Runtime/Project设置HTTP退出（2026-09-08）**：Host web-session拥有Registry/Runtime/Work资源装配与项目操作视图注入，session-migration拥有旧Panel/Binding投影；旧root session compatibility/types删除，Web/MCP/测试改公开owner。Host依赖既有Work包，离线0下载。11会话/迁移/重启回归通过；Runtime HTTP设置3项及项目设置/Demo/旧库迁移4项回归通过，重启finish顺序不变。各次Host/root编译、边界/diff通过，676源码2478imports99边0errors；root Web2252行。没有运行中测试。下一步已读到root composition仍依赖V3 JSON migration145行SQL/业务，须先迁V3再退出Host composition；未写V3 spec/代码。Claim续到10:01:02.073UTC、cursor1329。最终E2E/清理/总审未开始。

- **主Web视图与HTTP通用收发退出（2026-09-08）**：Native Goals document-index111/projection142/collection54/ports14拥有Goal只读视图，Storage journal持有原倒序事件读取，Host web-view组合Feed/Project及原cache；7事实/迁移+10状态/事件/缓存/语言回归通过。Host web-http/web-assets持有原鉴权/body/response与资源ETag收发，PTY入口路径callback保持root，3真实鉴权/资产/健康检查回归通过。定向build/root编译、diff和边界通过，671源码2444imports98边0errors；root server现在2633行。没有运行中的build/test。下一步继续SessionRuntimeResources/Panel装配、settings/onboarding/project路由与Goal写路由；本轮未写这些后续spec或代码。Claim仍到09:35:29.309UTC，最后剩余928秒，无需提前续。最终E2E/清理/总审未开始。

- **Artifact / Onboarding / Capsule / PTY旧Web入口退出（2026-09-08）**：Artifact Host收发+Workbench主题页面，Desktop bootstrap注入；8回归通过。Onboarding本机状态迁Host，3真实引导回归通过。Capsule Workbench types/items/snapshot投影、Host locale工厂、Desktop原Shell注入，11状态+2多项目/语言HTTP回归通过。PTY Socket迁Host消费Runtime Host，6持久化/UI+9实际PTY回归通过；同批零caller Desktop/PTY/Visual兼容文件删除。各slice定向build/root编译、diff通过，664源码2393imports98边6兼容1旧Huge、边界0errors。Host新增Runtime Host与原ws依赖，离线118已解析/82缓存/0下载；沙箱pnpm要求清空modules，未执行清空，改原缓存环境获准离线安装成功。所有build/test已终止；root Web只剩server.ts 3175行，下阶段先读其view projection/路由/资源装配，不能整文件搬Host。Claim续到09:35:29.309UTC、cursor1328。最终完整E2E→清理→再E2E→总架构审查仍待全量开发完成。

- **Feed HTTP也已退出**：Native Feed三个请求handler组合负责校验与产品操作，Host107行保留Node transport/公开工厂/Workbench渲染绑定；root `feed-native-plugin-http.ts`删除。Native+Host build/root编译、28回归+5实际HTTP/重启回归均0fail/0skip，657源码2357imports97边0errors。当前没有运行中的构建或测试；下一步读Artifact HTTP与Web剩余composition依赖，再迁Artifact/Capsule/Onboarding/PTY及大Web入口，不能直接整文件搬Host造成Desktop循环。

- **Relay与Feed旧目录退出（2026-09-08）**：`src/feed`已无源文件；Host Relay reader/安全装配、Storage旧格式读取、Native批量导入已真实落地，prepare快照→复制credential→commit原事务顺序保持。build+41回归、Relay final event ABORT回滚/重试、4项实际Feed contract回归通过；只测无用重复状态机的元数据测试已退出，生产fixtures迁tests/fixtures。Feed Item升格Goal也已迁Native+Host有限端口，5回归含实际绑定失败回滚/复用/旧revision/丢弃Draft替换/归档拒绝通过。当前650源码2317imports97边0errors；Claim到09:08:36.981UTC。下一步Feed请求处理/Node传输与剩余Web3171行、Capsule/PTY/Onboarding、CLI/MCP/SDK公开出口；总Goal未完成，最终完整E2E/清理/总审未开始。

- **账号/同步/调度退出（2026-09-08）**：root Connector service/types/providers/registry/OAuth/installations/scope与Source scheduler均已删除，真实caller改Host factories；Native Feed拥有账号管理、来源登记、Connector同步与Scheduler，Integration解释Provider协议/账号权限，Host提供同库Listener/Signals/PluginRuntime与Secret装配。Provider Host26、同步30、账号+调度34回归均0fail/0skip；新增Source/event失败回滚与Listener终态独立持久化、真实Host OAuth到账号Source再解绑测试。641源码2271imports97边6兼容1旧Huge、0errors，构建已完成（accounts首轮根类型import修复后续建通过）。当前Claim续到08:41:22.999UTC，cursor1326。下一主线：Relay旧库读取/解密/映射与Feed剩余测试式contract入口，再继续Web/CLI/MCP/Host总装配；整项开发/E2E仍未完成。

- **Connector授权最新切片**：Host credential adapter/GitHub Device Flow与Gmail OAuth均已迁出旧root入口。Provider协议由Integration工厂拥有，Host只注入本机Secret/env能力。GitHub build+33回归、Gmail build+36回归全部0fail/0skip；Gmail新增state/TTL/identity/redirect门禁、并发回调按账号隔离、刷新失败与成功测试。625源码2184imports96边0errors；下一步Gmail installation/scope旧入口退出后继续Connector业务与Scheduler，不是整体开发完成。

- **2026-09-08 最新状态**：从`2260155`继续的变更未commit；没有修改现用安装、服务或用户项目。Cutover仍在执行，总Goal未完成，Outbox继续按用户决定后置。当前Run `run-c68ee77f-0153-4a43-9745-fe3ee9c9890d`、Claim `claim-20475297-ba3d-4f45-ba25-d8d1b4aeddc9`、actor `codex-runtime-01a07630-be49-7791-bb05-de4db2d1377b`，租约以实时Contract为准。
- **真实退出的旧入口**：`src/web/render.ts`、`src/projects/catalog.ts`、`catalog-session.ts`、`desktop-panel-adapter.ts`、`src/v1/demo.ts`与root Feed security/content等已删除，caller改公开owner。Workbench工厂组合注册UI，Host绑定唯一请求语言作用域，Desktop提供shell端口。风险决定归Goals Safety Contribution。默认GoalPolicy文本唯一归Goals；旧SDK仍兼容导出。
- **Catalog与本地内容**：Runtime选择/建议/确认绑定/解绑/创建请求幂等归Private Work Context；Host按创建迁移/删除恢复/Demo重建分担文件生命周期。Host Catalog唯一装配，Desktop通过平台入口注入独立SQLite adapter，Host无反向Desktop依赖。Storage负责readonly/integrity/checkpoint/catalog metadata，以及原SecretStore技术adapter；Feed Module负责保留正文引用/内容，Host负责呈现时hydrate。原schema1–10、事务、错误identity与恢复路径保持。
- **Feed应用与来源Runtime**：旧Store已删除，Native FeedApplication消费Module契约和有界事务/Listener/回执/事件端口，Host同连接装配。Relay目标DB直写已收回，批量导入/回执/事件仍同事务。Module错误identity归其Contracts并原入口重导出。RSS目录/Custom URL/正文分类归RSS，YouTube标识归YouTube，opaque搜索缓存/CAS/AEAD/Secret适配归Storage。Host持可信身份与SDK生命周期，Native Feed执行exact来源约束（Host注入definition端口），RSS ./host持网络实现；Plugin间无实现引用。root sources/runtime、intelligence-adapter、catalog、custom-rss、youtube、feed-body、search-storage和feed/errors已删除。
- **Source业务最新切片**：旧SourceService删除，Native来源管理227/同步280/请求142行，通过有限provider/运行时/事务/事件端口消费Host装配。Sources契约拥有原sourceDeletedAt与RSS receipt公共类型；RSS/Gmail/YouTube实现仍在Integration。Host复用原event ID/actor、同连接immediate事务、错误与shutdown顺序。源码已通过完整build；35项Source/Upgrade/Feed/Connector/HTTP回归0fail/0skip，新提交失败回滚/同键恢复测试通过且去掉事务能稳定失败，构建已恢复。日志 `molis-work-cutover-source-service-{build,regression}` / `source-rollback{,-mutation}`。
- **证据**：切片详见cutover-work-plan；最新616源码2159imports95边、7兼容白名单、1旧Huge，边界0errors，类型/diff通过。页面五组严格输出比对原证据保持。原118依赖离线0download。当前没有未结束构建或测试。
- **仍需处理**：root Web HTTP3176行、SourceScheduler、Connector/OAuth/Relay读取导入、Capsule/PTY/Onboarding与残留SDK/CLI/MCP装配。下一步读ConnectorService/Provider Registry/OAuth调用链，先写切片spec，再迁真实业务与Host生命周期；SourceScheduler复用Host source工厂但仍耦合Connector构造，随此切片退出。首次样式回归仍有一条旧测试期待搜索框display:none、生产display:flex，最终清理时处理，不改产品凑绿。
- **审批事实**：Runtime首次混合大脚本被自动审批拒绝且未执行；准备具体14文件diff、核对§24授权与git apply --check后，单独重审应用补丁和离线安装均获批并完成。已解除，不再当阻塞或重放转换脚本。
- **最终顺序不变**：全部开发→真实前后端用户E2E（含Desktop/CLI/MCP/安装升级卸载/恢复）→代码清理→受影响E2E复验→初始架构逐条总审。当前不是只剩测试，不得因局部全绿标完成或重复索取授权。以下为历史进度，不能覆盖本段。

- **11:55UTC续接**：Storage连接/公共Journal已真实实现；Feed导入及迁移回执归Feed；迁移1–31/Feed相关Module启动顺序归Local Host；旧Store.snapshot改调Goals Plugin公开查询组合，四Module提供只读组装工厂。对应回归126、11+10、132、123均0fail/0skip，日志和修改边界见cutover-work-plan。两次真实pnpm内部依赖同步通过，外部依赖仍为原118项。旧Store约160行，Coordinator607行，尚非全量cutover完成。当前Claim续至12:19:04UTC，同一Run/actor继续；完整pnpm build已通过（48包、root清理后重建及PTY bundle）；Web/Host/Runtime/迁移跨入口回归见 `/private/tmp/molis-work-cutover-shared-entry-regression.log`，结束状态以实际进程为准。下一步读该回归结果，再继续Host/旧Catalog/Web/renderer等真实caller退出。旧Store历史读取wrapper仍在，不能说Repository已全部退出。

- **Cutover本轮后续切片（11:36UTC）**：工作阶段/完成门禁、资格评价、Ready/Available/Explain、Risk action授权、Review义务、Contract读模型均已归Goals Plugin；Board创建/current Goal写入及生命周期清理归Goals。Coordinator当前607行，SQL与Repository旁路已删除，尚有装配及有限转发，未宣称Host已退出。工作阶段135/0/0；资格151+查询7/0/0；Risk/Review/读模型124/0/0；Board121+直接Module3/0/0（含初始化事件失败回滚、重试幂等、无Host hook完成后指针清除及重开），详见cutover-work-plan与/tmp日志。新包构建/root tsc/48包边界0errors。当前Claim已续到11:53:57UTC，后续以实时Contract为准；同一Run继续。

- **Cutover已进入真实实现（当前最新）**：三份提案均已批准、Assurance revision2于10:57:58UTC Review pass后completed（cursor1306，Evidence `evidence-9158b078-c443-4a33-8311-a808a6a9b0ae`，Review `review-a571bf90-0ad5-4f58-94b5-a88a8fc99679`）。Cutover前提revalidate=true（inconclusive证据，未当完成）；工具返回submit_evidence，rework_request被拒为不在完成门禁，Explain executor ready=true，按原projection正常select允许，当前同一executor Run `run-4e33a188-6c38-4c74-a47a-28fca317543c`、Claim `claim-3008b339-2b7a-4840-8647-6736108febc2`，actor为当前任务；不要重复返工请求或revalidate。租约11:30:22UTC，到期/续期以当前Contract为准。

- **三个串行代码切片已验证**：详见 `cutover-work-plan.md`。个人方法schema/CRUD回Goals，Home locator回Local Host，Catalog旧SQL/reader退出，Planning16+Web2+MCP1通过；Clarification schema/migration8回Governance，失败回滚/真实进程恢复6+旧升级1通过；执行验收应用6个原src/v1文件迁Goals Plugin，Ports不再注入旧Store/Module/Repository，117项V1+24项执行/租约/Review/回滚回归全通过。新增public Execution历史Query及review Run收尾、Goals Evidence失效API沿用原生产实现；同一Error构造类型由装配传入。边界检查更新owner路径而未放宽App/Store禁区；LocalHost直接SQLite的第一版被检查拦下并已纠正。锁文件118项供应链检查通过。无生产数据/现用安装改动，未提交Git。仍要继续Coordinator剩余装配/判断、Store/Catalog/Feed/Web实际caller与最终整体验收。

- **三份提案已由当前用户“确认”批准（2026-09-06）**：assurance 1项、DD 1项、父项覆盖8项全部 applied，cursor1270/1275/1293。已完整读取三份 semantic_review 合并涉及的23个当前 Contract，8个父项业务字段无变化且valid/satisfied；DD父项valid/satisfied，DD1/DD2及公共前置保持完成。Assurance为revision2 needs_revalidation/unmet，唯一验收差异为已确认的Outbox后置。原依赖的产出消费仍成立，图检查0issues。根与DD仍有coverage提示，非当前执行阻塞；不得用它们重问已批准提案。现在继续assurance新版本复核、正式验收，然后Cutover。下方等待三份决定的文字已成为历史。

- **8个已完成父项覆盖复核已提交（2026-09-06）**：见 `parent-coverage-refresh.md`。31个当前子Contract对应32输出/24条件，业务字段与覆盖映射原样保留；正式提案 `goal-tree-proposal-11becfc9-439e-4a2d-8ddc-73e539075550` 共8项，pending，read/check通过，cursor1263。只是覆盖版本刷新，不是实现再验收或总重组完成。Assurance提案 `goal-tree-proposal-0500bb62-7509-4934-abf0-0bb3d36e8249`（1项）与DD提案 `goal-tree-proposal-84bdb63c-4da2-4996-9af5-8a93e2cec4b4`（1项）已重新read/check，均pending、无冲突/规划问题，最新cursor1265。当前将三份完整提案共10项列给用户请求决定；此前绑定“可以”与自动Goal续接都不是批准。用户明确决定后才逐份正式decide并消费semantic_review；未答时不重复审计/新建提案来绕过。不重跑无变化的成功测试。剩余主线仍是恢复保证正式验收、最终切换开发、真实前后端E2E、清理后复验与初始架构总审。

- **切换前只读审查已补齐（2026-09-06）**：见 `cutover-preflight.md`。当前边界检查 48 packages / 519 sources / 1606 imports / 71 edges / 30 subpaths / 10 compatibility / 4 legacy huge / 0 errors；这不代表退出完成。已定位 Coordinator 调度/门禁、旧 Store 注入、Catalog personal 方法 SQL/项目初始化、Feed 回执/事件、Web scoped Store/Coordinator 与残留 UI 的真实 caller；给出串行开发与前后端用户旅程验收路径，并指出现有 embedded Host、symlink npm、Provider fixture、HTTP 与 Chrome 证据差别。未执行受阻 Cutover、未改生产代码、未重跑无变化的成功测试。下一步仍需范围提案与 DD 独立决定，不将自动续接当批准。

- **新对话已恢复，Outbox 范围提案待决定（2026-09-06 10:14 UTC）**：当前任务 `01a07630-be49-7791-bb05-de4db2d1377b` 经用户明确确认关联原项目。新 MCP Explain clarifier ready=true，根 coverage select allowed=true，原 `clarification_not_needed` 冲突已解除，不再等待安装或新对话。正式提案 `goal-tree-proposal-0500bb62-7509-4934-abf0-0bb3d36e8249` 仅一项 `item-assurance-existing-recovery-20260906`，修改同一 assurance Goal 的恢复验收，将 Outbox 实现/重放留后续并保留现有事务、幂等、重试与恢复。read/check 通过，cursor1256，conflict/planning issues 均空；尚未决定，不把关联回答“可以”当作批准。DD 独立提案仍保持未批准。详见 `assurance-scope-revision.md`。下方等待旧 MCP 的记录均为历史。

- **现用更新已授权并完成，旧对话 MCP 待重新加载**：正式安装器刷新同版本 0.1.14，受管服务重启成功，健康 PID 96675→23734，14 个项目仍可见。Codex 配置/LaunchAgent 配置字节不变、Runtime detection=connected；已安装 release 的 13 项修复回归通过。当前宿主 MCP Explain 仍是旧 clarification_not_needed（cursor1248），不要重复领取或继续声称等待安装授权；需新对话加载新 MCP 后再推进。未批准 DD 提案或修改真实 Goal。详见 `../molis-work-coverage-clarifier/validation.md` 的现用更新段。

- **覆盖澄清源码修复完成，现用入口未升级（2026-09-06）**。用户“确认修复”已授权实现；不能再称等待修复授权。见 `../molis-work-coverage-clarifier/spec.md` 与 `validation.md`：Goals Plugin 共用 coverage freshness，领取/Explain/work-state/Dialogue 一致，覆盖有效的已完成父项仍拒绝；待用户决定也不再误报 ready。150 个不同测试通过，类型及包边界通过。未改真实项目、未升级当前安装，现用 MCP 的 blocker 尚不能宣称解除；加载修复需要安装/重启授权。

- **Assurance 工程验证93项通过，范围修订入口受阻（2026-09-06）**：见 `assurance-validation.md`。新增完整离线Home恢复与缺密钥拒绝测试，中英文恢复文档已补。用户已明确“留到后续，本期只重组现有功能”，只指Outbox实现/重放，不能再问这同一范围决定。当前canonical assurance rev1 valid/unmet；executor Run已abandoned/释放，不假报完成。根coverage projection显示clarify ready，但原样select返回clarification_not_needed，explain确认同样拒绝，无新Claim。需要修复正式入口矛盾才能修改验收；不能通过CLI/SQLite、换Actor、新建空壳Goal或DD提案绕过。完整总目标保持未完成，测试进程均已结束。

- **DV4 正式完成（09:24:26 UTC，cursor1238）**：全三项 Evidence `evidence-85cd5c01-b889-49fe-9dff-b3e81387672c`，self Review `review-21270bfe-6272-4111-b518-5d359b641b2e` pass，projection completed。完整证据见 `dv4-validation.md`。最后发现并修复 workspace 旧编译输出泄漏；公共 build 清理后新 npm consumer smoke、App/DMG/zip 和最终 bundled CLI 验证通过，66 项安装回归通过。下方 DV4 等待 Review/GUI 的文字都是历史，不重复执行。父 Developer coverage 仍显示 revision_stale，不能把叶完成当作父覆盖修订已批准。下一项是已接受的数据迁移/安全恢复保证 `goal-7f442b3c-bf89-4696-ba50-721211740ff1`，当前 needs_revalidation；先核对依赖与现有结果，不重做已通过旅程。之后仍需最终 Cutover、全产品 E2E、清理后重复 E2E。DD 独立提案未批准的边界保持不变。

- **工作台完整顶部修复已通过实际 App（09:03 UTC）**：见 `../native-titlebar-alignment/spec.md`。移除错误的 -8px 上移（统一中心约22px），Tauri 真实全屏事件驱动共享左侧占位，窗口88px/全屏2px；普通/全屏、折叠/展开、设置标题与全屏内页面跳转通过。保留现有两行目录结构及普通 Web 行为，不是重做导航。定向6/0/0，完整 App 构建、边界0errors；完整样式套件29/1，唯一失败是 HEAD 已有搜索框 display:none 旧断言，应在整体测试清理按当前产品要求修正。下一步仍是 DV4 全三项文档/证据归一和正式 Review，以及总 Goal 的 E2E/清理/再次E2E/架构验收。

- **旧版升级修复及重装实测完成（08:45 UTC）**：见 `dv4-upgrade-validation.md`。实际 0.1.13→0.1.14 暴露 Listener 初始化遗漏，FeedStore 现在调用其公开 migration，14/0/0 回归及完整新 App 构建通过。全新旧版项目升级后正文/历史保留；普通卸载使用既有 Runtime 用户目录注入隔离，项目 DB/WAL 不变，实际 App 重装后恢复可读。08:44:41 原服务恢复。下一步是 DV4 全三项证据/文档归一及正式 Review，不重复测试已通过的这条旅程，也不据此声称完整重组完成。
- **本轮修复已完成（08:21 UTC，优先于下方历史）**：桌面确认框和真实自重启通过实际 App，见 `dv4-restart-repair.md`；新增 Onboarding 重叠/高度对齐修复通过最终 DMG 实机截图与迁移/跳过操作、普通 Web/390px 验证，见 `../onboarding-native-titlebar/spec.md`。08:20:58 UTC 原服务恢复、原配置不变，测试进程已退出。未替换原用户安装，DV4/总重组不因此自动完成；“等待是否修复”已过时，不重复询问。
- **Goals 父项收口已批准并落地**：`goal-tree-proposal-b7c484f1-c5c2-478f-8077-b67debd222a9` approved，item applied；07:16:45 UTC，cursor1201。父项 accepted/closed_compound、valid/satisfied，GW1–GW6 保持完成。已按 receipt 顺序读完 19 项受影响 Contract，原范围/消费关系仍成立，图检查 0 issues；不需要重做子项或重复问这份提案。下面 pending 记录为历史。
- **DV4 临时停服已获明确授权，首轮真实 GUI 验证和原服务恢复已完成**：见 `dv4-gui-validation.md`。当前代码重新构建 App/DMG/zip；隔离 Home 自动首装、首启设置/诊断、断线恢复、自有进程退出与重开已验证。07:28:27 UTC 原服务已恢复 running，原 plist/服务收据/安装清单字节未变，本次测试 LaunchAgent 已移除，临时日志/数据保留。
- **DV4 不能完成**：实际 Native App 诊断页“重启”不出现确认框；当前 `window.confirm` 和 Tauri adapter 相对 HEAD 未改，支持旧 WebView 兼容缺口判断，尚不是迁移前 GUI 对比证明。需决定是否把此既有缺口修复纳入本轮；不能绕过确认或以 CLI 成功代替 GUI 成功。DD 独立提案仍未批准。

- **当前唯一收口确认请求：Goals 父项** `goal-tree-proposal-b7c484f1-c5c2-478f-8077-b67debd222a9`，仅 `item-gw-parent-closure-20260906`，pending；read/check通过，cursor1195，conflict_item_ids=[]、planning_issues=[]。完整四承诺三条件及方法依赖已复核，见 `goals-parent-closure-audit.md`。只将原父 accepted/frontier_open 结束为 accepted/closed_compound，保留原字段、子项与关系；不同时批准 DD 或暂停4173。下次用户明确确认这一整份提案后正式decide，再逐项读semantic_review与图检查。
- **Query 的 Feed 间接 caller 补齐已完成**：发现 src/feed/store.ts Attention Goal exists 旁路后，在原Query Contract下修复并revalidate；未新增Goal。旧 evidence-8f29fc8c-e202-4f4b-98bf-579329e64416 作为全caller结论已用 evidence-correction-6645c811-397b-44d7-8c73-35ad1b8ce159 retract（原Policy/Risk事实保留）。新 evidence-cb2bb926-f03a-4fc7-872b-0bcd95cb9b06 verified，04:17:42UTC revalidated=true/completed，cursor1187。78/0/0定向Feed/Query/Web回归、类型/边界通过，见 goals-feed-query-correction.md。下面旧Query completed记录为阶段历史，不再使用已撤回Evidence。

- **GW6 canonical 已完成**：2026-09-06T04:07:30.455Z，cursor 1173，projection completed；Evidence evidence-aac845f5-3542-4a21-a377-e4248b7c5d7b verified，Review review-b0db70e2-abab-4d19-948c-85bd65230d25 pass；执行/复核均结束。schema、15/25/26/30 Goals 内容和 V3 coverage caller 已迁移，193/0/0 前后端回归、补强历史数据对账 6/0/0，见 gw6-validation.md，不重复 GW6。
- **DD 收口仍未批准**：用户短答“确认”后的 decide 被权限审核拒绝（未明确授权具体提案），canonical 未变。不要使用自动续接或旧“确认”重试，不经 CLI/SQLite/其他提案绕过。独立 pending 仍为 `goal-tree-proposal-84bdb63c-4da2-4996-9af5-8a93e2cec4b4`。GW6 提案不包含它，也不包含暂停 4173 的权限。

- **Goals Query 读取边界纠正已完成**：原已完成 Goal `goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8` 的 caller Evidence 过度声称，已正式 retract（`evidence-correction-a5996146-ffd0-44e9-bc4b-a93d62761037`），不是新增 Goal。当前 Web Policy 历史/Risk 关联及 Coordinator 替代/依赖/风险 SQL 已退出。182/0/0 串行真实浏览器/Runtime/Web 回归，25.47 秒，`/private/tmp/goals-query-correction-acceptance.log`；构建、边界、diff check 通过。Evidence `evidence-8f29fc8c-e202-4f4b-98bf-579329e64416` verified；2026-09-05T21:31:42.224Z revalidate=true，valid/satisfied/verified/completed，cursor 1141，primary=null。该流程无需重复 Run report 或 select reviewer；按返回完成状态继续。
- 当前 Coordinator / renderer / server 为 2,675 / 2,240 / 3,230 行。查询纠正范围及证据见 `goals-query-correction.md`、`goals-query-correction-validation.md`。全部测试进程已结束。该证据不替代整个旧 Host/Store/schema 的退出审查。
- **GW5 canonical 已完成**，2026-09-05 17:01:04 UTC self Review pass 后 projection=completed。完成 Evidence `evidence-8efddec5-17d9-4437-ab5a-c78b64f2ef91`，Review `review-15084847-4b63-438c-93fe-74e011422203`，映射全三项。原执行租约到期历史保留，收尾 Run `run-9daddff5-6b88-4aec-89b1-df447a7b691e` 与 reviewer Run 均完成/释放。
- 完整范围、caller 和无损证据：`gw5-validation.md`、`gw5-caller-audit.md`、`gw5-progress.md`。最后补迁项目工作规则 document/client/styles/19 条文案；Plugin Policy project surface + Workbench mount。root renderer **3,827** / server **3,353**，边界 48 packages / 448 sources / 1,236 imports / 71 edges / 30 contract subpaths / 10 compatibility / 5 legacy huge，0 errors。
- 最终串行 Goals/Web/Desktop **175/0/0，86.9 秒**，真实日志 `/private/tmp/gw5-acceptance-regression.log`，已复核。不重跑无变化的已终止测试。原中英文 full/refresh 和项目规则页面对比、失败与修复历史均保留。后续仅改文档，diff check 通过。
- 开发文档 UI Platform、Goals、SSOT Matrix、Migration、Huge Class 和总 spec 的旧 GW5 状态已同步；既有 5 个 legacy huge files 仍需 Cutover，不是整体 retired。DV1/DV2/DV3 已完成，不重做。

## DD1 / DD2 已完成，进入父项覆盖审查

DD2 已于 **2026-09-05T21:10:21.787Z** self Review pass 后 canonical completed，cursor **1126**。Evidence `evidence-5bbb9ca4-957d-4ca0-bd52-e64547da2bd4` verified；Review `review-ed351489-139c-409e-be42-f3f33afdcf6b` pass。执行与复核 Claim/Run 均完成并释放，不复用旧租约或 token。native/legacy 应用、完整提案呈现、分组/最近结果、客户端与文案/样式均已迁。root renderer 2,240 行；Workbench 只组合各 owner HTML，跨 Feed/Goal 的刷新与 receipt 留在 Workbench。

最终 12 文件串行 **209/0/0，38.70 秒**，`/private/tmp/dd2-acceptance-regression.log`，所有测试进程已结束。包含 3 条新 Chrome 决定/修订/历史链及共享 Draft/Relation/Safety 表单；边界故障保护 **12/0/0**，512 sources / 1,585 imports / 71 edges / 0 errors。细节见 `dd2-validation.md`、`dd2-caller-audit.md`。

DD 父项已完成逐项覆盖审查，待确认提案 **`goal-tree-proposal-84bdb63c-4da2-4996-9af5-8a93e2cec4b4`**，仅一项 `item-dd-parent-closure-20260906`：保留原结果/范围/标准/关系，结束父项拆分为 accepted/closed_compound。21:18:46 UTC 预检 conflict_item_ids=[]、planning_issues=[]，cursor 1133；目前 pending，未决定。审查见 `dd-parent-closure-audit.md`。下一次用户针对这份提案明确确认后，走正式 decide，再读 semantic_review 和受影响 Contract；不可把此前确认当本提案批准。DD2 不重复 report / Evidence / Review。

Goals Mutation 父项仍开放：DD2、Query 纠正及 GW6 已分别处理实际发现的遗漏，完整父项需结合 GW1–GW6 与下游消费核对后正式收口，不能直接当作全量 Host/Store Cutover 完成。DV4 GUI 仍无暂停 4173 的明确授权。

已接受父 Goal **迁移 Draft Dialogue 与 Goal Tree Decision 入口**
`goal-1cb5db42-232a-426a-ac79-36c6320d621e`，canonical accepted/frontier_open/unmet revision 2；DD1/DD2 均 accepted/closed_leaf revision 1。

完整拆分提案：**`goal-tree-proposal-d6a1fac6-8695-4d89-8096-0d6eb3ba7f85`**，用户本轮明确确认后，2026-09-05T17:32:32.277Z 全部 11 项 applied，cursor 1097；不再等待重复确认。22 个 semantic_review Contract 已逐条读过，图检查 0 issues。
计划详情 `dd-work-plan.md`；使用迁移重构、软件开发、开发工具、AI 人工复核方法，目录与完整正文已读。

DD1 已完成：2026-09-05T17:57:57.712Z，projection=completed，cursor 1108；Evidence `evidence-4a0cc5ee-ba83-4d4b-a828-b5da26e0368a` locator verified，Review `review-8bca2c40-37c6-4d02-aa6b-6cc1df332898` pass，执行与复核 Claim/Run 均自动释放/结束。三个真实应用方法/独占 helper 与 root snapshot 澄清映射已退出，无 schema 改动。最终串行 **182/0/0，28.97 秒**，含真实 Chrome/独立 Runtime 争用/重开/到期/回滚。详见 `dd1-validation.md`。sandbox 失败日志保留，正常获准环境完整通过；没有停止现用 4173。

DD2 完成记录见本节顶部，不使用历史检查点租期恢复执行。

提案 11 项是两个子 Goal、两条子项归属、父项保持开放的计划、总重组归属、Cutover 消费依赖，以及四条已完成公共契约前置：
1. DD1 `goal-reorg-dd1`：草稿 start/turn/resume、现有 UI/CLI/MCP、错误身份/幂等/到期恢复/进程重开/分页，旧三方法退出。
2. DD2 `goal-reorg-dd2`：提案 submit/list/check/decide、Workbench Proposal/Decision UI/copy/client、可信确认/拒绝/修订、冲突原子性和 legacy 恢复，旧四方法退出。
3. 原父项关联总重组（不是 Goals Mutation 父项，避免既有 Execution 消费形成组合循环），最终 Cutover 消费 DD 完整结果。
4. 复用已完成 EX3/EX4/GW3/DV1。顺序先 DD1 后 DD2，不为共享文件制造 DD2→DD1 硬依赖，不新增并行 Agent。

### 预检中已遇到的具体问题

以下是 DD 拆分与迁移过程中的历史问题；DD1/DD2 现已完成，不以旧记录重新安排已验收工作。

- 第一版 `goal-tree-proposal-85670aad-bf9e-4bab-8c51-9825eaa42160` 缺完整 parent Contract 字段；第二版 `goal-tree-proposal-0f28df0d-9628-48b7-8b57-5af3f4f1ef08` 补齐后发现真问题：materialization 顺序先 goal/contract 后 relation，accepted compound closure 看不到同批新建 children，`goal.accepted_compound_closure_children_required`。
- 当前第三版按完整范围阶段性提交：parent accepted/frontier_open，review paused，open_goal_ids 保留 parent，明确两子项完成后再收口；完整 outcome/scope/criteria 未改。失败提案由当前版 supersede，不偷偷部分采用，不直接修产品绕门禁。DD2 负责已复现的同批预检/决定顺序问题的回归与必要纠正。
- Proposal 提交会自动释放 clarifier Run。修订时用 draft_dialogue_resume，同一 Goal；新 item_id 必须全局唯一，并用 supersedes_item_id 关联。当前 revision3 的 preflight 全过，不再无意义修订。
- 上述决定、semantic_review 和 DD1 Available/Contract/select 已完成；没有重开历史已完成 Goal。DD1 完成后按原授权顺序继续 DD2。

## 整体未完成及禁区

- **父项仍需独立审查**：`goals-parent-closure-audit.md` 的旧 Coordinator Proposal 写入反证已由 DD2 消除；Web/Coordinator 的读取旁路已由 Query 纠正消除。不能以子项完成直接关闭原父项，也不能把不再存在的旧读写重复当成缺口。Cutover 本身等待父项，需核对剩余初始化/迁移与 Host 职责的范围和真实消费顺序，不能先假报父项完成或制造反向环。

- Goals Mutation 父项 `goal-ccdd09e2-7bfe-4b4b-82e2-29b632b51b5d` 当前 draft/frontier_open，五个子项已完成，仍待按原结果做父项收口确认；不当作已完成，也不重复子项。
- 数据迁移/安全恢复等待 Developer 与 Goals Mutation；Cutover 仍 needs_revalidation/未执行。其 Contract 单读 primary 可能显示 revalidate，但 Available 会给依赖门禁，必须以实际 eligibility 为准。
- 整体终点仍是全部开发 → 模拟真实用户的前端/后端详细 E2E → 代码清理 → 再 E2E → 初始分包、边界、Huge Class、调用链、开发规范/逻辑逐项审查。175 项只证明 GW5。
- root Execution/Decision/历史/共享 Shell 复合内容不能全塞 Goals；按 `gw5-caller-audit.md` 走真实 owner，最终 Cutover 对 EX4 等历史验收有反证才正式纠正。
- 工作树大量长程修改，不 reset、不自动 commit。不改现用 4173、用户 Home/Applications/项目/Runtime 配置。测试进程状态以当前执行记录为准，不重跑已经终止且无改动的成功用例。
- actor `codex-runtime-01a05baf-e423-7581-a362-f8b3ecd6de49`；Board `project-c0128512-0062-45b7-be0e-81b5fe444898`，同一 Runtime 绑定。MCP 可用；reader 3 / schema 5 诊断不以换 DB/CLI 规避。
- GPT-6 Astra 检查已结束：本机默认 gpt-6-astra/xhigh，不等于本对话实际模型证明；不再迁移模型或改配置。
- 保留已实证修复：属性转义、草稿首次打开、Planning 显式采用、焦点、panel/records 取消恢复、旧响应身份保护、无重复分页。历史失败不能用最后全绿抹掉。

## DV4 已有证据与待授权步骤

- DV4 发布 tooling 已迁 Apps；旧孤立 npm payload 构建已改为 Local Host 自包含 release。干净副本 `/private/tmp/molis-work-dv4-clean.ITjqKC` 已通过锁文件 118 项供应链策略、全部 48 包+root 构建、Plugin CLI bin/manifest、官方 Node 下载校验和 Tauri App/DMG 构建。使用 Tauri Local Development 签名，公证因无凭据跳过；没有公开发布。
- npm workspace:* 分发失败已修复：App Local Host npm staging + root `pnpm package:npm`，35 个内部/vendor 包随包交付，外部原生依赖由目标环境正常安装。干净副本完整构建/打包与 `/private/tmp/molis-work-dv4-npm-consumer.JbALTN` 正常安装、npm ls、真实 CLI/PTY/SQLite/方法/Home/MCP 验证成功，含升级/故障回滚/版本恢复/demo 数据比较/卸载预览确认。`tests/npm-package.test.ts` 通过；显式端到端复验命令 `node tests/npm-distribution-smoke.mjs /absolute/consumer`。首测裸 node-pty 绕过既有 helper 初始化，已改用真实 MolisWorkPtyHost；没有生产补丁。旧失败产物仅作历史复现在 `/private/tmp/molis-work-dv4-npm.iJUCGg`。
- DMG 已通过真实安装脚本复制到临时 installed-apps，并用复制后的 App 内 Node/CLI 安装临时 dmg-user-home；installed/self_contained 与实际 CLI 启动成功。没有打开 App GUI、没有替换用户 Applications/Home。所有本轮 build/test/install 进程已终止，临时副本与产物保留用于后续验收。当前工作区的 `pnpm` 自动安装问题未通过删除 node_modules 规避；正式干净副本链已实证通过。
- 最新完整 macOS release 命令两种签名环境都成功：保留 Tauri Local Development、以及未设置身份时默认 `-` 的真实 ad-hoc。DMG/zip/SHA256、解包 App 签名和正式 DMG 临时安装通过；最终产物在干净副本 release/macos，解包/安装在 `/private/tmp/molis-work-dv4-release-check.tmaj5v`。先前 sandbox 证书校验失败已在正常获准环境对同一 App 验证成功，不是包损坏；不可继续误报默认环境没设签名身份。
- GUI 首启需暂停当前 4173 服务的明确授权：Desktop 和 LaunchAgent 固定端口/label，临时 MOLIS_WORK_HOME 不足以隔离。已确认用户服务运行中，没有停止它。待允许后只暂停现有服务、临时 Home 测试、清除本次临时服务并恢复原服务，不擅自更新用户 Home/项目/Runtime 配置。未获授权时该验证步骤保持未完成。
# 2026-09-06 本轮最新补充

用户明确“修”后，桌面重启确认框及 Web 自重启失败已修复，并通过实际 DMG 安装 App：取消保持 PID，确认后 48298→48829，受管服务 healthy/running/owned，退出重开正常。08:09:49 UTC 原服务恢复、配置字节不变。详见 `dv4-restart-repair.md`。旧“等待是否修复”说明已失效。

用户随后明确新增修复：首次引导左上角品牌与红黄绿重叠、未垂直对齐。已修复并完成实际 App 验证，见 `../onboarding-native-titlebar/spec.md`；不改其他标题栏或引导功能。最终合并包为当前工作区 `release/macos/Molis Work-0.1.14-macos-arm64.dmg`，仅在临时目录安装测试。
