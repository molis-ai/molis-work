# 插件同步接入（个人空间本机联调阶段）

`SyncReplicaAdapter.hasProjectChanges(projectId)` 是 owner 对指定项目未结算内容的只读判断，覆盖待提交变化、冻结上传及保留冲突（包括等待依赖）；删除后的键仍须可判定归属，其他项目不能误计。缺少此端口或归属不可知必须报告不支持/不可用，不能返回 false 冒充已同步；它不确认上传，也不授权回收。SQLite owner 通过可信 `belongsToProject(key,projectId)` 投影现有日志键的业务归属，共同 Storage 不猜键、不跨 owner 查表，查询不受上传启用筛选影响。当前 Aggregate、Pages、Images、Workflows 及已有项目分区已兑现；分区映射由可信组合根显式提供，不从输入猜测，失效分区拒绝观察。Todo 已按当前/删除后归属及未确认保留内容判断；Work 已按 work.project 关系及未确认保留内容判断，交接目标不作为归属；Home 文档以 owner 明确的当前/保留内容归属判断；未启用原分区可被动读取，未知归属继续拒绝。常驻项目生命周期已通过实际组合的本地隔离用例，真实云端另行验收。

当前有公共契约、内置 owner 增量适配、Runtime 发现接线、SQLite 持久队列、空间配置页，以及 Rust Worker/D1/R2 隔离实测链路。默认关闭；可信 Host 可配置规范 HTTPS 来源，或显式启用固定 localhost 联调。Worker 的结构化记录与 R2 预留共用 100 MB 原子配额，但尚未部署公网。不要把 Manifest 声明当成上线承诺。

## 作者提供什么

个人 Home 的可信 Host 激活在 `context.sync` 提供 `spaceId/assertActive`，本地空间或裸执行器没有；作者不能从业务输入替代它。app 在 `start()` 返回 `sync: [{collection_id, replica, content?}]` 兑现 Manifest 中的集合。没有实现就保持不可用；未声明或重复实现拒绝启动。Runtime 的 `bindRuntimeSyncCollection` 只查已启用安装，旧句柄在停用、重启、重装或授权/格式变化后失效，附件等待前后也检查。实际 Web 空间复用自己的唯一 Host，经 `runtime-sync-discovery.ts` 发现 Home 与项目中的现有实现，再交给共同协调器；不另建 Host、不恢复外部 MCP、不执行草稿。运行实例的本机键由可信 Host 按 Home/项目分区，网络内容必须匹配当前空间和该分区。当前样例和证据见 `examples/personal-sync-plugin/README.md`。

JSON owner 可使用公共 `createSyncDocument`：把业务数据与技术日志放入同一个条件替换文档，明确 `validate/observe/read/apply`。`observe` 返回稳定键和当前完整内容令牌；只在 previews 外修改的内容也必须改变令牌。`read` 返回已冻结的可携带内容，不保留指向可被修改/删除文件的唯一引用；`apply` 校验并分阶段保存不可变字节，再更新目录，不能执行任务。所有写入都经 `update`，不能另写 sidecar 日志。底层必须原子 CAS（如实际 Runtime 私有 KV 的 compareAndSet）；CAS 冲突明确拒绝，不自动重跑含副作用的业务回调。工具不授予安装或同步权限，作者仍需在运行 contribution 兑现集合，由用户明确选择。

Manifest 可选 `sync: { protocol_version: 1, collections: [{ id, title, schema_version, requires }] }`。集合是用户能理解的业务资产，不是数据库表。`requires` 引用本插件内其他集合，不能缺失、重复或成环。文件夹如果只是正文的结构依赖，和文档放在同一个集合，不制造可取消的半份资产。

SDK 导出 `PluginSyncSnapshotAdapter`、`PluginSyncSnapshot`、`parsePluginSyncDeclaration`、`expandPluginSyncSelection`。依赖展开不会授予权限，不会自动选中新版本加入的可选集合。新增字段须增加插件版本；数据格式版本与插件版本分开。

公共 `createSyncJsonContent({spaceId,authorize,project?,restore?})` 为 owner 已选择的可携带 JSON 提供 1 MiB 内容块和完整清单。`project/restore` 只处理 owner 明确提供的字段及字节，不能导出任意表或扫描 Home；Pages 仅投影正文内嵌图片，Issue 仅投影它的图片列。目录按集合 ID 显式选择 content 工厂，Host 不猜文件字段。未知格式、跨空间/资产、错长度、分块及整体摘要均拒绝，最终仍经原 owner 语义校验和事务应用。

