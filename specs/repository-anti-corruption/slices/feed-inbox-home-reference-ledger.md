# FI-4 Feed 的跨项目读写设计稿（PG-043 的 Feed 半）

状态：设计稿（2026-10-24），统筹审过方向、提了五条必改（hold 与 release 的竞态顺序、从外面带进项目库的路径、新 Home 的回填标记、删整个项目、与 #1245 的关系），已改入各节，等统筹核一眼；审过再实现，本稿不改代码。事实在 `origin/main` `584112c65` 上读代码核的，没跑过。父稿 [feed-inbox-runtime.md](feed-inbox-runtime.md) §3 D4 定了方向（两处分开：连接变化走事件；正文释放走 Feed 的 Home 引用账），本稿把它写成能照做的形状。号段 RAC-492～495（统筹 10-24 定），补充条 RAC-518（取 500 段末尾，见 §4）。

**先说一个顺序问题**：D4 的两半都要 Feed 是 Runtime 插件才做得出来（事件订阅要项目实例是 Runtime 实例；Home 一半是 `registration` 上 `runtime: { scope: "home", dual_instance: true }`，且「两半要么都随宿主发布」，项目一半今天还是宿主手工装配）。所以 **FI-4 的实现不能在 FI-6 之前，只能与 FI-6 同批或紧随其后**；设计现在定，拆片稿 §4 里 FI-4 的前置要改成「FI-6 的 Feed 装配骨架」。

## 1. 现状

| 事实 | 位置 |
| --- | --- |
| 连接变了（授权完成、连接管理、令牌保存）三处调 `refreshFeedConnectionState(home, connectionId)`：打开 `catalog.db`，列出所有项目库，**逐个以可写方式打开**，调 `refreshSourceConnectionState` 改来源状态 | `connector-source-state.ts`；调用方 `connector-activation.ts:54`、`connector-management-service.ts:22`、`web-connector-connections.ts:96` |
| `refreshSourceConnectionState` 只改 `sync_kind` 为 github/gmail/connector 且 `config.connection_id` 匹配、已启用的来源：不可用 → `disconnected`（错误码 `sources.connector_disconnected`），可用 → 若是 `disconnected` 则回 `active`；暂停的不动 | `modules/sources/src/index.ts:94` |
| 拉取之前另有一道独立的核对：`connectionAuthority` 比对连接是否启用、未断开、`updated_at` 与 `credential_ref` 都没变，变了抛 `feed.source_connection_changed` | `feed-connector-sync.ts` |
| 删来源并选「删本地历史」后，`createFeedHistoryRelease(db)` 释放正文：候选正文是该来源的材料与拉取回执里点名的；**要先读完 Home 里所有项目库**（`projectDatabaseFiles()` 列 `projects/` 目录，逐个只读打开），数出谁还引用，才让证据存储 `collect`；任一读不了就整个保留（`complete:false`） | `feed-history-release.ts` |
| 引用的两种写入者：Feed 材料的 `content_ref`（`feed_materials`，`listFeedMaterialContentRefs` 读）、拉取回执里的 `content_refs`（`withReceiptContentRefs`，`listListenerRunReceipts` 读）；还有拉取的检索记录按 `operation_id` 在项目库里（`forgetIntelligenceOperations`） | `source-sync.ts`、`modules/feed/src/index.ts:31`、`feed-history-release.ts` |
| 证据存储是 Home 级、按内容寻址（`molis-work-feed/sha256/<64 位>`），`collect({ candidates, isReferenced })` 自己看不到谁引用，由调用方回答；不是本存储的引用（如 `research:<id>`）原样放过 | `packages/storage/src/adapters/evidence-content.ts` |
| 删整个项目**不**释放它的正文（`ProjectDeletionService` 里没有证据存储的处理）：是已有缺口，不是 FI-4 引入的 | `project-deletion-service.ts` |

## 2. 为什么是这个形状

- 「读所有项目库」这个权，同等待遇下外部插件也会拿到，是隐患；「只数已打开的项目」会在没打开的项目引用正文时误删，保守不删又等于永远不释放（D4 已裁）。
- 所以 Home 上要有一份**别的项目也看得到**的账，但这份账只记引用，不含内容，也不让任何一方读别人的库。

## 3. 设计

### 3.1 连接变化：事件加启动时对账

