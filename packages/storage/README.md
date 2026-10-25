# 本地存储基础设施

为各 owner 提供 SQLite 连接、共享日志、幂等记录、原子文件写入和本地安全存储适配，避免每个模块各建一套底层机制。

包名：`@molis-ai/molis-work-storage`。工作区内部包，通过仓库构建和 Host 装配使用。


`openReadOnlyHomeSqlite` 为插件查询服务提供 SQLite 自身强制的只读连接；Host 用 `openBaselineHomeSqlite` 开当前业务基线，再持有读写连接。`homeStoreRegistry`（`home-stores.ts`）是 Home 存储登记的形状与检查：路径只能是 Home 下的一个名字或 `config/` 下的一个文件，一个路径只有一个主人；登记本身由 Host 组装（`apps/local-host/src/home-stores.ts`），这里不认识任何插件或模块。记忆账本与搜索索引的登记（`MEMORY_LEDGER_HOME_STORE`、`TEXT_SEARCH_HOME_STORE`）在各自的适配器旁，普通卸载保留，明确 purge 才清除。当前基线、回滚与错版拒绝由 `tests/issue-home.test.ts` 验证。

`acquireStorageOwner` 是 Host、独立 Agent 与离线 Home 操作共用的 SQLite EXCLUSIVE 所有权技术端口，路径仍是显式绝对目录里的 `.molis-runtime-owner.db`。获取始终严格，同一进程第二次获取也拒绝；不另建锁或根据 PID 放行。`assertStorageOwner` 与 `borrowStorageOwner` 只认本模块认证、同一 canonical root 和原 inode 的 live capability；复制对象不能借用，一个父 owner 同时只给一个执行服务借用。子服务关闭仅归还借用，父 owner 在借用归还前不能释放。失败关闭由原拥有者明确重试，普通释放保留锁 inode；Home 的 `agent-runtime` 父目录也不能在恢复发布时整体替换。该锁及侧车不进业务快照。回归：`tests/security-invariants-home-storage-owner.test.ts`、`tests/security-invariants-home-storage-sdk.test.ts`、`tests/security-invariants-home-storage-host.test.ts`。

持锁进程不能再用普通文件 API 打开/关闭该锁原件来读取或计算摘要：POSIX 文件锁会受到同进程其他描述符关闭的影响。快照和字节对照在读取前排除锁与侧车；inode、模式与目录检查只用元数据。`hasOnlyStorageOwnerFiles` 在 live proof 下只读核对目录是否仅含这些技术文件，任何 SDK 或业务条目都返回 false，不能用它自动采用已有记忆数据。`hasStorageBusinessFiles` 只读同一组技术文件之外是否有条目，缺目录或仅合法技术文件为 false，未知条目为 true，不安全技术链接或异常拒绝；它不授予所有权、采用或写入权，供原数据 owner 保持未启动 SDK 时的 ledger-only 删除。

## 一次典型调用

LocalSqliteStorage 打开连接并配置 WAL、FULL synchronous、外键和 busy timeout；LocalSqliteJournal 借用连接处理日志/幂等。Host 把各模块交出的当前 schema 拼成库的基线（`applySqliteBaseline`），版本不符就拒绝，不就地升级。runWithMolisWorkHome 将文件适配限定到当前 Home。

`describeSqliteBaseline` 用内存 SQLite 描述当前基线的完整 DDL，连接在返回前关闭，不碰 Home 库。Host 用它与 `describeSqliteSchema` 的实测结果比较，确认完整结构后才构造可能创建表的 Repository；SQLite 连接技术留在 storage。

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

## 开发要求

`backupSnapshotSqlite` 只读源库、使用 SQLite backup API 包含已提交 WAL，在私有副本核 owner 版本、schema、integrity/外键并刷盘；`copySnapshotFile` 与摘要端口拒绝链接、特殊文件和读取期间的改动，普通文件使用有界内存流式复制，默认在返回前刷盘。持离线 lease 的快照 owner 可明确延后私有副本的刷盘，先认证实际副本，再在发布前刷齐每个文件；认证或刷盘失败均不发布，不能把这个参数用于省略成功产物的持久化。调用方须先排除所有权锁及其侧车，不能打开它们做摘要。Home 路径、存储集合、同 Home lease 和原 key 策略由 Host 编排，不在 storage 复制业务名单；原 key 只记身份，不导出。回归包含 `tests/home-snapshot-content.test.ts`、`tests/security-invariants-home-snapshot-inputs.test.ts` 与 `tests/security-invariants-home-snapshot-lifecycle.test.ts`。

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
  - 记忆账本只有成功开始写事务后才进入嵌套状态；连接锁导致开始失败后，同一实例的后续多步写入仍完整回滚或提交。回归见 [memory-ledger-transaction.test.ts](../../tests/memory-ledger-transaction.test.ts)。
  - 搜索索引是可删除的派生缓存：文件缺失、损坏或 schema 版本不符时清空重建，不读回任何业务事实。
  - 索引切分：中日韩每字单独、相邻两字成词，其余字母数字按小写词、查询用前缀；候选必须在原文（NFKC、小写）里真实出现才返回，两字中文与 `Q4` 这类短词可查。
  - 正文由读取器提供的条目，只对能读该种类的调用来源返回。
  - 项目被删除时清掉它在个人库里的行：`clearInExistingHomeSqlite` 对已存在的库在一个写事务里运行删除（库不存在就不创建、版本不符照常拒绝）；`deleteSecretEntriesWithPrefix` 按引用前缀删密封的密钥，不解密；记忆账本的 `forgetScopes` 一并忘掉已不存在的范围。
- 改动后必跑：`node scripts/run-tests.mjs tests/storage-baseline.test.ts tests/home-store-baselines.test.ts tests/secret-store-keychain-retry.test.ts tests/secret-store-format.test.ts tests/home-backup-recovery.test.ts tests/plugin-private-storage.test.ts tests/system-search.test.ts tests/feed-local-history-delete.test.ts tests/project-deletion-owners.test.ts tests/project-deletion-studios.test.ts tests/security-invariants-secret-snapshot.test.ts tests/security-invariants-connector-private-state.test.ts tests/security-invariants-home-payload-purpose.test.ts tests/security-invariants-connector-private-state-limits.test.ts tests/secret-store-missing-key.test.ts`
- 相关手册：[docs/platform/STORAGE-AND-EXCHANGE.md](../../docs/platform/STORAGE-AND-EXCHANGE.md)；通用要求见 [docs/system/DEVELOPMENT-REQUIREMENTS.md](../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 进一步阅读

- [职责与接入说明](../../docs/SSOT-MATRIX.md)
- [架构与当前实现索引](../../docs/SSOT-MATRIX.md)

- Status: `partial`
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/storage`
- Migration Goals: `goal-reorg-f2`, `goal-reorg-ap2`.

上述状态用于追踪架构实现范围；当前行为以本包公开入口、调用方和对应测试为准。
