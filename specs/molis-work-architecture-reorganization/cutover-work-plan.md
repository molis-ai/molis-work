# 最终切换执行记录

沿用已接受Cutover Contract和总spec §24。完成等级仍为全量内部完整/发布候选验证；本文件中的局部切片不代替最终验收。

## 当前切片：个人规划方法的事实所有权

问题证据：`src/projects/catalog.ts`持有个人方法表schema、CRUD和JSON解码，Web两处重复版本归一化，Web/MCP从Catalog读取方法。规划规则已经属于Goals，但个人级实现仍留在巨型Catalog，且read路径有重复SQL。

方案：Goals公开个人方法服务拥有schema、读取、保存及删除；保存复用现有normalize/version规则。Local Host只定位Home文件，调用Goals只读API；数据库驱动与只读连接生命周期留在数据owner，App不直接导入驱动。Catalog只在既有同连接迁移事务中调用Goals schema，并装配个人方法服务；所有旧个人方法wrapper和reader删除，Web/MCP切换公开owner入口。首轮边界检查纠正了Host直接导入SQLite的实现，不放宽原App禁区。

保留catalog.db位置、schema版本9/10历史、原行格式与排序、enabled/版本/时间字段、个人/项目/builtin覆盖优先级、缺Home/旧表只读不创建、错误JSON忽略与readonly关闭。不给旧数据库制造第二份个人方法表。无新产品功能、无改现用安装或用户Home。

修改边界：modules/goals个人方法与公开入口、apps/local-host个人方法reader与依赖、旧Catalog个人方法部分、Web/MCP实际caller、相关测试与owner文档。Catalog其他职责继续后续逐项退出。

验收：当前及v8旧目录的个人方法保存/升级/重开一致；更新递增版本且保留created_at；无效scope/输入不落盘；删除后重开不可见；Home/无表读取不创建文件或表。原Web/MCP/Planning回归保持。测试使用真实临时DB和生产API，读取最终状态；不增加格式/字段存在类自证测试。

验证命令：定向Goals与Local Host包build、root tsc、planning-engine与个人方法测试、受影响Web个人方法/目录回归、package boundaries、diff check。执行后记录实际命令及结果。后续继续剩余Store/Coordinator等切片及完整用户E2E，不以本切片关Cutover。

本切片通过：两包build及root tsc；Planning16/0/0（含新版本/升级/只读不写验证）、Web2/0/0、MCP方法读取1/0/0；日志 `/private/tmp/molis-work-cutover-personal-{methods,web,mcp}.log`。最终边界48包/521源码/1617 imports/72边/0errors，清单与diff检查通过；现有118项锁文件供应链检查通过。旧Catalog个人方法SQL及reader已删除，Web两处保存统一调用Goals；未把HTTP测试称为全产品浏览器验收。

## 当前切片：澄清记录schema归属

旧Store在新建和migration8中重复定义clarification_sessions/turns，两表读写已属于Governance。将原DDL原样合并成Governance公开schema常量及migration8函数，原Store只调用；不改变列、索引、外键、约束、版本号、时钟或同连接immediate事务。所有其他迁移顺序保持。修改范围为Governance schema/公开入口、Store对应DDL与migration8、该迁移定向测试及文档。

验收：新建数据库与旧migration8均使用同一DDL；失败发生在第二张表之后时整批schema及marker回滚，重试成功后能通过正式澄清API写入/读取并重开恢复。运行已有V1新建/旧迁移与Draft Dialogue集成；新回归只验证真实DDL事务失败，不重复字段存在型断言。

通过：Governance/Draft Dialogue 6/0/0，包含真实独立进程争用与恢复及新migration8事务回滚；原V1新建/历史升级1/0/0。日志 `/private/tmp/molis-work-cutover-clarification-schema.log`、`/private/tmp/molis-work-cutover-schema-reopen.log`；Governance build/root tsc通过；边界48包/522源码/1619imports/72边/0errors。两处重复DDL及旧Store私有migration8删除，schema格式与stamp8不变。

## 下一切片：执行验收应用退出旧Store类型

Claim/Run/Evidence/Review应用位于src/v1，虽已按用例分文件，但Ports仍接受完整旧Store、ExecutionModule与GoalsModule。移入Goals Native Plugin应用owner前，将存储注入收窄为snapshot/eventCursor/appendEvent/同连接immediate函数；Execution历史查询及已验证Review收尾经Execution公开API，Evidence导致Goal失效经Goals公开Lifecycle API。错误构造由现有Host注入同一Error类型，保留instanceof/错误代码与顺序。新应用不导入旧Store/Coordinator、模块Repository或root types；真实callback到Coordinator的评价与其他业务组合仍须后续迁出，不在这一步宣称整个Coordinator已退出。

验收覆盖领取竞争/租约/重复请求、Run报告、Evidence/correction、Runtime/Human Review与自动释放、跨入口相同结果及恢复；原公共行为、事件排序、事务、幂等不变。允许修改原执行验收应用及对应owner包、必要公开类型/API、Coordinator装配、边界检查指向与回归；不改Policy/权限和完成规则来让测试通过。

此切片通过：Contracts、Execution、Goals、Goals Plugin build及root tsc；117项V1核心状态机与24项执行应用/Impact/模块/Proposal收尾/coverage/Dialogue回归均0fail/0skip。日志 `/private/tmp/molis-work-cutover-v1-regression.log`、`/private/tmp/molis-work-cutover-execution-application.log`。旧6个src/v1文件已删除；新Ports不导入旧Store、Coordinator、root types或Repository。边界48包/528源码/1662imports/72边/0errors，diff检查通过。原Core错误身份、拒绝/恢复、同连接事务及幂等保持；尚未完成其回调的Coordinator评价/装配退出。

## 当前切片：工作阶段与跨模块完成门禁

Coordinator中工作阶段、租约恢复、Review就绪与跨模块完成门禁迁至Goals Plugin查询owner。输入为BoardSnapshot、Goals/Evidence/Governance/Execution公开Query及现有可执行性评价回调；不接受Store/Repository。当前状态顺序（trash/archive/replaced/clarify/有效性/活跃Run/Review/完成）和错误/用户确认提示全部保留。Execution公开Query补充原latestCompletedWorkRunEventSeq，算法与事件来源不变。外部Evaluation仍在原Coordinator，下一切片再迁。

同一组工作阶段/lease/Review/coverage/并发回归及原V1全文件验证；先检查节点方法调用图再迁移，不复制成第二套状态机。

工作阶段切片通过：root tsc及Contracts/Execution/Goals Plugin构建，135项V1/coverage/执行验收/Impact/Proposal回归全部通过，无跳过。日志 `/private/tmp/molis-work-cutover-work-state.log`。边界48包/529源码/1674imports/72边/0errors。Coordinator中的阶段与完成判断实现已删除，仍保留装配与可执行性评价。

## 当前切片：可执行性判断与任务选择

将Coordinator的资格评价（角色、依赖、风险、Policy、租约、Impact）及Ready/Available/Explain组合查询迁至Goals Plugin，按资格评价与选择查询两个职责组织，共享原snapshot索引。Goals公开现有活动Policy绑定读取；Execution公开按Goal查询Claim，保留原SQL、排序与空值行为。工作阶段查询、执行命令与列表消费同一个评价实例，避免业务回调继续返回旧Coordinator。替代关系查询抽为同Plugin纯查询函数，避免评价与阶段互相依赖。

保留角色门禁、阻塞原因及排序、无Goal时Explain返回拒绝而非新异常、Available规划优先级、已完成待证据/Review与父级覆盖修订路径、Impact并行建议语义；不改变选择与领取的事务或权限。原公开Coordinator查询入口暂作无逻辑转发，待Host入口统一切换时退出。验证既有V1、planning、availability性能/状态、跨入口执行回归，检查新owner不导入旧Store/Coordinator或Repository。

资格与选择切片通过：151项V1/coverage/Planning/执行/Impact/Proposal回归、7项Goals Query/MCP呈现/Runtime完整协议回归全部0fail/0skip；日志 `/private/tmp/molis-work-cutover-eligibility.log` 和 `/private/tmp/molis-work-cutover-eligibility-queries.log`。Contracts/Execution/Goals/Plugin构建、root tsc、48包清单与边界（533源码/1707imports/73边/0errors）通过。Goals Plugin新增对既有Execution公开Impact policy的内部依赖，未新增外部包；lock仅对应workspace link。评价与工作阶段不再互相依赖或回调Coordinator业务。

## 当前切片：风险授权、Review义务与Contract读模型

剩余风险授权依赖Action projection、兼容revision、当前Evidence/Claim/Run，属于Goals Plugin跨模块应用；保持原校验顺序、历史兼容入口、用户/Runtime权限语义，注入公开Query与同一个Error工厂。Review义务由同Plugin按Goal criterion及Policy形成有限desired结构，Governance继续负责持久化reconcile。Contract读模型迁入同Plugin，并把租约到期的只读Claim/Run投影放入该读模型文件；旧入口删除，Host/Web仍可调用公开转发。无状态机或新权限变更，无新增SQL、无分包禁区放宽。

验收：原Risk动作的过期token/revision/用户接受/Runtime缓解与Evidence关联约束、Review分工/独立性/人工条件、Contract历史与过期投影保持；原V1/跨入口/查询/Runtime回归。新应用不依赖旧Coordinator、Store、root types或模块Repository。

## 下一切片：Board初始化和当前Goal事实归属

boards已由Goals Query和schema持有，旧Coordinator仍直接创建Board、设置/清除active_goal_id。将三个写入归入Goals Repository和BoardCommands，复用Goals同连接事务、原idempotency hash/operation与events格式，公开initializeBoard/setActiveGoal；生命周期完成/归档/回收站清除当前Goal直接在Goals内部完成，删除只为回调旧Coordinator而设的clear hook。旧入口暂作转发，不再持有SQL或Board业务。Execution补齐既有activeRunIds和revalidation close-out公开API，读回Run使用已校验Board ID，删除剩余Repository旁路。

验收保持Board创建/重复键/冲突/初始化失败回滚、设置当前Goal所有拒绝条件、完成/归档/垃圾箱后active清空及恢复一致性；执行重验证的事件/Claim释放与Run读回相同。原V1及Goals模块/Runtime回归，检查旧Coordinator无SQL/Repository/lifecycle实现调用。

风险/Review/读模型切片通过：124项回归全部0fail/0skip，日志 `/private/tmp/molis-work-cutover-risk-review-query.log`。Board归属切片通过：121项V1/Runtime/执行入口/Query回归及3项公开Goals Module验证，日志 `/private/tmp/molis-work-cutover-board-owner.log`、`/private/tmp/molis-work-cutover-board-module.log`。直接Module验收补强初始化事件失败原子回滚/同键重试/冲突不写、完成后指针自主清除及重开恢复。Contracts/Execution/Goals/Plugin/root类型、48包537源码/1728imports/73边/0errors、diff检查通过。

## 当前切片：SQLite连接与公共日志技术归属

旧Store仍拥有数据库驱动、连接pragma、事件/幂等记录技术SQL和三类基础DDL。连接与events/idempotency DDL及读写归packages/storage，保持原超时/WAL/FULL/外键/立即事务、序号、主键和原始payload序列化；boards DDL归Goals。Store暂组合公开Storage函数和Module schema，迁移顺序/版本/事务完全不变。此切片不实现Outbox/Exchange，不改变历史损坏JSON的读取行为、不另建第二份日志。

