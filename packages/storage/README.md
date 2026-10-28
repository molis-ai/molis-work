# 本地存储基础设施

为各 owner 提供 SQLite 连接、共享日志、幂等记录、原子文件写入和本地安全存储适配，避免每个模块各建一套底层机制。

包名：`@molis-ai/molis-work-storage`。工作区内部包，通过仓库构建和 Host 装配使用。

Knowledge 当前私库基线为 4，仍使用原卡片、全文检索、额度和回执表；普通打开拒绝旧版本。卡片采用与保留绑定使用现行 `source_identity`；旧 v3 的真实插件代只在明确维护中封装成插件身份，未知身份保留 null，旧机器与人工字段不丢失。旧库只由仓内有限维护入口 `tests/fixtures/coding-knowledge-maintenance.mjs` 在独占 owner、物理路径与 schema 核对、备份后按库事务采用，详情随 Knowledge 模块合同。人工关联与卡片正文、FTS 同事务写入；旧机器摘要仅保留供管理，在尚待人工整理期间不写入当前 FTS，人工字段保留。直接回归：`tests/legacy-memory-adoption.test.ts`、`tests/knowledge-cards.test.ts`、`tests/knowledge-retention-policy.test.ts`。


`openReadOnlyHomeSqlite` 为插件查询服务提供 SQLite 自身强制的只读连接；Host 用 `openBaselineHomeSqlite` 开当前业务基线，再持有读写连接。`homeStoreRegistry`（`home-stores.ts`）是 Home 存储登记的形状与检查：路径只能是 Home 下的一个名字或 `config/` 下的一个文件，一个路径只有一个主人；登记本身由 Host 组装（`apps/local-host/src/home-stores.ts`），这里不认识任何插件或模块。记忆账本与搜索索引的登记（`MEMORY_LEDGER_HOME_STORE`、`TEXT_SEARCH_HOME_STORE`）在各自的适配器旁，普通卸载保留，明确 purge 才清除。当前基线、回滚与错版拒绝由 `tests/issue-home.test.ts` 验证。

`acquireStorageOwner` 是 Host、独立 Agent 与离线 Home 操作共用的 SQLite EXCLUSIVE 所有权技术端口，路径仍是显式绝对目录里的 `.molis-runtime-owner.db`。获取始终严格，同一进程第二次获取也拒绝；不另建锁或根据 PID 放行。`assertStorageOwner` 与 `borrowStorageOwner` 只认本模块认证、同一 canonical root 和原 inode 的 live capability；复制对象不能借用，一个父 owner 同时只给一个执行服务借用。子服务关闭仅归还借用，父 owner 在借用归还前不能释放。失败关闭由原拥有者明确重试，普通释放保留锁 inode；Home 的 `agent-runtime` 父目录也不能在恢复发布时整体替换。该锁及侧车不进业务快照。回归：`tests/security-invariants-home-storage-owner.test.ts`、`tests/security-invariants-home-storage-sdk.test.ts`、`tests/security-invariants-home-storage-host.test.ts`。

持锁进程不能再用普通文件 API 打开/关闭该锁原件来读取或计算摘要：POSIX 文件锁会受到同进程其他描述符关闭的影响。快照和字节对照在读取前排除锁与侧车；inode、模式与目录检查只用元数据。`hasOnlyStorageOwnerFiles` 在 live proof 下只读核对目录是否仅含这些技术文件，任何 SDK 或业务条目都返回 false，不能用它自动采用已有记忆数据。`hasStorageBusinessFiles` 只读同一组技术文件之外是否有条目，缺目录或仅合法技术文件为 false，未知条目为 true，不安全技术链接或异常拒绝；它不授予所有权、采用或写入权，供原数据 owner 保持未启动 SDK 时的 ledger-only 删除。

## 一次典型调用

LocalSqliteStorage 打开连接并配置 WAL、FULL synchronous、外键和 busy timeout；LocalSqliteJournal 借用连接处理日志/幂等。Host 把各模块交出的当前 schema 拼成库的基线（`applySqliteBaseline`），版本不符就拒绝，不就地升级。runWithMolisWorkHome 将文件适配限定到当前 Home。

