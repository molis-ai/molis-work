# W5-16：Home 离线快照与恢复

状态：Codex C2 实施中；B1/B2a 已实际进入 main，B2b #1239 固定 `5e1d8a29156509d6fc51f75fd5bcc17316e3f225` 已独立核验、在 batch-35 #1258 待统一集成。A #1254 的固定 `b5211d8a5b9557783710ea7574a5e6d26751701e` 已由 Claude FIRST 判可合，并与 MCP 消费夹具 `e2d2ea19dee474bc3aaf788a0c86ba2f06c09c7e` 纳入 batch-36；原树冻结，后续修复由原队列独立接续，不等于已进入 main。本 snapshot 后续树已完成 SDK 零写认证接线及有限工程验证，待本片 FIRST/TEST；独立恢复 checkpoint `0dbde60642fec7ba294d0efe32ecaf22c2dc5a1b` 留在本地 `feature/codex-w5-16-home-restore`，不混入本快照 PR。完整恢复仍依赖 Memory owner 契约，C2 保持进行中。负责人：Codex 实现2。目标是完整命令功能可用，工程证据、临时 Home 实操与一骏本人验收分别结算。

## 目标、依据与交付顺序

落实主规格决定 #20：`molis-work home snapshot --to <dir>` 与恢复在离线窗口操作同一个 Home；逐库用 SQLite backup API，保存必要的非 SQLite 状态，清单记录版本、完整性与摘要，恢复版本不符就拒绝。定时在线备份、在线 quiesce/resume、换机器或搬动 Home 绝对路径不在这里。真实 Home、钥匙串、真实凭据与发版均不操作。

Claude 负责整线方向、优先级、跨线依赖与统一 full。2026-10-24 的具体技术选择由 Codex root 依一骏新增的决断授权给出：

1. B1 独立 PR：IM 邀请只存 SHA-256，改齐公开合同、用户路径、拒绝与维护演练。
2. B2：按唯一 Home 存储登记逐项核凭据；B2a 先独立交审，B2b 必须接续。Runtime 备份引用化，CLI 私有 `.home` 密封后保留原字节和权限，证明可重建的派生项才排除，不静默漏备。
3. A 前置：取得同一 Home lease 的时点早于宿主业务存储、调度初始化，Agent 转借同一所有权；快照、恢复及宿主互斥。只作必要启动接线，不增第二把锁或改造在线调度。
4. 完整快照，再完整恢复；可以分 PR，但上述总范围保持。本片交付不把 C2、W5-16 或防腐线标完成。

C1 RAC-113 以 #1183 固定并释放后，B1 已按约定交 REVIEW/TEST、释放给修复2的 #1112 短片，之后回到 B2。B1 在统一 #1202 中落定 S-61，真实前序 S-59/60 随沙箱同批进入，不插占位或放宽门禁。B2a 固定 head 后也立即直交 REVIEW、TEST、流水线并释放源码，不等待 B2b、评审或 CI；后续单 writer 由流水线按真实依赖接续。本片沿已有 S-12 增补密钥/备份拒绝，不另抢新编号。

## 完整 snapshot 命令（2026-10-24 当前实施合同）

本片后续树最初以 actual main `52560f32c5dec529315d11eff95932c2ea1d7dff` 组合 A `19ccdfa8`、B2b `5e1d8a29`（初始基点 `2b7d8133541deaa9d6ad79eaf5ac0e5ae9a19f97`）。snapshot 实现 checkpoint `8c5c7a677` 后已纳入 A 窄修复 `b5211d8a5b9557783710ea7574a5e6d26751701e`，A 修复后的组合提交为 `6ef2ad3148ef060ed2722dfbc654716529f2812d`，随后两文件 MCP 消费修复为 `e2d2ea19dee474bc3aaf788a0c86ba2f06c09c7e`；A 修复增量已独立双核，[完整 A FIRST](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6393270921) 与 [batch-36 接收](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6393455820) 已回读，统一集成/full 仍单列，不修改冻结来源。交付 `molis-work home snapshot --to <新目录> [--home <原Home>] [--json]`，下述 SDK 只读认证依赖已闭合，按本片范围统一交审。Home 解析沿既有入口，必须已存在；目标在 Home 外且尚不存在，父目录已存在。命令不创建业务 Host、不启动服务、不在线暂停；先取得同一 `agentRuntimeDirectory(home)` 的 opaque lease，再检查业务存储，busy 时不建立输出或暂存。锁与侧车在任何内容读取、摘要或递归前排除，原 inode 与父目录保持。

唯一集合仍为 `homeStores()`：在原条目旁增加快照分类、子路径排除、原 key 依赖和 SQLite 版本检查。带 Home 的枚举由原 installed-library owner 读取账本纳入实际第三方 Home 库；不另建 CLI 库名单。递归发现必要文件和实际分区，SQLite 通过文件头识别并用 backup API 包含最新已提交 WAL，侧车不复制。登记库核当前基线，Catalog 经原 metadata owner 核 owner/schema；项目库记录主版本和全部插件 ledger 子版本，子版本仅由建表 owner 的窄只读端口返回，不在 Host 复制 SQL。未知库、无法分类的内容、坏库、链接和维护标记整次拒绝；未使用的缺失存储记 absent，不初始化业务库。

普通内容保留相对路径与原权限；SQLite 输出记录 actual user_version、owner 子版本、schema 形状、integrity_check/foreign_key_check 和最终摘要，文件记录大小与摘要，目录记 mode。全部来自同一持锁离线窗口，不正则清洗用户正文。vault 只接受现行密文，Runtime 备份引用经 B2a owner 验证，CLI `.home` 只经 B2b 整批密封，不能 raw 复制。SDK、旧 Sessions、构建 run 的 key 只记同 Home 路径与身份摘要，不导出、不补造。书签按 Root 已定边界：显式 Home 内 `directory-access/bookmarks.json` 原字节及权限使用现有 Home payload owner 密封，限原机器原路径；OS 不接受时由用户重选目录，不刷新或伪造授权。Home 外 AppData 作为外部依赖，不读取或复制。已证派生项与浏览器 profile 排除，明确重新登录。

暂存为目标父目录中的随机 0700 sibling，输出文件为 0600，原 mode 仅记在 manifest；无明文秘密暂存。全部 payload、SQLite 校验和刷盘成功后，才写唯一 manifest 并刷盘，原子 rename 到尚不存在的目标。manifest 格式/产品版本、原 Home、owner 集合、文件和库版本、依赖及 exclusions 是恢复输入，不另造完成标记。普通失败清理本次暂存，无成功目录；被杀只可能留下无完成语义的私有 sibling，重试使用新目录，核路径后可清残留。rename 成功而父目录刷盘失败须报“已发布，持久化未确认”和位置，不伪称零产物或删除已发布结果。已有目标不得覆盖，cleanup 不删他人目录。

storage 只负责严格文件技术、SQLite backup/完整性；registry、编排与 CLI 接线归 local-host；installer、Catalog、installed-library 与插件库 ledger 由原 owner 提供只读检查。只追加必要公开导出/类型并同步 API，不新增动作、MCP、权限、加密算法、依赖、门禁或调度。使用有真实内容的临时 Home；整体 build 走公共槽，full 仅 Claude 排期。真实 Home、Keychain、网络/凭据配置均不操作，不重做 A/stdio/Memory。

| 编号 | 本片验收 | 证明方式 |
| --- | --- | --- |
| RAC-104-S-01 | 唯一登记含实际 owner、动态 Home 库和项目/插件/Alchemist 分区，必要文件保存，无未知静默跳过 | 有内容 Home，逐 owner 用原 reader 或 SQLite 实查读回，和实际 registry 比较 |
| RAC-105-S-02 | Host/Agent 与命令双向互斥，失败/退出/被杀可重取，锁和父目录 inode 保持 | 真实子进程/Host、持锁屏障、拒绝前后业务及输出对照 |
| RAC-106-S-03 | backup 含 WAL 最新提交、排除未提交，主/子版本、完整性和摘要正确；坏库/错版拒绝 | 保持 WAL writer 连接，独立 reader 实查备份事实 |
| RAC-104-S-04 | vault、Runtime、CLI 私有状态和书签符合 owner 密封合同，raw key/token/锁不外带 | 合成秘密扫描全部产物，原 key 下由 B2 owner 打开核字节/mode；缺 key/原文/维护拒绝且零业务写 |
| RAC-109-S-05 | 不覆盖目标、不越界、不跟随软/硬链接，中断无虚假完整产物，可重试 | 真实 I/O 故障/kill、完整 CLI 子进程和源/输出对照；文档给恢复步骤 |

### SDK 原 key 的认证约束与接入前诊断（2026-10-24 Root 具体裁定）

临时 Home 已实证：将 SDK 的 `storage.key` 换成另一份合法 32 字节后，仅记录文件 SHA 的 snapshot 仍会成功，但 SDK reader 报密文无法认证。当前实现的主路径证据不能覆盖该缺口。Root 明确要求补真实认证，不降为 opaque 字节结论：在既有 Home lease 内，由 agent-host 唯一 SDK owner 的窄只读端口遍历实际记录种类和全部分页，对 `hasSecureBody` 的记录调用现行公开 `HostStorage.readSecure`，包含合法空密文和墓碑仍保的密文；正文立即丢弃，不返回/记录正文或 key。原 key、错误的合法 key、损坏密文/缺 key、零源写与无 Runtime/模型须有实际断言。没有密封记录不声称证明了 key 与密文对应。

当前公开 `createNodeHost` 会 mkdir root/leases，`exclusiveOwner` 还会清 claims；`readSecure` 缺 key 时可生成新 key，不能据此实现只读预检，也不能因缺可重建 leases 目录就拒绝正常数据。所需最小上游能力是零源写的公开 storage inspection/open 端口，严格现存路径/普通文件/key、沿原格式和原解密实现，不 mkdir/补 key/清 claim；不私有深导入、不复制第二套解密、不隐式采用 Memory Draft 或自行换 vendor。Root/流水线核现有候选与唯一 SDK owner，只串行这个认证接线；C2 继续其余输入、I/O 与进程中断验证。agent-host 只新增必要技术检查，不修改 A 生命周期、Memory 业务/采用，也不读取退役 Sessions 正文。

