# 干净 Home 与统一存储起点

版本号相同、结构不同的旧库不在检查范围内；重建前不要用新构建打开旧 Home。已知例子：旧角色库曾为1但没有 `character_runs`；#661之前的连接库也曾为1；记忆账本旧1曾带 `facts` 表；MCP授权、Shelf目录、`feed/secrets.json` 和讨论库以前也有过版本1。数字重新从1起算不证明这些旧形状会被拒绝；原有明确的结构、路径、权限与密钥检查仍保留。这里只引用既有记录，没有重新读取真实Home。

状态：按统筹 #1332 6517794305 转达的用户决定重做；旧迁移计划已取消。#1538/#1553已关闭、未合并；#1552/#1549保留产品代码并去迁移；真实Home未开始，须用户另说“开始”。负责人：Codex（设备 A）；验证与Opus high二审由Claude统筹安排。

## 执行合同

保留现行结构、现行新Home产品行为和PG-077/W5-17产品代码；把Molis业务库、插件自有库及存储JSON的格式起点统一为1。动作/Manifest/成果内容协议、实体修订、产品版本和SDK内部记录格式不在本次重编号范围。只保留现行结构；删除离线升级/采用/搬迁/残留清理入口、旧结构夹具及其演练。错版本仍整体拒绝；owner现有的结构、安装和权限验证不放宽，不新增读取兼容、启动ALTER或默认猜测。

真实Home的执行另获“开始”后才允许：按pid停写入者，将整个Home搬到Home外700目录（不复制、不删）；用合入后干净构建安装、必要时修service；检查新Home库版本1、完整性/外键、安装登记和目录形状。旧Keychain条目与已存在只读副本不删不改；新构建自己创建所需新条目。旧项目、连接、MCP授权由用户在新Home重建。旧迁移的私有预检不再推进。

## 现行版本与归属（冻结main ea05b7690b）