`next({excludeKeys})` 保留隔离项的正向队列，不能删除唯一原件。`receive(event,{retry:true})` 供已授权显式重试和有界临时失败重放：可重访旧集合游标，不能覆盖该键更新的 head，游标不得倒退。永久格式/归属错误必须显式重试；暂时不可用的接收项保留事件，每轮至多重试 20 条，不阻塞同集合健康资产。隔离记录、重放模式与共同拉取游标属于 `sync/sync.db` v5 当前基线，错版只拒绝，不自动补表。

`acknowledge(key,operationId,revision)` 是当前适配器的必需端口：只确认匹配的冻结操作及其已捕获序号前缀，保留之后的编辑，不推进整个集合的下拉游标。Worker 写入响应必须有服务端修订，重放也返回同一修订；已确认 head 的日志重播不得重新应用或制造冲突。历史压缩不删除紧凑回执，也不能让 ACK 跳过另一项资产。

`inspectConflict` / `recoveries` / `inspectRecovery` 读取 owner 的保留事实；用户选择携带刚查看的修订，`resolve` 在同一事务内核对。`restoreRecovery` 必须核对当前修订且不存在待提交、未决上传或冲突，保留恢复前内容，经原 owner 校验后作为新修改排队。分区适配器只映射恢复标识，不直接改 owner 表；同步历史永远不作为执行授权。

冲突对比还返回 `state`：共同 `createSyncConflictState` 根据远端事件、双方完整值和本机编辑世代派生，不是授权令牌。网页确认必须把所读 `state` 原样带回，Host 不接受缺失值，owner 在同一事务核对 `expectedState`；看完对比后又发生的本机编辑也会使旧确认失效。低层可信 owner 主动协调可省略该前提，但用户输入或界面调用不能使用这条直接协调路径，也不能临保存时重取新 state 为旧确认补前提。

contracts 只保存同步类型和 schema；声明解析/依赖展开归 SDK，空间策略解析归 sync-replication。失败使用 owner 的 `defineErrorCodes` 与共同 `ActionError`，不得新建跨层 Error 子类。需要等待关联资产时，在错误 details 中给出 `sync_waiting: true`，协调器不猜其他 owner 的错误码。

私密内容还要保护本机技术记录：contracts 的 `SyncLocalProtection` 是可信组合根提供的同步字节保护端口，不是网络字段，不携带密钥。SQLite owner 可通过 `createSqliteReplica` 的 `protection` 同时密封待发送、冲突和恢复正文；稳定键/用途绑定由 Storage 提供，Home/空间/集合绑定与密钥生命周期由提供方负责。保护模式拒绝明文及解码失败，不降级读取。owner 必须把此选择固定在当前库格式中；这项端口本身不表示 Work 会话、下载缓存或真实密钥管理已接入。

读取完整 JSON owner 内容时，已知的暂时字节不可用用 `kind: unavailable` 明确拒绝。共同文档工具将其转为不带原路径/私密诊断的 `plugin.sync_unavailable` 与确切资产键，不清日志、不冻结半份内容，也不永久隔离；本轮其他健康资产继续，下轮重试。未知异常和语法错误仍按格式失败处理，不能把所有失败都冒充临时状态。

SQLite 的比较指纹通过 contracts 的 `SyncConflictState` 端口由可信组合根传入 owner Context，再交给 Storage。组合根复用公开 SDK `createSyncConflictState`；Storage 不增加 SDK 依赖，也不复制算法。未注入端口时拒绝生成或确认用户比较，不回退到没有本机内容前提的覆盖。

原数据在 Runtime 私有 KV 中的 owner 不直接读取 `plugin_private_values`。通过 `PrivateValueReplicationOwner` 描述可信固定前缀/key、数组及身份字段，以及逐对象 JSON 的投影、校验、护栏和恢复。Runtime 的 `installPrivateValueReplicationJournal` 在原 KV CAS 事务记录真实变化的独立对象，`privateValueReplicaOwner` 接到共同 Storage replica，不另存业务文档。源文档虽然一个 key，独立创作仍分别记账、隔离与冲突；其他私有 key 不选取，坏对象不能堵住健康对象。`validatePrivateValueReplication` 的纯校验先于项目创建和文件暂存；恢复及墓碑只改变所指对象，保留其他对象和目标本机高水位，不复活执行或安装批准。这些端口本身不注册目录、启动实例或授予权限，实际 Host 仍需完整装配及字节验证。