已实查 Memory SDK 候选的私有 `NodeStorageReader(existingOnly: true)` 有所需只读基础，但当前公开 recovery inspection 限单 App kind 且绑定 Memory 管理授权，不能借此扩大快照权限；由原 SDK owner 补通用窄认证操作后再接薄包装。另用公开 `@prologue/sdk/node` 实证，合法的 metadata-only `storage.commit` 会生成 records、`hasSecureBody=false`，根没有 `storage.key`；检查点也不是必须带 SDK key 的证据。只在真实密封正文时由 SDK owner 要求原 key，纯元数据/检查点允许无 key；没有密封记录不声称 key 已认证。此前粗 `requiredKeys` 规则已在接入真实端口时替换，不能据文件存在推断密文需要密钥。

### SDK 消费实施合同（2026-10-24）

Root/流水线已接受串行采用 FIX7 的固定 SDK `42ccc75ae85b138f73e65f81b789ffecdbb05ce3`（唯一 parent 是当前已消费的 `2c7feba5a6ea85e81e4a263671fb5e68f536d86a`）。准确受控 tgz SHA-256 为 `349ad8987683472d219ef6dffd49d3e98f77dfaf8b95cc5b5b5b42eaeaf77a1c`，独立 REVIEW/TEST 已过；本地再核 708→712 文件，仅五项改变、四项增加、703 项及 package.json 逐字节不变。源码在本地 SDK 仓库，未声称上游 main 合入；不带整个 SDK #102 或 Molis Memory #1101。替换唯一当前包并同步来源、原包历史与 lockfile，不同时保留两套 SDK。

`horizontal/agent-host` 仅新增公开 `verifyPrologueNodeStorageContents` 薄包装，直接调用 `@prologue/sdk/node` 的 `verifyNodeStorageContents({storageRoot,keyRoot,assertCurrent,signal?})`；void 返回，无 Runtime/模型/业务初始化、无解密副本或错误放行名单。所有 SDK 错误均拒绝，包括 `STORAGE_KEY_INVALID`。正常 App 只通过原 agent-host owner 调用，根与当前性来自 Host 已持的同一离线 lease。

在原 `HomeStoreSnapshotPolicy` 增加窄 `inspect` 钩子，通用 capture 完成该 owner 的私有 payload 后调用，输入为实际暂存 data root、registry 导出的原 Home root、同次 inventory 的相对文件/目录和 lease/signal。agent-runtime 及实际 builder runs 用它认证**即将发布的归档记录**，只在原 root 读取已有 key；构建 run 根从同一 inventory 发现，不另列静态名单。key 不复制到 stage，claims/leases 等原排除项不复活。移除 SDK 粗 `requiredKeys`，无 sealed 正文不要求 key、不声称 key 已被认证；退役 Sessions 的既有 key 前置保留。

验证保留正式 `security-invariants-home-snapshot-sdk` 的全部现有断言，证明错误合法 key、跨 kind/页/空正文/保留密文墓碑被拒绝，纯元数据/普通检查点无 key 成功，同一锁仍被独立进程判 busy。再跑原四个 snapshot 文件、源码/构建指纹与涉及 agent-host 的有限要求；shared-core full 由 Claude 统一。SDK 上游双核不能替代这些本应用结果。快照通过后交普通非 Draft PR 给 Claude 首评与 TEST；恢复 checkpoint 的预检/发布/回滚和真正 Memory 资格/合法空态缺口继续，完整 C2 不关单。

### SDK 接入后的本应用验证（2026-10-24）

准确包已串行采用，`pnpm install --frozen-lockfile=false --offline` 的 lockfile 只变本 SDK 路径与 integrity；workspace 登记同步同一个依赖字面量，门禁算法未变。整体 build1/build2 均通过；最终构建与当前生产源码指纹一致（`a66f2676c263eac51ab528b265c548fe7898e73ac8cfa9c4d86865049675078c`）。新测试严格类型、agent-host/Host 类型、API 快照（零变化）、零源码/构建混用、merge-base health、boundary 和 27 个页面资源预算均通过。

原四个快照文件再次通过：CLI 3/3、content 1/1、inputs 26/26、lifecycle 9/9。SDK 第一轮与这些文件共用两测试进程时，文件复制/fsync 因同机 I/O 争用达每次 17–48 秒，120/60 秒父限时导致取消；原 raw `snapshot-sdk-app-first.log` 保留，不称整批全绿。随后按公共 build 槽排独立 I/O 重跑，保持全部原断言和超时，`snapshot-sdk-app-isolated.log` 自然通过 **24/24（含父项），零 fail/cancel/skip/todo，132.16 秒**；原主认证组 92.73 秒、元数据组 17.85 秒、暂存坏 tag 组 19.05 秒。原 21 结果全部已覆盖并绿，新增两 root 暂存坏 tag 的 3 个含父项结果也绿，且在实际发布前以独立进程证明 SDK 检查后同一 Home lease 仍排他。key 不进入 stage、源字节/mode/文件集合保持、leases 不补造；不启 Runtime/模型。

Skill/README 的有限回归明确为 91 个非浏览器和四个浏览器文件，不是 full。非浏览器首批 90/91 文件通过；唯一失败是 `vendor-provenance` 当前记录组仍写旧包名、31 个历史包与“当前已合上游”的旧事实。只将该组改为实际固定包、42ccc/原2c base、localOnly 且无伪造合并、32 个历史包，原门禁变异规则不改；该文件单独复验 78/78，通过后原 90 文件证据复用，不称首批一次全绿。两项原 opt-in 跳过单列：真实 MiniMax 和公网 npm 包安装，未作这两项实测。

浏览器按公共槽和独立测试 wrapper、私有 profile 单进程运行，三个文件通过（action selection 1/1、components 12/12、workflow 42/42）；`agent-studio.e2e` 前两项通过，升级凭据后访问测试 HTTPS 的第三项因 TLS 建连断开失败（2/3）。已亲读 A 阶段干净 `bde02c59` 的原始单用例对照 `molis-w5-16-home-lease-base-studio-retry-20261024.log`：同一断言为 400 而非 200，正文也是 `Client network socket disconnected before secure TLS connection was established`，0 pass/1 fail/0 skip/cancel。该测试与 `public-https.ts` 在 bde、当前 HEAD 与工作区的 blob 完全相同；生产每请求 `agent:false` 而夹具仍 mock global Agent，静态调用链支持旧夹具失效的归因。复用已有真实基线证据，取消仍在公共槽排队的重复 `4f7e95c` 基线构建，不声称新基线 build/test 通过。当前 raw 为 `snapshot-sdk-required-browser.log`，精确证据和 blob 对照为 `studio-tls-baseline-inherited.json`，原始首败和最初基线的不同错误正文仍保留。未改网络/代理配置、生产 TLS 边界或断言；该基线失败交统筹处理，shared-core full 仍由 Claude 统一。

这是本片 snapshot 的临时 Home 工程证据；source SDK 独立双核、第一次旧实现红、首次新实现限时取消和最终隔离绿分开保留，不把它们混成一次全绿。完整恢复不随这 24 个结果关闭；真正 Memory owner 的现行 v3 采用资格与合法空态受控恢复仍是外部契约缺口，恢复 checkpoint 留在独立本地分支。

### 当前 snapshot 证据与剩余项

实际有内容临时 Home 已覆盖 Catalog、两个项目的 Goals/成果固定版本、全部 registry 库的真实行、第三方 Home 库、两组 Alchemist Studio/Search、SDK/构建 run 的记忆、Feed/Alchemist 证据、现行 Runtime 引用、真实 prepare/install/登录完成的 CLI 私有状态和密封书签。独立 WAL writer 连接保持，备份包含其最新提交、不含后来未提交；逐文件摘要、原字节/mode、同 key 的 owner 读回与秘密不外带均有断言。这是 snapshot/局部手动读回证明，不是完整 restore 命令或真实 Home 验收。

`tests/home-snapshot-cli.test.ts` 3/3、`tests/home-snapshot-content.test.ts` 1/1、`tests/security-invariants-home-snapshot-inputs.test.ts` 26/26、`tests/security-invariants-home-snapshot-lifecycle.test.ts` 9/9 通过。拒绝包含未知/错版/坏库、孤立 WAL、维护、缺/错 vault key、链接/FIFO；生命周期含真实双向 Host/命令互斥、目标竞争、源变化、I/O/取消、发布后刷盘未确认和 SIGKILL 后保持原 inode 重试。当前源 build 通过，storage/Host 类型、全部新测试严格类型、boundary、merge-base health、API/资源体积和版本核对通过；full 仍由 Claude 统一排期。

