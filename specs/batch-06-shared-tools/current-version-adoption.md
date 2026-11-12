# 06 现行版本下的资料与同步采用

状态：同版本实施设计已独立复核并补齐采用边界（2026-11-09），产品实现、隔离实证和公共 C 合审未完成。

依据用户最新决定（`79dbf1bdd`）。项目库仍是 2、D1 仍是 6，`process_items`、sync.db、round、Agent SessionIndex 维持 1。[A 接入](materials-ui-contract.md)和[共享需求书](spec.md)的 BSH-05–08/11/13/14 行为、历史及授权要求照旧。[同步合同](sync-cutover.md)管理容量、冻结值、授权、回执、R2 和验收约束。本文细化公开协议路由、本地接管与同版本结构采用。以下是同版本实施替换段，实际采用只在隔离 Home 与本地 Worker/D1/R2。现行结构、原结构、数据接管是三个可单独观察的事实。

## 永久封旧与同一公开集合

公开选择、请求 namespace、PortableVersionBundle 仍用精确五元组 `N = ["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1]`。D1 原 namespace 行是旧源；仅这一集合由 Server sync owner 从已经封印的 `cutoverId` 派生内部 journal 键 `A = ["process_items_adopted",cutoverId]` 的规范文本。Auth 推导的 space 始终是另一个 SQL 键。此分区记录一次不可逆数据采用，客户端的 schema、发布者、签名和业务身份取值都一样。公共请求只接受原合法 namespace，任何内部键直接拒绝。账本、events、heads、pins、receipts 用现有 namespace 列；原五元组的行、原计费和原指纹都留在原处。比在同一 heads 上覆写简单，旧历史/终态无需再保存一份影子头。

采用后的调用保持现行 /v1 形状，可用一个只供 Host 的明确 scope 请求头携 `cutoverId` `X-Molis-Process-Items-Cutover`。GET cutover status 可恢复 ID；它只定位封印，授权来自 Auth、实时 policy/历史同意及当前 phase。解析器以可信账号和精确 N 判路，内部 A 只由服务端构造。只有完成态、已选择并匹配该封印的 scope 才能走现行读写；错、缺或陈旧 scope 无法触达 A。客户端以它提交 N 时，服务器仍只接受精确公共 N；历史专用入口同时核真实旧引用。Host 的当前接管设备经本地 owner 屏障才发活动流上传。同账号持有 Auth 凭据者可自行发符合现行策略的新版请求，现有 Auth 只有账号身份，Host 的设备接管步骤不作为服务端身份声明或放权依据。

| 入口 | 原客户端与采用后入口 |
| --- | --- |
| policy、round | 保留一份实际 policy revision 与逻辑选择，`sync_policy.namespaces` 供 SQL 查实际分区。封印后，无 scope 的旧视图永远隐藏 N，旧 PUT 提交含 N 拒绝，其更新其他集合时在同 revision CAS 内保留已采用的 N 选择和 A，不可覆盖或反开。scope 命中且 complete 时普通 PUT 才可关/开现行 N，物理值仍为 A。seeding 不公布 N。round 依各视图的选择查询真实 heads，返回时 A 投影回 N，`format:1` 和四字段保持。 |
| changes、archive、restore | 无 scope 的旧请求只允许同账号、原 N、原 operationId、原 fingerprint/restore tuple 的精确 receipt 重放，零新增；新操作在实际 SQL 拒。scope 命中时进入 A 的独立 CAS 与 receipt，同 operationId 在 A 的确认只来自 A 的实际原回执，永不复用原 N 回执；旧 outbox 也从不附现行 scope。seed 使用专用服务端 opId 与 base=0，只从 seed 路由写。普通写无权冒用；A 的任何首写实际 SQL 核旧 N 的 terminal/deleted 头，终态 key 永不复活。 |
| blobs、history、trash | 所有入口沿相同作用域映射。旧普通读取拒，普通 trash 在分页前排除封旧 N，A 按授权可见且返回 N。旧历史专用 GET 在实际查询核 `cutoverId+consentRevision`、保留期和 exact event/ref，导出正文、archive/restore、原修订与实际附件可供 owner 隔离恢复。旧新建 reserve、part、ready、pin、purge、显式 trash claim 在各实际 INSERT/UPDATE/DELETE 拒，不能只查请求开始。现行/旧历史和合法其他集合的 R2 GET 都在 await 后复核当前 grant/选择、合法 ref 与 generation，Host cache 交付同查。 |
| 账号及其他集合 | 状态、原/新 receipt、预留和 R2 世代以账号隔离。非 N 的现有逻辑选择/分区/客户端不变。对这次封旧标记的 blob，另一集合必须有合法可读引用或实际持有证据才可下载/重挂，合法原有 ref 保持可用。现行 A 的同摘要复用也核 A 的实际来源，seed 特例凭本次计划和 N 精确旧活动引用。 |

