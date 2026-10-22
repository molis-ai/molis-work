# 本地存储基础设施

`belongsToProject` 的第三参是惰性的保留内容读取函数：只有需要解释冻结上传/冲突内业务归属的 owner 才调用，沿同一授权和原正文保护解码，最多返回该键两份现有记录；Storage 不解释其 payload。只从稳定键判断范围的 owner 不触碰正文或密钥。

`SyncReplicaAdapter.hasProjectChanges(projectId)` 是 owner 对指定项目未结算内容的只读判断，覆盖待提交变化、冻结上传及保留冲突（包括等待依赖）；删除后的键仍须可判定归属，其他项目不能误计。缺少此端口或归属不可知必须报告不支持/不可用，不能返回 false 冒充已同步；它不确认上传，也不授权回收。SQLite owner 通过可信 `belongsToProject(key,projectId)` 投影现有日志键的业务归属，共同 Storage 不猜键、不跨 owner 查表，查询不受上传启用筛选影响。当前 Aggregate、Pages、Images、Workflows 及已有项目分区已兑现；分区映射由可信组合根显式提供，不从输入猜测，失效分区拒绝观察。Todo 已按当前/删除后归属及未确认保留内容判断；Work 已按 work.project 关系及未确认保留内容判断，交接目标不作为归属；Home 文档和未启用分区的完整被动读取尚待接线，项目云端生命周期仍未因此启用。

为各 owner 提供 SQLite 连接、共享日志、幂等记录、原子文件写入和本地安全存储适配，避免每个模块各建一套底层机制。

包名：`@molis-ai/molis-work-storage`。工作区内部包，通过仓库构建和 Host 装配使用。


`openReadOnlyHomeSqlite` 为插件查询服务提供 SQLite 自身强制的只读连接；Host 用 `openBaselineHomeSqlite` 开当前业务基线，再持有读写连接。`homeStoreRegistry`（`home-stores.ts`）是 Home 存储登记的形状与检查：路径只能是 Home 下的一个名字或 `config/` 下的一个文件，一个路径只有一个主人；登记本身由 Host 组装（`apps/local-host/src/home-stores.ts`），这里不认识任何插件或模块。记忆账本与搜索索引的登记（`MEMORY_LEDGER_HOME_STORE`、`TEXT_SEARCH_HOME_STORE`）在各自的适配器旁，普通卸载保留，明确 purge 才清除。当前基线、回滚与错版拒绝由 `tests/issue-home.test.ts` 验证。

## 一次典型调用

LocalSqliteStorage 打开连接并配置 WAL、FULL synchronous、外键和 busy timeout；LocalSqliteJournal 借用连接处理日志/幂等。Host 把各模块交出的当前 schema 拼成库的基线（`applySqliteBaseline`），版本不符就拒绝，不就地升级。runWithMolisWorkHome 将文件适配限定到当前 Home。

`describeSqliteBaseline` 用内存 SQLite 描述当前基线的完整 DDL，连接在返回前关闭，不碰 Home 库。Host 用它与 `describeSqliteSchema` 的实测结果比较，确认完整结构后才构造可能创建表的 Repository；SQLite 连接技术留在 storage。

`inspectCatalogFile` 只返回目录库已有 owner/version，不建库、改日志模式、修复或 checkpoint。没有 WAL/SHM 的已关闭文件用 Node SQLite 单连接只读 immutable 观察，前后核对文件与日志状态；已有完整活动 WAL 则使用与目录 owner 相同的 better-sqlite3 驱动按普通只读事务读取，不能忽略尚未 checkpoint 的已提交版本。同进程不能用另一套 SQLite 实例探测活动库，否则关闭探测连接会干扰常驻连接的 POSIX 锁，让其他进程误清理 WAL/SHM 或取得仍被占用的写锁。部分日志、回滚日志或观察期间文件变化直接拒绝重试。它只用于前置拒绝，正常写连接仍须复查自身 owner/version；不把 mutable 文件的 immutable 观察当最终写入授权。旧 WAL 主文件的拒绝不留下新侧文件，相关验证在 `tests/security-invariants-project-metadata-sync.test.ts`（含 PCSYNC-MCP-RECONNECT-01/02 跨进程锁回归）；标准 MCP 异常退出重连见 `tests/images-concurrency.test.ts`。