验收：原新建/升级/事务失败/幂等/租约与重开回归；Storage构建与边界；后续再把迁移顺序和Snapshot装配归Local Host，不能把技术提取称为Store整体退出。

Storage切片通过：126项V1/备份恢复/公开Goals/Draft Dialogue回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-storage-verified.log`。首次运行发现无caller的sqliteJson旧导出仍引用已迁走helper，删除该零caller导出后重跑通过；失败日志保留。Storage/Goals构建、root tsc、48包538源码/1730imports/73边/0errors与清单通过；pnpm实际安装同步workspace依赖、118项供应链检查通过。旧Store连接/日志方法只调用Storage，boards与journal DDL已分别归owner。

## 当前切片：Feed导入回执事实与公共事件消费

旧FeedStore仍持有导入回执DDL/写入/读取、已属Feed的迁移回执读取、公共events写入。导入及迁移回执的既有类型/字段、排序与upsert归Feed公开Receipt服务，FeedStore仅组合其结果。公共事件SQL统一消费Storage的同连接Journal（保持event-ID前缀、web-user actor、payload/顺序）；Storage连接与借用连接的Journal分别管理，后者不关闭传入DB。无新增业务规则，Feed导入/重复回执/项目隔离/迁移恢复以及原events回归。

## 下一切片：迁移顺序回Local Host

迁移1–31的执行顺序属于Local Host装配，业务DDL及数据修复继续调用各Module。把旧Store的迁移组织与Feed/Sources/Signals/Attention/Listener初始化组织迁到Local Host公开入口；Storage提供有限schema版本/表列存在查询与marker写入，并保存已有opaque blob技术表DDL。保留fresh事务边界、逐版本顺序、缺表/列修复条件、29/30联合事务与所有旧时间生成位置；不新设schema版本、不压缩旧数据或重写历史。旧Store调用一个公开migrator，旧Feed迁移导出仅转发，后续统一caller再删。

验收重点为旧DB重开、迁移29失败原子回滚、30联合升级、Artifact/Dialogue/Guidance缺表重建、已应用版本不重复事件/回执。类型与跨包边界检查后运行V1、Feed升级/Contract、Goals Module、Dialogue与备份恢复回归。Host不新增业务SQL，仅组合owner schema和有限技术API。

Feed回执切片通过：11项Feed/Goals/备份恢复和10项Feed升级/Contract/Module/接收链回归0fail/0skip；日志 `/private/tmp/molis-work-cutover-feed-receipts.log`、`/private/tmp/molis-work-cutover-feed-migration.log`。Host迁移顺序切片通过：132项V1/Feed旧版及失败回滚/Goals/Dialogue/备份恢复回归0fail/0skip，`/private/tmp/molis-work-cutover-host-migrations.log`。Storage/Host构建、root tsc，48包542源码/1751imports/83边/0errors，workspace清单/diff通过。pnpm真实同步新增内部依赖，复用已通过的118项供应链结果，无新增外部库。

## 当前切片：Snapshot公开查询组合

旧Store.snapshot仍构造并调用四个Module Repository和Clarification Store，跨模块Snapshot组合属于Goals Plugin查询。新组合只消费Goals/Impact、Execution、Evidence、Governance与Clarification公开Query；Module公开只读组装工厂复用原Query实现，避免Host构造Repository。保持Board/Goal/事件游标来源、各数组排序、全量历史、migration兼容记录与lifecycle_events合并顺序；不增加第二份Snapshot缓存或schema。旧Store其它历史读取wrapper暂留到caller切换，不假报其已退出。验收为原Contract/Available/执行状态、历史迁移、Feed Goal存在与Board隔离回归。

Snapshot公开查询切片通过：123项V1/Contract/Goals Query/Feed Goal存在与旧版重开/执行入口回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-snapshot-query.log`。四个Module只读工厂复用原Query实现，Goals Plugin组合完整Snapshot；Feed的两个Goals Query caller也切换工厂。模块构建/root tsc/48包543源码/1757imports/83边/0errors/diff通过。Coordinator唯一getGoal旧Store调用已改为已知Board的Goals Query。

共享链路集成检查通过：完整 `pnpm build`（48包、root清理后构建、PTY bundle）以及66项Web/Local Host/CLI-MCP一致性/Runtime/迁移E2E回归全部0fail/0skip。日志 `/private/tmp/molis-work-cutover-shared-build.log`、`/private/tmp/molis-work-cutover-shared-entry-regression.log`。这是本次共享存储链路的回归，尚不是全产品统一用户验收。

## 下一切片：Host运行时与旧SDK兼容边界

新LocalProjectDatabase组合Storage与公开Module查询；GoalProjectApplication仅装配已经迁出的业务应用及公开Module，放入Local Host。原Store/Coordinator真实内部构造caller切换新Host入口；根SDK名称暂作兼容导出，已无生产caller的历史读取wrapper不再承担正式事实来源。保留当前公开SDK可用性，兼容入口的移除条件为全部内部caller清零、旧SDK消费者迁移且发布兼容验证完成；不在这个结构切片静默删除可用SDK方法。Domain Error保留原构造和名称，由Goals Plugin公开导出，所有入口使用同一个类。构造时的业务资格判断仍归Goals Plugin/Module，Host只绑定调用。

验收：新Host可真实初始化数据库/Board、装配Runtime、跨入口执行和恢复；旧SDK测试仍通过且错误instanceof相同；新App不导入旧root、Database驱动或Repository；数据库只打开一次，Module实例与同连接事务保持；最终pack/release caller和旧入口清理仍须后续统一验证。

LocalProjectDatabase切换：123项功能回归通过；唯一失败为旧Host边界测试仍要求构造SqliteMolisWorkStore。将该断言改为新正式构造点，并把禁止Web/CLI/MCP自行构造的集合扩展到LocalProjectDatabase；定向复验1/0/0（日志 `molis-work-cutover-project-database-guard.log`），不放宽单Host规则。原失败日志 `molis-work-cutover-project-database.log`保留。新App仅导入Storage及Module/Plugin公开入口，root Store仅剩历史SDK读取方法。

Host装配前补齐：原构造器中的新增关系预检与父级覆盖闭合判断改调用Goals Planning公开方法；算法/顺序/查询事实保持。Run-start的Goal有效性检查由既有GoalEligibility执行。随后迁出剩余装配类，保持同一错误构造与公开SDK别名。

Host应用装配切换通过：185项V1/Local Host/CLI-MCP一致性/Web/Runtime/Query/迁移回归全部0fail/0skip，`/private/tmp/molis-work-cutover-host-application.log`。新关系预检/覆盖判断回Goals Planning，Run-start资格回Goals Plugin，错误类同一公开owner；Root Coordinator只10行兼容导出，Store51行SDK读取兼容，src内部正式caller全部使用新Local Host类型/实例。Contracts/Goals/Plugin/Host/root构建、48包546源码/1784imports/84边/0errors/diff通过。

## 下一切片：renderer剩余独立样式与首次使用页面

保持视觉和交互不变：独立首次使用样式原样归Design System，Goal回收站文档样式归Goals Plugin并由Workbench组合；Root renderer只消费公开样式。首次使用页面随后归Workbench renderer factory，保留完整/更新/新项目、Desktop query、i18n、控制token、Runtime检测与所有表单/客户端data属性，Root只绑定现有平台helpers。先保存现有生产输出作为迁移对照，再对同一真实输入比对完整HTML/CSS，补既有首次使用/标题栏回归；不改样式数值、文案或业务接口，也不把该切片视为新UI设计或全产品E2E。

首次使用切片补充：现有 intent frames/校验/规划提示同属 Workbench 首次使用流程，随 renderer 原样迁移；Web 创建项目 handler 直接消费 Workbench 公开入口，删除旧根文件。迁移前已保存生产 HTML/CSS 输出到临时文件，覆盖中英文、三模式、Desktop/Web、Runtime 可用/缺失与转义输入。

首次使用迁移完成：24组真实 renderer 输入的完整 HTML 与两份完整 CSS 逐字一致；Design System/Goals Plugin/Workbench 构建、root typecheck、48包550源码/1790 imports/84边界0errors通过。Web/Desktop/样式121项：120通过、1失败、0跳过；唯一失败仍为迁移前已记录的搜索框 display:none 旧断言，保留现有 display:flex 产品行为，纳入最后整体测试清理。首轮因 sandbox 禁止临时监听而失败，经允许本机临时端口后完成上述结果；日志 `/private/tmp/molis-work-cutover-onboarding-regression-authorized.log`。不将此结果称为全量绿色或完整用户E2E。

## 下一切片：项目目录与设置导航组成

项目目录、迁移对话框、项目切换器及全局/项目设置导航属于 Workbench 壳层，原样迁入两个职责文件：project-directory-renderer 与 settings-navigation。导航模型只有项目ID/名称/数据类别；页面继续绑定现有翻译、转义、图标及Desktop URL helpers，控制和客户端脚本仍复用原owner。保留空目录/多项目、当前项目回退、URL编码、Desktop标记/安全区/选中态、迁移确认与表单全部属性。先记录公共目录和设置/规划输出，再迁移并逐字比对；不改变项目创建、迁移或Runtime操作授权。Root renderer保留正式消费入口直至最终调用者切换。

目录与导航切片通过：公共目录、全局四设置页面、规划库在中英文/Desktop-Web/空与多项目/有无当前项目输入下完整输出逐字一致；Workbench/root类型、48包552源码/1794 imports/84边界0errors及diff通过。导航事实未复制为第二套状态，root仅绑定同一factory实例；后续受影响Web回归随下一个完整页面切片运行。

## 下一切片：Goal 展示模型与剩余执行记录/用户复核 UI

Root renderer 当前仍定义跨入口共用 Goal 展示模型并实现人工复核场景、对话验收预填与完整事件记录。将展示模型归 Goals Plugin 公开 UI 模型，复用既有 Module/Plugin 类型而不复制领域状态枚举；Web只组合Feed/项目壳。人工复核是Workbench已有执行验收UI的一部分，完整事件展示同样归该文件族；依赖Goals Plugin既有决策文案和公开Goal模型，不持有执行权限/数据库。保留预填的有效Evidence/时间/criterion scope/对话locator约束、attention token、推荐条件、事件倒序与分页和所有表单属性；旧renderer调用新factory，不修改提交API。

验收：定向真实Human Review/事件分页与Web回归，覆盖有/无通过依据、人工标准、预填、多复核义务及过期/无效Evidence，事件最新/下一页；迁移前后公共页面输出和公开类型检查。此处只是UI/类型归属迁移，不调整人工验收权限或完成门槛。

人工复核与记录切片通过：Goals Plugin/Workbench/root构建，真实demo派生的Goal详情/记录/分页/进度/快速记录/决定中心在中英文下完整输出一致；93项Web/Desktop回归0fail/0skip，含真实Human Review与event ledger。日志 `/private/tmp/molis-work-cutover-review-records-regression.log`；48包555源码/1812 imports/84边0errors。旧renderer重复Goal模型、人工复核、预填判断、事件账本实现删除，当前1047行，仍未整体退出。

## 下一切片：安装诊断公共读模型与全局设置页面