沿原 `plan/item → begin → seed → finish/consent`，`adoptProcessItems` 记录本人确认采用，`planId` 在封印时成为 `cutoverId`。封前保同一 policy revision、完整原 N receipt 水位（含 archive）和逐键活跃 head。开始时原子校验计划成员、空 A、实际精确 quota 预留、落封并撤旧选择。plan/item 实际 UPSERT 也拒已封。种子绑定原 key/revision、canonical 冻结值、真实附件和预留；复用现行按字节计费/共享 digest，普通写预留优先、GC 退款回预留，精确重放不重扣。Host 先按 owner 在隔离库读回，再用现有 blobCache+专用计划 namespace 保存实际 canonical 字节，换机/清缓存只有重新得到完全匹配的 wire 才续接。finish 前再经真实 seed 和附件读回核图，SQL 以 A 的 live head/专用 receipt 对原 N 做 anti-join，预留结清才激活。D1 条件失败须 ABORT 整组，零行 UPDATE 后不得继续写。撤回保留计划与进度但拒历史读和 seed；本人重授权接续原切换。原主图、归档、pin、trash 的原期限照原稿，旧当前正文完成后 30 天可 GC，保留旧 head/receipt；清旧当前正文不可把曾采用的原活动 key 标为 terminal。R2 优先沿现有对象路径和 ready 冻结的 part/checksum 回收，保同 checksum 共享对象，等真实夹具证明，不先加 metadata。

## 隔离设备接管

- 发起端用旧构建、原 v2 项目和原 N 跑实际 PersonalSync.run，排空冻/未冻队列并拉齐远端。锁下重查逐键头、旧 partition/stream cursor、conflicts/recovery、sync.db deferred。切换后旧构建无法续写，丢响应仅按原请求查旧 receipt。新 Host 不借当前 reader 打开旧布局跑原队列。
- 双 Home 脏设备仍用原 BSH-14 私有恢复件 v1。锁下按旧 v2 owner 逐键保全真实图或删除意图、未冻 seq/key 对应的当时原值、冻结原值/id/base/through_seq、冲突恢复、原 cursor/deferred/必要分块。重开件逐键读回并经现行 owner 隔离验证，再由本人选择接管。旧库/队列在原 lane 可保全；待确认或缺件时不改属、不清旧队列。无同步选择的本地旧资料仍可按同一 owner 规则保全和采用；云端 adoption 不自动替此设备选择上传。
- 项目当前 v2 基线用固定、受信的 `process_items_adopted` SQLite journal 前缀，触发器同名切到现行 journal。绝不按远端 ID 构造 SQLite 表名。旧 journal 不改写；现行 journal 从零，owner 转换在触发器切换前或 applying 窗内完成，拉取 seed 不记普通 changes。sync.db v1 的 partition/stream cursors、deferred/failures、parts/uploads、保护 AAD 以派生的 `[space,cutoverId,process_items_adopted]` 作现有文本键，旧 N 本地记录完整保留。计划缓存再单独键，不能取代活动流或历史实时授权。
- 当前 Home 重启从切换 status 与受信本地接管进度续接。选中集合但尚未接管时，先按完整观察读取 A 逐键实际 heads（含终态）与原 N 的 terminal 清单，和现行项目 journal 的实际逐键 revision、deferred/conflicts、旧活跃面比对；页带同一账号与 adopted 水位，有并发改变重读。completionHead 只是下限，round cursor 只作传输进度。新图先用无普通上传的现行收件路径接齐，终态元数据走 owner 的确切删除/缺席检查，无正文终态不能建项目；有不能安全接收的键保留并暂停采用。已有现行本地待上传值按原 owner 保全，不能在重启时清空。Files producer 改属和来源验证在 `personal-artifact-sync.prepare` 建项目之前。空 Home 依同一路接收完整活动历史及所有非 Files owner；保留期内旧历史可独立恢复导出。只有已接齐的本地设备才发普通 N 带 scope 的上传。未解决分支先保全，归属冲突或原 terminal 交给本人按现行 owner 选可用新操作/新身份，已有原件不回灌旧 lane。重启可重跑只读 head 对账，采用标记取已有封印、本地当前结构和逐键已接收事实；避免另建设备升级账本。

### 独立复核补充：采用前拒绝与终态

以下三点是本方案的实施条件，不能交给版本数值或传输游标推断：