- 宿主在连接变化时只发一个宿主事件 `host.connection.changed@1`（`HOST_EVENT_TYPES` 里加一行，`delivery: "broadcast"`，载荷只有 `connection_id`，不带「可用与否」，让订阅方自己读，不信载荷）。订阅它的项目实例要持有 `connections:read` 一类权限（具体名在实现时按事件表的规矩定）。`connector-source-state.ts` 删除，三处调用方改成发事件；宿主**不再打开任何项目库**。
- 每个项目里的 Feed 实例订阅它，对自己库里 `config.connection_id` 匹配的来源，读该连接当前状态后改来源状态（逻辑从 `refreshSourceConnectionState` 搬进 Feed，仍走来源的命令与事件）。读状态用一个只读动作；`connectors.*` 里现成哪一个合适，开工前核对，没有就补一个只读的，**不新增 service**。
- 事件不入库，项目没在运行就收不到。所以 Feed 实例**启动时对账**一遍：对自己所有该类来源，按连接当前状态把来源状态改对。这样漏掉的事件不会留下陈旧状态。
- 正确性不依赖这条刷新：拉取前的 `connectionAuthority` 核对仍然拦住「连接已变」的拉取。刷新只管来源状态怎么显示。

### 3.2 正文释放：Feed 的 Home 引用账

**位置**：Feed 的 Home 一半（双实例，照 Shelf：`registration` 写 `runtime: { scope: "home", dual_instance: true, … }`）。Manifest 声明 `databases.home`，一张表：

```text
feed_content_holds (content_ref TEXT, project_id TEXT, source_id TEXT,
                    PRIMARY KEY (content_ref, project_id, source_id))
feed_content_meta  (key TEXT PRIMARY KEY, value TEXT)    -- 'backfilled_at'
```

行的意思是「这个项目里的这个来源，持有这份正文」；用行不用计数，是为了「加」「减」都幂等（`INSERT OR IGNORE`、按持有者 `DELETE`），崩溃重放不会数歪。

**两半怎么说话**：服务句柄不互借（S-48），项目一半不能直接碰 Home 一半的库，经动作网关调 Home 一半的两个动作，只许本插件自己的项目实例调（不对别的插件公开）：

- `feed.content.hold({ project_id, source_id, content_refs })`：登记持有。
- `feed.content.release({ project_id, source_id, candidates })`：见 3.3。

`project_id`、调用者身份来自调用上下文，不从输入读（可信身份）；一个项目实例只能登记、释放**自己项目**的行。

**写的顺序（账总是引用的超集）**：

1. **先加后写**：拉取一批、要写正文之前，先 `hold` 这批正文的引用，**`hold` 返回之后**才写正文文件（包括「文件已存在、跳过」的那个判断，也只能在 `hold` 返回之后做），再在项目库事务里提交材料行与回执。正文的引用是内容的哈希，写之前就能算出，所以「加」可以排在「写」之前；排在写之后会有一个窗口：B 项目写了同一份正文、还没登记，A 项目此刻释放，看账上没人就删了文件，B 的材料就指向一个已不存在的正文。
2. `hold` 与 `release` 在 Home 库里用同一把写锁（`BEGIN IMMEDIATE`），互相排队。`hold` 失败 → 这一批拉取按来源故障处理，什么也不写（已写的正文文件无人引用，是孤儿，不是误删）。
3. **先删后减**：来源的行在项目库里删除、事务提交之后，才 `release`（见 3.3）。提交与 `release` 之间崩溃，账里多留着这个来源的行，只会漏释放。
4. 单个条目被删（不是整个来源）不减账：账因此偏多，只会晚释放，不会误删。

### 3.3 释放

`feed.content.release` 在 Home 一半里，**一个 `BEGIN IMMEDIATE` 的 Home 库事务**：

1. 删掉 `(project_id, source_id)` 的全部行；
2. 对每个候选正文，看账上还有没有别的行；没有的才删文件（证据存储的 `collect` 用这个答案作 `isReferenced`）；**文件在事务提交之前删完**；
3. 提交；返回 `bodies_deleted / bodies_kept`，与今天的 `FeedSourceHistoryRelease` 同形。

为什么删文件必须在提交之前：若先提交再删文件，A 释放提交 → B 的 `hold` 进来，看到文件还在、跳过写 → A 才删文件，B 的材料就悬空了。文件在提交前删完，B 的 `hold` 只能排在整个事务之后，它看到的要么是文件还在且有 B 自己的行，要么是文件已不在、B 自己重写。删到一半事务回滚时，来源的行恢复、有的文件已删：账只多不少，最多漏掉几份已删正文的行，不误删。

释放时**不打开任何项目库**：候选正文仍由项目一半在自己库里读（`holdingsOfSource`，就是现在的写法），检索记录 `forgetIntelligenceOperations` 也仍在项目一半做。Home 账读不了、或 Home 一半没在运行 → 返回「全部保留、`complete:false`」，和今天读不全项目库时的语义一致。