| 库 | 现行版本 | 常量位置 | 目标 |
| --- | --- | --- | --- |
| 项目库 | 11 | `apps/local-host/src/project-database-schema.ts#PROJECT_DATABASE_BASELINE` | 1 |
| 项目库里 Coding 的表 | 1 | `plugins/native/coding/src/database.ts#CODING_PROJECT_DATABASE` | 1 |
| 项目库里 Feed 的表 | 2 | `plugins/native/feed/src/database.ts#FEED_PROJECT_DATABASE` | 1 |
| 项目库里 Goals 的表 | 1 | `plugins/native/goals/src/project-database.ts#GOALS_PROJECT_DATABASE` | 1 |
| 项目库里 Inbox 的表 | 1 | `plugins/native/inbox/src/database.ts#INBOX_PROJECT_DATABASE` | 1 |
| 项目库里 Schedule 的表 | 1 | `plugins/native/schedule/src/database.ts#SCHEDULE_PROJECT_DATABASE` | 1 |
| 目录库 | 22 | `apps/local-host/src/project-catalog-contract.ts#CATALOG_SCHEMA_VERSION` | 1 |
| Functions | 4 | `modules/functions/src/store-schema.ts#FUNCTIONS_STORE_BASELINE` | 1 |
| 助理 | 3 | `apps/local-host/src/assistant/assistant-store.ts#ASSISTANT_STORE_BASELINE` | 1 |
| Home Plugin Runtime | 3 | `apps/local-host/src/home-plugin-store.ts#HOME_PLUGIN_RUNTIME_BASELINE` | 1 |
| 装进来的插件的 Home 库账本 | 1 | `apps/local-host/src/installed-plugin-libraries.ts#LEDGER_BASELINE` | 1 |
| 插件的本机目录授权 | 1 | `apps/local-host/src/plugin-directory-store.ts#DIRECTORY_GRANTS_BASELINE` | 1 |
| 插件原文件登记 | 1 | `apps/local-host/src/material-original-files.ts#ORIGINAL_FILES_BASELINE` | 1 |
| Issue | 2 | `plugins/native/issues/src/database.ts#ISSUES_DATABASE` | 1 |
| Goals 的个人方法 | 1 | `plugins/native/goals/src/home-database.ts#GOALS_HOME_DATABASE` | 1 |
| Feed 的正文引用账 | 1 | `plugins/native/feed/src/content-ledger.ts#FEED_HOME_DATABASE` | 1 |
| 记忆 | 4 | `packages/storage/src/adapters/memory-ledger.ts#MEMORY_LEDGER_BASELINE` | 1 |
| 项目资料 | 1 | `packages/storage/src/adapters/knowledge-cards.ts#KNOWLEDGE_CARDS_BASELINE` | 1 |
| Form | 2 | `plugins/native/form/src/database.ts#FORM_DATABASE` | 1 |
| 放置 | 1 | `apps/local-host/src/placement-actions.ts#PLACEMENT_BASELINE` | 1 |
| Agent 定义 | 1 | `apps/local-host/src/agent-definitions/agent-definitions.ts#AGENT_DEFINITIONS_BASELINE` | 1 |
| 插件的 Agent 声明 | 1 | `apps/local-host/src/agent-definitions/agent-declarations.ts#AGENT_DECLARATIONS_BASELINE` | 1 |
| 连接 | 2 | `apps/local-host/src/connectors-store.ts#CONNECTORS_BASELINE` | 1 |
| 引导 | 1 | `apps/local-host/src/context-onboarding-store.ts#CONTEXT_ONBOARDING_BASELINE` | 1 |
| Cognia | 1 | `plugins/native/cognia/src/database.ts#COGNIA_DATABASE` | 1 |
| Dataset | 1 | `plugins/native/dataset/src/database.ts#DATASET_DATABASE` | 1 |
| Images | 1 | `plugins/native/images/src/database.ts#IMAGES_DATABASE` | 1 |
| Jelly | 1 | `plugins/native/jelly/src/database.ts#JELLY_DATABASE` | 1 |
| 灵光 | 1 | `plugins/native/lingguang/src/database.ts#LINGGUANG_DATABASE` | 1 |
| Pages | 2 | `plugins/native/pages/src/database.ts#PAGES_DATABASE` | 1 |
| PPT | 1 | `plugins/native/ppt/src/database.ts#PPT_DATABASE` | 1 |
| Todo | 1 | `plugins/native/todo/src/database.ts#TODO_DATABASE` | 1 |
| Workflows | 1 | `plugins/native/workflows/src/database.ts#WORKFLOWS_DATABASE` | 1 |
| 炼金术士工作室 | 1 | `plugins/native/alchemist/src/studio/server/db/schema.ts#ALCHEMIST_STUDIO_BASELINE` | 1 |
| server（讨论） | 2 | `server/src/database.ts#SERVER_DATABASE_BASELINE` | 1 |
| 角色 | 2 | `modules/characters/src/open.ts#CHARACTERS_STORE_BASELINE` | 1 |
| 搜索索引（可重建的派生库） | 2 | `packages/storage/src/adapters/text-search-index.ts#SCHEMA_VERSION` | 1 |
| 密钥与凭据（JSON 文件，不是库） | 2 | `packages/storage/src/adapters/file-secret-store.ts#FORMAT_VERSION` | 1 |
| MCP 授权（JSON 文件，不是库） | 3 | `apps/local-host/src/mcp-settings-store.ts#MCP_TOOL_PREFERENCE_VERSION` | 1 |
| 炼金术士搜索缓存 | 1 | `apps/local-host/src/alchemist-search.ts#ALCHEMIST_SEARCH_BASELINE` | 1 |

Shelf JSON的现行catalog版本另在其owner定义，和MCP/凭据JSON一起重编号；保留算法、权限和密钥绑定。统筹6518340875已批准：已退役Sessions的离线技术登记、reader、旧结构夹具和演练一并删除；SDK内部shape与动作/Manifest/成果内容协议版本不重编号。凭据FORMAT_VERSION归1且AES-GCM、绑定与缺原key拒绝保持。

## 分片与依赖

1. 项目库/Feed声明：PROJECT_DATABASE_BASELINE 11→1、FEED_PROJECT_DATABASE 2→1；同一份现行DDL不改。删project-maintenance-v8/v9/v10/v11的SQL、测试及project-database-schema-v7/v8/v9/v10；把依赖它们的拒绝/归属测试换成现行结构和独立约束。业务历史场景夹具保留内容，只改当前元数据起点，删除旧升级说明。RAC-2360～2363。
2. 目录库/W5-17：在#1549普通合main，去database_path直接成为catalog1；删catalog维护脚本/旧结构夹具/演练。#1101由统筹请原owner按新起点衔接，不碰其分支。PG-077 #1552去成员维护脚本/演练，保留平台UI/provider/权限行为。
3. Functions/Assistant/Characters及Home Runtime：各自当前结构改1，删对应maintenance SQL/演练；Home安装、授权与缺库初始化保持当前合同。
4. Pages/Form/Issues和其余插件/派生索引：大于1的基线归1，已经1的只去旧升级引用，owner/shape/事实不变。连接库等#1564作者交接或合入后再改，避免并改context-onboarding-store等文件。
5. Memory/Goals/Inbox/Feed：Memory当前新Home偏好保留，删storage/Host/SDK显式旧采用与Goals旧名/个人方法搬迁、Inbox绑定/Feed引用账回填的离线入口和演练；保持当前正常新库与权限行为。SDK包不换、不改其内部领域版本。
6. IM与JSON/B2b：现行IM2、MCP3、Shelf2及凭据format2归1，删除一次性重建/转换入口和旧夹具；保留当前密封、缺原key拒绝、恢复与原子发布产品功能，删除仅为旧格式建立的分支。
7. 汇总文档/隔离新Home启动：CHECKLIST §3/4、HOME-DATA、反腐spec §4.1统一当前起点与搬开重建流程；旧迁移清单作废，按各片实际代码逐步更新版本表，过渡期不提前把未改的常量写成1。每片交统筹验证/Opus high二审，不本机Full、不自行合并/安装。