- **BSH-14-A/C：公开请求与本地状态分开。** `PersonalSync.cycle`、手动 `retryItem`、history/trash 和 `blobTransfer` 共用可信 scope 解析；公开 wire 仍是 N，本地 cursor、outbox、deferred、parts/cache 与保护 AAD 使用各自 lane，不能继续以一个 namespace 同时承担两者。当前活动流必须先得到匹配账号和封印的实际 cutover status，并通过本机接齐屏障。旧 Worker 不识别入口、未封或错封时，现行传输直接拒绝；封印匹配但本机未接齐时，仅允许接管专用下载及终态对账，禁止普通现行上传。任何一种情形都绝不退回旧 N 或发无 scope 的当前 outbox。封前准备只走明确的旧源预检端口。policy 的 scoped/unscoped 视图不共用缓存。历史或普通附件命中完整缓存时，除本地 `channel.assert()` 外，交付前须向实际服务端核当前 consentRevision，或当前 policy 加仍有效的 exact ref/generation，并同本次请求开始捕获的授权代次精确相等，撤权后重授也不放行旧请求；远端失权或无法核实就不交付该同步读取。已合法导出的独立本地副本沿原合同保留。
- **BSH-14-F：原升级链用原目标基线。** U1 `platform-upgrade-stores` 和 `verifyUpgrade` 按目标 baseline 精确验结构，N12 同版本恢复也会核前像；不能拿新增 trigger/table 的当前 baseline 验原 1→2 结果。本片选择最窄隔离顺序：在进入当前采用程序前，由保留的原 owner/旧构建及其原 baseline，持真实 Home 租约先收日志（2026-11-12 起从 1 起的库由现行 1→2 直接到新布局，不再由旧构建先升），结束旧 owner 后由显式采用程序取得同一 Home 的实际租约，重新核 exact 旧 v2 与侧文件、恢复件和远端状态再转换。两个 owner 交接间不能写业务；重新取得租约后的任何变化均使原观察失效。当前 U1 不注册 2→2，也不添加仅靠 stamp 放行的分支；普通当前打开继续拒旧布局。原件恢复仍交能识别原基线的 owner，完整采用后的恢复只接当前基线，混形拒绝。
- **BSH-14-D：空项目终态不造业务状态。** 现有 `personal-artifact-sync.prepare` 拒 null，`partitionedReplica.receive` 需要先有项目，故 terminal 清单不能冒充普通正文事件。已存在项目若仍有旧活跃图，必须先验证覆盖该精确 key 的恢复件，再由本人选择，最后由 owner 按该选择删除或隔离；不存在的项目由 Catalog 与过程项 owner 证明该项目及 key 缺席，不为终态建项目、空行或本地逐键 head。可推进传输水位，但每次接管/重开仍重读远端 terminal 证据并核实际缺席；cursor 前进、deferred 入队、completionHead 或采用标记都不是完成证明。需要接收正文的项目先走完整 owner 图验证，再由现行收件路径创建。

## 同版本存储实施

| 载体 | 当前基线和显式隔离维护 |
| --- | --- |
| D1 v6 | 冻结现有 `server/migrations/sync/0001_sync.sql` 为此前 v6 精确起点；加一份本集合 SQL 结构采用脚本（D1 文件序号不参与 schema 版本），装封印/计划及范围、预留、引用保护所需结构和约束，原 `sync_schema=6`。空库初始化按这两份同源 SQL；既有 v6 只在显式本地 operator 路径，先认准确前置表/触发器、锁定隔离目标，再原子执行同一脚本和校验。current Worker 的 `quota::check_schema` 在 Auth 前同时查版本和当前结构必需表/新安全触发器的准确定义；旧 v6、部分结构、高版拒，绝不请求中补 DDL。真实窗口另行决定备份/排空旧 Worker 的全部 HTTP 与 cron（也含只读请求，旧读链仍可能按逻辑选择读到旧流）；旧 Worker 也认 6，且旧 blob reserve SQL 不携 namespace，数值不能保护混跑或旧二进制回退。 |
| 项目 v2 | `PROJECT_DATABASE_BASELINE` 给空库完整初始化当前结构及新 journal；`LocalProjectDatabase.inspectDatabase` 在可写打开前按 owner 做当前触发器/结构检查，已存在同版本旧布局只给明确采用入口，不普通读修补。U1 的同版本步骤无效，且 stamp 不是采用证明。现有 v1→v2 步骤（用户 2026-11-12 定，取代原先「保留原结果形状」）同时建采用后的过程项日志、把过程项触发器改记到它，只动结构、不转数据，从 1 起的库直接到现行布局；这样到 2 的库若还有 Files 过程项与连线，由显式采用程序在现行布局上转换，移动期间用采用日志自己的 `applying` 标记不入日志。真实 Home 已有的旧布局 v2 照旧只走显式采用。用现有 Home owner lease、配对恢复/拒绝与可信数据库身份读检，在隔离维护命令确认 exact 旧 v2、项目、Home/space、安装、sidecar、恢复件和写屏障，备份后每项目一同步 owner 事务做最窄 DDL、转换和逐键回读。保留 `PRAGMA user_version=2`，不调用 `runSqliteUpgrade` 假装同版本步骤，不改 U1 ledger/stamp。当前同名触发器定义不同，旧构建的只读 trigger 检查应拒已采用库，实测。中断同一项目回滚，重入以 exact old/current 结构和 owner 事实判断；陌生混形、外来/高版、未验证恢复件均拒并留原件。历史旧 journal 继续保全，不以清库达标。 |
| A 消费者 | Goals 维持已核 wire，过程项固定绑定只存 exact opaque id/version，由实际 owner 恢复 ref；UTF-16 原范围保在 immutable item。阅读位置搬运精确官方 Files 的项目偏好，原值没有 actor，继续以 live 根权限检查，记录不补造历史个人归属。原 collection 输出、授权及 A 界面行为沿已定稿。 |
| Coding 私有值 | 同一项目 v2 owner 采用中，由 Coding/Runtime 用原整值 CAS 转精确官方安装的 `materials:`/`queued:` 两类行，含非 Files。原可解析 artifact id/version 仍是 fixed；原活动缺精确版本保留待核对。旧队列 workId/正文/意图照旧，字段缺省或 null 仍按原语义取草稿，显式 [] 仍无材料；新队列才按新合同冻结所选 ref。CAS 冲突保原值并重核，不混用新旧路径。范围已获用户决定，不再请求批准。 |
| Agent SessionIndex v1 | Agent owner 在现有 `AgentTextMaterial` 和冻结来源投影加可选 `material_ref/read_revision`。仅随正常已接收轮次的 CAS 写出，现有 reader 的 v1 版本和原字段照旧。旧缺 ref 的轮次显示当时未记录，正文沿原 exact Prologue resource、SDK resume/replay，不重读替换；原成果、原 key/密文格式、旧索引记录和 SDK 历史原样保留。无需 `openNodeRecoveryMaintenance`、重写或加密升级编排。 |