`eventCursor(projectId, objectType?)` 可以只读取某类对象的 journal 游标。Host 用它发现同项目其他连接已提交的变化；调用方负责避开本连接尚未提交的事务。它不提供业务订阅身份、确认或副作用重放，这些仍由各 owner 管理。

## 从哪里读代码

公开入口是 [src/index.ts](src/index.ts)。生产调用使用包名或 package.json 声明的子路径；下列链接用于定位实现，不是深层导入示例。

| 文件 | 用途 |
| --- | --- |
| [src/sqlite.ts](src/sqlite.ts) | 连接、事务、事件日志和幂等 |
| [src/schema.ts](src/schema.ts) | schema 辅助与 opaque blob |
| [src/adapters/local-security-paths.ts](src/adapters/local-security-paths.ts) | Home 作用域 |
| [src/adapters/file-secret-store.ts](src/adapters/file-secret-store.ts) | 本地凭据适配 |
| [src/adapters/text-search-index.ts](src/adapters/text-search-index.ts) | 系统搜索的本地全文索引（切分、写入、查询、重建） |

可对照现有调用方 [apps/local-host/src/project-database.ts](../../apps/local-host/src/project-database.ts) 阅读装配方式。

## 接入与边界

`ensureStorageSpace(home)` 持久化不可变的 Home 归属；`personalStorageSpace(issuer, applicationId, userId)` 生成稳定个人空间标识。`bindDatabaseSpace` 为 Store 绑定归属并拒绝重标记，`spaceAssetRef` 生成带空间的资产引用。业务记录和附件继承其 Store/Home，不由 storage 解释插件 payload；独立夹具数据库不自动归入进程默认 Home。详见 [空间归属](../../docs/platform/STORAGE-AND-EXCHANGE.md#12-空间归属2026-09-30)。

借用连接的 Journal 不负责关闭连接；连接拥有者负责释放。Secret/body 存储跟随创建时的 Home，不能靠切换全局变量混用用户目录。`replica.ts` 提供借用 owner 连接的事务变更日志、持久 Outbox、游标和冲突备份，不解释业务字段或调用网络；业务写入须在同事务内记录变更。

`borrowedReplicaDatabase` 为返回 unknown 的 SQLite 驱动提供同一个严格行类型桥，只接受 SQLite 标量和字节，不读取业务表；`hasReplicaBodies` 检查该技术日志的待发送、冲突及恢复正文是否仍存在，供可信密钥 owner 使用，不解密或创建业务数据。

首次初始化才调用 `initializeReplica(db,true)`（默认）；已经通过当前 owner 版本检查的库可用 `initializeReplica(db,false)` 验证既有状态，状态缺失即拒绝，不重新生成设备身份或清空下载位置。Work 的同一正常/被动打开器使用此区分。

私密 owner 可由可信组合根向 `createSqliteReplica` 注入 contracts 的 `SyncLocalProtection` 端口。待发送 operation、冲突及恢复的双方正文均经同一个序列化器保护，绑定稳定键与用途，解码严格验证 UTF-8/JSON；保护模式拒绝明文，密钥不可用或撤权时不清队列、不尝试明文读取。序列化器不创建密钥，Storage 不依赖 SDK。owner 必须将此模式固定在自己的当前库格式与组合根中，并由提供方额外绑定 Home/空间及集合；不能把可选技术端口当成任意现有库自动切换格式的升级器。网络传输、共同下载缓存及实际 Work owner 的密钥接入仍须分别验证。

`createSqliteReplica().inspectReceive` 只读观察事件当前属于忽略、游标追赶、本人回执、冲突或可应用，用于 Host 判断是否需要异步准备。它与 `receive` 使用同一份日志判断，不读取业务 owner、不改游标/队列/冲突；观察不是接纳凭证，任何等待之后 `receive` 必须在原事务中重新判断。Host 不能据旧观察绕过新编辑或新回执。验证：`tests/replica-dependencies.test.ts`。

`next({deletionsOnly:true})` 供满额同步挑选独立删除，其他记录继续排队。已冻结的正向 operation 不变形，不借较新的本机编辑改写不确定的请求；新的变化在原回执确认后再生成下一份 operation。筛选不清日志、不推进游标、不跨 owner 判断是否删除。

`createAtomicFileDocument(filename, authorize)` 为可信组合根选择的普通 UTF-8 文件提供 `read/compareAndSet`。旧字节比较和既有原子文件替换在同一个 SQLite 文件互斥区执行；与密钥存储复用原有的互斥技术，锁库不保存业务内容。进程崩溃由 SQLite/操作系统释放锁，不推测并删除旧锁。不同进程争用、坏 UTF-8、文件链接或最终撤权都保留原文件；业务 owner 可把内容与同步日志放在同一条件文档。它不理解目录 schema，也不自行把旧目录转换成新格式；Shelf 目录使用这一端口，文件语义仍归 Shelf。

`aggregate-replica.ts` 为 owner 明确声明的业务聚合提供事务触发器、子记录原子恢复、编辑版本高水位及冲突日志；表/字段白名单和语义验证由插件给出，不遍历或上传整个数据库。仅个人空间初始化；可信 Host 提供项目可用性和关联资产检查。公开入口为 `initializeAggregateReplication`、`createAggregateReplica` 与 `AggregateReplicaContext`。

已有钥匙串加密凭据的主密钥读取失败（拒绝、取消、超时或无效返回）后，同一进程、Home 和凭据配置停止自动重试，避免页面刷新或状态轮询反复触发授权。错误为 `KeychainUnavailableError`；恢复本机钥匙串访问后重启应用或对应 MCP 连接再试。此失败只保留在进程内，不改现有密文、密钥、后端或钥匙串权限，不自动降级文件存储。不同进程的首次读取仍分别发生；这不是跨进程授权合并机制。

只在部分操作需要凭据的服务使用 `createLazyFileSecretStore(homeDirectory)`：创建时固定 Home，调用时才沿用原凭据库与锁；只读取尚未保存的凭据引用时直接返回空值，不初始化后端。Functions 的 Host、HTTP、MCP 和设置装配使用此入口，因此本地列表、说明、草稿与场景查询不因服务初始化而请求钥匙串。已有凭据的读取、写入、迁移与后端诊断仍走原保护；配置了环境凭据的 Functions 也不提前打开无关的本地凭据库。这里不承诺消除所有钥匙串提示，模型健康检查和实际需要本地密钥的调用仍可能读取钥匙串。

工作区依赖：`@molis-ai/molis-work-contracts`。冲突确认指纹通过 `SyncConflictState` 端口由可信组合根传入；组合根复用公开 SDK 的同一份工具，Storage 不依赖 SDK、不复制算法。缺少端口时拒绝生成比较确认，不回退到旧内容覆盖。其他运行依赖见 [package.json](package.json)。

`createLocalPayloadProtection` 复用与既有 Search AEAD 相同的内部 AES-GCM 字节实现，既有 Search 密文前缀保持不变。可信组合根明确提供 Home 固定的 SecretStore、密钥引用、作用域、授权尾检和完整的已存保护数据检查；首次初始化通过原 SecretStore 的跨进程 `createIfAbsent` 保存密钥与独立身份指纹。密钥身份指纹仍在，或仍有受保护数据时，缺失、无效或被替换的密钥均拒绝读写，即使业务缓存暂为空也不自动换 key。只有密钥、指纹均不存在且没有任何受保护数据时，才允许作为全新状态初始化。保护不传密钥、不创建另一份凭据库；它本身不代表某个业务 owner 已接线。`createSyncBodySerialization` 公开复用同一个严格 JSON 密封序列化器，供共同协调器的延迟事件使用；用途与稳定键绑定，不另写第二套密文 JSON 格式。

`createEvidenceContentStore` 为 Feed 与研究等消费者保存受限大小的加密正文，Host 显式选择目录并固定 Home。`createSearchOpaqueBlobStore`、`createSearchAead`、`createSearchSecretStore` 为 SEL 提供持久化。历史 `molis-work-feed/sha256/...` 引用、密钥引用、恢复 overlay、密文格式及 `feed_runtime_blobs` 表名保持不变；旧 Feed 名称仅导出同一实现，不保留第二份存储。来源游标、研究策略和条目处置归消费者。正文按内容寻址、整个 Home 共用，本包看不到谁在引用：`EvidenceContentStore.delete` 删一份正文，`collect({ candidates, isReferenced })` 只删调用方数过引用、确认无人持有的候选；`createSearchOpaqueBlobStore` 返回的 `collect({ namespace, discard })` 按键删 SEL 操作记录（值保持密封、不被读取）。数引用的一方（Feed 删除来源）负责数全。

## 本地开发

`validateProjectReplicaRows` 为受控内容投影提前检查明确声明的表、字段、类型、JSON 与项目身份，不读取业务表或授予权限。owner 仍负责语义验证。存在 `restore` 的 section 必须先 clear 捕获同事务目标状态，写入后消耗该捕获，不能将旧缓存作为第二次恢复依据。

`validateProjectReplicaJournal` 复用 Journal 的现行事件/回执字段、身份、业务家族与去重校验，在创建目标项目前可纯检查完整输入。它不访问数据库、不授予读取权限；实际 `createProjectReplicaJournal.validate/apply` 仍再次检查目标库已有稳定 ID 的归属，不能以纯检查替代目标事务。

`createProjectContentReplicaFactory` 将显式 `ProjectReplicaDefinition` 组合成事务一致的项目内容单元，校验身份、字段、归属和外键，再按 owner 的纯投影恢复。它不发现业务表或插件，不触发监听与执行；私有连接配置只合并同事务捕获的目标本机状态。定义来自 Host 已登记的业务 owner，集合与日志命名来自同一个插件目录描述符。

`validateProjectContentReplication` 与真正应用共用完整 envelope、各 section 的字段和 owner 纯校验，供创建目标项目前使用；不替代目标事务的稳定 ID/权限检查。`beforeClear` 在同事务捕获当前行后先调用 owner 护栏，普通恢复与空墓碑都不能跳过；拒绝时不留下旧捕获。技术高水位可由 owner 明确声明为本机保留行，不进入网络，但不因此获得业务对象重建权限。

`replicaMarkRowsSql` 接受可信 owner 生成、返回 `key` 列的 SELECT，把同一次业务提交影响的各个稳定键写入共同日志；网络输入不能决定 SQL。Runtime 的私有文档 owner 使用它记录独立对象，不把整份 KV 文档错误当成一个项目冲突单元。它不读取业务事实，不改变共同 replica 的事务、游标或回执规则。

以下命令在**仓库根目录**执行，使用 Node.js 24+ 与仓库配置的 pnpm。首次准备运行 `pnpm install --frozen-lockfile` 和 `pnpm build`；之后可单独检查此包。

```bash
pnpm --filter @molis-ai/molis-work-storage typecheck
pnpm --filter @molis-ai/molis-work-storage build
```

已有行为示例与回归：[feed-security.test.ts](../../tests/feed-security.test.ts)、[web-home-isolation.test.ts](../../tests/web-home-isolation.test.ts)。完成上述构建后运行：

```bash
pnpm test:run tests/feed-security.test.ts tests/web-home-isolation.test.ts tests/secret-store-keychain-retry.test.ts
```

阅读测试中的输入与断言，可以看到接入方式、结果和错误分支。

## 开发要求

- 负责：SQLite、文件系统、Blob、事务、当前 schema 基线与版本校验、备份与本地密钥存储的技术端口；系统搜索的本地全文索引适配（`openTextSearchIndex`，`{home}/search/search.db`）。
- 不负责：Module schema 的业务含义、跨 Module 查询；搜索来源的发现、同步与权限（归 `horizontal/search`）。
- 公开入口：`@molis-ai/molis-work-storage`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/storage`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 密钥与正文存储跟随创建时的 Home，不靠切换全局变量混用目录。
  - 钥匙串主密钥读取失败后，同一进程、Home 与配置停止自动重试；不改密文、不自动降级到文件存储。
  - 文件后端已有密文时必须读取原有的有效密钥；缺失或无效即拒绝读取、写入和后端诊断，不生成替代 key。恢复原 key 后可重新打开。回归见 [secret-store-missing-key.test.ts](../../tests/secret-store-missing-key.test.ts)。
  - 只有部分操作需要凭据的服务用 `createLazyFileSecretStore`：读取尚未保存的引用不初始化后端。
  - 原子文件写入、日志与幂等记录由这里提供，Module 不各建一套。
  - 记忆账本只有成功开始写事务后才进入嵌套状态；连接锁导致开始失败后，同一实例的后续多步写入仍完整回滚或提交。回归见 [memory-ledger-transaction.test.ts](../../tests/memory-ledger-transaction.test.ts)。
  - 搜索索引是可删除的派生缓存：文件缺失、损坏或 schema 版本不符时清空重建，不读回任何业务事实。
  - 索引切分：中日韩每字单独、相邻两字成词，其余字母数字按小写词、查询用前缀；候选必须在原文（NFKC、小写）里真实出现才返回，两字中文与 `Q4` 这类短词可查。
  - 正文由读取器提供的条目，只对能读该种类的调用来源返回。
  - 项目被删除时清掉它在个人库里的行：`clearInExistingHomeSqlite` 对已存在的库在一个写事务里运行删除（库不存在就不创建、版本不符照常拒绝）；`deleteSecretEntriesWithPrefix` 按引用前缀删密封的密钥，不解密；记忆账本的 `forgetScopes` 一并忘掉已不存在的范围。
- 改动后必跑：`node scripts/run-tests.mjs tests/storage-baseline.test.ts tests/home-store-baselines.test.ts tests/secret-store-keychain-retry.test.ts tests/secret-store-format.test.ts tests/home-backup-recovery.test.ts tests/plugin-private-storage.test.ts tests/system-search.test.ts tests/feed-local-history-delete.test.ts tests/project-deletion-owners.test.ts tests/project-deletion-studios.test.ts`
- 空间归属改动另跑：`node scripts/run-tests.mjs tests/space-ownership.test.ts tests/web-home-isolation.test.ts`。
- 相关手册：[docs/platform/STORAGE-AND-EXCHANGE.md](../../docs/platform/STORAGE-AND-EXCHANGE.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/storage`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

项目 owner 可声明 `journalUpdateCondition`，仅约束 UPDATE 日志，`$old`/`$new` 引用原行/新行；INSERT/DELETE 不受该谓词影响。Coding 用它区分本机运行缓存与新终态历史：活动/待核对缓存不制造业务冲突，真正结束的 SDK 会话保持待导出和待同步。

`retainLocalReplicaSnapshot` 供 owner 在本机删除的同一业务事务内保存完整原件，复用既有本机恢复日志及可选的正文保护，不构造云端事件或修订。`local_delete` 可在原项目/账号范围、无后来内容/冻结上传/冲突且版本匹配时离线撤销；未上传原件不按本机时钟过期。Images 是实际消费者。

`createAtomicFileDocument` 的 `withReadLock` 与 `compareAndSetChecked` 使用同一 SQLite 文件互斥锁。后者先核对完整原字节，再运行 owner 的同步文件验证，成功才原子替换；旧输入不运行验证。存储层不扫描或解释业务文件。

`createAggregateCopy` 为原 owner 声明的保存图提供独立复制入口；源接口可在本地空间只读导出，不取得个人同步准入，目标仅向当前个人空间创建。owner 明确声明 copy kind、依赖及 JSON 引用重映射；普通正文不搜索 ID。根记录和全局子记录建立新标识，完整答卷、保存版本及终态对话保留。目标相同结果重试不重复导入，已编辑目标拒绝覆盖，最终撤权回滚业务与日志。此接口不是整项目复制用户入口，项目编排及其他 owner 尚在实现。

`openOwnerCopyStore` 复用同一只读路径、基线和关闭句柄边界，owner 自行提供投影、目标日志安装和以具名基线显式打开的目标连接；公共工具不转交未知 schema；缺失源库不创建，目标仅个人空间。Images 通过此端口复用完整终态图片投影。`hasReplicaHistory` 只检查技术日志；副本当前不存在但已有删除/替换历史时，复制重试必须拒绝重新创建。