Runtime 接入检测与 Web Service 检测是 Local Host 提供给 UI 的公开只读契约；将既有 Detection/State 类型与 Runtime ID 列表移到 contracts/platform/app-host 内部文件并公开，Local Host 保留实际检测、配置、服务动作和授权，不让 Workbench 反向依赖 Host 实现。全局设置四页面及 Runtime 预览对话框归 Workbench，复用刚迁出的导航/目录对话框和原客户端脚本；配置展示、按钮状态、安装缺失/冲突/重试文案以及Desktop返回链接不变。

先保存各 Runtime 检测状态、Web Service 状态、安装状态及页面输出；迁移后逐字对比并跑安装/设置相关测试。此切片只移动公开类型与渲染，绝不调用真实配置/服务写入，不扩大自动接入或安装权限。

全局设置切片通过：Contracts/Local Host/Workbench/root构建、各种Runtime连接状态/服务状态/安装状态完整输出逐字一致，80项Runtime接入/Web设置回归0fail/0skip；日志 `/private/tmp/molis-work-cutover-settings-regression.log`。边界48包558源码/1823imports/84边0errors，legacy超千行文件剩2个（目录与server），不将低于阈值当作职责完成。

## 下一切片：Feed 组合读模型与 Workbench 页面模型

为了让UI组合不再导入root服务实现，现有Feed/Sources/Attention/Listener组合DTO归Feed Plugin：从各事实owner公开类型派生，保留当前HTTP board_id、item_type、资料解密后的只读content以及Listener组合字段，不改存储或wire。原重复领域枚举改为owner别名；上下文摘要格式化消费同一Feed Plugin脱敏函数。全部旧Feed types caller直接换公开入口，旧文件删除。

Workbench页面模型组合Goals Plugin展示模型、Feed Plugin读模型与项目导航；来源目录字段公开为Feed Plugin的catalog读模型。UI的connector auth只依赖实际消费的github/gmail状态（既有FeedUiModel公开类型），不反向依赖root连接服务的OAuth安装细节。生产返回对象保持不变。后续继续迁Feed组合映射/服务实现，不能把DTO迁移当作FeedStore整体退出。验证类型、源/接收/上下文/Feed用户回归及迁移前后完整输出。

Feed读模型切片通过：17处旧types引用已改成Feed Plugin公开入口并删除旧文件；事实字段从Feed/Sources/Attention/Listener公开契约派生，非重复枚举/记录定义。40项Feed/来源/连接/安全/Plugin回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-feed-projection-regression.log`；Goal完整页面输出对比、类型与48包560源码/1834imports/84边0errors通过。Workbench页面模型不再导入旧类型和root服务。

## 下一切片：共享 UI 基础与 Feed 页面组合 caller

图标归Design System，locale runtime归Workbench（字典已在同一owner），Feed富文本解析/清洗归Feed Plugin，RSS HTTP游标解析/更新归RSS integration。所有旧文件直接迁移并将caller指向公开入口，复用原依赖版本；不新增内容解析规则、网络请求或HTML许可，不改locale cookie/回跳校验。Workbench的Feed模型映射随后消费这些公开owner，继续通过同一个UiHost注册的Feed contribution渲染。

Workbench public index中的UiHost装配移至明确ui-composition文件，index保留public exports和包描述；内部组合不再反向导入自己的public barrel，避免模块初始化环。边界检查读取真实装配文件加public入口，原注册/禁止绕过检查不放宽。验证完整CSS/HTML前后对比、i18n/图标/富文本信任边界、RSS重试与UI映射回归；样式数值和富文本安全策略原样保留。

语言边界修正（实现前发现）：Workbench不能持有Node-only请求上下文。原locale runtime里的AsyncLocalStorage留在Local Host的web-locale适配器，Workbench公开无平台依赖的locale函数工厂，由Host注入currentLocale读取。Feed UI映射工厂消费同一L/dateTimeLocale端口，既不导入Host也不创建第二个locale store。所有SSR/HTTP/tests使用Host公开请求scope，cookie/转义/语言匹配和异步隔离保持；新增内部Host→Workbench依赖是公开渲染适配，不引入反向依赖环。

共享UI切片通过：89项i18n/Workbench/富文本安全/Feed/RSS/Web回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-shared-ui-regression.log`；迁移前后四组完整输出全部一致。新增异步请求真实交错/嵌套失败验证，Host统一scope未串语言。静态标签检查已覆盖迁出模板，UiHost注册检查读取新装配owner，禁区未放宽；48包567源码/1858imports/88边0errors。原118项依赖离线复用，零下载；旧Root四文件和Feed UI adapter删除。

## 下一切片：Goal 文档面板与 Focus 组成

Goal进度、窄屏Runtime摘要、快速记录和只读完整记录是Workbench对已注册Goals/Execution UI的组合；抽成Goal文档面板owner，按原公开renderer方法注入，禁止读DB/构造业务Module。Focus卡片/标题/展开内容是同一UI机制，单独归Workbench共享模板。保留当前Run与历史阻塞的区分、租约显示、完成比例、全部快速记录表单与只读关系/风险/规则内容；Fragment路由继续调用同一组面板，不新增状态机或执行判断。

先沿用已保存同一生产view，对所有Goal进度/快速记录/完整记录逐字比较，新增测试只针对未被当前回归覆盖的行为；现有Web/Fragment/Runtime测试验证前后端调用链。继而迁项目设置页面与决定组合，最后Root只剩平台装配再迁入明确App入口。

Goal面板/Focus切片通过：76项Web、Context/Document UI和i18n回归0fail/0skip（含真实事件/快速记录/人工复核），日志 `/private/tmp/molis-work-cutover-goal-panels-regression.log`；同一真实demo派生输入的Goal完整页面逐字一致，Workbench/root类型、48包569源码/1869imports/88边0errors、diff通过。Root renderer630行，Workbench面板164行与Focus67行，保留现有注册Contribution调用；未按文件行数单独判断完成。

## 下一切片：项目说明、规则与规划设置页面组合

把根 renderer 中项目设置 HTML 与规划页面外壳交还 Workbench。Goals 的说明事实、规划组合与规则 renderer 继续消费原公开契约；Workbench 只负责页面和导航，Host 注入语言与 Desktop URL/bootstrap 能力。保留现有 HTML、客户端行为、历史记录、转义和入口签名。验证迁移前后同一输入完整输出、项目说明/规划/规则 UI 与 HTTP 回归，不改业务写入。

边界验证修正：项目规划 renderer 已有“消费 Module composition，不重算”契约，保留它。组合函数由当前平台装配注入 Workbench 的强类型端口，Workbench只传入原 enabled project methods，既不直接导入Module，也不复制组合规则。后续整体App装配迁移时一并归属Host。

项目设置切片通过20项规划/工作规则 UI、真实HTTP E2E与i18n回归，0fail/0skip，日志 `/private/tmp/molis-work-cutover-project-settings-regression.log`；同一真实view+zh/en+Desktop/Web输出一致（新方法ID的时间部分单独标准化）。项目目录/设置输出亦一致；570源码、88依赖边、0边界错误。

## 下一切片：风险决定与决定/Feed组合

风险决定表单归Goals现有Safety Contribution，新增该Contribution的risk-decision surface，复用既有动作投影/token、风险解释与决定提示，保留相同风险owner选择与提交字段。Goal决定链接归Goals共同展示函数。Workbench负责把各owner输出组合成决定中心与Feed补充项；不自行改变业务状态或增加权限判断。保持同一输入全页输出并运行风险决定、Feed/决定中心与Web真实提交回归。

## 下一切片：Workbench 页面入口与平台装配端口

剩余render.ts中的页面/Fragment/决定与Feed组合迁到Workbench的createWorkbenchRenderer工厂。工厂依赖显式locale、Desktop链接/bootstrap、Goals默认规则与规划组合端口；内部使用实际owner模块，禁止self-barrel或Host/Desktop反向依赖。现有调用方先保留同签名的临时装配，再按Host/CLI/SDK真实用途退出旧文件；不能用保留facade当作cutover完成。样式/脚本仍来自Design System/注册Plugin，运行时状态由Host原scope持有。

入口退出细化：Local Host提供createLocalHostWorkbenchRenderer(desktopPorts)，持有唯一locale scope与Goals默认/规划组合依赖；Desktop只公开其已有bootstrap/link端口。Web server在启动装配位置调用Host工厂，将Feed所需render方法注入现有HTTP适配器。Capsule决定数量改消费Goals公开纯投影；测试使用相同Host工厂，旧src/web/render.ts不作为永久转发保留。另移除已确认重复的默认GoalPolicy文本，由Goals Module原query默认值作为唯一实现，SDK仅公开兼容导出。默认值逐项相同，无政策行为改变。

页面入口退出通过：src/web/render.ts已删除，兼容白名单10→9；风险决定78/0/0、工厂117/0/0、退出后137/0/0，完整输出五组一致，日志 `/private/tmp/molis-work-cutover-{risk-decision,renderer,render-entry-exit}-regression.log`。后者包含实际HTTP/Feed/Capsule/Session/Desktop与policy；573源码1915imports88边0errors。Host factory23行以内，Workbench只组合注册UI，不新增依赖边。全量build另记录，完整产品浏览器验收仍待整项开发结束。

## 下一切片：Runtime 项目选择只读规则

Catalog仍把精确Session绑定、目录唯一关联、候选评分、用户拒绝/解绑历史与项目目录/物理存储生命周期放在同一类。Private Work Context已有binding事实Repository，应拥有上述Session选择逻辑；新RuntimeProjectResolution消费自己的binding查询与Projects的公开query契约，不导入Projects实现、不写数据、不自动建立绑定。Host/Catalog只规范化宿主输入后调用；绑定和创建路径复用同一查询，避免两份判断。保持已有Session优先、唯一且realpath验证的目录关联、歧义候选、当前Session拒绝/解绑抑制、最近其他Session记录、评分与稳定排序。验收Runtime context/项目目录/MCP选择回归，后续再迁确认写入与文件生命周期。

Runtime选择只读切片通过23项项目目录/Runtime context/Session router/隔离与workspace、Session操作回归，0fail/0skip，日志 `/private/tmp/molis-work-cutover-project-resolution-regression.log`。迁出候选评分与解析规则，Catalog减少261行，新增owner无写入与Projects implementation依赖；类型、边界、diff通过。

## 下一切片：确认绑定、解绑与新建绑定的执行规则

Private Work Context继续收回当前Session确认、换绑确认、拒绝建议、解绑、绑定事件及创建绑定幂等判断。规范化/校验工厂由Host注入Projects公开目录规范化函数与既有错误构造，保持错误code/name/消息；所有状态变化仍在原同连接transaction中执行。文件创建/验证/移动/失败清理由Host提供的provision callback执行，Session模块不读写项目文件。当前已发生竞争、重复请求、后续切换和失败回滚场景沿用真实生产回归，不新增并发框架或Outbox。Catalog仅装配端口并暂保同名调用入口，后续实体生命周期与整体entry退出继续执行。

## 下一切片：受管项目文件生命周期与只读校验

Catalog中真实文件staging/提升/备份恢复/删除清理归Local Host；项目登记/删除回执仍归Projects，绑定清理归Private Work Context，Panel清理由注入Desktop端口执行。迁前先补现有调用实际需要的公开读取：Goals board ID列表、Execution有效Claim/未结束Run数量；复用原SQL，不在Host扫描业务表。Storage提供现有readonly连接、integrity_check与checkpoint原语，Host只消费结果；错误、schema迁移时点和失败关闭保持。Demo seed暂由已有生产seed函数注入，不把演示内容复制进Host。文件操作只在测试临时目录验证，不动用户真实Home/项目。