`describeSqliteBaseline` 用内存 SQLite 描述当前基线的完整 DDL，连接在返回前关闭，不碰 Home 库。Host 用它与 `describeSqliteSchema` 的实测结果比较，确认完整结构后才构造可能创建表的 Repository；SQLite 连接技术留在 storage。

`eventCursor(projectId, objectType?)` 可以只读取某类对象的 journal 游标。Host 用它发现同项目其他连接已提交的变化；调用方负责避开本连接尚未提交的事务。它不提供业务订阅身份、确认或副作用重放，这些仍由各 owner 管理。

`readMemoryLedgerProfiles` 只读枚举 ledger 4 中所有 actor/key 的原始偏好，供 Host 在打开写连接前严格检查九字段设置；它不补字段，不扩大 `MemoryLedgerPort`。旧六/八字段只由显式离线采用入口处理：`inspectMemoryLedgerAdoption` 保留实际 SQLite 版本（3 或 4），同一 `adopting → SDK 核验 → completeMemoryLedgerAdoption` 路径原子写入完整九字段并完成 ledger 4。已有分类限制、所有身份、原 origin 和历史保持；失败保留阻断，不新增版本或表。相关回归：`tests/memory-ledger-adoption.test.ts`、`tests/memory-adoption-maintenance.test.ts`、`tests/memory-adoption.test.ts`。

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

借用连接的 Journal 不负责关闭连接；连接拥有者负责释放。Secret/body 存储跟随创建时的 Home，不能靠切换全局变量混用用户目录。这里没有实现 Outbox 或 Exchange。

已有钥匙串加密凭据的主密钥读取失败（拒绝、取消、超时或无效返回）后，同一进程、Home 和凭据配置停止自动重试，避免页面刷新或状态轮询反复触发授权。错误为 `KeychainUnavailableError`；恢复本机钥匙串访问后重启应用或对应 MCP 连接再试。此失败只保留在进程内，不改现有密文、密钥、后端或钥匙串权限，不自动降级文件存储。不同进程的首次读取仍分别发生；这不是跨进程授权合并机制。

只在部分操作需要凭据的服务使用 `createLazyFileSecretStore(homeDirectory)`：创建时固定 Home，调用时才沿用原凭据库与锁；只读取尚未保存的凭据引用时直接返回空值，不初始化后端。Functions 的 Host、HTTP、MCP 和设置装配使用此入口，因此本地列表、说明、草稿与场景查询不因服务初始化而请求钥匙串。已有凭据的读取、写入、迁移与后端诊断仍走原保护；配置了环境凭据的 Functions 也不提前打开无关的本地凭据库。这里不承诺消除所有钥匙串提示，模型健康检查和实际需要本地密钥的调用仍可能读取钥匙串。

`inspectSealedSecretsSnapshot(home, ciphertext)` 只读核对所给的现行 v2 vault 与同 Home 原主密钥，逐条验证 AES-GCM，返回后端、条目数和 `{location, sha256}` 密钥身份引用；不返回 key 或正文，不创建目录、锁库或替代 key，不依赖现 Home 的 vault 是否完好。单独空 vault 没有密文依赖。`readSealedSecretSnapshotEntry` 是 owner 明确恢复时读取单条正文的端口；`readExistingSecret(home, authRef)` 对当前 vault 做同样的只读检查，并拒绝软/硬链接文件，不借用 store 缓存。它们不是普通诊断或 HTTP 返回接口；调用方仍负责自己的引用归属。已密封的 Runtime 原配置备份由其 owner 使用这些端口读取。