可携带的跨对象关系仍归 Ledger。可信 owner 可经 contracts 的 `ContextHistoryReplication` 注入其公开 `createContextHistoryReplication`：明确来源、分区及允许的关系/目标类型，完整校验同源连续历史后在同连接事务替换该来源。不能让插件读写 Ledger SQL、重放普通绑定动作或借历史恢复执行授权；冲突确认、未采用分支和恢复前提仍由调用方 replica 保证。该端口本身不表示 Work 会话同步完成。

Work 会话是系统 Module，不制造插件 Manifest。Host 用其现有 Module 合同身份作为传输归属（协议字段仍名为 `plugin_id`），单独登记默认未选的“工作会话与交接”集合；同一保护提供方覆盖 owner 队列/历史与共同下载缓存/延迟事件，同一 JSON/R2 codec 传完整聚合。会话当前 v8 被动恢复不携带本机绑定，不运行交接或补发消息；历史引用保留未知定位，不制造被引用的 Goal。此接线仍须实际 Host/Worker 和设备验收，不能把声明或双临时 Home 的 owner 用例当成上线。

快照用完整的 `spaceId + projectId + plugin_id + publisher_id + publisher_signature + collection_id + schema_version` 定位，`source_revision` 只在源设备上有效。`apply(snapshot, expectedRevision)` 的前提须来自目标设备的 `read`，不能传源版本代替。插件自己解释 payload，不导出 SQL、Home 路径、密钥或运行中任务。

## 空间配置与授权

已选集合缺失、停用或更换格式时，整轮明确未完成且不更新上次成功时间；失效 owner 不打开，其余健康集合继续同步。用户原选择保留，不自动以新格式替代；恢复原实例或明确复核选择后才可完成后续轮次。

Storage 的 `createLocalPayloadProtection` 使用可信组合根给出的固定 SecretStore、密钥引用、作用域和完整已存数据检查，复用既有 AEAD 字节实现。密钥与独立身份指纹通过 `createIfAbsent` 初始化；读操作不生成密钥，密钥身份指纹仍在，或仍有受保护数据时，丢失或替换密钥均拒绝读写、不降级或覆盖原数据。仅当密钥和指纹均不存在且没有任何受保护数据时，才可作为全新状态初始化。可信 Host 可在 `SyncRegistration.protection` 提供相同的本机保护端口：共同协调器按集合固定模式，下载分块与延迟事件同时密封；撤掉端口或更换模式拒绝，下载缓存按集合分区、仅在对应 owner 接收后释放。`hasProtectedSyncPayloads` 供密钥 owner 检查共同库中是否仍有受保护数据，不创建缺失的库。业务 owner 自己的正文、队列和历史仍须固定同样的保护；这不表示 Work 会话已接入。

Host 从同一 Manifest 派生 `SyncRegistration.dependencies` 的完整发布者/集合/格式身份。保存配置前验证所选依赖闭包，缺失或未接入时拒绝，不替用户自动勾选。接收的共享策略即使缺失依赖也只阻止对应消费者，其他集合继续；不能用同名但不同发布者或格式的选择冒充依赖。

`SpaceSyncPolicy` 属于 spaceId，而不是某一台设备或直接属于 userId。选择固定发布者、签名、集合与数据格式版本；升级改变依赖/格式时需要明确复核，不借旧配置自动扩大同步范围。未知但合法的旧选择保留供修复，不静默删除。本地空间不允许上传；个人空间由本人配置，团队权限仍未实现。

设备是否自动同步独立保存在该账号 Home 的 `sync/device.json`，不上传为共享策略。首次进入个人空间由 Host 确认；未选择或暂不开启时不后台传输。立即同步是一轮有界操作，不启动计时器；保存集合不改变设备选择。已开启设备在个人空间激活、重启或重新登录后恢复循环，退出或切回本地空间取消在途同步。插件无须也不得各自维护设备开关。