**没有回填标记就一概不释放**：`feed_content_meta` 里没有 `backfilled_at` 时，`release` 直接返回全部保留。这不是读取兜底，是拒绝：账是空的时「没人引用」不成立，不拒绝就会误删。代价是 FI-4 合入到维护跑完之间，选「删本地历史」的来源正文暂不释放（事件记「未能确认无人引用，已保留」），只漏、不丢。

### 3.4 存量账：维护一次补齐

- 维护脚本对 Home 里每个项目库**只读打开一次**，读出每个来源的材料引用和回执里的 `content_refs`，写进 Home 账，最后写 `backfilled_at`。幂等：重跑只会补，不会减。
- 只写 Home 账，不写项目库；项目库只读（`LocalSqliteStorage` 的 `readonly`）。
- 时段与 W5-17 同一次（`claude/ac-w517-catalog-paths`，等用户给维护窗口），**归用户**；PR 正文照 W5-17 的写法以「合入前要用户定维护时段」开头。我不在真实 Home 上跑，本机只用临时 Home 验证。
- 回填之后，读取一律只认 Home 账；不留「账没有就去读项目库」的兜底。
- **新 Home 怎样拿到 `backfilled_at`**（统筹 10-24 改定）：Feed 的 Home 库**第一次建立**时，若本插件在**任何项目里都没装过**（或装过但项目一半从没写过正文），当场写 `backfilled_at`；否则等维护。没有它，新装的 Home 和每个测试 Home 都永远不释放。Home 一半今天没有可用的平台服务：要补的是「平台告诉插件它**自己**装在哪些项目」（本插件的安装记录，只返回项目 id），**不是**整个 Home 的项目列表——同等待遇下外部插件也会拿到全部项目 id。这只给插件关于自己的信息，不是新权限。这是平台一侧要补的，实现片一并或先行提供，不进 Feed。

### 3.5 从外面带进项目库的路径：账不能因此少于引用

备份恢复、项目导入、整个目录拷贝，都会把一个别处写成的库放进来；库里的材料可能引用一份正文，而这份正文在账上的行早被删了（只剩别的项目持有），之后别的项目一释放就误删。两层：

- **(a) 每次启动自己对账**：Feed 项目实例**每次启动**，把自己库里所有的引用做一次幂等 `hold`（和 3.1 的连接状态对账同一处）。这一层兜住所有路径，包括用户手工拷文件这种平台管不到的。
- **(b) 平台自己的写入路径**：每条「从外面写入项目库」的平台路径，**完成之前**触发该项目的这次 `hold`；做不到就不算完成。

开工前把 (b) 的路径列全。目前读代码看到的候选：`project-arrival.ts`（暂存目录 `renameSync` 到目标，新建项目）、`demo-project-lifecycle.ts`（演示项目重放种子）、`managed-project-deletion.ts` 的 `restoreMovedProject`（删除失败时把目录移回去；删除本身不释放任何正文，所以账本来就在）。备份恢复与项目导入在宿主代码里没有找到入口，实现时再查一遍，确认没有或补上。

## 4. 验收（暂定号）

| 编号 | 内容 | 证明 |
| --- | --- | --- |
| RAC-492 | 连接变化时宿主不打开任何项目库：`connector-source-state.ts` 删除，三处调用方只发事件 | 临时 Home 里有若干项目库，其中一个换成打不开的垃圾文件，连接激活仍成功且未触碰项目库；源码里这三处不再 import 存储与项目目录 |
| RAC-493 | 运行中的 Feed 实例按事件更新匹配来源的状态；之后才启动的 Feed 实例启动时对账到连接当前状态；拉取前的「连接已变」核对照旧拒绝 | 事件到达与启动对账各一例；错过事件的项目启动后状态正确；现有 `source_connection_changed` 用例原样过 |
| RAC-494 | 账是超集、释放只删无人持有的：先加后写（`hold` 返回前不写正文、不做「已存在」判断）、先删后减；释放在提交前删完文件；`hold` 失败什么也不写；在「加」之后、「写」之前或「删」之后、「减」之前崩溃，账只多不少；同一份正文被两个项目、两个来源持有时，释放其中一个不删 | 在这几个点逐个注入失败；两项目共持同一正文的用例；**交错用例**：A 释放事务进行中 B 的 `hold` 排队，A 提交后 B 看到文件已不在并重写，B 的材料不悬空 |
| RAC-495 | 释放不读别的项目库，并带回填保护：另一个项目库打不开不影响本项目释放；没有 `backfilled_at` 时一概不删；新 Home 在本插件没有任何安装（或项目一半从没写过正文）时当场写 `backfilled_at`，否则等维护；回填只写 Home 账、只读项目库、幂等，回填后账是实际引用的超集 | 垃圾项目库用例；未回填用例；无安装与有安装的初始化各一例；插件拿不到自己安装之外的项目 id；回填跑两遍、前后账一致；临时 Home 三个项目的回填对照 |
| RAC-518 | 从外面带进来的库不破坏超集：把一个引用了某正文的项目库放进 Home（该正文的账行只剩别的项目持有，或已无），Feed 实例启动后账上有它的行，别的项目随后释放不误删；平台自己的写入路径完成前触发该项目的 `hold`，做不到不算完成 | 恢复用例（拷入项目库后启动）；列出的每条平台写入路径各一例 |

