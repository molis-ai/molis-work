# W5-16：Home 离线快照与恢复

状态：Codex C2 实施中；B1 #1190 `bc0160f06` 经独立 REVIEW/TEST 核收，已随 #1202 实际合入 main `645853cb6`（#1190 本身关闭而非单独 merge）；B2a（Runtime 备份密封、只读 vault 预检、旧备份维护）进入交付验证，B2b（CLI 私有状态密封）待接续。早期 Home 互斥及完整快照/恢复尚未实现。负责人：Codex 实现2。目标是完整命令功能可用，工程证据、临时 Home 实操与一骏本人验收分别结算。

## 目标、依据与交付顺序

落实主规格决定 #20：`molis-work home snapshot --to <dir>` 与恢复在离线窗口操作同一个 Home；逐库用 SQLite backup API，保存必要的非 SQLite 状态，清单记录版本、完整性与摘要，恢复版本不符就拒绝。定时在线备份、在线 quiesce/resume、换机器或搬动 Home 绝对路径不在这里。真实 Home、钥匙串、真实凭据与发版均不操作。

Claude 负责整线方向、优先级、跨线依赖与统一 full。2026-10-24 的具体技术选择由 Codex root 依一骏新增的决断授权给出：

1. B1 独立 PR：IM 邀请只存 SHA-256，改齐公开合同、用户路径、拒绝与维护演练。
2. B2：按唯一 Home 存储登记逐项核凭据；B2a 先独立交审，B2b 必须接续。Runtime 备份引用化，CLI 私有 `.home` 密封后保留原字节和权限，证明可重建的派生项才排除，不静默漏备。
3. A 前置：取得同一 Home lease 的时点早于宿主业务存储、调度初始化，Agent 转借同一所有权；快照、恢复及宿主互斥。只作必要启动接线，不增第二把锁或改造在线调度。
4. 完整快照，再完整恢复；可以分 PR，但上述总范围保持。本片交付不把 C2、W5-16 或防腐线标完成。

C1 RAC-113 以 #1183 固定并释放后，B1 已按约定交 REVIEW/TEST、释放给修复2的 #1112 短片，之后回到 B2。B1 在统一 #1202 中落定 S-61，真实前序 S-59/60 随沙箱同批进入，不插占位或放宽门禁。B2a 固定 head 后也立即直交 REVIEW、TEST、流水线并释放源码，不等待 B2b、评审或 CI；后续单 writer 由流水线按真实依赖接续。本片沿已有 S-12 增补密钥/备份拒绝，不另抢新编号。

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

验收沿 RAC-104/107/108：有内容的受管 CLI 临时安装在 snapshot 前后 Home 字节/权限不变；扫描全部 payload 无合成原文；移除整个 `.home` 后用同 Home 原 key 恢复原相对路径、二进制/文本字节和 mode；缺/错 key、篡改、越界、软/硬链接拒绝且目标零写；正常 pre-master 路径经过显式准备后可备份恢复；payload 不含 raw master、SDK key 或 Keychain 值。完整命令联验由后续 engine 完成，不能把 owner 单测算作完整命令交付。

### 现行登记逐项凭据策略

以下集合来自本片基线 `f586496e` 的 `homeStores()` 实际输出，按同一集合归组，包含 48 个登记项；它是审计说明，不是另一个运行时名单。后续 A 在唯一登记中补快照元数据，并在同一集成点重新枚举；不得据这张静态表跳过新 owner。表中“普通”指平台管理的凭据为引用，用户正文及插件私有内容仍按其 owner 合同保留，不能用正则删用户内容。最终所有 owner 的字节扫描与恢复实操尚未完成。

| 登记路径（逐项） | owner 与依据 | 快照/恢复策略与依赖 |
| --- | --- | --- |
| `projects` | local-host 的 Catalog、项目库及项目插件数据库 owner | 普通库与必要项目文件；逐库版本/子版本和 WAL backup；模型连接只存引用。项目绝对路径必须保持 |
| `logs`、`backups` | local-host；installer 的预留备份目录 | 日志不备份；`backups` 没有现行写者，空目录可省，未知非空内容必须拒绝分类，不能默认为缓存 |
| `sessions` | private-work-context，`sessions/content` | 库与密封 blob；`content.key` 只记同 Home 原文件依赖，不能导出/替换 |
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
| `directory-access` | desktop 的 `DirectoryRecord {path, bookmark}` | 包含目录授权能力，既有 HOME-DATA 仅推断可重建；完整命令前须核桌面 owner 的密封/本机重新授权边界，不按普通配置导出或静默排除，此项尚未完成 |

文件依赖只留 owner、同 Home 原路径/后端和必要的身份摘要；raw master、SDK key、会话 key 与构建 run key 不进备份。浏览器是现有明确排除；目录授权仍有上表的 owner 核实项，其他独有事实不能借“派生”漏备。

B2a 首轮作者工程证据（`dbec1b89d`，独立评审后来发现上面的有效输入遗漏）：整体构建通过；storage/local-host README 必需项加本片共 70 个明确非浏览器文件，首批 69 通过、1 个新增维护用例因 macOS `/var` 与 `/private/var` 的夹具注入路径不一致失败。修正为真实路径后该文件 4/4 通过，合计 70 个文件、628 个不同用例通过，skip/cancel 均为 0；没有放宽断言。原始未实现基线的备份/预检回归失败；类型与静态检查通过。这些旧用例不能证明后来发现的空配置/BOM 输入已正确。

两项 mustfix 短修：新增正式回归在旧生产输入上为 12/16，通过的原 12 条不受影响，新增 4 条均红；修后整体构建通过，10 个相关文件 58/58，skip/cancel 为 0，其中 Runtime owner 6/6、只读快照 4/4、维护 6/6。`ct` 必须为字符串、可以为空，nonce 保持 12 字节、tag 为完整 16 字节，仍由 GCM 完成认证；缺字段、截短/篡改 tag、坏 nonce 和错 key 拒绝且零写。严格 UTF-8 用 `ignoreBOM: true` 保留原字符，仅在描述符分类时忽略开头 BOM，密封/恢复正文不去 BOM。空原件经真实 prepare/confirm、子进程公开读取、无关 secret 和后续非空捕获验证；空 raw、BOM 加非空 Unicode/换行、0640 权限经 list/apply、新进程 Buffer 对照、外部原件和重复零改验证。其余有效工程证据沿用，不重跑 full；新固定提交、复审/独立复验、静态与推前密钥扫描分别在交付记录绑定，作者验证不替代独立结论。

A 当前真实入口是 agent-host 的 `acquirePrologueStorageOwner`，对 `agent-runtime/.molis-runtime-owner.db` 持有 SQLite EXCLUSIVE；它目前随惰性 Agent 启动，不能覆盖空闲宿主。必要前置的唯一责任仍归 C2：将同一 lease 技术放到可共用的现有公开边界，宿主早期持有，Agent 按可信所有权转借，失败/退出只释放一次；restore 不移动、替换或复制持锁 inode。拟涉及 storage 的通用 lease 端口、agent-host 当前锁适配，以及 local-host 的最小启动/Agent 装配接线。实施 A 前再核实际文件认领，记录精确路径与合同；在途冲突只暂停相关接线。

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