容量从 Worker 的 `GET /v1/quota` 读取，精确准入由 D1 同次写入校验。`SyncReplicaAdapter.next({deletionsOnly:true})` 必须只提供独立删除标记，保留正向上传队列；公共 Storage 与分区适配器已兑现。不能把已冻结的同一资产不确定上传改写成删除，不能因容量满而清队列或停止其他集合的下载。当前计量包含保留的结构化版本和账号内去重的附件实际字节（包括预留）；删除后不立即释放历史版本或附件容量。通用墓碑的 30 天保留、24 小时未引用预留和有账本的私有对象回收已实现并在隔离环境验证；嵌套业务回收语义和正式环境验收仍按主规格推进。

`platform/sync-transport` 的 `SyncBlobReference` 是精确字节的 SHA-256 十六进制摘要与大小，不是文件路径。`SyncContentCodec` 由 owner 在既有注册中兑现 encode/decode，返回共同 `SyncBlobSource`；只有声明给当前事件的引用才能读取。平台不遍历任意 JSON 猜附件。当前 Artifact 将导入文件原始字节及较大版本正文投影到 R2，还原并验证原 digest 后仍经原 owner 原子写入；Goals 使用下述完整聚合投影。小 inline 及 R2 投影是现行两种表示，不是历史兼容回退。各集合格式与原本的适配职责不改变。

上传先在 D1 准入并预留，再按固定 4 MiB 分块传入私有 R2，服务端校验各块和完整 SHA-256 后才允许写业务事件。下载经相同账号授权，分块校验及全体校验通过前不落业务事实。32 个附件请求的单轮预算耗尽后保留回执与本机暂存；已传完成的前缀不会让后续附件饥饿。退出或切换账号后拒绝迟到的缓存/owner 写入。调度、回收与其他 owner 接入范围以总规格为准。

真实 Host 同时核对配置、账号、项目权限、插件生命周期和实现可用性，再注入可信回调；异步等待后重查授权。不能从网络 JSON 传 `authorize` 或自己拼 userId；配置不是授权。Manifest 声明但没有已注册适配器时必须显示未支持。

## Pages 试点

Coding 的固定 `coding.plan.v1` 现行 schema 为 2，可携带计划、原任务和会话/轮次引用，不携带本机目录。目录仍归本机草稿和原规划 Run；执行入口必须以当前授权读取本机完成的 planner Run 并核对原目录，不能把同步的来源标识当成执行许可。缺少原执行时可引用固定计划作只读材料，继续执行须重新规划；不保留 schema 1 读取回退。此拆分不表示 Coding 私有草稿已同步。

`ProjectReplicaDefinition.contentRefs` 仅返回本 owner 验证过的确切证据正文引用。Feed/Signal 消费此端口：Host 将选定引用的原字节交给共同 JSON/R2 codec，下载完整校验并复查账号后，使用目标 Home 自己的密钥重加密。密钥与本机密文不上传；不扫描文件或任意 JSON 猜附件，未知引用、缺原件和坏摘要保留原内容并报错。`validateProjectReplicaRows` 是公共 Storage 的严格字段/归属检查，不授予读取权限。带本机合并投影的 section 写入必须先在同事务 clear 捕获目标状态。

Inbox 的 `attention` 集合是 Module owner 描述符路径的另一个消费者：只恢复 Attention 自己的引用、处置与事件，关联对象由原查询解析，缺失时保留定位。同步写入不触发判断或执行；恢复同键记录抬高目标编辑修订，旧页面仍按原版本提交并被拒绝，不能临保存时替旧内容重取当前版本。

内置 Module 内容在唯一目录用 `scope:'project-sections'`、`owners`、`kind`、`namespace` 描述，不把业务 Module 实现引入工作台。Host 的现有项目库组合根解析公开 owner 身份，公共 Storage `createProjectContentReplicaFactory` 负责事务技术；日志安装也从同一目录派生，不另建逐插件名单。

Runtime 私有文档使用 `scope:'project-private-values'`、固定 `namespace/kind` 和 `owner` 工厂；Host 注入 Home、当前授权及逐对象活动检查，Runtime 只访问声明的 key。Builder 的 `authoring` 是实际消费者，完整文件字节由其明确投影到共同 R2，空文件保留为空；该注册不自动执行或安装收到的代码。项目库当前 v16，旧版拒绝且不改写，真实 Home 维护另行批准。