`sealExistingHomePayload(home, binding, contents)` 与 `openExistingHomePayload(home, binding, payload)` 供明确的 owner 在内存中密封/恢复必要私有状态，使用同一 AES-GCM v2 core 与原 master。payload 的 AAD 绑定用途域、canonical Home 和 owner/install binding，与普通 vault 条目的用途隔离；vault 现行无 AAD 的读写格式不变，不读取旧的无用途绑定 payload。seal 要求已有现行 vault，open 按 payload 的原 backend/key 引用读取，即使活 vault 已损坏也可预检；二者都不初始化 store、锁、缓存或替代 key，不写活 vault、不落明文暂存、不返回 master。当前受管 CLI 使用它们密封整个私有目录的普通文件与权限，普通设置/Agent 状态不返回该正文。缺原 key 的恢复按 [HOME-DATA 的原后端恢复边界](../../docs/system/HOME-DATA.md#original-key-recovery)，不能用任意新 key 或切换后端代替。

已有 v2 vault 的 backend 在 entries 为空时也保持绑定：正常重开不按新的环境偏好切换，原 key 缺失/无效即拒绝，不生成替代值；只有从未存在 vault 的首次初始化走原选择规则。单独空 vault inspection 的无密文依赖结论不代表 vault 外的 owner payload 没有依赖。

工作区依赖：`@molis-ai/molis-work-contracts`。其他运行依赖见 [package.json](package.json)。

`createEvidenceContentStore` 为 Feed 与研究等消费者保存受限大小的加密正文，Host 显式选择目录并固定 Home。`createSearchOpaqueBlobStore`、`createSearchAead`、`createSearchSecretStore` 为 SEL 提供持久化。历史 `molis-work-feed/sha256/...` 引用、密钥引用、恢复 overlay、密文格式及 `feed_runtime_blobs` 表名保持不变；旧 Feed 名称仅导出同一实现，不保留第二份存储。来源游标、研究策略和条目处置归消费者。正文按内容寻址、整个 Home 共用，本包看不到谁在引用：`EvidenceContentStore.delete` 删一份正文，`collect({ candidates, isReferenced })` 只删调用方数过引用、确认无人持有的候选；`createSearchOpaqueBlobStore` 返回的 `collect({ namespace, discard })` 按键删 SEL 操作记录（值保持密封、不被读取）。数引用的一方（Feed 删除来源）负责数全。

## 本地开发

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


`memory-ledger-adoption-cleanup` 是原离线采用的窄维护主人：直接复用 `BEGIN IMMEDIATE`，不经普通 `openMemoryLedger` 打开 ledger3。既有 memory-operation marker 固定无正文确认与每项子操作号；source-links、候选 source_refs 和原 promotion journal 提供已知来源，首次 SDK 删除前幂等保留 memory-source-forgotten。正式项沿 retention.forget 清历史、使用、成对记录与正文/undo，候选项只删准确投影；不按同源扩删 SDK 对象。每次事务核采用快照、原决定、当前权限和取消，未完成决定始终阻止 ledger4。相关回归 `tests/memory-ledger-adoption.test.ts`；新用例待正式 SDK 包集成后实跑。

MEM-40原项目计划的冷retention由 `createMemoryLedgerProjectRetention` 提供（合同见Memory spec的同名段）。它固定Home及原项目/actor/operation/ID/scope/source，以四种语义方法抑制来源、移除原候选账注、遗忘原正式ID和最后清非个人scope；沿原retention与adoption事务执行，不暴露SQL/DB/万能mutation。每步接expected adoption snapshot，COMMIT成功后才返回同事务post，父frame据此接受自己的变更；异常不猜提交状态。original模式拒绝写，只读验证原对象全部retention后置条件与来源屏障，不能凭marker或当前scope空态清同ID后继。参数/当前授权不可扩大固定集合；个人scope只逐ID处理，scope收尾前SDK覆盖证明归上层。直接回归 `tests/memory-ledger-project-retention.test.ts`；不新增schema、registry或第二删除核。局部真实SQLite验证已覆盖提交前回滚、提交后未知结果不返回post、撤权/取消、计划外拒绝与同ID后继保持；完整冷Memory父frame接线与全主人恢复仍由上层集成。

MEM-40 的非项目精确选择由 `createMemoryLedgerSelectedRetention` 承接：固定 actor/operation 与多个已授权 scope 中的原正式 ID、候选 ID、来源元组，没有 project_id 或 forgetScopes。它与项目入口共用原路径/current、existing-only adoption 事务、五表双存身份检查、三种逐对象 mutation 及原件证明；项目范围收尾仍只在项目入口。个人 owner 必须等于 actor，重复 scope 或同类对象 ID 拒绝。selected 来源的 version 可省略，直接表示真实 source-forgotten 事件屏障；存在时必须非空，命令逐完整原元组匹配，不替屏障编造版本。项目入口的来源 version 继续必填。original 模式拒绝全部写入，仅验证固定原件的全部 retention 后置条件。独立遗忘和来源屏障不删除 owner、偏好、信号或 scope，也不证明上层 SDK 删除已完成。直接回归 `tests/memory-ledger-selected-retention.test.ts`，实施合同见 Memory spec 的 MEM-40-SELECTED-01..06。

MEM-40 的 Ledger 临时连接关闭失败由 Storage 留住实际原连接：`MemoryLedgerCloseFailure` 是 AggregateError，携带非枚举的 `close(): Promise<void>`，只允许显式重试原资源关闭，成功后幂等；不公开 DB/SQL，不重新执行业务、授权或事务。业务与关闭都失败时保留两份原错误及原业务 cause/code；业务失败但关闭成功时原样抛出业务错误。COMMIT 后关闭失败不回滚、不返回 post，后续 close 成功只表示资源已释放，不能冒充原命令成功或父发布完成。adoption 只读检查、写前只读预检、adoption 事务、selected/project 原件证明及 recovery inspection 初始化失败沿同一职责处理；原父 frame 负责留住该关闭能力并继续处理首次失败。短合同见 Memory spec 的 MEM-40-LEDGER-CLOSE 段。

直接回归 `tests/memory-ledger-close.test.ts` 使用真实连接和物理 close 故障；连同 adoption、selected/project retention、recovery 和事务共6文件56项通过。父 owner 保留及最终恢复发布仍须外层接线，不由资源关闭成功代替。

MEM-40-SELECTED-07：SDK canonical inspection 的 cleared 结果没有版本；selected 正式/候选项因此另允许 `{memory_id|candidate_id,state:"cleared"}`，与原带真实 version 的条目互斥，cleared 分支不得出现 version。该分支仅承接已由上层确认的 Ledger 原件清理/证明，不是 SDK 删除许可；Storage 不调用 SDK、不替缺版本 present 项填值。ProjectRetention 的原项目条目仍必须有真实 version，并在运行时拒绝 cleared。未选 ID、同项目后继、owner/偏好/signals 保持；上层仍须把原选择和当前权限绑定，不把 state 字符串当作跨主人证明。真实公开 SDK 与 SQLite 回归见 `tests/memory-ledger-selected-cleared.test.ts`。

## 恢复父决定

MEM-40 恢复父决定沿原 Ledger marker 持久化，一次冻结来源含义、目标元组、原 Session 业务选择、事件屏障及完整 Catalog groups；不存 Catalog 计划/步骤/完成。`createMemoryLedgerHomeRecovery` 提供 read/adopt/begin/complete/close，沿原 existing-only adoption 事务同时核 snapshot 与原 parent(at/body)，不以 snapshot 代替父比较。adopt 只在原父缺席时复用原采用阻断，初始化的关闭失败也由该 facade 保有。普通采用完成拒 pending/坏父；恢复完成同事务改父 committed 并沿原采用发布。COMMIT 后关闭失败仍报原失败、不补 post；facade 留住自身及嵌套初始化错误中的真实 close 能力、封住业务，显式 close 不重新授权/开库/执行。纯 DTO 位于 contracts，Storage 同一父 decoder 供原 recovery 投影复用，Memory 原解释只返回 inspect-target，绝不因父 phase 或 cleared 字符串授权 SDK 写。原件全表证明可读取后继，但不从后继重新选择或删除。LocalHost 的显式停写恢复生产者复用该 facade；无新表/锁/registry。个人 Assistant 只按原 kind/plugin/install/Session/actor 联结其个人 scope，不伪造项目。短合同及验收见 Memory spec 的 MEM-40-PARENT-01..06、MEM-40-FRAME-05..06。

直接回归 `tests/memory-home-recovery.test.ts` 使用公开入口、真实SQLite与实际连接关闭故障，覆盖双expected、原父重开、输入冻结、当前权限、真实COMMIT拒绝/回滚、COMMIT后close失败及nested初始化资源；只验证Storage父片，不代替外层原件清除或完整Home发布验收。原三包README和相关调用方定向结果见同spec。

## 离线搜索目标清理

`clearProjectInExistingTextSearchIndex` 供 MEM-40 原项目删除步骤维护停写 target：调用者固定目标 Home、项目及原操作决定，持有原维护 owner；必填同步 `assertCurrent` 检查同一 frame 的当前 owner/权限，`signal` 检查取消。入口、事务删除前与提交前均复核，拒绝回滚。它复用搜索当前 DDL、结构描述器和 `removeProject` 的删除事务，只清该项目文档、来源与对应 FTS，不启动 SearchService 或 Runtime。

缺库只返回 `absent`，不创建目录/库，也不代表删除完成；上层不能用 source absent 替代 target 实测。只接受当前完整结构，拒绝旧/坏库、额外触发器、错误 FTS 定义以及链接/非普通文件，不迁移或重建。`cleared` 返回本事务删除的文档数；重试固定同一项目，operation 账仍由 Catalog 持有，不给缓存增加持久决定。source/backup 不传入此写入口；安全停 writer 与完整副本仍是调用者责任。

回归：[text-search-maintenance.test.ts](../../tests/text-search-maintenance.test.ts) 使用真实 SQLite，经公开包入口验证旁项目保持、重开、缺库、坏结构、链接、撤权与取消。

## 开发要求

冷项目retention的实际Ledger路径由现 `inspectExistingSqlitePath` 固定：规范绝对路径、db与祖先身份、非链接/非硬链接侧车，current前后及SQLite打开/BEGIN等待后/写前/提交前重核；writer mode=rw不创建缺失库。changes与candidates须通过与原recovery/relations共用的列/body身份检查，矛盾持久化事实保留并拒绝，不能借scope删除消除。该边界不等于抵御同OS权限进程任意时刻换路径的原子锁。

原retention五表的实际双存身份统一核对：changes四字段、candidates三字段沿原读取器；uses五字段、revisions.version、pairs.pair_id/state由同一relations职责核对。没有双存的revision memory_id和pair actor_id不制造JSON字段要求。此检查在冷写前及原对象证明前生效，不改变普通Ledger的删除SQL或新增格式。

`backupSnapshotSqlite` 只读源库、使用 SQLite backup API 包含已提交 WAL，在私有副本核 owner 版本、schema、integrity/外键并刷盘；`copySnapshotFile` 与摘要端口拒绝链接、特殊文件和读取期间的改动，普通文件使用有界内存流式复制，默认在返回前刷盘。持离线 lease 的快照 owner 可明确延后私有副本的刷盘，先认证实际副本，再在发布前刷齐每个文件；认证或刷盘失败均不发布，不能把这个参数用于省略成功产物的持久化。调用方须先排除所有权锁及其侧车，不能打开它们做摘要。Home 路径、存储集合、同 Home lease 和原 key 策略由 Host 编排，不在 storage 复制业务名单；原 key 只记身份，不导出。回归包含 `tests/home-snapshot-content.test.ts`、`tests/security-invariants-home-snapshot-inputs.test.ts` 与 `tests/security-invariants-home-snapshot-lifecycle.test.ts`。

快照技术拒绝沿共同 `ActionError`：静态不合法为平台 `actions.input_invalid`，开始复制后观察到改变为 `actions.conflict`；源库原 `storage.schema_version_mismatch`、取消和 I/O 原样传播。Home 编排把这两类转为自己的快照码，不依赖消息文本。退役库的 metadata 端口仅供持锁备份集，只查声明的 owner/schema_version 与完整性，不提供业务 reader；公开调用及实际 SQL/源零写证明见 `tests/home-snapshot-errors.test.ts`、`tests/home-snapshot-metadata.test.ts`。

- 负责：SQLite、文件系统、Blob、事务、当前 schema 基线与版本校验、备份与本地密钥存储的技术端口；系统搜索的本地全文索引适配（`openTextSearchIndex`，`{home}/search/search.db`）。
- 不负责：Module schema 的业务含义、跨 Module 查询；搜索来源的发现、同步与权限（归 `horizontal/search`）。
- 公开入口：`@molis-ai/molis-work-storage`（`src/index.ts`，经 `dist` 导出，不深入 `src/` 导入）；合同 `@molis-ai/molis-work-contracts/platform/storage`。
- 依赖：`@molis-ai/molis-work-contracts`；第三方依赖见 `package.json`。方向：平台包只依赖 contracts/platform 与更低层平台包（[包边界规则](../../docs/system/PACKAGE-BOUNDARIES.md)第 1 节）。
- 不变量：
  - 密钥与正文存储跟随创建时的 Home，不靠切换全局变量混用目录。
  - 钥匙串主密钥读取失败后，同一进程、Home 与配置停止自动重试；不改密文、不自动降级到文件存储。
  - 已有现行 v2 vault（包括 entries 为空）时必须读取它绑定的原有有效密钥；缺失或无效即拒绝读取、写入和后端诊断，不生成替代 key。恢复原 key 后可重新打开。回归见 [secret-store-missing-key.test.ts](../../tests/secret-store-missing-key.test.ts)。
  - 密文快照预检必须只读，不创建锁/目录/key；密文中有任一条认证失败就整体拒绝，不能因活 vault 损坏而拒绝检查健康快照。明确恢复读取仍核原 key、普通单链接文件及调用 owner 的引用归属。
  - 只有部分操作需要凭据的服务用 `createLazyFileSecretStore`：读取尚未保存的引用不初始化后端。
  - 原子文件写入、日志与幂等记录由这里提供，Module 不各建一套。
  - `memory_owners` 的既有scope/owner不能改绑project或非空subject；同关系title更新和缺subject的可信准备补齐由同一条件UPSERT原子处理，冲突不改原行。Storage只核关系一致性，不推导Character/hash或授予权限。回归见 `tests/memory-owner-relations.test.ts`。
  - 记忆账本只有成功开始写事务后才进入嵌套状态；连接锁导致开始失败后，同一实例的后续多步写入仍完整回滚或提交。回归见 [memory-ledger-transaction.test.ts](../../tests/memory-ledger-transaction.test.ts)。
  - `memoryLedgerHasOnlyPreferences` 只读核现行精确 schema、完整 prefs 形状及 new-home adoption 标记；任一正文账注、未知标记或未知形状都不证明空态，不创建或迁移数据库。它与 Runtime 目录确实不存在共同支持 Catalog-only 新 Home 的项目删除准备；项目 prefs 是可归属设置，不代表 Memory 原件。对应真实恢复用例为 `tests/project-deletion-recovery.test.ts`。
  - 搜索索引当前派生基线为 4，保留绑定也使用 `source_identity`；旧基线只沿普通打开清空重建，existing-only 维护拒绝旧基线。搜索索引是可删除的派生缓存：文件缺失、损坏或 schema 版本不符时清空重建，不读回任何业务事实。
  - 索引切分：中日韩每字单独、相邻两字成词，其余字母数字按小写词、查询用前缀；候选必须在原文（NFKC、小写）里真实出现才返回，两字中文与 `Q4` 这类短词可查。
  - 正文由读取器提供的条目，只对能读该种类的调用来源返回。
  - 项目被删除时清掉它在个人库里的行：`clearInExistingHomeSqlite` 对已存在的库在一个写事务里运行删除（库不存在就不创建、版本不符照常拒绝）。带维护 control 时，经 `openExistingBaselineSqlite` 使用 mode=rw 严格核版本与完整 schema/对象清单，空库、未知结构不初始化或修复；开库、BEGIN、回调与 COMMIT 前检查原同步 control，回调主人还须在每次实际删除前检查。原普通 openBaseline/apply 初始化语义保持；`deleteSecretEntriesWithPrefix` 按引用前缀删密封的密钥，不解密；记忆账本的 `forgetScopes` 一并忘掉已不存在的范围。
- 改动后必跑：`node scripts/run-tests.mjs tests/storage-baseline.test.ts tests/home-store-baselines.test.ts tests/secret-store-keychain-retry.test.ts tests/secret-store-format.test.ts tests/home-backup-recovery.test.ts tests/plugin-private-storage.test.ts tests/system-search.test.ts tests/feed-local-history-delete.test.ts tests/project-deletion-owners.test.ts tests/project-deletion-studios.test.ts tests/security-invariants-secret-snapshot.test.ts tests/security-invariants-connector-private-state.test.ts tests/security-invariants-home-payload-purpose.test.ts tests/security-invariants-connector-private-state-limits.test.ts tests/secret-store-missing-key.test.ts`
- 相关手册：[docs/platform/STORAGE-AND-EXCHANGE.md](../../docs/platform/STORAGE-AND-EXCHANGE.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)


上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。

`beginMemoryLedgerAdoption` 与 complete 共用现 change 事务的同步 assertCurrent：取得原 snapshot 后、实际 COMMIT 前都复核，异步 checker 或拒绝回滚该事务。原 origin/adopting、CAS 和库版本不变；SDK 失败后已提交的 adopting 保留。回归见 `tests/memory-adoption-maintenance.test.ts` 与 `tests/memory-ledger-adoption.test.ts`。

`MemoryLedgerPort.ownerRelations()` 在同一 SQLite 读取中投影全部 owner 与候选账的身份关系，不交正文、标题或历史；候选索引/JSON 身份不一致及跨源同 owner 项目冲突明确拒绝。不改变 adoption snapshot 或授予 scope 权限。

`openMemoryLedgerRecoveryInspection` 仅检查完整 T1 工作副本：单 readonly SQLite BEGIN 快照，`next` 默认 40、最大 100 条 fact+issue，非法限额拒绝；计划条目跨页延续，不整库收集后切页。输出只有经过校验的身份/原决定/来源屏障，不交正文或 raw marker。失败页保留位置；`close` 即使取消/撤权也释放连接并报告检查或关闭失败。没有 Home/库/表/key 创建、迁移或 checkpoint，工作副本可出现 SQLite 必要侧车；原件 T1/T0 不打开。`exhausted` 不是恢复 complete。Schema、清理决定、owner/candidate 行级校验与现入口共用。专项回归：`tests/memory-ledger-recovery.test.ts`；相关读取影响面加跑 `tests/memory-owner-relations.test.ts`、`tests/memory-ledger-adoption.test.ts`、`tests/memory-adoption-maintenance.test.ts`、`tests/memory-ledger-transaction.test.ts`。

维护文件路径共用原 Search 提取的 `inspectExistingStoragePath` / `inspectExistingSqlitePath`：逐祖先拒绝链接，文件必须普通且单链接，原目录/库 dev+ino 在等待后复核；SQLite 侧车允许自身创建/消失但不能重定向。`openExistingBaselineSqlite` 拒绝别名路径；维护调用方提供 canonical Home。实际 rm 的库外目录也须独立检查。`deleteSecretEntriesWithPrefix(prefix, control?)` 把同一控制传入原 mutex 和原子保存，拿锁后、临时密文写入前及 rename/COMMIT 前复核；维护只用既有凭据互斥库，不解密或创建密钥。普通无 control 的初始化与写入语义不变。真实链接、硬链接与双进程撤权回归见 `tests/project-deletion-file-boundaries.test.ts`。

冷 Memory 首次计划需要两遍身份与来源连接时，完整消费 `openMemoryLedgerRecoveryInspection.next()` 至 exhausted 后可调用 `rewind()`，在同一连接、同一只读 BEGIN 中复扫；未穷尽、待交拒绝页或关闭后拒绝。它不重新开库或获取新快照，外部 writer 的后续提交只在关闭重开后可见。两遍仍受原同步 current/取消控制，成功 close 后才允许进入写阶段；该读取能力不替代父 Home owner 或目标 SDK CAS。

### 独立 Session 冷维护连接

`openExistingSqliteConnection(filename, {readonly})` 只打开已存在的 BetterSqlite 文件，缺库拒绝；不配置 PRAGMA、不建表、不迁移。调用者拿到句柄立即纳入原资源的 close 集合，再校验 schema、设置所需 foreign_keys、拿写锁并复核 current。初始化校验或 PRAGMA 失败与 close 失败须同时可见；关闭失败只明确重试同一连接，不重开库、不重放业务。普通 `LocalSqliteStorage` 行为不变。

冷恢复的 `inspectMemoryLedgerSelectedSources` 只接受原 Memory ref/identity，由原 adoption cleanup 的来源查询返回保留的事件身份；不开通用 Ledger，不复制候选来源规则。它在同一只读事务核现行采用 schema、表身份与物理路径，首回调前固定入参，返回前再核 current；初始化和关闭失败沿原资源 close 能力保留。外层在父决定中保存这些来源，再交既有 selected retention 做原屏障/原件清理。