绑定执行切片84/0/0；文件生命周期切片82/0/0（含迁移前后快照、错误恢复、真实有效Claim/未结束Run删除门禁、Demo重建与Web），日志 `/private/tmp/molis-work-cutover-{context-binding,project-files}-regression.log`。Catalog1711→460行，其余实现按owner分为只读解析、确认绑定、请求幂等、Host文件生命周期；不据行数声明完成。Storage readonly路径无迁移、无写pragma，正常连接保持原4项pragma；Goals/Execution新增只读query均复用原SQL。Host新增Projects公开依赖，离线118原依赖0下载；584源码89边0errors。

下一步迁出Catalog 1–10 schema装配：Storage持有现有catalog_meta的技术元数据适配，Host决定owner/schema版本和按既有顺序调用各owner迁移。Desktop schema创建以明确callback注入，防止Host→Desktop循环。原未知库/future reader拒绝、每步事务回滚与旧版本数据保留不变。

## Catalog 旧入口退出：Host 装配与 Desktop adapter

Local Host承接当前Catalog的连接生命周期与Modules/文件/绑定装配；公开open需平台端口，避免Host反向导入Desktop。Desktop仅在其composition入口提供Panel service与SQLite adapter（adapter接收Storage拥有的连接，Panel service继续只持Repository/Context Port），不把SQL放回Desktop lifecycle。Panel Repository/Context/构造参数的稳定类型归App Host Contract；实际SQL/schema/mapping留独立`apps/desktop/src/adapters/sqlite-panels.ts`技术adapter，属于23.3就近放置，不新增包或放宽数据库driver禁区。示例seed归Host首次使用装配，仍调用既有Goals application，单个exists SQL切公开Goals query。删除root Catalog/Panel adapter/catalog-session与demo旧入口，生产与测试改实际公开owner；保留当前open/close时序、错误identity和DB同连接事务。CLI/MCP/Web复用同一公开Host catalog实例入口，Desktop仅注入平台adapter，不另建事实系统。

Catalog旧入口退出通过136项回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-catalog-entry-exit-regression.log`，覆盖Project/Session/绑定ledger/目录/迁移/删除/MCP/桌面/Web。root Catalog、catalog-session、Panel SQLite adapter、demo入口均删除；8项剩余兼容白名单，590源码2023imports90边0errors。Host无Desktop实现依赖；Desktop composition调用Host唯一catalog并注入其独立adapter，SQL与Panel生命周期分离，数据库driver禁区未放宽。生产Goal/Onboarding完整输出仍一致。

## 下一切片：本地 Secret 与 Feed 保留内容存储

将已有SecretStore及atomic-write/目录解析作为Storage的本地技术adapter，保留env/keychain/install-key选择、AES-GCM、旧envelope升级、跨进程锁与原子写入。Feed引用/保留正文读取语义归Feed Module，UI hydration只在Local Host呈现边界解密；不移动secret到Source/Feed行，不新增密钥轮换或加密格式，不动当前用户真实密钥。所有caller改公开owner，旧security/content文件删除。验证现有Secret/Content恢复、字段脱敏、损坏/丢失key/blob、Source/Connector调用链及真实Feed路径；当前环境测试显式临时Home。

Secret/Feed保留内容切片通过35项安全/Feed/Source/Connector/接收链回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-feed-storage-regression.log`。类型、595源码2045imports92边0errors、diff通过；原依赖0下载，未触碰用户真实密钥。当前最新完整构建日志 `/private/tmp/molis-work-cutover-catalog-feed-storage-build.log`，结果待进程终态确认。

Secret/Feed存储完整构建已通过（上述日志，exit 0）。

## Feed 应用编排退出旧 Store

Feed Plugin 持有 FeedApplication，消费 Sources/Feed/Attention 公开契约及有界 Listener/Receipt/事务/事件端口；Local Host 唯一工厂负责同连接实例、迁移、ledger 授权及 journal 装配。Source 删除保留 immediate 事务与原清理顺序，历史选择校验、错误 identity/name/code/消息、导入与恢复行为保持。Module 错误类型上移其 Contracts 并原入口重导出；不改变事实写入归属。纯投影独立文件，root Store 删除，真实调用方和测试改工厂，不保留构造转发。sourceDeletedAt 调用既有 Sources helper。验收 Feed/升级/错误/历史删除/Source/Connector/HTTP 回归、类型、边界及构建；完整用户 E2E 仍在整项开发后执行。

调用链校正：类型检查发现 Relay importer 通过 `target.db` 包住整批导入并直接写迁移事件（先前只查 `feed.db` 漏掉别名）。本切片同时收回这两个泄漏：FeedApplication 的 importOwnershipBatch 在原 immediate 事务内执行导入、保存回执、通过 Host journal 写原事件；外部 Relay 只提交导入结果和回执，不接触目标 DB。不改变 Relay 读取/解密/映射，现有重复导入与失败回滚测试验证原约束。

Feed 应用编排切片47项回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-feed-application-regression.log`；600源码2074imports92边7兼容1旧Huge，边界0errors，类型通过。旧src/feed/store.ts删除。Relay目标DB直写已收回，原读取数据源尚待下一批迁移。最新完整构建日志 `/private/tmp/molis-work-cutover-feed-app-build.log`，待进程终态。完整产品用户E2E未因此完成。

Feed应用最新完整构建通过（exit 0）。

## 公开来源适配器与搜索技术存储

RSS Integration 收回目录、Custom RSS URL/地址判定及正文分类；YouTube Integration 收回公开频道标识与URL规则。它们继续使用原输入限制、错误code/name与分类，不修改网络行为或来源清单。FeedDomainError身份归公共Feed契约，所有caller统一引用，旧errors入口退出。Search opaque blob/CAS/可信时钟与AEAD/Secret adapter归Storage技术层；依旧保存原feed_runtime_blobs与原密钥命名，不复制状态机、不改schema或重试。

后续Local Host负责搜索Runtime/加密内容装配及可信调用身份；RSS传输通过独立host子入口避免Workbench加载Node网络实现。Exact source selector约束按provider归适配器，组合路由与生命周期归Host。先完成纯provider与技术storage切片，再验证具体联网/恢复路径。验证RSS/Custom/YouTube/精确查询/Secret/CAS现有生产回归与包边界。

公开来源基础切片完整构建与32项Source/Secret/Connector/接收链回归通过，0fail/0skip；日志 `/private/tmp/molis-work-cutover-source-primitives-{build,regression}.log`。605源码2086imports92边0errors，依赖离线118原包0下载。回归包含真实RSS Runtime的200/304请求与持久化状态；不声称已有独立CAS故障矩阵。

Runtime切片细化：Feed产品的exact selector匹配/required-vs-allowed约束归Native Feed的纯路由组合，消费RSS/YouTube已公开目录与标识；该逻辑决定用户Source允许的来源范围，Host只注入路由并提供可信caller身份、持久化和SDK生命周期。RSS协议传输归Integration的`./host`子入口，通过显式频道URL判定与User-Agent端口接收Host装配，不让RSS依赖YouTube或Workbench引入Node传输。Host保留同一APP_ID/版本、搜索scope、key namespace、惰性初始化、失败重试和shutdown时序。完整旧runtime/intelligence-adapter入口退出，Source Service先消费Host公开runtime，后续迁业务编排。

Runtime切片通过完整构建及32项回归，0fail/0skip；日志 `/private/tmp/molis-work-cutover-source-runtime-{build,regression}.log`。609源码2116imports94边7兼容1旧Huge，边界0errors、diff通过。旧runtime与intelligence-adapter均删除；Host装配158/253行、Native exact规则389行、RSS node transport203行。两条新增边均Host→Integration，Native不直接导入Integration，RSS node传输只从./host公开。未修改密钥命名/可信身份/SDK版本/运行中服务。

审批执行记录：首次批量脚本（源码转换+依赖安装）自动审批拒绝，未执行。已核对用户active goal全量迁移授权、§24、版本控制和当前diff，先生成 `/private/tmp/molis-work-source-runtime-review/runtime.patch`，只读审查并通过git apply --check；随后明确14文件补丁重审获批且已应用，安装另行获批。该拒绝已解除，不是当前阻塞；不要重放最初脚本或再次索要相同授权。

## 来源管理与公开同步业务拆分

当前SourceService混合来源注册/配置/计划、Exact请求、同步提交与数据库/运行时构造。Native Feed新增来源管理、公开同步处理、请求规范化三个协作单元；共享类型和少量确定性ID/输入工具独立。管理通过同步处理器执行sync，不使用继承或数据库透传。Host唯一工厂装配FeedApplication、同连接immediate transaction、原journal事件、运行时工厂与有限provider工具端口；所有调用方改Host工厂，旧service入口删除。Scheduler本切片只换实际工厂，连接器调度的完整迁移随Connector处理。

RSS receipt公开结构和sourceDeletedAt纯事实解释归Sources契约，原owner重导出保持身份与兼容；RSS状态解释/更新仍只有Integration原实现，Host注入这些函数。Gmail scope、YouTube频道、Custom RSS URL和目录同样注入，不建立Native→Integration/Host依赖。Intelligence请求/结果类型归Native使用边界，Host复用；采用原vendor 0.2.2不升级SDK。

保留注册事件的原非事务顺序、两处sync immediate事务、终态回执重放/配置冲突、部分成功requirementMet入库门槛、RSS连续失败/配置错误告警与事务后Attention更新、删除历史选择、schedule推进和shutdown时点。事件actor、类型、ID算法和消息保持。验收现有Source/Upgrade/Feed/Connector/HTTP回归、类型、边界、完整构建；真实用户完整E2E仍待整项开发结束。仅改Native Feed、Host、Sources/RSS公开契约、直接caller、依赖配置与本任务文档；不动schema、密钥、安装或运行中服务。

来源管理/同步切片完整构建与35项现有回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-source-service-{build,regression}.log`。另外增强实际Source生产路径的提交失败回滚测试：在最终sync_completed事件写入注入SQLite错误，验证新材料/Source计数与last_sync/终态回执均回滚，再以同一幂等键恢复一次并重放无重复。正向通过日志source-rollback；临时去掉已构建Host的transaction后该测试稳定失败（未拒绝并错误重放已写终态），已finally恢复原构建文件，mutation日志保留。旧service.ts删除，业务227/280行、请求142行，Host58行；616源码2159imports95边、7兼容1旧Huge、边界0errors。新增依赖只有Host→Gmail与Native同版本SDK，原118依赖离线0下载。SourceScheduler目前只改Host工厂调用，完整调度装配随Connector切片。

## Connector授权基础：凭据adapter与GitHub Device Flow

先将本机凭据读取/绑定/解绑/加密状态查询迁到Host技术adapter，保留已有ref、env优先顺序、错误/脱敏和Gmail旧slot删除语义；所有caller改公开Host入口，旧credentials文件删除。GitHub Device Flow协议归GitHub Integration的独立OAuth入口，以有限clientId读取/写入、token绑定端口消费Host；Host工厂绑定原SecretStore与env，协议不持Storage/Host依赖。保留scope、URL、request字段、失败消息、轮询状态与token返回范围，root github-oauth删除。GmailOAuth只在当前切片改credentials依赖，随后单独拆分迁移。验收现有GitHub OAuth/凭据/Feed/Connector测试、类型、包边界、构建，使用临时Home与模拟provider响应，不访问用户账号或真实token。