创作内容接收还必须复用平台合同和实际界面的校验：冻结设计的 Schema/示例、计划/组件绑定、完整发布界面和历史来源均先于项目创建与文件暂存检查。候选方案允许尚无行为示例，但仍校验已有 Schema、示例和组件；平台的只读 `assertProposalContract` 不可替代执行入口的 `assertContract`。历史里声明的能力和资源只是内容引用，不是目标设备的授权；正常执行、模型选择和安装批准仍需目标 Host 的当前检查。可携带合同字段是显式清单，不接受藏入本机目录或执行身份的未知扩展字段。

固定版本由原 Artifacts Module 共同拥有，但成果库与过程项仍是两份事实：同一目录条目的 `scope:'project-fixed-versions'` 明确 `store:'library'|'process'`，分别注册 `versions` 与 `process_items`，各自勾选和记日志。Coding 计划、变更集等固定过程项从原表完整传输，不伪装成成果，也不因恢复启用生产者或继承执行授权。接收完整解码并经 owner 无写入校验后，才创建缺少的目标项目；已有版本不同内容、跨项目 ID 和迟到撤权均拒绝。项目库当前 v16，旧版只拒绝，真实 Home 维护仍需单独批准。这不代表 Coding 私有内容已完成全覆盖。

`openPagesStore(home).syncAdapter(context)` 只供可信组合根/测试使用，不直接暴露为 HTTP 方法。一个项目的文档与文件夹形成一致快照，正文、稳定 ID、收藏及 Goal/Artifact 引用保留；生成历史、导入幂等记录、发布中的意图和本机编辑版本不作为可移植内容。Goal/Artifact 必须通过同空间同项目 owner 检查准确引用，缺失返回等待依赖，不删引用。

原 Store 的触发器在业务事务内增加持久修订计数，并为个人空间写逐资产变更日志。`store.replica(trustedContext)` 将单记录封装交给公共 `SyncReplicaAdapter`；队列由 storage 提供，格式和落库验证仍归 Pages。目标在一个事务里应用内容、游标和回执；远端写入不产生回传。并发冲突保留，用户明确选择版本后双方原文存入恢复日志。这不是公开的跨空间搬迁功能。

正文内嵌 data 图片保留，HTTP 链接仅保留链接、不获取内容；blob/file/本地相对链接拒绝，不能冒充已同步附件。运行中生成、待恢复发布和超限集合明确停止；不绕过保护复制数据库。

## 后续增量接入要求

项目同步的日志安装和内容准备也由同一 `registration.sync` 声明，不向 Host 添加插件名或实现 import：`project-database` 的可选 `install(db, projectId)` 在个人项目库打开、schema 校验通过后、首次业务变更之前调用；普通本地库不调用。`project-sections.owners` 中的字符串只引用 Module owner；插件自己的 owner 写 `{ create(services), prepareUpload?(db, context) }`。`create` 返回 `ProjectReplicaDefinition`，只得到纯 `validateSavedHistory`，发现目录不能启动 SDK；空集合、未知 Module owner、重复 owner ID 均拒绝。`prepareUpload` 仅在选中的集合上传冻结前、已启用且库可用的项目调用，身份取声明所属插件，`context` 提供绑定当前项目/插件/本人及原授权的 `readSavedHistory`、`authorize` 和纯校验。Host 在异步调用前后复查，插件在自己的提交点仍须 `authorize()`；不能把历史导出放进 `create`、`refresh` 或状态查询。此接口是可信目录装配，不改变独立 Runtime 接入状态、不授予新权限，也不变更数据格式。

`ProjectReplicaDefinition.beforeClear` 是 owner 的目标端事务护栏：读取刚捕获的本机事实，在删除任何行前校验，普通替换和墓碑都必须经过。拒绝时不保留可供另一次写入复用的旧捕获；`restore` 只合并同事务捕获的本机状态。Coding 用它保护活动执行和后台命令，恢复会话/计划不携带 Runtime 绑定、执行状态或原确认授权；计划和输入的编辑高水位只留本机，删除和恢复不倒退。其元数据、计划、未发送文本与待答内容是同一一致性单元；Runtime 对话由原执行 owner 导出完整保存档案，被动展示不建立执行绑定。

同步内容接入后，所有正常编辑入口也必须使用同一 owner 和原版本前提。Coding 的 `coding.sessions.update@2` 在修改文本或待答内容时带原读取的 `expected_input_revision`；旧 v1 不保留别名，此动作仍 LOCAL、不新增 MCP 工具。后台读取不能用新版本为未保存的旧输入补权，窗口重载须保留原基线；拒绝时保留输入，用标准对比对话框让人明确采用或按所见版本保存。已接受执行的回执只能清除原版本且原正文相同的文本，不能删除执行开始后继续输入的内容，也不清除待答草稿。

