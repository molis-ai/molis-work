# Files 同步切换与旧设备恢复合同

**现行版本决定（2026-11-09）。** 用户保留功能和代码范围，明确已有 v2/v6 保持、取消新增升版。本稿原 v1→v2 namespace、D1 6→7 与项目 2→3 方案不再实施，正在按现有版本重定切换合同。原资料/附件/队列保全、精确回执、封旧、授权、quota 与中断恢复验收全部保留；不把改版本号当切换，不清空数据。同版本方案完成并复核前，不能按下文旧版本分流实施。

状态：隔离实施合同（2026-11-09），产品与真实 Worker 验证未完成。本稿承接[共享需求书](spec.md)的 BSH-11／BSH-14，核对基点 `b60adfd66`；独立审查提出的配额、附件授权、旧队列、播种回读与 R2 回收问题，以及增量审查的旧端接管和读取尾检，均纳入本稿。用户已批准本次隔离实现与验证，真实部署、真实 Home 维护和云端迁移仍另约；公共 C 合审未由本地设计复核代替。

## 范围与状态

Auth 推导账号 space。只切 `["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1|2]`。Rust owner 管策略、头、回执、容量、留存及附件。Host 和成果库 owner 校验、转换、接收业务图；D1 继续承载不透明传输值。普通策略、旧客户端、插件或页面不能自报可信来源。

一条账号切换行保存封印、cutoverId、选择的 planId、剩余预留、历史读同意与其 revision、completedAt。无封印为 `open`，封印未完成为 `seeding`，有 completedAt 为 `complete`。completionHead 取本次专用 seed 回执的最大 revision，空集合为 0。旧源水位取 v1 不可变回执末端，含 archive；源分页和 begin 同核 policy revision、水位及逐键活跃头。独立历史在封后按现行保留期读取，封前 pin、历史正文到期或 trash 清理无需另设历史 epoch。影响活跃图的任何新增、恢复或删除都推进原回执水位。

| 请求 | 条件与结果 |
| --- | --- |
| `GET /v1/process-items/cutover` 和有界源分页 | 本人读取 `phase,policyRevision,sourceHead`，封后另有 `cutoverId,consentRevision,historyRead,completionHead,reservedBytes`。源分页返回精确 key/headRevision 和当前状态，后续每页核同一源观察。 |
| `PUT …/plan/item` | 本人显式准备新版后，Host 逐键从 v1 活跃头解码，按同一 2→3 owner 规则转换，并以现行 owner 在隔离库读回完整图。请求带 `planId,expectedPolicyRevision,expectedSourceHead,key,sourceRevision,value,attachments`。Worker 核有界非空 wire，以实际事件序列化算正文计费字节、fingerprint 与附件描述，回传 canonical 冻结值。实际 plan INSERT／UPSERT 同核账号尚无封印、原 policy／源水位和旧活跃头，条件失效拒绝且不动计划。每账号同时仅一份 open 计划，每键一项；源变化须重读。计划 id 在封印时成为 cutoverId，重试定位相同输入。 |
| `POST …/begin` | 输入 `planId,expectedPolicyRevision,expectedSourceHead,enableV2:true,allowRetainedRead:true`。同一次提交核本人选择、源水位、计划与旧活跃 heads 精确匹配、空 v2 目标及足额配额，预留后落永久封印并撤 v1 选择。v2 暂不进入普通 selections。旧源完全为空时，同一规则走零项计划；已撤选且仍有 v1 历史，先在 open 经本人原入口授权预检。配额、计划或 CAS 不符时留 open。begin 响应丢失按 cutoverId 读同一封印。 |
| `POST …/seed` | 输入 `cutoverId,expectedPolicyRevision,expectedConsentRevision,key,sourceRevision,value,attachments`。实际插入核 seeding、有效同意、已冻 plan、旧活跃 exact key/revision、非空 wire、原 fingerprint、v2 base=0、附件实际 ready 且来源合格。服务端派生专用 operationId，仅该入口带 seed 标志。精确重放原 receipt；改正文、来源或未在计划内均拒绝。 |
| `POST …/finish` | Host 先经专用授权只读入口回读实际 seed，下载实际附件、校验 owner 并同封前图逐键比对。输入 `cutoverId,expectedPolicyRevision,expectedConsentRevision`。D1 逐旧活跃头 anti-join，核精确计划、非空 seed event、专用原 receipt、对应 v2 live head、实际 ready refs 和预留结清。一次提交写 completedAt 并激活 v2。重复 finish 返回原结果。 |
| `POST …/consent` | 本人输入当前 cutoverId、consentRevision 与新选择。撤回立即拒读和暂停 seed，已提交结果和预留保全；重授权接续原计划。普通 PUT 的实际 CAS 不能重选已封 v1，完成前也不能选 v2。完成后普通策略可关闭或重开 v2。 |