GitHub授权基础完整build与33项回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-github-auth-{build,regression}.log`。新增2项生产DeviceFlow测试验证选定client持久化、request URL/body/scope、各poll状态不写token、authorized绑定及缺client零请求/零写入。Host credential adapter保留原技术语义；GitHub协议独立factory，root credentials/github-oauth退出；619源码2166imports96边0errors，离线118原依赖0下载，类型/diff通过。现有测试未覆盖Gmail PKCE与token刷新，后续迁移须补state/TTL/身份变化、并行账号隔离及刷新失败的生产行为验证。

## Gmail OAuth 协议与本机凭据装配

将旧901行OAuth实现按配置与redirect gate、pending session、token lifecycle、start/complete flow分为Gmail Integration协作单元。Integration定义有限Secret读写/存在查询、环境配置读取及legacy token绑定/读取端口；Local Host注入现有Storage与credential adapter，保留惰性创建和现有ref命名。复用Integration已有TokenRefs/UsableTokenResult，不复制类型、不让Integration依赖Host/Storage实现。调用方改公开Host factory绑定入口，常量与纯callback parser归Integration；删除旧OAuth入口。

保留PKCE算法、默认scope、client写入与redirect校验顺序、state-keyed session和旧slot兼容、10分钟TTL/时钟/身份漂移门禁、60秒刷新窗口、按账号refs同步写入与legacy镜像、不借用其他账号env token、失败不改token等行为。未新增OAuth能力或改变provider错误语义。新增测试真实调用生产factory，验证错误state/过期/身份变化无HTTP及无token写入、两账号回调交错隔离、刷新失败保留原值和成功轮换；现有Connector/Source/Contract回归、完整构建、包边界和diff校验。范围仅Gmail Integration、Host composition、直接caller与本任务记录；完成等级仍是切片已验证，整体内部完整/E2E待全量开发后。

Gmail OAuth完整构建和36项回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-gmail-auth-{build,regression}.log`。新增3项生产factory测试覆盖6种session拒绝路径、实际A等待profile/B先完成的并发交错、PKCE challenge/request绑定、回调重放拒绝、network/malformed/rejected刷新失败无写入、单账号轮换与后续新鲜token复用。初次回归只有Web临时loopback端口被沙箱EPERM阻止，明确该原因后重审获批并全套通过；没有账号联网或现用服务变更。625源码2184imports96边0errors，root OAuth入口删除，Host22行只注入能力。

下一小切片：Gmail installations中的既有账号ref规则、legacy解释与settings模型归Gmail Integration，原文件无数据库实现，保留注入端口与行为。Connector与Relay导入改消费公开Integration；旧scope转发文件删除，实际caller改已有./scope公开入口。不改变来源业务或凭据格式。沿用Connector/Relay/Source现有真实回归及构建/边界检查，后续主流程仍需拆分。

## 官方Integration运行时与Provider Host装配

将OfficialIntegrationRegistry的PluginRuntime安装/grant/start/recover/配置变更重装/uninstall生命周期迁至Local Host；保留每Source session和原fingerprint内容。GitHub/Gmail的本机Provider factory同归Host，协议继续调用公开Integration，fixture仅原test+显式开关时允许。Connector业务暂消费该公开Host registry，下一切片再改注入port。删除旧两个Provider shell、registry与execution-mode入口；重复Connector types改用已有IntegrationProvider契约，success/failure在使用处Extract、mode从公开sync输入派生，避免平行类型真相。

只改Host composition、直接caller与边界断言/allowlist，不动Provider协议、Module事实、安装权限或运行中服务。边界检查从要求旧shell存在改为要求其删除并核对Host公开Integration import/不含协议URL；移除已退出的Gmail兼容白名单。验收PluginRuntime Integration/Connector/Source/Relay回归、完整构建和边界检查。保留外部网络测试使用模拟response和临时Home，测试loopback端口按原权限边界运行。

Gmail installations切片完整build与13项Connector/Relay升级回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-gmail-installations-{build,regression}.log`；旧installation/scope文件退出，626源码2185imports96边0errors。

## Connector 同步业务与 Listener 装配拆分

Native Feed持有Connector同步处理器，通过有界Listener session端口执行run与读checkpoint，消费标准IntegrationProviderItem/Signal引用。Host负责registry、ConnectorHost、Signals、ListenerHost同数据库装配，原afterSignalAccepted仍在Listener的生产事务中调用Feed ingest。ListenerHostError构造归既有公共Listener Contract，原入口重导出保持instanceof身份。失败Source+event继续immediate事务，Attention在事务后；成功保持原checkpoint读取、Source写入、event写入时序，不静默增加事务或Outbox。原mode参与operation ID、终态重放、错误码、fixture标记、原event actor/ID算法与恢复保持。

Provider cursor的账号/授权解释分别归GitHub/Gmail Integration纯函数；Host只组合其返回与Source当前config，不把协议字段判断带入Native或Host业务。Native处理器使用原32位stable ID与幂等输入规则。root ConnectorService本切片暂保账号管理并调用Host同步工厂，后续账号管理与Scheduler继续迁移，不能把中间转发声明为退出。验收既有Listener raw重放、终态/失败/重试/游标/Inbox/Source/Relay测试、构建和边界；必要时对迁出的同步状态路径补故障敏感性测试。改动范围限定Native Feed、Host、Listener Contract/重导出、两Integration账号投影、直接caller及本任务文档。

Provider Host切片build+26回归通过；Connector同步切片build+30回归通过，均0fail/0skip，日志 `/private/tmp/molis-work-cutover-{provider-host,connector-sync}-{build,regression}.log`。同步新增真实SQLite事件ABORT：Source整条更新回滚、Attention未执行，但Listener已提交failed终态独立保留；同键重放无Provider请求，新键失败可正常写Source/event/Attention。沿用原事务契约。635源码2235imports97边6兼容1旧Huge、0errors；Host新增ConnectorHost既有workspace边，pnpm离线118原依赖0下载。构建初次只发现空对象返回的TS推断不匹配，显式标注原返回契约后通过；边界断言已跟随实际Native/Host owner，无权限禁区放宽。

## Connector账号管理与调度入口退出

Native Feed持有账号管理、固定来源登记和同步业务的组合；来源登记独立小函数保留原稳定Source ID、旧描述升级、绑定状态、暂停保护和默认scope。通过面向消费方的有限credentials/OAuth端口接收Host，Host绑定既有公开Integration协议与Secret能力。Gmail Source创建/legacy暂停与解绑Source循环仍归Feed产品，token refs校验/删除留Host+Integration适配；不改变重新授权继承源配置、全部同kind解绑或无email fallback行为。旧ConnectorService删除，所有caller改Host唯一工厂。

Scheduler业务归Native Feed，仅消费Source service、Connector sync dispatch与Feed错误投影，Host工厂注入同库Source/Connector实例构造。保留每tick的service获取、并发inFlight、原plannedAt幂等键、finally推进计划、仅不可重试auth/config/stale fault入Inbox、defaultDispatch每次新建service时点。旧scheduler删除，不新增长期timer/后台任务或调度协议。验收现有Source schedule/HTTP/Connector/Relay/Listener回归与构建、边界；新的端口只描述当前输入输出，不建立通用扩展框架。

账号管理+Scheduler已退出旧入口。641源码2271imports97边6兼容1旧Huge、边界0errors；全包build通过，根编译首轮缺Scheduler类型import，补上后root tsc/PTY/build manifest完成（原完整构建日志accounts-build记录首轮错误，续建session67914 exit0）。34项回归0fail/0skip，`/private/tmp/molis-work-cutover-connector-accounts-regression.log`。新增真实Host factory Gmail授权→加密凭据→账号Source→重复授权稳定Source→legacy暂停→按kind解绑清理链测试，使用临时Home与模拟Google响应。原Scheduler交错去重、睡眠后单次追赶、计划持久化、不可重试告警回归通过。纯Provider TokenRefs guard统一归Gmail Integration，Host credential status使用Native消费方projection类型。没有新增网络依赖或修改现用服务。

## Relay 迁移的旧加密格式读取

先将Relay secrets envelope、旧master key选择和保留正文blob读取/验证移至Storage技术adapter。保持env hex/base64/scrypt、macOS Keychain/文件回退、legacy envelope兼容、AES-GCM AAD与原content-ref digest验证；只返回进程内私有读取结果。adapter不依赖Feed、不写Molis Work业务表，目标Feed content store的重新加密仍由调用方装配，失败仍返回不可用并保留原引用计数。旧Relay importer暂保批量映射和只读SQL，后续再拆，不能把整文件搬Host当完成。验证真实旧库迁移、加密凭据/正文成功、缺key/坏blob/跨账号引用与幂等安全回归；只用测试临时Home与legacy库，不访问用户真实Relay资料。

Relay加密读取切片build+15项安全/迁移/Feed回归通过，0fail/0skip，日志relay-security-{build,regression}。另新增生产readRelayContent测试，以独立加密fixture验证合法正文、缺key、错误key、AAD引用不匹配和有效密文但正文digest不匹配，日志 `/private/tmp/molis-work-cutover-relay-content-boundary.log`。642源码2276imports97边0errors，未改格式/算法或目标写入顺序。

## Relay导入业务与本机旧库Reader

Native Feed拥有历史来源/账号映射、Item/Material/Run写入与重复导入保留本地状态。输入用封闭字段的旧行DTO（SQLite scalar与已有可选列），不向Native传DB、密钥或明文credential集合；消费只读credential refs集合、内容迁移callback、Gmail refs函数及原source fingerprint callback。来源映射与批量事实处理分文件，共用原importOwnershipBatch immediate事务，不增加事务外状态机。

Local Host独立`adapters/relay-reader`将旧Relay表结构翻译为该输入，复用Storage readonly连接技术实现；这是一次性旧库格式适配，不注册新的在线Provider Plugin。Host import工厂负责路径/env、preflight、旧key/credential读取、目标Secret/Content装配及finally关闭。credential复制保持在DB批量事务前，内容写入保持在材料处理时，fingerprint保持在receipt产生时；不以拆分改变文件与DB的原失败边界。原缺表/缺列先拒绝、旧来源手动计划、同账号稳定ID、已导入来源的状态/游标保留、无账号Item合成来源、legacy Gmail暂停、无正文状态、计数和receipt保持。删除root Relay入口并更新实际caller，新增边界断言验证Native无foreign SQL与Host adapter唯一读取来源。验收已有schema drift/重复导入/加密内容独立性/失败回滚测试、完整构建和包边界；不变更当前安装或真实旧库。

自查收回副作用次序：Native先prepare读取当前Feed快照，Host再读取/复制旧凭据，随后调用Native返回的commit执行原batch；不把快照推迟到credential复制后，避免目标读取失败却先写了凭据。prepare/commit只是当前同步调用的两个阶段，不保存新状态或引入协议。

## Feed剩余旧Contract入口退出

root contract.ts只剩测试caller，包含未被生产消费的版本/owner描述及重复Source/Run状态机；删除这些无效生产出口和只验证它们自己的元数据测试。保留真正调用生产Feed写入、迁移失败回滚、Attention和公共错误投影的测试，public error改直接消费Native owner。Provider fixtures实际驱动Feed生产写入，迁到tests/fixtures继续使用。默认OAuth scope已由GitHub/Gmail真实请求测试验证，Source/Run转换由Source/Listener生产回归验证，不用删掉的独立状态机冒充。零caller Gmail history兼容转发同时删除。本切片不改产品行为，验收实际Feed contract回归、类型与边界，后续全量用户E2E与清理顺序不变。

Relay业务拆分完整build+41回归通过，0fail/0skip，日志 `/private/tmp/molis-work-cutover-relay-import-{build,regression}.log`。另外增强生产importRelayData的事件提交失败测试：TEMP SQLite ABORT在迁移最终事件触发，全部Source/Item/Material/receipt快照回滚，再成功重试并验证后续重复导入保留用户disposition/read state/来源pause和cursor；`relay-import-rollback.log`通过。旧contract退出后4项真实生产contract测试通过（`feed-contract-exit-regression.log`），root tsc与diff通过。648源码2304imports97边6兼容1旧Huge、边界0errors；src/feed已无源文件。Host Relay126行仅装配，独立reader103行只读旧格式；Native来源映射232、批量导入170、封闭输入42行。Claim已续到09:08:36.981UTC，cursor1327。

## Feed Item升格Goal的业务退出HTTP

将HTTP文件中的promoteFeedItemToGoal规则迁为Native Feed应用操作，消费FeedApplication、Goals公开createGoal/getGoal与GoalInputBindings契约以及Host注入的hydration/同库immediate事务。Host工厂只装配这些现有能力，HTTP只传item ID、revision、start intent和路由前缀。保留归档/revision拒绝、已绑定有效Goal复用与processing推进、失效Goal重建、未信任外部输入说明、标题截断/优先级、web-user身份、原幂等键、输入绑定snapshot digest、Goal路径和runtime_autofill。Goal创建、输入绑定和Feed关联必须在原同事务完成；测试覆盖公共调用与持久化、重复promotion以及绑定失败回滚，不用只检查HTTP返回值代替。之后再拆Feed路由请求处理与Node传输，当前不改UI或自动启动Runtime。

Feed升格切片Native/Host定向build+root tsc通过，5项生产Goal关联/升格/Native路由回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-feed-promotion-regression.log`。新增真实Host工厂测试：input_bindings写入ABORT回滚Goal/Feed/输入绑定，恢复后正确建Draft/优先级/确认输入；旧revision拒绝，start复用Goal且无重复绑定，丢弃旧Draft后创建替代Goal，归档Feed拒绝无写入。首次测试把未完成Draft直接归档，被真实Goal契约拒绝；改用用户可执行的移入回收站路径，不放宽生产语义。首次内部helper import路径纠正为现有projection owner；无行为补丁。650源码2317imports97边0errors，HTTP仅剩调用；完整用户E2E仍待全量开发。