创建缺失的目标项目前，必须先完成当前 owner 的完整纯校验，不能只检查外层空间和标题。Goal 聚合先检查所有 owner 的表/字段、业务关联、共享 Journal/回执家族和稳定事件锚点；坏内容和撤权不留下空项目。公共 `validateProjectReplicaJournal` 与真正应用共用同一格式校验；目标库已有 ID 的归属与外键仍在实际事务内复查。

文件型 Home owner 可在同一目录声明 `scope:'home-document'`、固定 owner 相对路径及 `open(home,{spaceId,storage,authorize})`。可信 Host 只在个人空间注入公共 Storage 的原子文件 CAS；Module 复用 SDK 文档工具，不依赖私有 Storage，也不把业务 schema 下放给 Host。Shelf 是实际消费者：正常动作和同步打开同一目录，材料/结果及终态任务分别作稳定键，原文件字节先校验并暂存成不可变版本，再提交目录；冻结上传不只保存指向可删除文件的路径。空正文保持空文件，不伪装删除或零字节 R2 预留；设置和剪贴板留在设备，执行中相关对象等待，不运行远端任务。当前目录 v2，旧版只拒绝；文件暂存回收仍须独立验证。

新插件实现集合的稳定键、导出、事务应用与语义验证，由可信 Host 注册 `SyncRegistration`，复用队列/重试/传输/配置，不自行调用云接口。多集合须隔离各自日志与游标。声明本身不注册运行时实现；附件依赖、Schema 迁移、第三方 Runtime 接线和完整项目生命周期仍须扩展。Pages 仅同步最小项目定位信息；内嵌 Artifact 有独立适配器。

内置插件在自身 `src/registration.ts` 的 `registration`（由生成器汇入 `BUILTIN_PLUGIN_CATALOG`）按集合 ID 提供 `sync` 工厂表，例如 `sync: { documents: { scope: 'projects', open, content } }`。`builtinSyncBindings` 逐项匹配 Manifest 的集合，不取数组首项；未声明的工厂、不属于自身的继承属性和没有工厂的声明均不注册。每个集合须拥有自己的日志/游标，不用一个适配器冒充两份独立资产。Host 只从该目录派生注册，不另维护第二份逐插件名单；此内置绑定扩展不代表独立 Runtime 自动发现已经完成。首次收到内容可启用从未安装的插件，但不得重新启用用户明确移除的插件；移除事实经 Projects 的公开只读口查询，不跨 owner 读事件表。

同步日志、编辑高水位及策略缓存都属于当前 Store 基线，必须在 owner 当前 schema 中声明并更新版本/fixture/发布表。错版拒绝且保持原文件；同步启动不通过 ALTER 或临时补表修复旧库。插件只能调用 Storage 的公开日志端口，不直接查询它的 replica 表。真实 Home 的备份与重建需要单独批准，不属于代码升级的隐式步骤。

项目私有库在同一目录条目使用 `scope: 'project-library'`、固定 `kind` 和 owner 的 `open(home,projectId)`；共同 Host 负责分区和项目授权，owner 负责安全路径、不可重绑的空间/项目、当前库基线与逐事务日志。炼金术士的 `studio` 是这个入口的实际消费者：整份研究图作为一致单元，终态任务仅保存观察信息，前台模型等待/后台活动时暂拒接收，恢复不能启动执行。不把此内置分区端口当成独立 Runtime 自动发现的完成证据。

Module 的项目内容可通过 `ProjectReplicaDefinition` 明确 `assetKind`、表/字段/范围与语义校验，由 App 组合到既有目录。`project` 是 owner 的纯导出投影，`restore` 只能合并同事务捕获的目标本机状态；例如 Sources 不上传连接配置，在恢复业务描述时保留目标端已有连接。清理和写入必须在同一事务里，不能把本机凭据放进网络快照后再让 Host 猜哪些字段需要删。没有自身项目根表的 owner，由可信组合根向 `installProjectReplicaJournal` 明确传入项目 ID，不跨 owner 申明或遍历根表。事件键来自显式 `assetKind`，不再假定每份内容都是 Goal。