共享文档由本线串行更新。#1564重叠connector与context-onboarding-store、index、UI/合同，本线在连接/引导/加密相关片开始前重查；#1101重叠catalog常量和project-database-schema，先通知统筹新语义，不改对方分支。两项自己的产品PR也普通merge、无rebase/force。全部片合入且构建就绪前不动真实Home。

## 第一片验收

- RAC-2360：全新项目是库1，完整平台/Module现行结构，插件按声明建表并记账；Feed声明1、12表及授权保持。
- RAC-2361：现行完整DDL却版本不符的库（2及其他取值）在业务写入前拒绝，文件/行/结构不变；不依赖旧结构夹具证明拒绝。
- RAC-2362：平台基线不含插件表；项目根外键、Goals board归属和所有声明表完整，保留现有独立约束断言。
- RAC-2363：4段项目升级SQL/演练及旧结构v7～10删除；历史业务场景使用当前结构1可继续回归，正文/业务事件不为重编号改写。

先build，按Host/Feed README与affected-tests跑定向用例（删除演练项以同业务的新库/拒绝断言替代），全部经machine-slot、jobs1；health/base、boundary、版本核对与secrets，公开Manifest快照按现行声明更新。Full若命中只交统筹排，代码与当前产品/真实Home验收分开。

第一片拒绝路径补充：初次新断言发现可写连接在版本检查之前切换WAL，虽拒绝但文件头已改变。Host现在先用既有只读连接检查版本，拒绝后不进入可写连接；正常打开后仍由原applySqliteBaseline复核。不存在的新库与真正空库仍按当前基线初始化，existingOnly恢复维持原错误合同。定向4文件21项已通过，含文件字节、结构与业务行不变；未改生产接受条件来迁就测试。

第一片工程结果（main ea05b7690b）：两次整体构建通过；核心四文件现为22项（项目基线8/Feed7/Goals5/历史2），Host/Feed README及直接影响其余89文件串行通过，合计93个不同文件；包含真实临时Home的新建、重开、项目删除、权限与MCP/SDK路径及一个测试浏览器文件。health对照ea05b769、boundary、40库版本核对通过。affected-tests命中storage/full，留统筹排CI Full，本机未跑全量。旧结构/维护4+4+4共12文件删除，业务历史4份SQL只改元数据编号，DDL与业务INSERT保留；真实Home未操作。新PR、准确head与独立验证/二审另记。

## 八片修复承载（2026-10-30）

按统筹6529491590，从干净main `8276d875c7577bc7b2db3daf527487c1b84ce8d9` 建唯一 `integration/clean-home`，依次普通merge #1578、#1549、#1588、#1587、#1589、#1591、#1593、#1552的已签源头，不改八作者头、不rebase。第五/六片二审必修、共用文书及加强断言只在该承载追加提交；#1589只能随#1578一起落地，删除旧项目演练后不再调用已删Goals维护脚本。

批内增量去掉Runtime配置备份孤立维护标记与两处拦截及专用错误码，S-12原key缺失拒绝和配置/备份/密钥不变断言保留；外层1快照预检增加非sealV2/明文拒绝和全目录不变负例。普通get/put的既有差异按统筹6532134256留MISC，本批不改；不新增读取兼容。RAC-2369增加无新journal/WAL/SHM，RAC-496完整独立schema逐项相同；Runtime现行夹具只在独立Host用例核对，不冒称真实Home检查。

共用文书按6524173085、6527165271、6527268864、6527251631、6528761774及T-321方案6529444914（BL-739随本批取消）收口：旧候选迁移取消；PG-020与PG-012按统筹决定已做，BL-925只在第三个双实例插件出现时再评；BL-157、BL-739、BL-780随重建取消，PG-094的T-115/T-116与其余待办保持。PG-058/077/078/111不另改收口。T-134不入这批，但须先合再由统筹请用户真实开始；开始前统筹盘点全部在途Home DDL，先落地或明确重建后按版本2维护。