## 5. 不在本片

- 整个项目删除时释放它的正文、并删它的账行（现状缺口，账建好后补，登在 BL-526）。
- 孤儿正文的清扫（写了文件但 `hold`/提交失败留下的），账建好后可以做，登在 BL-527，不在本片。
- 与 #1245 的关系：Codex 在 #1245 让 Attention 的 `owner_plugin_id` 可空，宿主直接调用（今天的 Feed 应用）写 `null`。FI-6 里 Feed、Inbox 改用 `services.attention` 后，这条 `null` 路径一起删，写进 FI-6 的验收，不在 FI-4。
- Inbox 没有跨项目读写，不涉及。
- `home_aggregate`（S-49）只调**已打开**的项目，不能当账用，所以这里不用它。

## 6. 号段与拆片稿要改的两处

- 统筹 10-24 裁定：本稿用 RAC-492～495，FI-5 为 496～498，FI-6 从 499 起顺延进 RAC-500～519；补充条 RAC-518（本稿）与 RAC-519（FI-3）从 500 段末尾倒着取。
- 拆片稿 §4 的 FI-4 行已改：前置「FI-6 的 Feed 装配骨架」，可开工「设计审过后随 FI-6」。

## 7. 平台一半先落（统筹 10-25 定，2026-10-25 已实现）

Feed 一半要等 FI-6 的骨架，但它依赖的两样平台东西与 Feed 无关，先做完、先带测试进分支：

- **事件与可用性读取（RAC-493a）。** `host.connection.changed@1` 已进 `HOST_EVENT_TYPES`（广播，权限 `connections:observe`，载荷只有 `connection_id`）；发送口是 `apps/local-host/src/connection-change-events.ts` 的 `connectionChanged`（三处调用方：`connector-activation.ts`、`connector-management-service.ts`、`web-connector-connections.ts`），先照旧刷新 `refreshFeedConnectionState`，再向本 Home 里平台正在运行的各项目广播，不为它启动平台，发不出只记日志。**`refreshFeedConnectionState` 和 `connector-source-state.ts` 此刻还在**（RAC-492 要的「宿主不再打开项目库」随 FI-6 删，那时 Feed 实例订阅事件接手）。§3.1 说的「读状态用一个只读动作」补成 `connectors.connection.availability@1`：只有 `plugin` 受众，要 `connections:observe`，只答 `{ connection_id, available }`，不认识的连接与用不了的同答 false；没有该权限的插件在动作目录里看不到它。Feed 实例启动时对账与事件处理都调它。权限取新名 `connections:observe`，不借 `connectors.*` 管理动作的 `connections:read` 一类（那些带账号标签与服务，给订阅方过宽）。
- **本插件装在哪些项目（RAC-495a，§3.2 的前置）。** `services.installations.projects()` 返回 `{ project_ids, complete }`：本插件在本 Home 里装着、或卸载后留着数据的项目 id（`plugin-installed-projects.ts` 的 `pluginInstalledProjects`，读的是 `plugin-holders.ts` 的 `heldInstalls`，与插件默认规则的「谁还持有」同一份读取），有读不了的就一个也不给、`complete` 为 false。只有 Home 一半能调（项目一半被拒），要 `plugins:read`（与 `list`、`get` 同权限），插件 id 取自 Manifest、不是参数，只给项目 id、不给项目名与路径。Home 一半因此第一次有 `installations` 服务（Home 实例调用带着发起项目的 id，项目范围比对只对项目实例做）。「`complete` 为 false 时账不能当作齐」仍是 Feed 一半的规矩（§3.2）。

安全表：S-54 加第三条宿主事件与可用性读取，S-48 加 `projects()` 一条；动作合同快照加 1 行（`connectors.connection.availability@1`，宿主登记）；公开 API 加 `HOST_CONNECTION_CHANGED_EVENT`、`HOST_CONNECTIONS_OBSERVE_PERMISSION`、`HostConnectionChangedPayload`、`PluginInstallationProjects`、`PluginInstallationClient.projects()`（给插件作者的影响：旧插件不受影响；自己实现 `PluginInstallationClient` 的测试替身要补 `projects`）。