Goals 的 `project_goals` 集合由 Goals、Governance 和 ContextLedger 各自声明可移植字段，Host 组合、Storage 原子恢复。目标关系、决定、约定与工作历史作为项目一致性单元；历史序号在传输中改用稳定事件 ID，恢复时重新映射。不能复制本机 seq，也不能调用执行或批准动作来恢复历史。Goal 引用边只带定位与精确版本，内容仍经被引用 owner 授权读取。聚合不超过 64 KiB 时 inline，较大聚合经同一 `SyncContentCodec` 按 1 MiB 字节块投影到私有 R2，D1 仅存空间、项目与完整摘要清单；完整聚合最多 100000000 字节，最终仍受账号剩余额度限制。所有块及整体验证后才创建目标项目、事务应用全部事实，失败不恢复半份项目。它只分传输块，不拆业务冲突单元；并发修改仍由用户明确选择。

表结构稳定、业务对象可聚合的 owner 可使用 storage 的 `initializeAggregateReplication` / `createAggregateReplica`：明确列出可移植字段、子记录及顺序、语义验证、发布阻塞字段、编辑版本及关联依赖。它不是任意 SQLite 导出；SQL 名称仅来自 owner 常量，网络输入不决定表名。必须在 Store schema 建好后安装事务触发器；不要等第一次同步才开始监听删除。普通本地空间不安装同步日志。

问卷以一份问卷及其答卷为冲突单元；数据表携带保存版本；演示稿保留全部页和备注；灵光按想法/对话分别记录，对话等待关联想法。同一聚合两端同时修改保留双方，当前不自动合并答卷或行。数字编辑版本使用目标端高水位，删除后恢复不回退；灵光时间版本在目标端递增。D1 元信息上限 512 KiB，已接入 owner 的可携带内容通过公共 codec 切片，仍受领域边界、100000000 字节聚合上限及账号剩余额度限制。超限保留本机数据，不截断；没有 owner 字节投影的文件不能据此声称已同步。

回归：`node scripts/run-tests.mjs tests/plugin-sync-foundation.test.ts tests/personal-sync.test.ts tests/personal-sync.e2e.test.ts`。真实 WASM/D1 测试和启动边界见 `apps/sync-worker/README.md`；隔离测试不等于公网生产验收。

Host 生命周期接纳使用 `SyncRegistration.withMutation(scope, commit)`：普通接收、自动/显式重试、冲突选择和本机历史恢复共用异步预留边界，预留内只能调用一次同步提交。等待后的实际 adapter 仍重检 CAS；预留结束后保存的回调已关闭，不能迟到写入。`prepare` 只能做非破坏性准备，不得提前回收/删除。此端口属于可信 Host 装配，不增加插件权限。

Projects 的同步生命周期只在可信 Host 预留许可 `authorizeLifecycle(key,recycled)` 下由 owner 在最终接收事务写入；无许可继续拒绝删除和回收项恢复。目录 v25 的回收记录可独立于项目原件保留未知项目墓碑，不能创建占位项目，也不把墓碑当可见回收条目。真实旧库不自动迁移；常驻 Host 已通过唯一删除服务接线，缺失子 owner 仍拒绝。

项目注册经可信常驻 `ProjectDeletionService.admitSync` 接纳删除和恢复；许可只在最终同步提交回调中有效。旧事件/本人回执/已知冲突不提前释放 Runtime；显式选择和恢复在等待前检查所查看的版本，最终 owner 仍复查。未知项目删除不创建原件；恢复的准备只创建被墓碑隐藏的原件，不改变回收状态。所有已注册子 owner 都需给出指定项目的未结算判断，未覆盖或不可用时继续拒绝，不能以当前接线声明整体生命周期已验收。

可选 `SyncReplicaAdapter.locate(key)` 和共同同步文档的 `locate(data,key)` 由 owner 给出本机位置；共同层不解析业务键，比较界面仅接受同源导航，不把导航当授权。

`SyncRegistration.prepareUploads()` 只在用户已选择的集合每轮下载完成、冻结上传之前运行；用于从原执行 owner 派生完整保存历史。返回按 key 隔离的失败，不阻塞同集合健康资产。`refresh()` 只发现当前目录，不能因为状态查询、接收或项目回收检查初始化 SDK。Coding 保存官方 SDK 导出，不复制 SDK 数据库，不导入运行权限；分页展示完全被动。