验证只在临时Home：整体build、批增量与冲突相关定向用例、health/base、boundary、版本与资源核对、secrets；沿统筹允许的未变输入链复用原B证据，不自称独立重验八作者片。公共machine-slot与jobs1；Full和main合入由统筹安排，真实Home/旧副本/服务/Keychain/安装未操作。

批增量工程候选结果：本承载整体build通过；公共槽、jobs1运行29份不同的完整定向原文件，231/231、skip0，含各库完整基线/新建重开/拒绝、S-12原key与v1快照认证拒绝、S-102、Schedule冲突用例、PG-077入口、动作合同快照与Runtime/离线快照消费路径。health对照merge-base8276d875通过后由原脚本刷新快查，boundary、41项存储版本、48项资源7,491,890字节通过；相对该基点仅workbench.js减少140字节，没有资源放行。八源头本轮仍未变、Verify与各CI为15success/2skip；源头B/Opus原有范围按统筹证据链复用，不能当作批增量独立签收。批增量Opus、统筹Full和真实Home仍未完成。

### 批Full发现的消费点（2026-10-30，作者已修，待独立增量与统筹排程）

#1633旧头d4c86e1de的Full41119786533已有失败，B回执6533150286保留原日志，不能作为后续82ace2273的通过证明。五份失败原文件在远端82ace2273仍有相同消费前提：Home登记期待已退役的Sessions技术目录、成熟度分布仍计被删除的成果插件包、知识用例试图安装旧artifacts成员、颜色/图标用例仍把平台面当Manifest条目、Memory MCP用例期待旧JSON外层3。本地979f00065修复这些前提，保留文件其余业务、撤权、隔离和拒绝断言，不改产品接受条件。

PG-077的RAC-2342及原RAC-702/703/707/708还要求：平台成果在没有插件目录时仍有既定颜色与图标，组件板保留它的图标行；插件Manifest颜色全量断言继续覆盖全部现行插件，外来非法颜色继续拒绝。组件板的成果行由工作台已有ARTIFACT_NAVIGATION声明提供，与首页/角色/市场同属平台面，不恢复插件登记。Home存储完整清单仅去已退役Sessions项；生产包分布少一包时仍单独钉住modules/artifacts为production且旧插件包不存在；知识用例在无旧成员前提下继续验证2份/1份/无权限的完整目录行为；Memory MCP仅改外层版本为1，授权代际、权限、撤销及内容隔离断言不变。

先整体build，公共槽jobs1跑五份完整失败文件、Workbench README适用必跑及成果平台边界，再以main merge-base跑health、boundary、版本、资源和secrets。这里只产生作者修复证据，交原B/Opus核增量；当前承载的CI/Full仍由统筹排，未获下一次推送时段不向运行中的承载追加提交。真实Home等原红线不变。

作者工程结果（979f00065）：匹配整体build通过；上述34份不同完整文件225/225、skip0，含原五失败文件33项及10份真实测试浏览器文件34项。全部使用公共槽、jobs1、独立Home/profile；原全量、旧144/231批次和T133/T135/T260未重跑。health对照merge-basea626bac7通过，boundary63包0错、41项库版本、48项资源7,492,348字节、diff通过；图标行不增加资源字节，也没有生成快查变动。尚非B独立验收、当前远端CI/Full或用户验收，下一次推送时段问统筹6533302712，最终提交后另核secrets。

B同条评论6533150286于20:56:47Z追加旧Full终态：9成功、5失败、2取消叶片，另有聚合作业失败；原失败不因取消清零。第六份失败文件primitive-catalog-bar的RAC-80/81仍把成果平台格当作可添加/移除的插件。补修只更新这个前提：明确成果平台格出现一次、可打开、没有添加/移除按钮、不在插件市场；全部现行插件原亮/灰、默认pin、开发插件及完整目录断言保留。不改生产代码，也不为这个测试/文书增量重跑前述有效34文件；另跑该完整原文件再交原B/Opus。

补充作者结果：primitive-catalog-bar完整原文件2/2、skip0，通过公共槽与独立测试进程；生产代码/构建与979f00065一致，前述34文件输入未变。两批共35个不同完整文件227项通过（34文件225项+补1文件2项），原六失败文件共35项；不把这些作者定向结果记为B独验或远端Full通过。后续只待最终secrets和统筹6533302712的下一次推送排程，仍未操作真实Home。