Feed升格的5项既有HTTP/重启回归亦通过，`/private/tmp/molis-work-cutover-feed-promotion-http.log`；包含Repeat click与Web重启后复用Draft、Inbox保存/开始后保持绑定，以及Runtime只填入上下文而不发送。

## Feed请求处理与Node HTTP入口退出

Native Feed按来源/账号请求、Item/Attention请求、快照/导入组合三组实现原路由handler；请求字段校验、返回状态/错误分类与relay user_confirmed门禁均由产品owner持有。Host注入同库应用工厂、Goal promotion、加密内容hydration、Relay能力及Workbench渲染callback。Native不导入Host/Workbench/Modules实现，不拿数据库连接；返回纯route response。

Node method/path入口判断、body读取/限制、GET/DELETE可选body、response headers与序列化留Local Host transport文件。保持原错误捕获边界、45秒同步deadline、mutation后的invalidate时点、OAuth callback redirect、preset与Inbox引用校验和Runtime autofill，不更改URL或UI。旧root feed-native-plugin-http删除，Web caller改Host公开入口。验收Native routes、Source/Connector HTTP、Feed/Inbox promotion重启与错误回归、定向build/root类型/包边界；全量Web transport拆分仍在后续执行。

Feed handler/HTTP切片定向Native+Host build及root编译通过；28项Source/Connector/Native route/升格回归与5项实际HTTP/重启回归全部0fail/0skip，日志 `/private/tmp/molis-work-cutover-feed-http-{regression,restart}.log`。Host107行仅Node收发和工厂/renderer装配；Native请求处理154/79/38行，ports23、validation26、错误投影15行。657源码2357imports97边6兼容1旧Huge、0errors；root HTTP文件已删除，边界检查要求改由Native handler生成route table。MolisWorkV1Error专门catch与原generic Error返回完全相同，合并为后者，未新增跨Plugin实现依赖。UI输出或交互未改，最终整体E2E仍待剩余Web/其他入口开发。

## Artifact HTTP组合入口退出

Artifact路由识别、版本读取/导出继续由Native Artifacts提供；Host持有Node收发、Workbench页面组合、请求locale与CSP。新增createLocalArtifactHttp工厂接收Desktop bootstrap字符串，root组合处注入Desktop公开常量，Host不得反向导入Desktop。Goal引用片段继续由Workbench+Native查询组合，保留项目链接prefix由外层一次处理。删除旧root Artifact HTTP文件，不改URL、页面字节结构、错误状态、下载内容或locale求值时点。范围仅Host入口、root caller、边界断言和本文；验收Host build/root编译、现有真实Artifact HTTP精确版本/只读状态/错误/语言/多项目回归。此切片不新增业务或通用transport框架。

组合边界补充：主题script、图标与基础stylesheet组合归Workbench的Artifact页面入口；Host仅传view/locale/desktop bootstrap等输入，避免新增Host→DesignSystem依赖。保留原低层page渲染API供已有UI测试使用。