SQL 内容 owner 可声明 `ProjectReplicaTable.journalUpdateCondition`，仅决定 UPDATE 何时记录业务变化，可信 `$old`/`$new` 引用行。INSERT/DELETE 保持原规则。运行缓存不能伪造共享编辑；真正终态的新 SDK 历史必须在导出和 ACK 前保持待同步，防止项目生命周期误判干净。

`examples/personal-sync-plugin` 可在独立目录只安装 contracts/plugin-sdk 两个公共包，用 Node 构建并打包；同一默认 PluginDefinition 支持多个 Home，动作必须捕获本次启动的 owner，使用旧内容前提拒绝旧编辑。停用后保留的 replica 句柄必须拒绝读取/写入，不能返回空队列假装已同步。

共同同步文档技术格式 v2 在正常 `update` 删除稳定键时原子保留完整 owner preimage（`local_delete`）；实际 v1 原样拒绝、不做读取转换。未上传且没有后来内容/冻结上传/冲突的删除可按原修订离线撤销，不能制造服务端事实。SQLite owner 用 Storage 的 `retainLocalReplicaSnapshot` 在删除同事务保存原件，私密 owner 仍需传原正文保护端口。不按设备时钟丢弃唯一未上传原件。

可选 `SyncReplicaAdapter.maintain()` 仅执行 owner 有界垃圾清理；正常轮次只调用已选集合，Runtime/分区包装保持同一激活授权。文件 owner 需同时拥有 `SyncDocumentStorage.withReadLock` 和 `compareAndSetChecked`，且共用同一跨进程锁；清理按锁内事实保留当前路径，提交在相同锁内再次验证复用的暂存字节。缺少这些端口只保留文件，不能靠 mtime 猜安全。不得用此端口执行任务或丢弃唯一未上传原件。

本地空间复制使用独立 `ProjectCopyOwner` 数据端口，不放宽个人 `replica()` 准入。`snapshot(projectId)` 仅选定项目，`read(reference)` 仅明确依赖，`fork` 使用可信回执中的稳定新身份及项目映射，owner 明确重映射已校验的引用；正文不是 ID 查找表。kind 由绑定 owner 命名（owner ID 加冒号），未来 Runtime 接线须检查发布者/格式/激活，不允许占用别人的 kind。目标 `apply` 创建一次或验证已有相同结果，拒绝覆盖编辑后内容，最终撤权同事务回滚。当前 Form/Dataset/PPT/Lingguang/Images 已有本地端口，整项目入口、其余 owner 与公共 Runtime 复制装配尚在实现。Images 完整字节与终态记录经同一纯校验，连接和 runner 不入复制；已有删除技术历史时不能重新创建副本。

放置服务的 `previewProjectCopy` 从已检查 owner 端口求明确依赖闭包，原项目新增、删除、修改或依赖变更使旧确认指纹失效；缺失/不可用依赖和未勾选项目会阻止确认。预览视图不含正文，JSON 字节估计不能冒充附件或云端容量。`projectCopyIdentities` 从可信空间和持久操作身份生成稳定新 ID，但不替代持久回执、目标提交编排或完整 owner 覆盖。离线或容量不足允许完整本机副本，显示待同步；复制不改变设备同步开关或集合选择。

`createProjectCopyJournal` 用原子条件文档保存复制计划和阶段，格式 v1，仅保存身份/指纹/摘要，不复制正文或授权。`executeProjectCopy` 在目标写入前持久计划，新尝试接管令旧尝试失效；目标工厂必须把该检查传到 owner 最终事务，异步准备/发布等待后也要重检。准备不发布可见项目，全部内容完成才发布；完成回执重放不覆盖后来编辑。Host 的 `openProjectCopyJournal` 只打开可信个人 Home，不启动 Runtime 或同步循环；项目文件暂存与实际入口尚需装配。

复制尝试结束即关闭被保留的提交检查；每 20 个同步 owner 提交让出事件循环并复核授权，不把大批次期间的退出/撤权推迟到全部结束。Shelf 清理在同一授权下保存扫描位置，Host 的文档注册复用该适配器；关闭账号后缓存仍拒绝读写，重启可安全重扫。

Module 持有的 Home 内容使用 home-store 的 path/owner，Host 从现有 HomeStoreDeclaration.replication 取得工厂并核对主人；插件目录不 import Module 实现。项目 section 墓碑在同一事务以空行集调用 owner restore，仅保留本机高水位，不恢复业务对象。