允许写入边界供唯一 writer：Server `server/src/sync/{lib,protocol,round,changes,history,retention,blobs,maintenance,quota}.rs` 和本集合 cutover helper、`server/migrations/sync/`；`apps/sync-worker` 仅本地夹具与验证文档。Host 项目和资料/sync owner（`project-database{,-schema}.ts`、`project-replication{,-triggers,-schema}.ts` 对应现行文件、`personal-artifact-sync.ts`）、`modules/{artifacts,sync-replication}` 及 Runtime 私有值/端口 owner；A 现行合同对应的 Coding/Agent/Workbench。隔离维护入口与 BSH-14-F 改成同版采用，记入现有 specs/CONTRACT-CHANGES，所有版本注册值保留。无需放宽现有门禁。

## 验收与实证限制

- BSH-14-A/B/C/E 沿原矩阵，在真实隔离 Worker 另钉同版的错 lane、猜内部 key、跨账号 cutoverId、旧 policy PUT 回开、同 opId 旧重放与现行独立回执、并发 policy/封印/续播/R2 交错及 quota/GC。受保护引用、老正文与 R2 读回、读到完整图是断言，单比键或计数不够。
- BSH-14-D/F 用精确原 v2 项目与 v6 D1 真实初始化/采用，核原物理旧数据、owner、附件、队列、错高版/混形的拒绝及零结构修补、事务失败、重启和可重入。双 Home 测旧设备离线脏写、丢回执、完整旧件重开、现行收件未接齐时无普通上传、空 Home 完整回读。验证本地 cursor/deferred 与各范围隔离，原 terminal key 首写拒。实际旧 Worker/未封/错封响应下，自动 cycle、手动重试、history/trash 与完整附件缓存均不能回落；同 operationId/digest 在两条流各取真实回执/授权。缓存命中期间撤远端同意拒交付，不能以本地 channel 仍有效替代。先前已通过的现行双 Home 基线只证明夹具可用。
- A 用现行 v1 原会话实件验证读/恢复/重试原资源；新轮次重开核材料完整 ref、读取版本和原正文。Coding 旧 fixed、活动待核对和缺省/null/[] 的三个队列行为逐一读回，验 CAS 竞争、阅读位置缺 actor、Goal exact 快照。沿 BSH-05–08/13 和独立 C/D。
- 已只读核 d2dcffa02 的 `identity.rs`、`lib.rs`、`0001_sync.sql`、`quota.rs`、`modules/sync-replication/src/{index,round,partitioned-replica,blob-transfer}.ts`、`packages/storage/src/{sqlite-baseline,sqlite-upgrade,replica}.ts` 及 project/Agent 入口。无本轮运行证据；未证明同版本结构脚本在真实 D1 的原子执行、源/现行 owner 的隔离读回、真实双 Home 重启。唯一固有边界是既有数值不足以让旧 Worker 安全混跑，真实部署需单独停写、排空及配对恢复窗口。隔离实现有可行路径，无新增用户版本决定。