Artifact入口切片Workbench+Host build/root编译通过；8项真实HTTP和引用UI回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-artifact-http-{build,regression}.log`。658源码2365imports97边0errors。

## 首次使用的本机状态入口退出

onboarding.json是Local Host安装级用户设置，不是某个Project/Goal业务事实。将现有170行读写、规范化、版本提示与完成/跳过操作迁至Local Host唯一onboarding入口；不改变schema、home默认、临时文件命名/0600/rename写入、异常读取默认值或引导状态转换。现有只读安装manifest版本检测保持。root Web唯一生产caller改Host公开API，删除旧入口。范围仅文件归属、caller及边界和本任务文档，不拆出通用设置框架；验证既有Web onboarding创建/跳过/更新/重启场景与Host build/root编译。

Onboarding Host build/root编译及3项真实Web首次跳过、真实Project/Draft/Workspace创建、按安装版本提示回归全部通过，日志onboarding-{build,regression}。

## Capsule只读页面投影退出

保留Desktop现有Capsule Shell与客户端交互；将旧root Capsule的只读UI分组/排序/文案投影归Workbench，消费既有Goals公开视图与AvailableGoal。拆为视图类型、条目投影、快照选择三块；Host只绑定请求locale，Desktop shell由root注入函数，避免Workbench/Host反向依赖Desktop。保留待确认优先、活跃focus置顶、近期完成显示窗口、继续项Available顺序和priority、阻塞/等待顺序、菜单计数、空状态、route prefix与无项目拒绝；不写任何Goal/Run/Attention状态。主题脚本仍归Workbench，Desktop实际HTML输出保持。范围含上述owner文件、直接caller/测试与边界；验收既有Capsule全部状态投影和真实多项目/语言HTTP回归、定向build/root编译，不引入新的通知或Attention协议。

Capsule Workbench+Host build/root编译通过；11项状态/浮窗回归与2项真实多项目隔离/语言切换HTTP回归0fail/0skip，日志capsule-{build,regression,http}。663源码2387imports97边0errors；Host仅6行locale装配，Workbench条目投影/快照选择/类型分离，Desktop原样。

## PTY WebSocket与零业务兼容入口退出

PTY Socket是Local Host HTTP消费者的传输adapter：迁至Host，保持/pty upgrade的本机Host与同Origin门禁、首帧token鉴权、消息/错误投影、spawn attach/replay、write/resize/kill、session输出callback及服务关闭killAll。实际PTY启动继续消费Runtime Host公开入口，不把Session/Goal事实或node-pty实现放Host。Host声明原项目已使用的Runtime Host/ws依赖，使用现有锁定版本，不新增供应商或协议。所有直接caller改Host公开入口，旧Socket删除。另删除零生产caller的Desktop Shell、PTY Host、Visual Foundation兼容重导出，测试改直接owner；保留实测而删除只证明兼容文件够短的断言。验收真实PTY输出持久化/重启、HTTP鉴权/PTY回归、构建和边界；不启动现用Runtime或修改用户安装。

PTY Host build/root编译、6项持久化/Workbench回归和9项实际终端回归0fail/0skip，日志 `/private/tmp/molis-work-cutover-pty-{build,regression,http}.log`。覆盖token/启动/attach/错误前置检查/工作目录/面板kill与Session输出重启保留。离线依赖安装第一次受沙箱缓存环境影响要求清空modules（未清空）；使用原缓存环境获准安装成功，118解析/82缓存/0下载，日志pty-install。workspace inventory同步声明Host→Runtime Host与ws，未放宽owner禁区。664源码2393imports98边6兼容1旧Huge，0errors；root Web只剩server.ts 3175行。

## Goal Web读视图与缓存退出主HTTP

Native Goals已经拥有GoalsDocumentView、动作/显示状态投影和解释文案。迁入旧Web视图的Goal关联事实索引、单Goal详情投影、普通/归档/回收站筛选及fallback选择；按索引/单项/集合拆开，消费当前公开Goals查询、InputBindings、Execution查询与生命周期callback，不导入Host或Workbench。保留读取顺序与每Goal时钟求值、事件关联去重和倒序、GoalTree触及对象、Rewire/Candidate关联、项目policy合并顺序、有效evidence criterion和pending review标签。Host组合Project导航、隐藏内部board id、Feed不带正文的目录快照、Relay/catalog/auth状态与请求locale。缓存继续使用原databasePath+eventCursor+完整optionsFingerprint（含locale/projectRoot/导航），不新增失效策略或永久缓存。

唯一裸events SQL从HTTP移至Storage既有LocalSqliteJournal的倒序读取操作，保持字段转换与损坏payload返回null；不新增表或重复事件事实。Host绑定该读取端口。调用签名buildMolisWorkWebView/cachedMolisWorkWebView不变，root实际caller和测试消费Host出口，HTTP退出实现。验收现有Goal关联事实、回收站/归档、覆盖、缓存复用/失效与语言切换实测、定向build/root编译和边界；此次不动写路由或授权契约。

Goal读视图切片通过Storage/Native/Host build与root编译、7事实/迁移回归及10状态/事件关联/缓存/语言回归，日志web-view-{facts,http}。首轮类型检查纠正真实presentation import路径、2参数生命周期消费端口、未使用import；Host仍逐Goal调用原clock默认，不提前取统一时间。事件SQL保持原倒序/转换，Host返回字段顺序也保留。Native索引111行、单项142、集合54、端口14；Host视图/缓存84行。669源码2434imports98边0errors，root server减至2804行。

## 本地Web鉴权与静态资源收发退出主路由

Host拥有现有HTTP JSON body读取/响应、本机Host与Origin/token鉴权及一次性操作键状态。逐字保留GET/HEAD行为、API mutation匹配、键长度、成功finish保留/失败释放、4096淘汰顺序和原错误语言，不重设计安全协议。静态资源handler通过现有Workbench renderer函数接收内容，PTY文件路径仍由旧入口import.meta.url解析并注入callback，保持源码/打包位置查找优先级；保留ETag算法、304、HEAD与缺文件响应。root只装配并调用Host出口，PAGE_CSP保持当前字面值。范围限定Host transport、root caller及检查/文档；验收既有真实鉴权/重复提交/资产缓存/PTY回归与build，不加通用HTTP路由框架。

Host build/root编译与3项真实Web本机鉴权/项目资源/健康检查回归全部通过，日志web-http-{build,regression}。实际覆盖恶意Host/跨站/缺token/重放拒绝、Workbench CSS/JS与PTY脚本ETag/304。671源码2444imports98边0errors，root server减至2633行；原文件路径callback仍从root入口解析。没有未结束的构建或测试。

## Session Web资源装配与旧兼容入口退出

Host负责打开Registry、组合Runtime router/Codex transport/Work目录内容Handoff及TUI recorder，保持现有懒启动与关闭顺序；Web继续持有同一个资源Promise并处理相同失败路径。项目会话视图仍调用Native Work buildWorkSessionView，Host绑定文件存在与Workspace标准化，Desktop runtimeTitle通过显式函数注入。旧Panel到Session迁移投影归Host，消费Catalog与Private Work Context公开migration API，原before_step事务故障注入、幂等与旧事实保留不变。直接caller全部改公开owner；旧session兼容/types文件在最后caller退出后删除，测试按实际类型/错误owner导入。范围包括Host资源与迁移文件、root Web/MCP callers、直接测试/边界和既有Work依赖声明；不改变Session协议、启动策略、迁移表或UI。验收Host/root编译、迁移回滚/重试、真实Session HTTP隔离、Codex与fallback完整项目操作路径及包边界。既有完整用例覆盖此装配改动，不另写镜像测试。

Session资源装配Host/root编译通过（首轮仅root两个旧unused import，已清除）。11项真实迁移、Registry、HTTP与Codex/fallback全路径回归0fail/0skip，日志web-session-{build-final,regression}；边界673源码2458imports99边0errors。Host新增既有Work workspace依赖，离线安装0下载。旧session compatibility/types无caller后删除，MCP迁移消费同一Host实现；服务关闭仍按recorder→owned transport→registry顺序。

## Runtime与常驻Web服务设置HTTP退出

Host持有Runtime接入及Web Service管理，迁入根Web已有GET状态、POST plan/confirm的HTTP适配。保留明确confirmed/declined、同一service实例的plan状态、Runtime成功状态集合、返回400/409/202/200、finish后执行restart及错误日志顺序；serviceProcessId仍读取同一环境变量并给health复用。该handler只消费现有Host服务，不改变安装、重启和外部配置协议，也不实际操作用户服务。范围限Host设置handler与root调用/import；验收既有真实Web Runtime与服务确认/拒绝/重放/重启响应回归、Host/root编译与边界。

## 本机项目设置与迁移HTTP退出

Host持有Project Catalog文件生命周期，迁入已有项目list/create/rename、Demo create/reset/remove和已明确确认的Legacy DB迁移HTTP适配；调用原Catalog实现，不移入或重复业务规则。Desktop仍在入口提供带Panel adapter的Catalog runner，Host只接收有类型的callback，不反向import Desktop。请求校验、idempotency key生成、错误身份/文字与status、数据分类、返回路径/字段及Demo局部return保持原样。共享项目导航/设置投影与安装manifest/launcher诊断归Host只读Web适配，保留读取时点与错误分类，不修饰内部路径展示。范围含Host相关文件、root caller与公开出口；不改变安装manifest或旧DB迁移协议。验收现有设置确认流程、Demo隔离/重建/删除、Web旧DB迁移成功与失败恢复、编译和边界。

Runtime设置Host/root编译、3项真实HTTP设置/服务确认/health回归通过，日志runtime-settings-{build-final,regression}；重启202与finish后kickstart得到实测。项目设置Host/root编译、4项设置/Demo/旧库迁移及失败不变回归通过，日志project-settings-{build-final,regression}。首轮编译分别纠正Host内部Action类型的实际owner与root已退出的unused import；没有改产品语义。最终676源码2478imports99边0errors、diff通过；root Web2252行。全部构建/测试已终止。

## V3 JSON业务导入与最后Board SQL退出

旧src/v1/migration.ts把V3安全字段转成Draft Goal、part_of树及legacy coverage，并在同一个immediate事务初始化Board、设置首Goal指针和记v3.imported事件。Native Goals接管原映射/排序/安全ID/错误与报告，消费有限Goals查询/命令及Host事务端口。Module Goals扩展内部legacy导入完成命令，拥有原nullable active_goal_id更新与最后审计事件；Repository原setActiveGoal允许null供空导入，正常用户setActiveGoal门禁不变。Host提供原公开importV3Board(store, coordinator, legacy, input)装配，SDK保持该函数签名，所有caller用新owner，旧文件删除。

不把V3 accepted/satisfied/Claim/Evidence推断成可信事实，不改变schema版本、时间取值点、事件顺序或已有Board拒绝覆盖。范围包括Contract内部命令、Module/Native/Host、SDK/direct caller/边界与定向测试。验收现有V3字段/覆盖/故障回滚/重启读取；补最后v3.imported事件失败导致整个新Board/Goal/coverage/receipt回滚与重试成功、空Goal导入保留null指针。编译按Contracts→Goals Module→Native→Host→root；既有真实CLI/MCP import路径在后续Host composition退出时一起验证。

V3导入Contracts/Goals Module/Native/Host/root编译与8项真实迁移回归通过。新增final-event ABORT断言Board、Goals、关系、coverage、events、idempotency全空，修复触发器后同请求成功且不能覆盖；空Goal导入保留null。日志v3-{build,build-final,regression}，首轮Host访问Native应用不存在的query已改用既有store.goalsQuery公共读取，未暴露Module私有字段。

## 唯一Local Host运行时装配退出旧root

前置V3业务已退出，旧composition剩余Runtime创建/关闭与能力注册真实归Local Host。将Host现有通用LocalHost实现从index移到独立文件供同包引用，公开入口保持；将项目runtime类型/引用标准化/类工厂与能力注册分开，Goals注册保持原逐条有限映射，Plugin Development注册保持原初始化与private storage/UI依赖装配。所有Web/CLI/MCP和测试改Host公开入口，旧src/local-host/composition.ts删除。保持实例共享、storage identity门禁、并发打开、typed call串行、active use关闭等待、构造clock/planningMethods快照及hook顺序；不重设计Host状态机或修改业务注册行为。

范围包含Host新增composition与register文件、index、旧入口/direct callers及静态owner检查。验收Host/root编译、真实CLI/MCP/Web共享Host一致性、并发/重开/关闭等待、命令/提案入口、边界反例检查。静态检查改到真实注册owner并继续检查公开应用调用，不能删除门禁或放宽SQL限制。

Host装配与注册退出通过Host/root编译、30项共享入口/并发/重开/恢复/命令/提案/边界反例回归，日志host-composition-{build,build-final,regression}；编译暴露同目录Plugin Development caller，已改公开Host import。LocalHost实现原样搬到同包local-host.ts，project-host112行只构造/生命周期，project-capabilities187行只注册。下一步同目录唯一剩余Plugin Development状态目录装配也迁Host：保留marker版本/非空普通目录拒绝、独立development.db与finally close，CLI改公开出口；不改变Plugin执行器或授权。

## 首次引导HTTP与输入校验退出

Host接管根Web首次引导status/dismiss/initialize/page收发，按原序确认输入→Project创建→Host capability创建root Draft→可选Workspace→引导完成记录→返回201；后半失败保留已有Project与recovery_path，完成记录失败仍成功返回journey_warning。输入校验保持文字/长度/意图、绝对且存在目录、支持Runtime和CLI可用；Native Goals继续验证和持有Goal事实，Workbench继续提供意图/规划文案和页面，Desktop行为与CLI检测通过端口注入。保留draft/abstract状态、原title生成和idempotency、首次/版本更新模式及语言作用域，不新增自动启动TUI或Runtime binding。范围Host onboarding input/HTTP与root caller；验收已有首次跳过、真实Project/root Draft/Workspace、版本更新与校验/恢复回归及build。

引导Host/root编译及3项真实首次跳过/创建/版本更新回归通过，日志onboarding-http-{build,regression}。Plugin CLI样例首测因Node SQLite ExperimentalWarning混入stderr使JSON断言失败，未据此改生产行为；以NODE_NO_WARNINGS=1标准化该次测试后复验，结果见local-plugin-dev-regression-clean。这是测试运行环境差异，首次失败日志保留。

## Goal Web写请求退出主HTTP

根Web约千行Goal写路由属于Native Goals产品操作，沿用Native Work现有method/pathname/readBody/respond传输端口形式迁移，不引入新的HTTP框架或Node依赖。按创建Draft、编辑Draft、Relation、Risk/Impact、Policy/Project Guidance、Human Review/Evidence、生命周期、Proposal决定分组，公共上下文只提供现有Goals命令/查询、Execution验收、有限Proposal应用、snapshot与cache失效callback；不传Host、Store、Module实现或任意执行函数。

逐条保留当前HTTP匹配、body读取和decode时点、校验/错误捕获范围、web-user authority、用户原话/整体确认、幂等键生成及响应字段。尤其新Goal创建与后续关系添加仍是原调用顺序（本轮不改其事务语义）；Human Review仅成功后删当前view cache；风险拒绝改回mitigate、依据引用、proposal risk repair分支保持；已接受Goal不能通过Draft输入越过Module门禁。Root在原位置调用Native组合函数，外层500和本机授权仍归Host。Scope仅这些路由/helpers/types、root调用与被迁移owner的边界检查。

验收真实Web创建/草稿/Relation/Risk/Impact/Policy/Project Guidance/Human Review/Evidence/active/archive/trash/Proposal决定回归，Native/Host/root编译、原边界反例；不以新镜像测试替代现有持久化与状态转换测试。其他读页面、引用打开、规划及Session/Panel装配后续继续退出。

Native Goals HTTP切片Native/Host/root编译、17项真实写入/决定/生命周期回归0fail/0skip（日志goals-http-{build,regression}），公共边界检查695源码2564imports99边0errors。root1047行，8个有界请求组消费32行端口，无Host/Module实现依赖。检查随真实调用改为Native路由分发与命令端口，同时覆盖各组SQL和实现import禁区。Plugin CLI标准化警告后的完整样例1项通过，包含真实打包/安装/权限拒绝/独立目录/重试/Artifact UI结果（local-plugin-dev-regression-clean）。

## 剩余Web装配退出计划

剩余根Web主要是平台装配，按真实资源边界退出：先Work Panel/Session和项目引用HTTP装配，再个人/项目规划路由与读页面，最后Catalog路由和HTTP服务生命周期。Host绑定既有Work/Goals/Artifacts公开操作、存储与请求locale；Desktop仅通过类型明确的平台端口提供Catalog Panel adapter、launch/env/prompt、Shell renderer/bootstrap和CLI检测。Workbench仍拥有HTML/JS/CSS和页面选择，Node收发/资源生命周期归Host。root保留可执行入口与源码/打包位置PTY资源路径，不把import.meta路径搬错位置；WebServerOptions公开签名保持。

验收保持URL/顺序/headers/cache、Project选择纯只读、Session repair/unlink与原工作目录隔离、Feed上下文材料只读权限、Reference错误status/CSP、planning个人保存后的原Host重开时点、启动/关闭/定时器与原transport所有权；现有真实HTTP和Session/PTY测试复验，并更新静态检查到真实owner，不放宽边界。每个子切片先编译与针对性回归，最后再做用户要求的整链E2E和总审。

Work装配Host/root编译通过，Session/PTY/Workspace39项中38通过；发布版本检查发现旧Feed源路径（真实已迁Host），已机械修正Desktop verify-release-versions路径，单独失败用例复验通过。随后3项实际Evidence locator/Runtime工作目录/Git worktree引用HTTP回归通过；原失败与修复日志work-http-{regression,release-path,reference}保留。规划HTTP按计划迁Host183行factory，保持Workbench渲染与原个人/项目保存、个人全Host关闭时点；Host/root编译通过，回归执行结果随后记录。

规划5项UI/路由+1项真实Web设置方法全链回归通过（web-planning-{ui,http}）。读页面Host/root编译、8项文档/Artifact引用UI与4项真实项目/证据/回收站/归档HTTP通过（goals-read-http-{build-final,regression,web}）；首轮修正把独立Artifact Host helper误列为Workbench renderer端口的类型错误，仍消费原Host helper。root628行。

最终Web入口切片将仅剩的Host组合分为web-composition（平台函数绑定）、web-routing（只读Project选择/fixture）、web-catalog（全局页面与设置分发）、web-request（项目请求分发）、web-server（HTTP与资源生命周期）、web-types（原公开options）。Desktop新增web-host提供原Shell/Panel/CLI检测端口，声明已有Runtime Host workspace依赖；Host无反向Desktop import。根Web只保留原CLI执行入口和import.meta解析PTY资源位置，公开createMolisWorkWebServer选项保持。静态调用链检查迁真实web-request并保留旧入口无业务构造门禁；最终验收真实Web健康/鉴权/locale/项目导航、Session/PTY、Feed/Artifact/Goals写读、命令symlink与关闭顺序。

最终Web切片Host+Desktop+root编译、完整Web/desktop-tui/Session/Workspace **98/0/0** 通过（final-web-regression）。平台依赖离线118解析83缓存0下载，未升级外部版本；首轮声明生成要求ArtifactHttpContext可命名，已导出原文件内类型，未改HTTP行为。迁移脚本中途未识别Desktop export-star，检查实际shell/advance-prompt owner后完成剩余写入；原root在此之前未切换，未重放前半。最终根入口57行，Host composition53/routing78/request183/catalog116/server136/options53；707源码2701imports100边0errors，旧Huge计数0。这里的0只覆盖已有检查清单，不代替最后全仓Huge/调用链审查。所有测试已终止。

## 卸载Catalog读取装配退出

旧root uninstall仅剩只读Catalog inspection与Demo删除装配。Host改用现有Storage LocalSqliteStorage({readonly:true})打开同一路径，继续消费Projects公开inspectProjectCatalogForUninstall，保持缺库无项目、非本产品owner冲突、损坏库错误与finally关闭，不触发任何迁移。Demo删除通过Desktop提供的Catalog runner调用原Host生命周期。Desktop公开工厂保留原options默认值，CLI/测试改新入口，旧文件删除。验收原卸载preview只读字节不变、保留用户Project、明确purge确认、版本恢复、拒绝外部Catalog及真实CLI预览；不执行用户真实安装的卸载。

卸载Host/Desktop/root编译与边界709源码2713imports100边0errors。回归首测安装fixture触发source.build_stale：自完整构建后持续迁移导致安装器正确拒绝旧build manifest，未执行安装/卸载动作。当前运行pnpm build刷新完整包与正式manifest，再复跑卸载测试，不通过仅重写manifest或调用install:local绕过门禁。日志uninstall-regression和full-before-uninstall-build保留。

卸载完整构建后6项回归全通过，覆盖只读旧Catalog/外部owner拒绝、真实CLI预览、用户项目保留、purge双重确认与服务失败恢复（uninstall-regression-final）；测试临时Home已由fixture清理。

## MCP工具分发与宿主装配退出

旧MCP入口530行同时承担stdio、工具参数适配、Runtime权限与Session/Project资源。App MCP接管现有V1工具switch，通过公开HostClient调用Native Goals capabilities，使用有限的错误工厂、Evidence工作目录与用户确认authority callback；保持所有工具名、payload转换、JSON格式与base URL取值。Host接管Runtime连接、foundation迁移、权限门禁、Panel链接、Catalog与Session活动生命周期，Desktop提供实际Catalog runner；根server保留原构造签名兼容出口与stdio执行入口。顺序保持foundationReady→权限→Panel链接→context或V1分发→活动记录，显式注入Host不得被关闭。

范围为App MCP分发、Host MCP server、Desktop平台工厂、root薄入口及相关公开出口/静态检查；不改协议、身份来源、写入授权、Session刷新或错误分类。验收App MCP→Host→Desktop→root编译，现有MCP权限/Context/Session活动/Skill旅程与共享Host回归，真实stdio协议，包边界检查。静态检查跟随实际分发/装配owner并继续禁止直接业务构造，不弱化断言。

MCP App/Host/Desktop/root编译与边界713源码2752imports100边0errors；44项MCP权限/Context/Session活动/Runtime完整协议旅程/共享Host/CLI跨入口与边界回归通过（mcp-regression）。实际dist/mcp/server.js stdio initialize与Runtime工具可见性通过；首个手工断言错把原serverInfo.name写成molis-work，核对原catalog的molis-work-mcp后纠正断言，未改产品。根入口48行，App dispatch219行，Host server225行+authority107行，Desktop11行。公开构造参数与close所有权保持；base URL仍只在contract工具读取。脚本第一次不能识别export-star的normalizeRuntimeWorkContext，检查原project-catalog owner后完成，未重放已切换的入口。

## CLI项目命令与本机命令装配退出

App CLI接管现有V1 switch及公共HostClient命令/查询调用；Local Host接管prepare storage→payload解析→按输入生成Project引用→withScope→仅关闭自有Host的顺序。help仍在读存储前返回，非法payload保留已有目录副作用与原错误时点。root v1/cli先只留兼容出口，实际caller可按Host公开入口使用。Host声明已有App CLI workspace依赖，离线同步锁，不引入外部库。

之后本机CLI安装/service/demo/uninstall由Host装配既有服务与Desktop Catalog；App CLI保留顶层命令选择与错误/帮助输出，Host本机适配保留现有preview/confirm与操作结果文字。根cli/main仅注入原import.meta默认安装源目录、真实平台Catalog和可执行判断；不能把安装默认源误改到workspace包目录。Plugin CLI仍通过原tooling包公开入口。范围CLI/Host/Desktop/root、workspace清单锁、静态caller与回归；不改变确认门槛、安装产物、命令名称或默认源语义。验收参数优先级/help/错误/URL、CLI和MCP同一Host、V3导入拒绝覆盖、真实CLI只读预览、隔离安装卸载及Plugin样例；完整build后才做涉及安装freshness的回归。

CLI/Host/Desktop/root构建及边界719源码2784imports101边0errors；11项参数/help/错误副作用、V3 import、共享Host、命令与Proposal/查询实际调用链回归全通过（cli-regression）。Host新增App CLI依赖，离线沿用现有缓存连接，0新外部依赖。沙箱内pnpm找不到原store写权限而触发no-TTY模块替换门禁，未执行替换；用此前相同本机缓存的获准离线命令成功同步（cli-lock-final）。涉及安装fixture的测试等待最终完整build刷新manifest再运行。

## 根SDK与零caller兼容文件收尾

所有生产入口已迁入公开owner；root保留三个可执行文件和当前npm公开SDK。保留SqliteMolisWorkStore的既有只读方法及MolisWorkCoordinator公开别名，不让本次包重组静默破坏该版本SDK；Store只转交LocalProjectDatabase/Goals公开读取，不保留SQL、状态判断或第二套写入。移至明确sdk-store.ts/sdk-types.ts；重复Action/Claim/Work状态定义均改为Native Goals已有同名公开类型，不新建定义。

内部tests/fixtures/examples通过公开包入口使用类型、应用和CLI；特定SDK兼容验证通过根index调用，以验证其旧方法与同一新owner数据一致。原v1目录与Desktop薄re-export在caller清零后删除。更新静态门禁到真实owner与SDK兼容边界，移除已不需要的huge-file白名单；不能用删除检查掩盖业务残留。范围仅这些facade、imports、同名类型alias、SDK兼容test及门禁，无数据、协议、状态机变更。验收根SDK旧方法/错误身份/重开读取、owner build/root tsc、现有模块与入口完整回归；最后全仓审计仍按§24执行。

SDK/root编译、139项V1公开SDK/迁移恢复/边界回归通过（sdk-regression），根SDK仍由原V1完整状态机用例通过index消费。42个原Store内部测试/fixture已切LocalProjectDatabase，Web两处只读使用公开goalsQuery及明确Board；原coordinator/type/CLI imports改真实owner。根目录现为SDK三文件与CLI/MCP/Web三入口，原v1/Desktop目录删除；root SDK只保留51行旧读取适配和207行类型别名，无重复Action/Claim定义。边界719源码2784imports101边0兼容豁免0errors。下一阶段先完整build和全量自动回归，再统一真实用户E2E，不因本139项通过关Cutover。

### E2E cleanup: explicit Web Home isolation

Observed: Web --home selected the test catalog while Feed secrets still resolved the default environment Home; one read-only GitHub pull imported notifications into the test project. Bind Web requests and background scheduler to its configured Home using a Storage async scope, without process.env mutation. Cached SecretStore instances must retain their creation Home; content roots use the same scope. Preserve the existing default when Home is omitted. Scope: local storage adapter and Web composition; no account or OAuth changes. Acceptance: two concurrent Web homes, interleaved operations, reused stores, isolated persisted values and fresh-store reads. Validate feed-security, focused HTTP integration, build and boundaries.

### E2E cleanup: utility surface reload

Observed: Sources registration/sync and Feed Inbox actions save UI state and reload, but initialization always treats the retained Goal URL as a new deep link and overwrites the restored surface. Preserve saved utility surface on reload/back-forward; a fresh Goal navigation still opens the requested Goal. Do not replay a Goal hash into an unrelated restored utility. Retain existing per-project source/item/filter state; no new navigation storage. Validate actual browser Sources mutation/reload, Feed reload, and fresh Goal link, including existing navigation regression.

### E2E cleanup: latest execution and quick record label

Observed completed Goal records displayed the oldest clarifier claim/run after later execution and review. Board snapshot is newest-first whereas UI assumed newest-last. Select latest by started_at/claimed_at with existing ID tie break; keep active claim precedence and repository ordering. Apply same selection to progress overview. Extend the cross-entry real execution/review test to assert the rendered latest IDs/actor, and recheck the completed QA Goal. Add the missing explicit accessible label to the existing icon-only Quick record button; no layout/copy change.