begin、finish 用单条状态变更及其触发器，或用失败会 **ABORT 整组** 的 D1 batch。任何后续状态和 quota 更新均以成功条件为前提；单独的零行 UPDATE 不算断言。保留普通 `/v1/round` format 1。[D1 事务文档](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## 预留、冻结值与恢复

- 计划只有这一次切换的 key／源 revision／wire fingerprint／实际正文长度／附件描述。旧 outbox 属于原 namespace 和 base，且不是全集合；普通 v2 journal 用来接收和上传采用后的新业务，提前写种子会触发首轮接收冲突；receipt 只证明已提交。使用 scoped D1 计划行预存尚未提交的精确成员和计费事实，完成后删除正文计划和未封计划的暂存，长期只留封印、必要附件保护和原回执。
- `begin` 按服务器实际计费预留：未播种的 canonical 正文 UTF-8 字节，加计划去重后的尚无已计费 ready generation 的 digest/size。就绪的同账号合法共享 digest 只计一次。已有同 digest 但 size 冲突、正在删除或未就绪时留 open，待现行上传／GC 结清再核。预留与封印、policy 写入同提交。普通事件／附件 admission 使用 `used + reserved + charge <= limit`；仅专用 seed 按计划从预留转实际使用。已有收据或同 generation 重用不重复扣费。普通合法写若先充入计划所需 digest，先通过未预留空间 admission，再同事务释放对应预留。GC 删除仍为活跃计划所需的计费 digest 时，将实际退款转回该计划预留。始终维持实际已用加未兑现预留不超过上限。finish 只结清本计划；暂停保留预留。
- Host 在 begin 前把 Worker 回传的 canonical wire 和新编码所需附件字节通过 `blobCache` 放入现有 `sync.db.sync_blob_parts`，使用由账号切换 planId 生成的专用 namespace；wire 用该 canonical 字节的稳定 fingerprint/digest 和长度，附件用现有 digest/size，仍按 part 和当前保护模式存取。重启从受权 plan 页重导 namespace 与 refs，复用同一缓存，不在 sync.db 增表或存指针。缓存核可读后才封，重启优先发送真实冻结值。缓存损坏或换机时，当前确定性 codec 可以从同一旧活跃源重建，但须同整段 wire fingerprint 和各附件 digest/size 逐一相等才发送。随机化或不可重现的 codec 在本切片不接入；未来接入须先证明冻结字节可靠续接。失权缓存保留在 owner 内，禁止交付。
- 封前隔离 owner 回读 + 原 wire 绑定使正常产品路径无法在 seed 时提交另一正文。读回暂态失败保留同一收据，从原冻结值重传尚未完成的附件或重读，保留 seeding。若 owner 校验发现确定性产品缺陷，停住并保原 v1 源、原冻结值、导出和 receipt，先排除 Worker 传输或读链故障。需要更换已提交正文时由 owner 单独裁定恢复，不改同 id 或把错误体发布到普通流。D1 无法证明有本人 token 的非 Host 客户端真的执行过 owner 校验；持本人 token 绕过 Host 可向其本人账号提交业务不合法的不透明值，仍受范围、精确字节、配额和封旧规则限制。正常 Host 收件必须在建项目之前拒绝。若独审要求也能自救，备选仅 seeding 内经同等 owner 预检的单键重备，CAS 撤下未公开的 provisional v2 head/body、保旧 receipt、换新 op 并重新精算预留。先评估此信任边界，无可变通用 seed 机制。

## 写入封锁、历史授权与 R2

- 旧 `changes`、archive 和两类 restore 只在同账号、旧 namespace、原 operationId 与原 fingerprint／restore tuple 精确匹配时重放。现有 archive/history restore 的选择预检需让旧精确回执先行。新事件在实际 INSERT 拒；`history::pin` INSERT、`history::purge` DELETE、`maintenance::claim(explicit=true)` UPDATE 和 `blobs::{reserve,chunk,complete}` 的实际 reserve／part／ready SQL 同核 scope 与当前许可。旧已存在 reserve 或 purge 的提前返回也检查封印。seed 附件绑定当前 consent 与计划中的精确来源。
- begin 同一事务标记当前有 v1 事件真实引用的 blob generation；旧事件到期后标记留到该 generation 的实物回收，防止 D1 删除最后旧 ref 后到 R2 清理之间泄漏。历史 GET 只凭本次 live grant、仍可读的旧 key/revision、精确 attachment ref 和同世代读取；在 R2 await 后、Host cache 命中交付前再次核。普通其他 namespace 若已经有该集合当前可读的合法 ref，继续使用和新挂；否则状态／chunk GET、空字节 reserve 重用与 `sync_events_validate` 新挂全拒绝。v2 seed 可凭同一授权与实际引用该 digest 的旧活跃源复用；计划提前核，缺合法来源时留 open。新挂不能用已知 digest/size 当持有证明。首选用现有合法来源，若夹具发现必须支持已有字节却无来源的合法复用，备选仅对本次受保护摘要用现有 chunk 校验收取真实字节，发给同 generation／namespace／operation 的短时附加许可；没有普通集合的全局来源账本。
- 独立旧历史复用 `history` 和下载 codec，发现并导出保留期内真实 archive/restore、action/sourceRevision、正文和附件。从空隔离项目经 owner 验导出可恢复。旧正文由实际 SQL 同核账号、当前历史 grant、留存资格和精确 event；普通 v1 changes 在 SELECT 时核仍选中且未封。普通 trash 在分页前过滤该账号已封的旧集合。普通 process_items v1 附件 GET、以及同账号其他集合读取受保护世代的 GET，均在 R2 返回前复核当前选择、实际 generation 和该集合合法可读 ref；状态查询同核。合法既有他集合引用继续可读，晚到封旧／撤权／换世代时丢弃结果。撤权拒新读，先前合法导出的副本不回收。Seeding 期间旧活跃头保持可重读；旧 trash、被替换版本和已有 pin 沿现有期限。完成后，维护另选 `completedAt + 30d` 已到、未 pin 的 v1 **当前**正文，绕开现行 skip-current 分支，保留 old head 和 receipt，附件仅在最后有效 ref 消失后按原 R2/配额流程清理。过期立即拒读取。
- R2 首选保 `space/digest/generation/part/checksum`，无新 metadata。分块实际发布核 current grant、generation、未 deleting 且 ready=0。就绪后 part/checksum 只读。带本次封印的账号，有界 orphan scan 除现有无世代回收外，仅在确认同世代已 ready 且已固定 part 的 checksum 不同才删该准确对象；同 checksum 的共享对象保留，未就绪世代沿既有无引用 24h GC。败方不能仅因自己未写成 D1 就删共享路径。若真实夹具不能证明世代／checksum 条件足以安全定位，才复核 metadata 或私有暂存方案。[R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)

## Home 采用顺序

1. 现行旧版可执行文件、项目库 schema 2 和 v1 选择跑原 `PersonalSync.run()`，排空发起端冻结及未冻结队列，查项目 conflict/recovery、sync.db deferred 和真实 partition cursor。进入 Home 维护写屏障，停旧 producer 和同步；受信 owner 锁下用 U1 只读预检再核，普通新 Host 不打开旧项目库跑 v1。新代码只通过限定只读源端口准备／回读远端图；若远端有新 v1 head，刷新原观察和整份计划。
2. 脏旧端先走本人受保护的同步设置「保全旧过程项」，由同一 U1 维护入口持 Home owner 锁，在可写升级前打开精确 schema 2 项目和 sync.db v1。缺受权恢复件时，U1 只对受影响项目待处理，普通启动不拉云端或自动改属；本人重进该维护入口才重核这一项。逐键读取 `replica_changes` 的 seq/key 对应原 owner 完整图或删除意图、冻结 outbox 的原 value/id/base/through_seq、conflicts/recovery；sync owner 读旧 namespace 的 deferred 原事件、stream/partition cursor、必要已存 parts，保旧逐键 head。不能调 `next()` 代替读取；已写丢回执只可按原编码精确查回执，跳过 reserve。
3. 最小恢复件为 `sync/process-items-recovery/<captureId>.jsonl`，由 `modules/sync-replication` 在原 Home 私有发布；captureId 由 owner 产生，页面不给路径。过程项 owner 供应图，Storage 供应队列证据。头写 `format:1`、原 Home/space、v1 namespace、cutoverId 与源库版本；按项目/key 写图或删除意图、原操作、冲突及恢复、deferred/cursors，必要 parts 逐块保留实际字节、现有 checksum 和保护绑定。用既有私有临时文件、原子发布，旧件不覆盖。重开核版本、原 Home/space 和项目，再逐键与旧库核正文、意图、队列、分块，并验证图能由现行 owner 在隔离库回读。缺必需 parts 时只按当前授权补，无法回读则保原库并停对应接管。登记 `format.sync.process_items_recovery`，随 `SYNC_HOME_STORE` 走现有设备同步数据的 preserve 分类。恢复件不含凭据，只能经同空间的接管入口消费，v1 队列原样保留。恢复件独立于 U1 会被轮替的临时快照。
4. 远端 complete 后，本人确认已验证恢复件，再用同一 U1 锁和 2→3 事务复核，terminal 比对在改属前做。会遮住新版头的本地分支或旧 terminal 活跃图，只在已验证件涵盖且本人选择接收新版时由过程项 owner 移出活跃读面，相关失效输出由 Runtime owner 处理；任何无法保全或安全隔离的键拒升级。v2 journal 空起，转换和种子不记普通 changes。Files 转换仅匹配精确官方 producer/binding/type/schema，保原 ref、作者、正文和历史；v2 `prepare` 在建项目之前拒旧 Files 与冒用系统来源。
5. 先 download-only 逐键核 v2 heads、实际 partition、deferred/conflicts 及旧 terminal 无活跃行，completionHead 只作下限。本人在同步设置查看原件和当前图，显式选「接管」才可由 owner 导入同义完整图，按实时授权与 v2 base CAS 走普通新操作；已相同则无新增。冲突／terminal 原件保留，用户可保当前或另选合法的新操作／新身份；删除意图仅在现行 owner 支持相应动作时重做。v1 id/base/cursor 不进 v2，旧 terminal 原 key 首写 SQL 永拒。

## 实施面与验收

同一根仓。服务端限 `server/src/sync` 与 `server/migrations/sync`，App 仍薄入口。保留已登记的 v6 `0001_sync.sql`，追加原子 v6→v7 的 `0002`，空库同链应用，错版仍 Auth 前拒绝。变更登记为 D1 6→7、process_items 1→2、已授权项目 2→3；普通 round 和 sync.db 版本维持。Host 使用现有 PersonalSync、owner、U1 及受保护同步设置入口。当前保留机制登记限定转换、只读历史、精确原回执与删除条件。真实服务窗口另需排空 v6 Worker 在途请求；旧 reserve SQL 无 namespace。目标实现路径此前八个开 PR 无重叠，versions 与 #2000/#1999/#1889 串行，发布 CHECKLIST 若涉及与 #1818 协调。

| 独立复核 | 隔离验收 |
| --- | --- |
| BSH-14-A 原子封旧与配额 | 改旧 event／archive head 或 policy 时 begin 拒且无部分变更；贴近上限时不足保持 open，刚好足额能在并发普通写、GC 退款、丢响应、取消及重启后续播；复用不多收费。证明 completedAt 到期实际清旧当前正文，保已有 pin 和原 receipt。 |
| BSH-14-B 权限与附件 | 真实 Worker 中两个账号与同账号另一个已选 namespace 直挂已知 digest 及读／reserve 均拒；已有合法引用仍可用。旧正文实际 SQL、普通 trash 分页和普通 v1／他集合 R2 GET 尾检均覆盖。历史 grant 撤回跨 R2 await 与 Host cache，正文/附件不交付；旧精确回执零新增；已过预检的 plan/item 和其他旧 mutation 封后仍拒。 |
| BSH-14-C 图的真实性 | 漏键、错 key/source、非空约束、错 wire、未就绪引用、v2 live head 不符都拒。实际回读旧 archive/restore 导出及新版种子，含 Files 固定版本、非 Files owner、跨页和大正文。 |
| BSH-14-D Home 恢复 | 双 Home 用真旧库保全并重开未冻原值／删除意图、冻结操作、冲突恢复、deferred/cursors/parts。验缺件拒升级、有效件下 terminal 隔离、清 v2 journal 启动、读齐新版后本人逐键接管和原键不复活。 |
| BSH-14-E R2 并发与清理 | 注入 precheck／R2 put 后 seal 或撤权；D1 part/ready 不发布。随后让另一集合完成同摘要并验证正常读回；败方 checksum 可清，精确共享对象保留。 |
| BSH-14-F 迁移与运行边界 | 真实本地 v6→v7 与项目 2→3 保原事实和错版拒绝，夹具加载同源迁移链；D1 批内失败必须整体回滚。 |

独立裁定允许 writer 做隔离原型。交片前须有三组真实证据：① v6→v7 quota 边界、GC 回补、并发、重启及清计划缓存后的精确重建；② R2 PUT／GET 跨 seal／revoke、已就绪败方清理与共享 checksum 读回；③ 双 Home 脏旧端保全、重开、拉齐与本人接管。公共 C 另行合审。

设计时本机缺固定 Worker 工具链；2026-11-09 已在临时目录安装 Rust 1.96.0／wasm32、worker-build 0.8.6、wasm-bindgen 0.2.128、该构建器指定的 esbuild 0.28.2，以及仓库锁定的 Miniflare/workerd。保留 Node 24.15.0，未改锁文件或全局工具。`00367bef9` 的现行 Rust/WASM 基线构建通过，`apps/sync-worker/cloud.test.mjs` 7/7 通过，使用 synthetic Auth 和临时 D1；独立工具冒烟实际写读临时 D1/R2 后关闭。Miniflare 首次直用旧构造选项被拒，按仓库已有 `convertV4MiniflareOptions` 后通过，没有修改产品或夹具。

随后在 `9e8583022` 整体构建 Host，通过 `apps/sync-worker/process-items.test.mjs`（1/1、零跳过）：两个临时 Home 使用真实 Host collection、Rust/WASM、D1/R2，完整传输大正文和后续固定版本，归档状态一致、无上传回声，接收不启动 Coding。使用合成 Auth，不涉及真实账号或云端。构建只使用临时编译缓存及 ad hoc helper 签名，保留既有 xterm 构建警告。

这些结果只证明当前 v6 Worker 与双 Home 测试环境可用，未覆盖本稿新增的预留、跨 namespace 附件防护、v6→v7 或旧设备接管。更早的 Files 专项 Host 探针只用模拟运输和现行 Rust SQL，不能与上述现行版本基线合并宣称新协议通过。Rust 原生 CI 覆盖两 crate 的 wasm32 编译检查，Worker 测试另用 `cloudFixture`、D1/R2 不持久化，机器 slot 各一份，Node `--test-concurrency=1`。仅本地迁移使用 `--local --persist-to <tmp>`。