按 CLI、storage、Plugin Runtime、Host、Alchemist README 合并的 104 文件有限回归原始结果为 103 通过、`tests/alchemist-mcp.test.ts` 第一条失败：旧夹具每个 stdio 客户端各开同 Home Host，被 A 的早期 lease 正确拒绝。流水线核 27 个在途 PR 无重叠后，交本 C2 writer 在后续树修消费者：一 Home 单 resident Host，多真实 stdio 客户端经既有网关和真实管理 grant，原只读/跨项目/held 取消断言全部保留；新增关闭重开 Host 后的事实读回。该文件修后 2/2 与严格类型通过，相关 gateway 13/13、Home lease 6/6 通过；两文件增量独立 [REVIEW 通过](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6391660103)、[TEST 窄核收通过](https://github.com/molis-ai/molis-work/pull/1254#issuecomment-6391693958)。这些绿来自 build4 的组合运行时，包含三项 snapshot 技术文件改动，并非干净 A/e2d 构建；A carrier 只取该两文件 commit。原 104 文件 raw 保留，不声称整批已在同一修后头重跑。其余有效证据复用，仅有关增量复验。SDK 接入前的原始红例单列保留：`tests/security-invariants-home-snapshot-sdk.test.ts` 使用公开 SDK writer，覆盖 Home/构建 run、超过一页的实际 kind、空密文、保留真实密文的受控墓碑、缺/错/坏 key，以及合法无 key 的元数据/普通检查点。旧实现曾错误接受错 key/篡改、误拒无密文；该正式旧红单列，不属于原 104 文件绿，新接入结果见上节。持真实 lease 后还用独立进程确认 SDK 检查不能通过误读锁 fd 释放所有权。snapshot PR 尚待最终有限回归与固定头，不标整线 ready。

RAC-107/108 的统一 restore 发布、回滚和重启续写仍归本 C2 后续；此处仅约定共享输入格式和原路径/key 约束，不把 owner 解密或手动读回称为 restore 命令完成。

### FIX19：离线窗口覆盖实际卸载与 CLI 写入口（2026-10-24）

状态：Codex 专职修复19实施中；parent `1556d97b7eb35d72de8b83b7569fbfd48b239760`，只补 #1267 FIRST 非阻塞2，完整 C2/restore、SDK 来源和快照错误分类仍归原队列。目标为此互斥合同功能可用，作者工程证据与独立审验分别记录。

已核真实链：snapshot 取得 `agentRuntimeDirectory(home)` 的 owner 并持到发布/清理结束；卸载 prepare 的 Catalog、RuntimeIntegration/WebService 预览只读，confirm 却在没有 owner 时写收据、移接入/服务、删 demo 与登记的 Home stores。purge 直接删除 `agent-runtime` 会使活锁 inode 脱离路径。CLI v1 的本地 fallback 构造未绑定 Home 的 Host，项目库在 runtime open 时写入；init 的 mkdir 更早。这两条确实绕过现有离线窗口，单文件 stat 不能补跨库一致性。

Root 已裁定普通卸载的最小接线：只读预览保持；confirmed 可写窗口在任何可避免副作用前严格取得同一 owner，busy 不消费计划。已有 Host 先同步检查 `lifecycle()` running，再用原 `ensureHomeStorageOwner`、`retainHomeStorageResources` 接纳并保留 pending，最终 settle 才归还；不改 Host 方法或 close 实现，不重取或伪造 SDK 借用。若该模式的预览表明受管服务仍在运行，先拒绝，不能在被保留的卸载中 bootout 自己并等待自身退出。不同 Home、closing、失败回执与明确新预览重试分别验证。

离线 purge 的候选是清全部登记业务数据而永久保留原 `agent-runtime` 目录、owner 锁与侧车；Home 最终可仅余技术骨架，不能先 unlink 再声称旧连接仍排他。借活 Host 的 purge 候选为先拒绝，由用户显式关闭后独立执行。这两项仍等原 Claude 的具体裁定，不以 Root 对普通卸载的批准代替。无第二把锁、lease 表或维护状态机，不主动停止占锁用户进程；非合作外部文件写入不在互斥保证内。

CLI fallback 仅在目标实际位于当前 Home 或由该 Home Catalog 登记时，通过 `ensureHomeStorageOwner` 绑定到本次 Host 的现有生命周期；拿锁早于 init mkdir、运行环境和 SQL。真实转发、明确拒绝/结果未知不回退的 S-07 合同不变，外部独立数据库不因本修复取得无关 Home owner。沿现有 owner 能完成的接线不修改 storage 公开结构。

首轮整体 build 自然通过；boundary 的唯一失败是管理入口门禁把 CLI fallback AST 写死为直接返回单表达式，不接受此前置 owner。Root 与 REVIEW 对具体 v2 patch 核定为必要门禁收紧，已按原授权应用：准确 Home 分类与 owner 前置、Home init mkdir、原唯一 return 是强制规范，旧无 guard 形状与额外业务语句拒绝，MCP 的原单表达式及唯一 unprepared client、reference、signal、resident/dispatcher 约束不变。外部独立 init 保留原有 JSON 解码前的父目录创建，Home init 只在 fallback 实际接纳且持 owner 后创建。全部原门禁变异组与新增 14 种拒绝变异已正式通过；最终候选双审验另结，不用专项文本核验代替真实运行。

| 编号 | 本修复验收 | 证明方式 |
| --- | --- | --- |
| RAC-105-S-06 | snapshot 占用时 confirmed 普通卸载/purge 在收据与安装/数据副作用前拒绝，原计划在释放后可重试成功 | 临时 Home、真实 snapshot 子进程与可释放 payload 屏障，源文件/安装数据/收据对照 |
| RAC-105-S-07 | 清理持有窗口中 snapshot/第二 Host 拒绝；purge 到 owner 目录清理后也不能重建锁绕过，释放后可重取同 inode | 正式 purge 的最终收据删除边界中真实子进程；业务项移除与原目录/锁 inode 实查 |
| RAC-105-S-08 | Home CLI fallback 与 snapshot 双向互斥，init 拒绝不建目标目录，释放后真实写入；外部独立库不被无关 Home 占用阻断 | 真实 CLI 与 runtime-open 子进程屏障，SQLite 实查/正式 snapshot 与源/目标对照 |
| RAC-105-S-09 | 已持 owner Host 的正常卸载不二次获取，关闭等待已接纳卸载，closing 后不接纳新维护 | 现有 Host/lifetime 的真实并发交错，拒绝前业务不变、完成后同 inode 可重取 |

定向新用例为 `tests/security-invariants-home-snapshot-entries.test.ts`，受控进程夹具 `tests/fixtures/home-snapshot-entry-window.ts`；沿生产公开入口，不用 sleep 决定交错。原 parent 的 RED 与最终 GREEN raw 分开保留于 `/tmp/molis-fix19-snapshot-exclusion-20261024/`。最终按 Host/CLI 的 README 跑适用定向要求、整体 build（公共 machine-slot）、boundary、准确 merge-base health、test-imports、secrets；不重复 full，不接触真实 Home。S-07/S-12 仅将必要窄语义和准确拒绝测试引用交唯一 carrier 更新，避免覆盖 FIX4/FIX7 的共享表。

普通卸载/CLI v2 阶段已实际完成：整体 build、70 包 boundary、8 条 S-08/S-09 真实交错/别名/登记项目后备/关闭与拒绝用例全绿；原 CLI 协议 5 项及完整管理门禁 7 项（其中含 14 种新增拒绝变异）全绿。按 Host 与 CLI README 第一条必跑清单去重的 62 文件自然通过 557/557（含父项），零 fail/cancel/skip/todo；包含 README 点名的一个浏览器文件，使用公共 test-kit、独立 profile 和 `MOLIS_WORK_TEST_CHROME` 指定 wrapper，并经公共 build/browser 槽。新用例 strict、8 文件 scoped Biome 与对实际 merge-base `52560f32` 的 health 通过。这些不是 full 或独立最终候选核收。

原红分开保留：stdin 屏障的 ready/EPIPE 不能证明窗口，标夹具故障/未验证；FIFO 屏障加独立 busy 断言后的旧实现真实拒绝失败另存 `red-1556-controlled-fifo.log` 与 `red-1556-parent-and-uninstall.log`。普通 v1 的 10 文件批为 9 过/1 CLI 协议回归；恢复外部 init 原顺序后的 v2/62 文件结果单列，不抹首败。purge 的 busy 之后同 plan 重试仍是 `plan_stale`，未计通过；独立诊断只见 Memory 的 0-byte WAL/32768-byte SHM、Agent 锁目录时间及项目目录派生项变化，不是业务修改。此处尚未实现技术指纹规范化、保锁 purge 或活 Host purge 的最终策略，RAC-105-S-06/07 和整题保持未完成，等原 Claude 对具体合同裁定后继续。

## B1：只存哈希的邀请合同

B1 实施前，`server/src/im/writes.ts` 将原文写入 `im_rooms.invite_token`，轮换回执又保存完整 `ImInvite`（token/path/url）；GET 从库取回原文，`packages/im-ui` 依赖它。B1 同改合同与客户端，避免只换列值导致现有页面失效。

库和表归 `server/`（`@molis-ai/molis-work-server`），不归 `apps/server` 启动器。库基线由 1 升至 2：`im_rooms.invite_token_hash` 可空且唯一，非空为 SHA-256；新建普通群与项目群均不生成尚无人持有的邀请令牌。项目群仍只能经项目权限加入，不开放邀请。

公开 IM 合同升至 v2，只读现行字段，不留旧读法：

- GET `/im/api/rooms/:room/invite` 只向当前 owner 回安全状态 `{ room_id, token_hash }`，不创建或更换链接。
- 显式生成/更换 POST `/im/api/rooms/:room/invite/rotate` 接受 `{ client_id, token }`。浏览器用 `crypto.getRandomValues` 生成至少 32 字节随机值；同一意图保留同一对，不能从 `client_id` 推导令牌。令牌只存在当前页面内存与请求中，不进 localStorage、数据库、回执或日志。
- 服务端按 SHA-256 写入、比较；回执与回应仅含安全状态。页面从本次已持有的令牌组成本站链接。所有生成、更换与重放先重查当前房间、成员、owner 和项目限制。复用同一 `client_id` 改内容仍拒绝。
- 原请求在后续轮换后重放不能写回旧哈希，也不能声称旧链接当前有效；返回当前安全状态供页面核对。hash 本身不能作为入群凭证。
- 当前页超时、断连接、重新认证后，重试沿用原意图，不重新生成。重开弹窗可复用该页仍持有且与当前状态匹配的令牌。刷新或换设备后无法取回原文：清楚说明已分享的链接仍有效；只有本人明确更换才使旧链接失效。打开弹窗绝不隐式轮换。
- 事务或回执失败时哈希、事件与回执一起回滚。提交后丢回应及重启后同请求重放不新增轮换或事件。复制保留现有 `molisCopy` 反馈。

## B1：一次性库维护

运行时拒绝 v1，不自动迁移。维护脚本位于测试夹具，只有 `list` 与显式 `apply`，路径必须指向一次性 Home 或授权维护窗口的副本；本任务仅在一次性 Home 演练。真正维护仍同 W5-17、Goals S9 排在既定维护时段，先在拷贝 `list`，真实 Home 需当次窗口授权。

`list` 用只读连接，输出版本、待哈希房间数与含邀请结果的回执数，不输出令牌、URL 或正文。`apply` 先完整检查版本、结构及回执 JSON，构造新的 v2 库，按旧令牌的 SHA-256 保留已有链接效力，将邀请回执改成安全状态；群、成员、消息、Thread、事件、非邀请回执及幂等身份保持。原库在预检、构造或校验失败时不变，发布前有可恢复原件，重复执行不再变更。

不能只 UPDATE 列后宣称秘密已消失：必须在离线发布的新 SQLite 文件及其 backup API 副本中检查已知原文字节，覆盖 WAL、freelist 与旧侧车。旧原件是敏感维护材料，保留在快照范围之外。发布前写入最小恢复标记 `server/.invite-maintenance.json`（原件/暂存位置），runtime owner 在打开库之前拒绝该标记；正常完成或回滚后删除，崩溃后先人工按记录恢复完整原件再重试。完整新库刷盘后进入收尾：先删除含原文的私有工作目录并确认父目录刷盘，再删除阻断标记并确认目录刷盘。工作目录删除失败或清理前中断必须仍被标记阻断；任何发布后收尾失败均明确报已发布但收尾未确认，保留新库和 Home 外原件，外层清理不得重试掩盖该状态，不在标记消失后回滚。保持宿主停止，核新库完整性、清完敏感工作副本且确认 Home 无原文后才解除标记，或恢复完整原件。这个标记用于防止半成品被打开，不能拿它证明维护完成；失败不得清空旧业务数据。维护程序和演练在真实维护完成后一起删除，从 Git 历史取回。

## 后续 A/B2 与快照、恢复

### B2a 当前实施合同

2026-10-24，B2 从 main `f586496e` 独立实施，沿用这一份 slice；不改已冻结 B1 头。Runtime 原配置备份在 `installer/runtime-integration-apply.ts` 原样写入，现有公开结果给出备份路径，回归也要求保留原配置精确正文；它是恢复材料，不能当作派生缓存漏备。

新备份由 Runtime integration owner 将完整原配置交给既有 `SecretStore` AES-GCM 密封，`runtime-config-backups/<runtime>/<plan>.bak` 只保留有版本的 owner 引用。引用由可信 Runtime/plan 身份形成，重复意图只对应同一正文；冲突拒绝。原配置与原权限恢复能力保留，经 owner 的明确读取接口取得原文；不在普通检测、结果或日志里返回正文，不增加第二套加密，不替用户写真实外部配置。`backup_path` 仍指向该备份条目，读取内容的调用方改走公开 owner 接口，不能把描述符当作原配置使用。当前正常读取只认现行引用格式；已有原文 `.bak` 由同一 W5-17/Goals S9 授权窗口中的一次性 list/apply 维护处理，先在临时 Home 演练，真实 Home 仍未执行。

REVIEW 6383768725 与独立 TEST 6383805807 发现两个当前验收必须修的输入遗漏：真实已存在的空配置会形成合法 AES-GCM 空密文 `ct: ""`，旧 decoder 将它误判无密文，使该备份及整库逐条预检拒绝；旧 raw 维护的严格 UTF-8 decoder 默认消费 BOM，成功恢复少了 `EF BB BF`。本次短修必须保留“存在且零字节”与不存在的区别，空正文仍有完整 nonce/tag 认证与原权限，不能跳过空记录，不能阻断同 vault 的其他条目或后续捕获；维护严格拒非法 UTF-8，同时按原字节保留 BOM。用真实 prepare/confirm、公开新进程恢复、无关条目、后续非空捕获、空 raw/BOM 维护 list 零写、重复零改和独立 Buffer 比对证明。此项不是 B2b 的 entries=0 后端绑定，不扩到初始化或新持久字段。

一次性维护先完整核旧条目、路径、文本编码与已有 vault/原钥匙，拒绝未知文件、链接和损坏数据；list 不写 Home。apply 先把备份条目原件与原 vault 密文保存在 Home 外新建私有目录，不复制任何 master。写 `runtime-config-backups/.maintenance.json` 后才调用现有 owner 密封正文、在原路径原子安装引用；全体正文、权限和密文依赖核对并刷盘后才解除标记。发布中断或 I/O 失败保留标记、原件和已写的密文/引用，明确报未完成与恢复位置，不假称跨文件整笔回滚；正常 Runtime 备份读取/捕获在标记期间拒绝。保持宿主停止，按外部原件恢复旧条目和原 vault 后重试，或完整核对现行结果后解除标记。旧 raw、当前引用、失败/杀进程、原件恢复及完成后无原文的证据都只用临时 Home。

维护入口是临时夹具 `tests/fixtures/runtime-config-backup-maintenance.mjs`，先 `list --home <离线副本> --json`，再 `apply --home <离线副本> --backup <Home外全新私有目录> --json`。输出只含数量/状态与恢复位置，不含正文。真实 Home 的 list 必须在副本运行；apply 还需当次已授权停机窗口及 `--maintenance-window`，本任务不运行。失败后保持停止，按 marker 的 backup 逐文件恢复 `.bak` 原字节/权限及原 vault 密文；`vault_existed=false` 时核对后移除本次新 vault，保留所有原 key。仅清理 marker.pid 对应、已确认进程停止后的原子临时文件（`.<basename>.<pid>.<time>.tmp`），不能按全局模式清理。确认原件已完整恢复后才移除 marker 并重试。外部旧原文按敏感维护材料保留在新快照范围之外；真实维护完成后删除夹具与演练。

storage 提供 SecretStore owner 的只读快照预检入口：输入明确 Home 与快照中的 v2 密文，严格核格式、后端及每个条目的认证；按快照的后端读取同 Home 已有 master，返回非敏感依赖引用与数量，不返回主密钥或正文。Runtime 备份 owner 的明确读取共用同一只读校验，按已核归属的引用取得单条正文，避免普通 `get()` 的进程缓存掩盖原 key 已丢失；该读取不扩大到检测和一般返回。不初始化带锁库的 store，不创建目录/锁/新 key，不因现 Home 密文已损坏而放弃可用快照。空 vault 不建立密钥依赖；有密文时缺 key、错 key、错后端和损坏密文均拒绝，原 Home 的文件与字节不变。现有加解密与 master 选择仍由原 owner 持有。

文件密钥（feed、会话内容、SDK 主存储和构建运行）只作为同 Home 的现有依赖，不导出原文、不补造替代值。按 `homeStores()` 的现行登记逐 owner 记录密封数据、依赖与可重建项；库里的用户正文不冒充平台凭据清洗。最终整 Home 备份字节与恢复联验由后续 A/快照/恢复实现继续证明，不能把本片 owner 用例称为完整命令完成。

当前允许路径：`packages/storage/src/adapters/file-secret-store.ts` 及公开出口；`apps/local-host/src/installer/runtime-integration*` 和独立备份 owner；其公开入口/直接调用方、一次性维护夹具、必要 README/HOME-DATA/维护说明与本 slice。`tooling/gates/error-owners.json` 只为原未归属的 SecretStore 文件登记 storage 主人，不改既有归属或门禁判断。存储出口与在途 #1184/#1153 是共同导出追加，交统一批处理；`home-stores.ts` 有 #1194/#1157/#1130 实际改动，本片先完成不依赖该函数的 owner 路径，不为共用文件合 main。验收沿 RAC-104：新备份不含合成凭据原文、重启和原 key 下正文/权限可恢复、丢 key 不生成替代、只读预检成功和各拒绝零写、旧原文维护保留恢复能力及失败可恢复。定向用例先红后绿，改到 src 后整体构建，再按 storage/local-host README 的适用要求与静态门禁验证；full 仍由 Claude 统一。

唯一 owner 集合来自 `apps/local-host/src/home-stores.ts` 的 `homeStores()`；通用路径与登记技术归 storage，不能在 storage 引入插件/Module 实现，不能另造 CLI 库名单。目录级登记还须涵盖 Catalog、全部项目库及插件子版本、Alchemist 分区库和实际存在的非 SQLite 状态。文档库数与旧版本文字不能替代现行 owner 基线。

### B2b：受管 CLI 的私有状态

2026-10-24 root 已裁定采用密封 payload；不能把整个原 `.home` 当作不可丢失的外部依赖。`connector-cli-launch.ts` 将 CLI 的 HOME/XDG 配置、数据目录指到 `runtime/connectors/installs/<id>/.home`；其中登录文件和独有配置由 connector owner 按安装身份枚举，保存普通单链接文件的相对路径、原字节和权限。包、共享运行时、安装 `.tmp` 和已证明只存派生缓存的 `.home/.cache` 排除，不能把未知配置猜成缓存。安装所有权、固定版本及连接的 `installation_id` 引用仍备份。第三方格式保持 opaque，不重写其认证协议，不承诺已被服务商撤销或过期的会话仍有效。

拟由 `apps/local-host/src/connector-private-state.ts` 提供 owner 的枚举/预检边界，通过 `readManagedConnectorTool` 核对现行安装归属；storage 的既有 SecretStore owner 提供只读 opaque payload seal/open，输入明确 Home、原 backend/key 引用、安装身份、相对路径和字节，认证绑定 owner/安装/路径/格式。payload 只含密文和必要元数据；不调用 `SecretStore.put`，不写活 vault，不落明文暂存，不建立新 master 或加密平台。恢复先全量核密文、原 key、路径、链接和权限，再交统一发布/回滚；原 `.home` 已丢失但原 key 尚在时必须恢复文件。

完整生产链已有 master 初始化：`installPreparedCli` → `startConnectorSetupSubmission` → `beginConnectorAuthorization` → `bindConnectorAuthorizationProtocol` 先向 SecretStore 写 presentation；安装的 `onPrepared` 与完成时又经 `bindConnectorAuthorizationInstallation` 写入。只看末段 `connectCli` → `activateConnectorConnection` 会漏掉此前序。2026-10-24 root 已纠正初版提案：保留原初始化链，不新增 CLI 初始化接线或 pre-master 常规维护步骤；底层 installer 直调用例不能证明生产可达。

实际问题是授权结束后 `finishConnectorAuthorization` 清除最后一个 presentation，vault 的 entries 可以为空，但 v2 backend 与原 master 已建立。B2b 必须把现行持久 vault 的 backend 作为绑定依据，entries=0 也只读原 key；正常重开不能因环境偏好变化切换后端或补造 key。初次不存在 vault 的正常初始化保持。CLI payload 独立登记其 key 依赖，不能借 B2a“单独空 vault 无密文依赖”漏掉它。无需新增持久字段、dummy secret、兼容格式或第二把 key；只读 seal/open 不调用可能创建 key 的普通 resolver。公开回归走真实 prepared/start/bind/finish 路径，证明首次登录前已建立依赖，完成清空后在新进程/偏好变化下仍可读，缺/错 key 拒绝且零改写。暂不改 `connector-cli-setup` 等生产初始化接线；B2a 固定交审后按唯一 writer 排序接 B2b。

验收沿 RAC-104/107/108：有内容的受管 CLI 临时安装在 snapshot 前后 Home 字节/权限不变；扫描全部 payload 无合成原文；移除整个 `.home` 后用同 Home 原 key 恢复原相对路径、二进制/文本字节和 mode；缺/错 key、篡改、越界、软/硬链接拒绝且目标零写；真实 prepare/start/bind/finish 前序已建原依赖，完成后空 vault 仍可密封及预检；payload 不含 raw master、SDK key 或 Keychain 值。完整命令联验由后续 engine 完成，不能把 owner 单测算作完整命令交付。

### B2b 本次实施与边界（2026-10-24）

唯一源码 START 从 main `0060920a314224b2eda6b71ee21b7e29323f6962` 进入，原 B2a 的生产 SecretStore 与五个 CLI 关键文件均已逐 blob 核对；在途 #1223 只继承该实现，本片不接它的运行时版本修复。#1210/#1212 的插件 ownerFiles/materials 不管理 CLI 私有 `.home`，相关实现保持。

本片首先修现行 v2 vault 的持久绑定：文件存在即沿其 backend 只读原 master，不以 entries 是否为空决定能否切换后端或初始化 key；从未有 vault 的首次初始化保持原行为。正常重开在原 key 缺失或格式损坏时拒绝；格式正确但不同的 key 由 payload 的 key 引用与 GCM 认证识别。既有单独空 vault 预检无需 key 的行为保留，不能扩成 CLI payload 没有 key 依赖。

storage 公开 `sealExistingHomePayload(home, binding, contents)` 与 `openExistingHomePayload(home, binding, payload)`，共用原 AES-GCM v2 core 和既有 master 读取，外层只带格式、backend、密钥身份引用与密文；Home、owner/install 绑定和正文在认证密文内。不初始化 store/lock/cache，不 put 活 vault，不生成 key，不返回 master，不改 vault 字段或版本。seal 必须有真实现行 vault；open 按 payload 的原依赖读取，不依赖当前 vault 完好。明文仅在明确 owner 的调用内存中。

connector owner 公开 `captureConnectorPrivateState(home)` 与 `preflightConnectorPrivateStateRestore(home, snapshot)`：枚举所有可核归属的安装，`.home` 的目录/普通单链接文件相对路径、原字节和 mode 密封；未知 `.cache` 不凭名字排除。安装身份与来源摘要绑定，payload 外不露敏感文件名。预检完整核当前安装集合（缺项、重项拒绝）、密钥、密文、全部路径与目录/文件关系，任何拒绝不写目标、不返回部分计划；原 `.home` 已丢时仍可返回包含空目录、空文件、二进制与 BOM 的完整内存文件计划。实际发布/回滚仍归后续唯一 restore publisher，本片不另造恢复写入器，也不以手写 fixture 发布证明命令已完成。

允许生产路径：`packages/storage/src/adapters/file-secret-store.ts` 及同 owner 必要的小型 adapter 拆分、`packages/storage/src/index.ts`；新 `apps/local-host/src/connector-private-state.ts`、`apps/local-host/src/index.ts` 的显式共同导出。新正式安全回归与直接 fixture；同一 slice、storage/local-host README、HOME-DATA 与原 S-12 的精确用例引用。保留 CLI 初始化接线、P2c/SDK/contracts/homeStores；无真实 Home、Keychain、凭据、R41、版本或门禁改动。

| 编号 | 本片可观察验收 | 证明与边界 |
| --- | --- | --- |
| RAC-104-B2b-01 | 真实公开 CLI prepare/install/login/job/finish 已建立原 key/vault；finish 空库后新进程改变偏好仍为原 backend，缺原 key 拒绝且不重建 | 临时 Home、本机包 fixture 与真实 PTY；不调用第三方账号或实际 Keychain |
| RAC-104-B2b-02 | capture 与 open/preflight 均不改原 Home 字节、mode、mtime，不写活 vault/lock；所有 payload 中无合成凭据、master 或敏感文件名 | 比对真实文件与输出字节；健康 payload 在活 vault 损坏时仍可按原 key 预检 |
| RAC-107-B2b-03 | 缺/错 key、篡改、错 Home/install、越界、重复路径、软/硬链接及特殊文件拒绝且目标零写，无部分计划 | 公开 owner/storage 路径与独立预期；需要隔离同步阻塞时在自有子进程中验证 |
| RAC-108-B2b-04 | `.home` 丢失但原 key 尚在时，公开预检完整返回原相对路径、binary/BOM/empty 字节和目录/文件权限 | 仅计 owner 预检能力；统一 publisher、真实重开、完整 CLI snapshot/restore 后续联验 |

在真实当前生产路径上先证明空库绑定的两条 red，再修并跑同一路径；新增 seal/open 功能缺失的 red 仅证明能力尚无，不冒业务根因复现。src 改动后公共 build 槽整体构建，跑新定向与包 README 适用必跑及门禁；full/storage 候选交 Claude 统一，不自行启动。固定非 Draft PR/head/raw 立即 DIRECT REVIEW/TEST/流水线并抄 Root，源码固定即释放，不等 CI 或前片合并。

### B2b 本轮评审修正（PR #1239）

本轮修复源码与工程验证已完成（2026-10-24），负责人 Codex FIX4，待固定新 head 的独立增量审验。起点 `b9af98fd430e7451ad0a267e3fc2bc9aab1d7944`；C2 已确认只有只读准备、零落码并交接本轮 writer，完整 C2 后续 owner 保留。复用一轮 6388031418、统筹 6388049535 与现行 CODEX-TASKS §0a，只修本轮有效项，不重复一轮或原 76 文件批、clean006 基线，不接 publisher、早期 lease、bookmark 或完整 CLI 命令。

- RAC-104-B2b-05：复用现有 AES-GCM core，为 Home payload 加用途域、canonical Home 与 owner binding 的 AAD；vault 的现行格式及无 AAD 读写保持。payload 密文移入 vault 后不能读作凭据；合法 vault 密文即便正文恰好是合法 Home payload envelope，也不能移作 payload。两方向在原 b9 生产构建上均须失败，修后拒绝，并证明普通现行 vault 与合法 payload 的原用途正常解封。不增加历史兼容或新 master。
- RAC-107-B2b-06：Root 已裁定当前内存 API 的全批边界为原始文件字节 32 MiB、安装/目录/文件节点 10,000、密封字符串 UTF-8 字节 128 MiB，等于上限允许、超过任一项整次以 `connector.private_state.limit_exceeded` 拒绝，零写且无部分结果。安装节点及每个存在的 `.home` 根目录均计数；不按安装重置额度，不省略未知 `.cache`。原始总量先按 stat 累计，再有界读 fd，并保留 inode/dev/size/mtime/ctime/nlink 变化拒绝；安装、私有树和恢复目标均逐条、迭代遍历，不能先无界 readdir 或递归栈溢出。预检在解密/大解析前核全批密文大小，base64 先算解码量再分配，每个逻辑源节点/文件仅记一次；恢复目标另用独立的全批 10,000 节点扫描额度，不读目标内容、也不把源计划重复记账。这些是完整 RAM 接口的资源边界，32 MiB 不是峰值内存，也不证明正常真实 Home 覆盖；超限意味着整次没有生成可用快照/计划，后续 publisher/流式归档不在本片。
- RAC-104-B2b-07：保留现行 vault 原 backend/key 的严格绑定与 Keychain 失败缓存，既有拒绝断言不放宽。缺原 key 的固定报错解释空 vault 仍可能有外部密封依赖，给出按原 backend 找回原值及重启/文档入口。HOME-DATA 分别写 file 的原 `feed/secrets.key`、env 的原 `MOLIS_WORK_ENCRYPTION_KEY`、Keychain 的原 service/account；新 env 值不能替代原 file/Keychain。手动移开 vault 仅限本人明确放弃旧数据，保留旧密文/原钥匙与快照的依赖说明，不执行真实 Home/Keychain/凭据操作。

S-12 同行补 B2b 的密钥引用、用途隔离、Home/owner/安装/来源绑定、空库原后端与链接/缺 key 拒绝，并补 connector owner 代码位置和上述真实拒绝用例。允许路径仍是原 storage owner、connector-private-state、必要直接回归与原 S-12/HOME-DATA/README/本 slice；不改门禁算法、公共 baseline/assets 或其他初始化路径。

验证：新用途隔离回归先对同源 b9 构建运行；实现后公共 build 槽整体构建，运行新的 crypto/规模/恢复拒绝回归、原 B2b 安全文件及 storage README 适用必跑，核 health 的实际 merge-base、boundary、test-import graph 与提交后 secret。原首批 75/76、657/658 红，候选 Keychain 单跑 9/9、clean006 8/8 分别保留，不称基线复现或已证负载。固定源码后一次正常推原分支，直交增量 REVIEW、风险 TEST 与流水线；full 仅 Claude 统一。

本轮实测与记录：

- RAC-104-B2b-05：在同源 b9 构建上 1/3，两方向互换各真实红，现行 vault/合法 payload 原用途为绿；修后 3/3。独立生成的当前无 AAD vault 密文仍可读，空正文、原 Home/owner 的合法 payload 可解封，错绑定拒绝。
- RAC-107-B2b-06：b9 为 1/4，字节、节点、多安装累计缺口各红；增长拒绝原已通过，不冒充新修。修后 4/4：未知 `.cache` 恰 32 MiB 完整原字节恢复、再加一字节在权限为 000 的内容读取之前得到限额码；源/目标各恰 10,000 节点允许、多一节点整次拒绝；两份公开 prepare/install 的真实安装共享字节/密文额度，恰超一字节拒绝，认证过的超量文件计划也无部分返回；受控真实 fd 读取中追加文件仍因变化拒绝。
- RAC-104-B2b-07：b9 恢复指引断言 0/3，修后 3/3；原 file 缺/坏 key 拒绝断言全部保留，恢复原 key 后可读；env 只有原值能解旧 payload。Keychain 原整文件本轮 9/9 首过，原重试缓存、失败恢复、新进程与 Functions 20 秒上限均未改；新增 mock 场景明确新 env 值不能替代已记录 Keychain 绑定。该次通过不解释原 b9 首批超时的原因。
- 原 B2b 文件本轮 9/9；storage README 所需其余用例加 Feed/model-provider 直接回归为另一个 12/12 文件批，全部通过。合计 17 个相关文件已分别验证，不称为旧 76 文件批或 full，也不重复 b9 的原浏览器 20/20。
- 整体构建最终退出 0；首轮发现错误类别应使用现有 `too_large`，已修正分类，业务码仍为 `connector.private_state.limit_exceeded`。四个新增/修改测试文件严格 TypeScript 通过；actual merge-base `0060920a314224b2eda6b71ee21b7e29323f6962` 的 health、boundary、全部 1,425 个测试进程的 import graph 均通过，0 source/build 混用；27 项页面资源预算通过，未改公共数字。health 首轮指出新增文件需入索引及 S-12 的本机证据列误归 CI，已修正为真实执行归属，未改门禁。
- 原件目录 `/tmp/molis-pr1239-b2b-review-fix-20261024/`：红灯 `purpose-red-b9.log`、`limits-red-b9.log`、`recovery-guidance-red-b9.log`；绿灯 `crypto-recovery-green-01.log`、`limits-green-01.log`、`b2b-existing-regression.log`、`keychain-review-fix.log`、`storage-required-regressions.log`；构建 `build-review-fix.log`、`build-review-fix-02.log`；类型/门禁 `test-types-review-fix.log`、`health-review-fix-02.log`、`boundary-review-fix.log`、`test-imports-review-fix.log`、`page-assets-review-fix.log`。提交后的 secret、精确固定 head、独立审验与共享文件释放记录交原 PR/交接原件。

本轮未读写真实 Home、账号或 Keychain，只有独立临时 Home、本机包源和 PATH 隔离 mock。`packages/storage/src/index.ts` 与 `apps/local-host/README.md` 未改；共享改动仅 storage README、HOME-DATA、S-12 同行及本 slice。C2 的 A 片可在本轮固定源码释放后串行追加其自身共享内容，不在本修复中实施 A。

### 现行登记逐项凭据策略

以下集合来自本片基线 `f586496e` 的 `homeStores()` 实际输出，按同一集合归组，包含 48 个登记项；它是审计说明，不是另一个运行时名单。后续 A 在唯一登记中补快照元数据，并在同一集成点重新枚举；不得据这张静态表跳过新 owner。表中“普通”指平台管理的凭据为引用，用户正文及插件私有内容仍按其 owner 合同保留，不能用正则删用户内容。最终所有 owner 的字节扫描与恢复实操尚未完成。

| 登记路径（逐项） | owner 与依据 | 快照/恢复策略与依赖 |
| --- | --- | --- |
| `projects` | local-host 的 Catalog、项目库及项目插件数据库 owner | 普通库与必要项目文件；逐库版本/子版本和 WAL backup；模型连接只存引用。项目绝对路径必须保持 |
| `logs`、`backups` | local-host；installer 的预留备份目录 | 日志不备份；`backups` 没有现行写者，空目录可省，未知非空内容必须拒绝分类，不能默认为缓存 |
| `sessions` | apps/local-host，SC-4 退役登记 | 仅持离线 lease 的通用快照技术读取 SQLite、核 owner/meta 版本 7 与完整性；不读 Session 业务表、不恢复业务 reader。密封 blob 同点复制，`content.key` 仅原 Home 依赖，不导出/替换 |
| `plugin-runtime`、`assistant`、`placement`、`agent-definitions`、`agent-declarations`、`context-onboarding`、`plugin-originals` | local-host 各当前库声明 | 普通事实、授权/声明与配置；平台凭据为引用，库按各 owner 当前基线备份 |
| `connectors` | connector connection/protocol owner，现基线 2 | 凭据为 `credential_ref`，依赖 vault；受管 CLI 的 `installation_id` 与 runtime 安装状态同点保存 |
| `runtime` | connector-tool-install/runtime/cli-launch | 安装所有权与固定版本记录正常备份；私有 `.home` 由 B2b 密封，包、共享运行时和已证缓存/临时排除 |
| `alchemist` | 各项目 studio/search owner | 普通分区库与密封 search-content；证据密钥引用经 vault，同点备份引用、索引及正文 |
| `functions`、`characters` | 各 Module 当前库声明 | 普通方法/人物事实；Functions 输入 API Key 由现有连接服务消费，不在方法配置重复持久化 |
| `memory`、`knowledge`、`search` | storage 的账本/知识库/全文索引 | 账本、知识库普通备份；全文 `search` 是从源正文重建的派生索引，不备份 |
| `feed` | SecretStore、evidence-content、opaque search store | `secrets.json` 仅 v2 密文，证据密封 blob 同点；依赖现有 file/env/Keychain master 引用，不导出 key；锁库排除 |
| `server` | server IM owner | 依赖 B1 #1190 的 v2 哈希邀请与安全回执；本片基线仍 v1，未集成 B1 时不能宣称整 Home 已无邀请原文 |
| `issues`、`cognia`、`images`、`jelly`、`shelf`、`lingguang`、`todo`、`pages`、`form`、`dataset`、`ppt`、`workflows`、`artifacts` | 各内置插件的 `home_store` 声明 | 保存各库、用户源文件、成果及必要私有状态；平台连接密钥只用引用，锁/已证缓存排除（如 `lingguang/models`）；不清洗用户内容 |
| `agent-runtime` | agent-host / Prologue node storage | records/checkpoints 等必要状态，密封正文依赖原 `storage.key`；key 和所有权锁不导出、不替换 |
| `runtime-config-backups` | installer 的 Runtime 备份 owner | B2a 的现行引用与 vault 同点保存；原文 `.bak` 必须先一次性维护，不能直接混进 payload |
| `runtime-integrations`、`runtime-integration-attempts` | installer Runtime integration owner | 自有配置路径/指纹、结果/错误信息，不存原配置正文；普通备份，含原文的历史材料不得按此分类带入 |
| `browser` | browser surfaces/host | `sites.json` 的站点权限正常备份；既有明确排除 profile/downloads/uploads/PID，恢复后需要重新登录，不能说登录态已恢复 |
| `plugin-builder` | plugin-builder 设计/构建/发布 owner | 源码、设计、发布及 run 状态保留；每个 run 的 `storage.key` 只为原 Home 依赖；已证构建缓存可重建 |
| `cache`、`git-operation-details.json` | local-host 缓存与 Git 审查细节 | cache 可重建；Git 细节是普通事实，与 Agent 审查回执同点备份 |
| `config/onboarding.json`、`config/project-arrival.json`、`config/mcp-tools.json`、`config/external-mcp-tools.json`、`config/connector-mcp-tools.json` | 各 Home 配置 owner | 普通设置、可见工具和授权引用；保留必要配置，不复制 Home 安装控制令牌 |
| `directory-access` | desktop 的 `DirectoryRecord {path, bookmark}` | 显式 Home 内原字节/权限由现有 Home payload 密封，只回原路径；OS 决定是否有效，失效仍须用户重选，不刷新或伪造授权。Home 外 AppData 仅列外部依赖，不读取或复制，不按普通配置导出 |

文件依赖只留 owner、同 Home 原路径/后端和必要的身份摘要；raw master、SDK key、会话 key 与构建 run key 不进备份。浏览器是现有明确排除；目录授权仍有上表的 owner 核实项，其他独有事实不能借“派生”漏备。

B2a 首轮作者工程证据（`dbec1b89d`，独立评审后来发现上面的有效输入遗漏）：整体构建通过；storage/local-host README 必需项加本片共 70 个明确非浏览器文件，首批 69 通过、1 个新增维护用例因 macOS `/var` 与 `/private/var` 的夹具注入路径不一致失败。修正为真实路径后该文件 4/4 通过，合计 70 个文件、628 个不同用例通过，skip/cancel 均为 0；没有放宽断言。原始未实现基线的备份/预检回归失败；类型与静态检查通过。这些旧用例不能证明后来发现的空配置/BOM 输入已正确。

两项 mustfix 短修：新增正式回归在旧生产输入上为 12/16，通过的原 12 条不受影响，新增 4 条均红；修后整体构建通过，10 个相关文件 58/58，skip/cancel 为 0，其中 Runtime owner 6/6、只读快照 4/4、维护 6/6。`ct` 必须为字符串、可以为空，nonce 保持 12 字节、tag 为完整 16 字节，仍由 GCM 完成认证；缺字段、截短/篡改 tag、坏 nonce 和错 key 拒绝且零写。严格 UTF-8 用 `ignoreBOM: true` 保留原字符，仅在描述符分类时忽略开头 BOM，密封/恢复正文不去 BOM。空原件经真实 prepare/confirm、子进程公开读取、无关 secret 和后续非空捕获验证；空 raw、BOM 加非空 Unicode/换行、0640 权限经 list/apply、新进程 Buffer 对照、外部原件和重复零改验证。其余有效工程证据沿用，不重跑 full；新固定提交、复审/独立复验、静态与推前密钥扫描分别在交付记录绑定，作者验证不替代独立结论。

### A：同一 Home 的早期所有权（2026-10-24 作者验证完成，待首评与集成）

本片从实际 main `bde02c59eb9a1d794a442419570819a80585708a` 独立实施，负责人仍是 C2。Root 与流水线的具体 WO 补充本段；B2b 本轮由 FIX4 在 #1239 `5e1d8a29156509d6fc51f75fd5bcc17316e3f225` 固定后释放共享窗口。本片只追加 A 的行为与证据，统一 carrier 合并时保留该头的 B2b 最终段落，不把早期 lease 当作完整快照或恢复。

现行 `acquirePrologueStorageOwner` 的 SQLite EXCLUSIVE 算法上提到 storage 唯一技术端口；仍使用同一 `agent-runtime/.molis-runtime-owner.db`、`busy_timeout = 0` 和同一 inode，不另建锁、进程名单或同 PID 豁免。一个 Home 的第二 Host，包括同一进程中的第二对象，都拒绝。Host 在业务存储、插件或调度初始化之前取得所有权，未给 Home 的 Host 在首次明确绑定前也须取得；空闲或尚未启动 Agent 时已排斥离线操作。锁文件及其侧车不进快照，restore 不移动、替换或复制锁文件，也不以改名整个 `agent-runtime` 父目录绕开它。

所有权是 storage 模块内 WeakMap 认证的 opaque capability，核 canonical root、原目录/锁 inode 和 live 状态；请求字段、复制对象、布尔值和 PID 都不能造出 proof。一个父 owner 至多有一个执行服务借用；父 owner 有借用时不能释放，Agent 关闭仅归还借用，创建失败也只归还自己的部分。独立适配器取得同一底层锁。Molis 的 `createPrologueNodeAdapter` 类型和运行时都要求明确的绝对 `storageRoot`，缺失、空值、相对路径在任何 SDK/磁盘初始化前拒绝，不解析到 cwd 或用户 `.prologue`；上游 SDK 默认行为不变。

生产 stdio 是转发器：不构造 Home 业务 Host/SDK、不直接打开可写 Catalog。context 的 resolve/list/bind/unbind/reject/create+bind、恢复绑定读取及 panel alias 经同一受保护内部传输调用原 Catalog/context owner；不复制绑定算法、不增 MCP 工具或参数、权限名单或通用 SQL/RPC。Runtime/Session/Panel 来自环境和协议 callContext 的传输上下文，与用户工具 arguments 分开；服务端绑定自身 Home、instance 与生命周期，按既有 identity 工厂推导 actor，项目与路径由本 Home Catalog 核实。复用数字回环、no redirect、Home token、Origin、一次性键和请求大小门；元数据/operation 采用 closed shape。断连、主体变化、重启/关闭后的迟到操作拒绝提交，拒绝或结果未知都不回退本地写入，原确认与幂等语义保持。

Web 的首次 Catalog 与后台初始化在持锁后；关闭先阻止新调用并停止现有后台，再等待项目、插件、Agent 和 Catalog 的实际关闭后释放 owner。并发关闭等待同一个结果；清理失败保留仍活的资源及锁，下一次显式 close 只重试未完成步骤，不自动循环或把一次失败永久缓存。初始化失败清理已建资源；进程死亡由 SQLite/OS 释放锁，不删除锁文件。不改在线调度策略，不操作真实 Home、账号、Keychain 或上游 SDK。

允许生产路径是 storage 新 `adapters/storage-owner.ts` 和既有公开出口、Agent 的锁适配/Node 组合与必要依赖、Local Host 的 `home-storage-lifetime.ts`、`project-host.ts`、`system-agent-service.ts`、Web/MCP 启停与必要的窄 context 薄传输、现有 owner 的提交前检查；配套正式进程/安全回归、README/手册与本段。保留 Memory authority/observer/业务关闭顺序、FIX4 B2b 和 #1240 删除检查/桌面 launch args 的独立 hunk。共享出口与同一 spec 已按具体窗口串行，不等待无关 CI 或合入。

Web 生命周期的实际依赖包括 `web-server-close.ts`、`web-storage-resources.ts`、`web-catalog-access.ts`、`periodic-tasks.ts` 与 `computer/computer-surfaces.ts`：只串接已有关闭、共享在途关闭结果与失败后的明确重试，不改变 timer、派发、凭据或桌面业务规则。context 薄传输为 `mcp-context-{envelope,client,gateway,tools}.ts`；`project-catalog.ts` 与 `managed-project-files.ts` 仅增加来自可信调用上下文的提交前检查，确认、绑定与幂等仍由原 owner 决定。

Host 关闭保留原 Home 绑定立即撤下、Alchemist 立即进入 closing 的时点，与原其余资源关闭链并行等待，仍在等模型的前台轮次不能趁关闭等待迟到提交。全部实际关闭均成功后才关闭 Catalog 并释放 lease；不将所有 owner 或 Memory/SDK 一并并行，也不改变记忆先于 SDK 的原业务顺序。既有 Alchemist close/close-late-failure 拒绝断言保持。

早取锁会使原来空的 Home 多出技术目录，因此 `memory/memory-adoption.ts` 的 fresh 判定接收同一个 opaque owner：只有 Home 仅含 `agent-runtime`、且 storage 在 live proof 下核实其中仅有锁/侧车，才仍按新 Home 初始化。已有 SDK、未知文件、ledger、marker 与 prefs 的采用/完整性拒绝保持；不把布尔值或请求字段当作证明，也不读锁原件的字节。与 Memory Draft #1101 `e3d0d4523154f4313b97e5c0c588de36713bf888` 后续合并时保留其独立 profile 校验、`projectDeletionPending`、project deletion 返回端口及 Session pending/live 检查；本片不采用该未接受候选。

`system-agent-service.ts` 外层关闭仍按原顺序撤下绑定、关闭记忆、关闭 SDK；只缓存同一关闭尝试，并记录已经完成的记忆关闭，防止 SDK 关闭失败后重复关闭 ledger。context 输入中的身份拒绝仍由原 handlers 决定；resident 在 handler 请求 scope 之后才关联协议 Session 的面板别名，不能让输入伪造 actor 的失败调用先写别名。

早取锁同样会影响删除项目时的 SDK 存在性判断：本基点的 `project-deleted-owners.ts` 与 `memory/memory-host.ts` 原来只检查目录存在，必须复用 storage 对同一组技术文件的只读元数据识别。缺目录或只有合法锁/侧车的目录没有 SDK 业务数据，保持原 ledger-only 删除且不启动 SDK；真实 SDK、未知项、链接或异常继续按原 pending/拒绝边界处理。这个只读检查不获取锁、不打开锁原件的描述符、不创建文件，也不授予所有权、采用或写入权；新 Home 判定仍必须有 genuine live opaque owner。Root 已确认这是 A 的必要回归修复。与 Memory Draft `c8c23dbec543f34185e8fa94737cf00c22270864` 合成时，其删除 owner 已移到 memory-project-deletion，统一 carrier 将同一技术判断接到新位置，保留其 preview、recovery 和全部独立业务块，不整片采用 Draft。

构造的同步记忆预检单独成段：该函数返回或抛错前已关闭自己的 ledger，尚未创建任何 Host 业务资源，此阶段拒绝立即归还刚取得的 owner，后一个入口继续得到原记忆/版本错误。业务资源创建后的失败仍等待实际异步关闭，失败清理保留 lease。原 Host/Web/嵌入式 MCP/晚绑定拒绝断言保持；字节检查在打开文件前排除纯技术锁和侧车，不因检查本身释放 POSIX 锁。

| 编号 | 本片可观察验收 | 证明边界 |
| --- | --- | --- |
| RAC-105-A-01/04 | 同一 inode 排斥同进程/跨进程第二 owner，两种启动顺序成立，别的 Home 独立 | 真实进程与原文件、业务字节对照；不冒充完整 CLI 命令 |
| RAC-105-A-02/03/05/06 | 伪造/错 Home/释放后/第二借用及链接、替换拒绝；归还子借用不释父锁，正常退出与 SIGKILL 后可重取 | 公开 storage/SDK 调用与独立父进程观察，原 inode 保持 |
| RAC-105-A-07 | 空闲 Host 提前排斥离线 owner，SDK 借父 owner；缺/相对 root 拒绝且零 SDK/磁盘副作用；纯技术目录保持 ledger-only 删除、不启动 SDK，未知/实际 SDK 数据仍保原边界 | 隔离进程与临时 HOME、真实 Node SDK、原 project-deletion-studios/processes 失败及相应数据控制；不取凭据或调用商业模型 |
| RAC-105-A-08 | 关闭未完成/失败时仍 busy，明确重试完成实际关闭后可重取 | 真实插件 stop 屏障及 SDK/Host 关闭链，不只测 release 函数 |
| RAC-105-A-09/10 | 真实 stdio 与 resident 共存，context/alias 只由 resident 提交；错 Home/token/Origin/重放、伪造身份、取消/换主体/关闭拒绝且无迟到写 | 原生产协议、HTTP 与 owner 读写；无本地 fallback |

作者验证已覆盖本片 RAC-105-A-01～10：实际双进程、真实 Node SDK、闲置及晚绑定 Host、实际插件 stop、SDK/Catalog 关闭失败重试、生产 stdio/context/alias 和取消后的目录回滚。整体构建与源码指纹核对通过；8 个 A 测试/夹具文件的 scoped TypeScript 检查、包边界、merge-base health、页面资源和版本核对通过。扩展到历史测试的额外严格类型检查存在原有诊断，不能写成全部测试类型检查已通过；原始对照随 PR 交付。

先按包要求、AI Skill 与安全清单自然跑完 337 个明确文件，首轮 328 通过、9 失败，保留原始结果。修复技术目录误判、关闭开始时点和所需夹具后，受影响的 20 个非浏览器文件及 MCP 授权真实页面通过；另补 24 个直接消费者，记忆采用是其中的真实阶段时序遗漏，修后再按受影响的 6 个文件复验。原记忆采用 9/9、Alchemist 生命周期 21/21、删除 processes 16/16、service 16/16、studios 4/4 与实际授权/撤权均通过；只复验相关项，未重复整批 337。

Studio 的 HTTPS 升级用例在本分支与干净 `bde02c59` 基线上仍同为 TLS 建连失败、同一断言 400 而非 200；最初一次基线给“结果未知”的不同正文也保留，不将它们混为同一根因。三个可选 live 条件未启用，不当作执行通过；没有商业模型、真实 Home、Keychain、全量或用户验收结论。`affected-tests` 建议 full（装配、存储、跨 4 包），选出 310 文件，其中 117 个建议项仍交 TEST/Claude 的后续窗口，full 只由 Claude 统一。完整 A 最小生产调用链和拒绝证据齐备后交正常非 Draft PR，作者验证不替代首评、独立审验或集成；完整快照与恢复仍未实现。

#### A 初始化清理重试补修（FIX4，#1254）

TEST 在固定 `19ccdfa8ed41fee58038e9cedcd43abf3f48e65d` 用公开 API 和真实 SDK/MCP 订阅复现：初始化后段抛错，第一次退订也抛错，原 catch 报 AggregateError 并保留借用，却丢失清理闭包；重建报 agent.storage_busy，父 owner.release 报 storage.owner.borrowed，退订没有第二次调用。Host composition 又只保存成功返回的 adapter，dispose 够不到失败实例。原件为 `/tmp/molis-verify-2026-10-24/pr1254-19cc-test/initialization-cleanup-repro.{mjs,log,json}`。

初始化返回的 Promise 保留显式 `close(): Promise<void>` 句柄；原 await 的 adapter 结果与成功后的 close 入口保持。句柄从创建起拥有本次资源、未完成清理和 release，不依赖异常类或全局恢复登记。初始化失败仍先尝试清理，失败报告原 AggregateError；显式 close 等待本次初始化结算后只重试未完成项，全部成功才归还借用/独立 owner。正常 shutdown 复用这些资源的完成记录，保留原顺序；一项成功后不因后项失败重复副作用。并发 close 共用同次 Promise，失败后允许下一次明确调用，不自动循环。

Host 从创建时保存初始化句柄；失败后的显式 ready 先完成旧实例清理再起新实例，dispose 即使没有成功 adapter 也调用该句柄。关闭一开始拒绝新初始化；已接纳的 ready 保留原正常结算合同，但不能在关闭后登记运行时或再建第二实例，由 dispose 等实际清理。Memory 先于 SDK 的原外层关闭顺序保持。只改 Agent Node 生命周期、Host composition、直接回归和必要说明；不改 storage 锁/快照端口、snapshot/restore 登记与 CLI、SDK 包、真实 Home/凭据、门禁或 baseline，完整 snapshot/restore 仍归实现2。

| 编号 | 本题验收 | 证明方式 |
| --- | --- | --- |
| RAC-105-A-11 | 初始化失败且清理失败仍可显式重试；再次失败仍占锁；已完成项不重复，全部清理成功后同 Home 可合法初始化/关闭/重新取得 owner | 原公开 API 复现和真实 SDK/MCP 订阅的父借用、独立 owner 回归；持续拒绝与恢复均实测，不能在 finally 提前 release |
| RAC-105-A-12 | Host dispose 能收尾未完成初始化；同 Home 并发 ready/close 只初始化/清理一次，关闭后不登记或重开运行时，不提前归还 owner | 真实 Host composition/关闭路径、实际订阅及受控关闭屏障，正常启动/关闭控制；无模型、临时 Home |

目标为本题功能可用并完成必要工程与独立核收；原 A 的 369 文件分阶段证据保原范围，只补本题受影响调用链，不重跑整批或新 full。先在19cc实际整体构建并保留原复现/新增回归红，再改实现并整体构建；定向 lifecycle、安全拒绝及适用包/Skill 回归、scoped strict/Biome、准确 merge-base health、boundary、test-imports、推前 fresh-fetch secrets。资源走 machine-slot，固定修后头正常更新原PR后交 REVIEW 增量/TEST，Claude FIRST 保留。

补修作者证据：原19cc构建来源指纹重新核对匹配b1226d80，原公开API探针仍以exit1记录退订只调用一次/借用不可归还；相同故障的修后探针真实调用第二次退订，后续初始化、关闭、父owner释放与再次取得均成立。新增A-11/12六项通过。首轮30文件为29过/1红，既有system-agent-service指出已接纳ready应正常结算；修正生产分支并保留原断言后，相关8文件50项全过，与其余适用结果合计30唯一文件208项有效并集，不冒一个同头全绿批。原首败、19cc的369分阶段与可选live/Studio边界均保留。构建、strict、Biome、准确merge-base健康、边界和引用检查的原件在 `/tmp/molis-pr1254-init-cleanup-retry-20261024/`；固定修后头还须独立REVIEW增量/TEST与原Claude FIRST、CI/集成核收，本片不关闭完整A、snapshot/restore或C2。

快照只在持 lease 的离线窗口枚举和读数据，逐库 backup，非 SQLite 与其引用取同一切点；写入私有暂存目录，全部验证后才发布完成清单。恢复先验证清单、所有文件、实际版本、完整性、摘要、密钥依赖和原路径；不自动盖版本或迁移。任何预检拒绝都不改原 Home。发布/回滚保留可观察状态和原数据，不复用旧数据库连接，不让半成品被宿主当成新 Home。

## 文件边界与验收

B1 可改：`server/src/database.ts`、IM owner 实现；`packages/contracts/src/services/im.ts` 及其 API 快照；`packages/im-ui` 邀请客户端和装配；直接回归、公开安全拒绝用例与一次性维护夹具；包 README、HOME-DATA、发布 CHECKLIST 和主规格库版本维护行、受影响包清单行，以及落定后的安全表。新错误用现有共同模型，不增 Error 子类；server 经现有插件 SDK 的错误出口映射 kind，不另写状态码表，增加这一份工作区依赖并同步 `scripts/workspace-packages.mjs` 的同一声明，不增第三方依赖。B1 不改 Host 枢纽、在线生命周期、门禁判断规则或产品发布版本。

| 编号 | 完整约束 | 证明方式 |
| --- | --- | --- |
| RAC-100 | B1 的 DB、回执和 SQLite backup 副本中没有平台管理的邀请原文；生成/更换、旧/新链接入群仍正确 | 公开 IM HTTP/owner 路径，扫描合成秘密的实际字节；hash 不能入群 |
| RAC-101 | B1 的重放先验当前权限，重复不轮换；后续更换后的旧请求不能激活或冒充当前链接 | 真实请求交错、权限撤回、回执失败、丢回应与重启 |
| RAC-102 | B1 的真实页面显式生成/更换、复制、安全 GET、同意图重试及丢失原文后的说明正确 | 正式 IM 客户端在独立测试浏览器中的操作，不只静态接线 |
| RAC-103 | v1 离线 list 零写；维护保留旧链接与全部其他业务事实，拒错版/坏 JSON/故障，重复零改且无原文字节 | 一次性 Home，原库/发布库/backup API 副本比对与公开重开 |
| RAC-104 | B2 覆盖每项登记库/文件的凭据、引用、密封数据或派生排除，恢复不缺功能 | 逐 owner 合成秘密与内容/引用实操 |
| RAC-105 | A 的同一 lease 覆盖空闲 Host、未启动 Agent、快照/恢复及失败退出；拒绝不写业务/备份，restore 不换锁 inode | 真实双进程，两种启动顺序、故障与退出后重取 |
| RAC-106 | snapshot 覆盖实际登记库/分区/子版本、WAL 最新提交和必要非 SQLite，清单记录实测版本/完整性/摘要 | 每 owner 有内容的临时 Home，经 backup API 后重读业务事实 |
| RAC-107 | restore 拒绝任一错版/缺件/篡改/越界/不安全链接或缺密钥，预检拒绝原 Home 不变 | 字节/业务状态对照，不只查 manifest |
| RAC-108 | 恢复发布失败有回滚和原件，重复不叠副作用；同 Home 解密、重开和后续写入成立 | 故障注入、原密钥依赖、各 owner 公开读写 |
| RAC-109 | CLI 参数、错误码、原 Home 路径约束和操作说明与实际命令一致 | CLI 端到端成功/拒绝与必要文档核对 |

构建/验证按实际片选：先 `pnpm install --frozen-lockfile --offline`，跨包/合同整体 `pnpm build`，再新定向测试与涉及包 README 的适用要求；`pnpm api:update`、`pnpm boundary:check`、merge-base health、版本与 test-imports 检查，推前 fetch 和 `pnpm secrets:check`。记录精确 head、命令、通过/失败/未跑与原因。合同/存储会触发 full，由 Claude 统一组批，本会话不启动。原始日志保存在本机临时验证目录；作者自测不替代独立评审、测试或用户验收。
