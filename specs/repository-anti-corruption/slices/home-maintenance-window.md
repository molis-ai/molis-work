# 干净 Home 与统一存储起点

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
