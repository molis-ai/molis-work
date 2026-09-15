# Molis Work Feed Workbench 与 Relay 来源接管

## 背景与目标

Molis Work 已完成第一版 Feed Workbench：Inbox/Feed 下钻后，左侧是 Item 列表，右侧是详情，并可保存资料、升格 Goal 或进入 Goal Runtime/TUI。当前缺口是数据仍来自对 Relay SQLite 的只读导入；Relay 删除后，Molis Work 不能注册新来源、刷新账号或恢复正文。

本任务把 Feed 所需的来源能力完整接管到 Molis Work：来源注册、账号凭据、手动同步、游标与幂等、正文/证据加密存储、失败恢复和一次性 Relay 所有权迁移。迁移完成后，Molis Work 的新增内容和历史内容都不得依赖 Relay 目录、进程、HTTP 接口或数据库。

完成等级：**4 · 内部完整**。本机现有 Relay 可以作为一次性迁移源；迁移完成后的日常读取、同步和处理必须独立工作。真实第三方账号授权、网络可用性和 Provider 配额属于人工门禁，不用 Mock 冒充通过。

## 当前行为与问题证据

- `src/feed/relay-import.ts` 每次从 `~/Library/Application Support/Relay/relay.sqlite` 读取 Source、Item 和 Evidence preview；这只是适配器，不是代码或所有权迁移。
- `feed_sources` 只保存展示字段，没有来源配置、同步游标、运行 receipt 或账号 credential ref。
- Relay 的真实公开来源链路是 `syncInboxSource → Intelligence Client exact → search-evidence-layer Runtime`；RSS、固定网页 query、YouTube 官方频道和自定义 HTTPS RSS 都由这条路径产生 Material/provenance。
- Relay 的 Gmail/GitHub Connector 负责凭据、OAuth/Device Flow、增量游标和 Inbox Item 去重。
- Relay 的正文不是明文放在 SQLite，而是 AES-256-GCM 内容寻址 blob；正文密钥在 SecretStore。现有导入只拿 preview，删除 Relay 会丢失可恢复正文。
- Relay 锁定的 `@adeptify/search-evidence-layer@0.4.1` 与 `@adeptify/intelligence-client@0.2.2` 在 npm registry 当前返回 404；可复现制品只存在 Relay `vendor/`，必须迁入 Molis Work，不能留下指向 Relay 的 `file:` 依赖。

## 保留、替换、忽略

### 保留

- 现有 Feed Workbench、筛选排序、Item 详情、保存资料、Promote、Goal-bound Runtime/TUI 和 `UNTRUSTED DATA` 上下文边界。
- Molis Work 的 Goal、Claim、Run、Evidence、Review 仍是执行与完成事实源。
- Relay 已验证的来源约束：注册不联网；同步必须显式；游标只表示观察进度，正确性由 durable dedupe 保证；失败、空结果和部分结果不混写；凭据不进入 Item/日志。
- Intelligence Client 与 search-evidence-layer 的 exact contract、RSS/AnySearch Provider、防 SSRF、Material/provenance 与 receipt 行为。

### 替换

- 持续读取 Relay DB，替换为 Molis Work 自有 Source/Connector/Run/Cursor/Content 记录；Relay 仅保留一个显式、可重复检查的一次性迁移入口。
- Relay SecretStore 与 evidence blob 位置，替换为 Molis Work home 下的独立 AES-256-GCM SecretStore 和内容目录。
- Relay 的 Item/Assignment 边界替换为 Molis Work 的 Feed Item → Draft Goal → Runtime；不复制第二套执行状态机。
- “从 Relay 更新”替换为“迁移 Relay”，并新增 Molis Work 来源管理、账号绑定、暂停/恢复和立即同步。

### 忽略 / 非目标

- 不复制 Relay 的 Assignment、Job、Review、ForkLight/FlyLeaf 路由、Team/OIDC、Slack/飞书、Automation、外部 Comment/Draft/Publish Action 或 Next.js 壳层。这些不是 Feed 独立所需能力，并会与 Molis Work 的 Goal/Runtime 形成两套真相源。
- 不把 Relay 尚未交付的 Reddit/其他 10 个社媒占位伪装成 live 来源；目录可以诚实展示“未接通”。
- 不自动同步、后台常驻轮询或偷偷访问账号；本轮只有用户显式点击的同步。
- 不在开发或测试中读取、打印真实 Token、邮件正文或 Keychain 明文；真实凭据迁移只由用户在 UI 明确确认后执行，返回数量与状态，不回显秘密。
- 不删除 Relay 仓库或数据目录；只有迁移结果和独立运行验证通过后，用户才能另行删除。

## 用户场景

1. 用户从 Inbox/Feed 打开来源管理，看到 Molis Work 自己拥有的来源实例、状态、上次成功、Item 数与最近失败。
2. 用户可注册目录 RSS、固定网页 query、YouTube 官方频道或自定义 HTTPS RSS；注册本身 0 网络，同一规范化配置不会重复。
3. 用户显式点击同步；Molis Work 先落 `running` Run，再调用 vendored exact runtime，随后在一个事务内写 Run 终态、Source、Feed Item、Material/provenance 和正文引用。
4. 用户暂停来源后不能同步；恢复后可重试。进程重启会把残留 `running` 标为 `interrupted`，不会伪造成成功。
5. 用户可绑定 GitHub Token/Client ID 或使用 Device Flow，绑定 Gmail OAuth Client 并完成浏览器 OAuth；Token 只进 Molis Work SecretStore。连接器同步将 Issue/PR/邮件变成 `Inbox Message`，完整失败时不推进游标。
6. 用户执行“迁移 Relay”：Molis Work 导入 Source、Connector 元数据、Cursor、Run、Item、Material；在可读取 Relay SecretStore 时，把允许迁移的账号凭据和 evidence content key 重新加密到 Molis Work，并复制仍被引用的加密 blob。重复迁移零重复且不覆盖 Molis Work 本地 disposition/linked Goal。
7. Relay 不存在时，Molis Work 既有来源、内容和账号仍可浏览、同步和开始处理；页面不再把 Relay 缺失当成日常错误。

## 数据模型与所有权

迁移 22 扩展 `feed_sources`：

- `definition_id`、`config_json`：公开 Source 的固定配置；query/channel/feed URL 只允许在 Source 配置出现，不复制进 Run/Event。
- `cursor_json`：最后一次完整成功后提交的 Connector/Source 游标。
- `credential_ref`、`account_label`：只保存句柄与脱敏账号标签。
- `sync_kind`：`public_source | github | gmail | manual`。

新增：

- migration 23 为 `feed_items.read_at` 增加本地阅读状态；打开 Feed 详情只写已读时间和审计事件，不提升 action revision，来源刷新不得覆盖它。
- `feed_source_runs`：operation/idempotency、source、phase、outcome、安全错误码、receipt、预算、计数与恢复次数。
- `feed_runtime_blobs`：search-evidence-layer 的 opaque/CAS 状态；只存密文/opaque，不成为产品层 Source/Run 的替代物。
- `feed_import_receipts`：一次迁移的来源路径 fingerprint、各实体创建/更新/跳过数量、凭据/正文迁移状态与完成时间；不保存秘密。
- `feed_materials.content_ref`、`content_available`、`content_type`、`character_count`、`captured_at`：Molis Work-owned 正文引用与可用性。

所有权：

- 项目 DB 拥有该项目的 Source、Run、Cursor、Item、Material、provenance、Goal 关联与迁移 receipt。
- Molis Work home 拥有跨项目复用的 Connector 凭据和 evidence content key；SecretStore 只接受稳定 authRef。
- Molis Work home 的 evidence 目录拥有内容寻址密文 blob；数据库只存引用、preview、hash 与 provenance。
- Provider 拥有原邮件、Issue、网页和 Feed；Molis Work 只保存显式同步得到的最小快照。

## 唯一调用链

### 公开来源

`POST /api/feed/sources` → 注册/校验（0 网络） → `feed_sources`

`POST /api/feed/sources/:id/sync` → `FeedSourceService.sync` → 写 `running` → Intelligence Client exact → search-evidence-layer Runtime → transaction(Source/Run/Item/Material/Event) → 返回 created/deduped/outcome

### 账号来源

`POST /api/feed/connectors/*/auth` → Molis Work SecretStore → 更新 `credential_ref/status`

`POST /api/feed/sources/:id/sync` → GitHub/Gmail adapter（只读 prior cursor） → 完整成功 transaction(Item/Cursor/Source/Run/Event)；失败只写安全错误与 Run，不改游标/last success。

### 处理

保持 `Feed Item → promote/start → Draft Goal + input_binding → Goal Runtime/TUI`；正文读取失败时保留 preview 并明确 `content unavailable`，不阻断用户用已有信息创建 Goal。

### 当前 Work Item：Item → Goal Runtime/TUI 闭环

- `start` 首次调用只创建一个 Draft Goal 和一个 confirmed `input_binding`；重复点击、刷新或 Web 进程重启后都复用 `feed_items.linked_goal_id`，不得创建第二个 Draft，也不得绕过 Molis Work 的 Claim/Run 规则自动开始执行。
- 浏览器只把 `{ goal_id, item_id, at }` 作为一次性 Runtime autofill 提示保存在当前 Session。跳转到目标 Goal 后，用户选择一个真实可用的 Runtime；连接成功才把上下文写入 Terminal 输入区，写入时不追加回车、不自动发送。
- autofill 请求必须携带原始 `item_id`，服务端验证该 Item 仍与当前 Goal 绑定；不能用“该 Goal 最近更新的任意 Item”替代用户刚刚选择的 Item。绑定失效时保留待填状态并提示用户回到 Inbox/Feed 重试。
- TUI 上下文包含 Item 类型、Source、原始链接、标题、摘要、正文和选中的 Material；完整正文不可用时使用 preview。上下文进入 Terminal 前统一清理 Authorization、Cookie、Token、API key、client secret、password、私钥等凭据形态，并放在唯一的 `UNTRUSTED DATA` 区块中。
- 外部内容不能闭合未信任区块、改写 Goal/System 规则或触发自动动作；Terminal 控制字符在客户端写入前移除。30 分钟过期、没有 Runtime、进程断开、Item 解绑和重复写入都有明确且可重试的状态。

### 当前 Work Item：信息流工作台内部完整验收

- 以真实项目数据复核 Goal、Inbox、Feed、来源与连接四类目录；验收 1440×900 深色、1180×760 浅色和 720×820 窄宽，检查列表行基线、筛选、详情层级、键盘焦点、动作换行、Modal 滚动和横向溢出。
- Inbox 与 Feed 共用同一套紧凑筛选栏：搜索框和筛选图标只占一行；来源、状态与排序在点击后出现的目录内浮层中选择，不再把三个原生下拉框常驻铺开。浮层沿用 Goal Tree 的筛选交互，可点击外部或按 Escape 关闭，显示非默认筛选数量，并分别保留 Inbox / Feed 的筛选状态。
- Goal Tree 的紧凑模式状态只显示一层标签，不得因外层目录状态容器与内层状态标签的级联规则同时绘制边框而出现重影；目录收起后，展开按钮必须位于 macOS traffic lights 安全区右侧，工作标签不得与左侧原生窗口控件或展开按钮重叠。
- 对 Inbox 与 Feed 分别复现“Item → 保存/开始处理 → Draft Goal + input binding”；Web 进程重启后再次处理必须复用同一 Goal、同一 binding 和原 Material，不新增孤立 Goal。
- 真实项目只执行只读来源同步和视觉检查，不向 GitHub、Gmail 或内容提供方写回；同步失败必须保留旧 Item，并显示可安全重试的反馈。
- Relay 独立性以删除隔离测试中的 Relay DB、SecretStore 和 evidence 目录后仍能读取迁入凭据、Source、Item、Material 正文为准；生产代码与 lockfile 不得包含 Relay 仓库绝对路径。
- 明确的 `/goals/:goal_id` URL 必须优先于 Session 中上次保存的 Inbox/Feed 目录状态；刷新、外链或浏览器恢复都应显示对应 Goal，只有带 `feed-start=1` 的 Start 路径才进一步进入 Runtime。
- 验收包统一记录自动化命令、数据库/界面数量对账、视觉矩阵、真实浏览器旅程、安全边界、未运行的真实 OAuth/账号门禁和 Relay 删除边界。

## 依赖与迁移策略

- 把 Relay `vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz` 与 `vendor/intelligence-client/adeptify-intelligence-client-0.2.2.tgz` 连同 SHA/provenance/SBOM 复制到 Molis Work `vendor/`，依赖只使用 Molis Work 内相对路径。
- 由于两个锁定 SDK 声明 Node `>=24`，Molis Work 来源接管将运行时门槛提升到 Node `>=24`；安装与构建必须对此给出明确检查。
- 迁移器只读打开 Relay DB 和 Relay SecretStore。凭据迁移采用“解密于进程内 → 立即以 Molis Work master key 重封 → 不记录明文”；找不到 Relay key 时，数据迁移仍成功但 credential/content 标为 manual gate。
- evidence blob 复制后以 content hash、AEAD tag 和引用路径校验；不复制 orphan blob。
- Relay 的 search opaque ledger 不作为 Molis Work active ledger 直接复用，避免 app identity/namespace 混淆；历史 Source Run receipt 导入作审计，新同步使用 Molis Work runtime 自己的 ledger。

## 文件与模块边界

- `src/feed/types.ts`：Source/Run/Material/迁移类型和上下文格式。
- `src/feed/store.ts`：迁移 21/22/23、事务查询、阅读/处理状态变化与 durable dedupe。
- `src/feed/sources/*`：目录、输入校验、exact runtime、公开 Source use case。
- `src/feed/connectors/*`：GitHub/Gmail adapter、OAuth/Device Flow、增量 cursor。
- `src/feed/security/*`：Molis Work SecretStore、evidence content store、Relay secret/content ownership transfer。
- `src/feed/relay-import.ts`：一次性 Relay 数据/凭据/正文迁移和 receipt；不得成为 active sync adapter。
- `src/web/server.ts`：Source/Auth/Sync/Migration API 和 Gmail callback；不写 Provider 协议。
- `src/web/render.ts`、`src/web/i18n.ts`：来源管理与诚实状态；不保存 Token 到 DOM/state beyond current submit。
- `vendor/*`：锁定依赖制品与完整性元数据，不引用 `/code/relay`。

## 异常与恢复

- 重复注册/迁移/同步：稳定 ID + idempotency Run；已完成同键本地 replay，零 Provider call。
- 同步中崩溃：下次构建 view/执行同步前把 `running` 标为 `interrupted`；用户显式重试，旧游标不变。
- Provider 空结果：terminal `completed/empty`；HTML/WAF、额度耗尽、401/403、stale Gmail history 分别为安全错误，不降级 Mock。
- 暂停与并发完成：暂停状态 sticky；晚到成功可以保存 Item/Run，但不得把 Source 改回 active。
- SecretStore/key 不可用：fail closed，不把密文当明文；已有 Feed 数据继续可用。
- evidence 缺 key/blob/校验失败：Material 保留 preview 与 `content_available=false`；不把损坏正文填进 TUI。
- Relay schema 不兼容：迁移整体数据事务回滚；已迁入的 Molis Work 数据不被破坏。凭据和文件复制按 receipt 记录独立状态，可再次执行。

## 验收标准

1. 原 Feed Workbench 的 Inbox/Feed 下钻、筛选排序、详情、保存、Promote、Start/TUI 和 Goal 决定表单回归通过；两个入口严格按 Item 类型隔离，Feed 已读状态在列表/详情一致且刷新、来源同步后仍保留。Inbox / Feed 的搜索与筛选入口在一行内完成，来源、状态、排序仍全部可达，非默认筛选可见且能一键清除。
2. Molis Work 可本地注册、暂停、恢复目录 RSS、web query、YouTube channel、自定义 RSS；注册 0 网络，规范化去重。
3. 公开 Source 同步走 Molis Work vendored exact runtime；完整/部分/空/失败/中断状态诚实，重复 idempotency key 不再访问 Provider。
4. GitHub live adapter 支持 Token 与 Device Flow；Gmail 支持 OAuth PKCE、refresh、正常增量同步和显式 stale-cursor rebuild；失败不推进 cursor。
5. Source/Connector 同步生成稳定 Feed Item 与 Material；第二次同步零重复；同账号范围与不同 Gmail installation 不串 dedupe。
6. SecretStore on-disk entry 为 AES-256-GCM，Token 不进入 DB、HTML、API response、事件或测试日志；UI 只显示 bound/末四位等脱敏状态。
7. Evidence 正文写入 Molis Work-owned 加密内容寻址 blob，Item detail/TUI 能读取；缺失时降级 preview。
8. Relay 迁移导入 Source/Run/Cursor/Item/Material；可用时迁移凭据和被引用正文；重复迁移不覆盖 Molis Work disposition/linked Goal，不产生重复。
9. 将 Relay 路径临时改名/设为不存在后，Molis Work 的列表、正文、来源管理、已迁凭据状态和 mocked-provider contract sync 仍工作，代码与 lockfile 中没有绝对 Relay 路径。
10. 1440×900、1180×760、720×820 下来源管理与 Feed 列表/详情可用，无横向溢出；Light/Dark 可读。紧凑 Goal Tree 状态标签无双层边框，macOS 原生窗口在目录收起后仍保留 traffic-light 安全区。
11. migration、schema downgrade、revision conflict、paused sync、network/auth/provider/stale cursor、interrupted recovery、secret/content corruption 有定向测试。
12. `pnpm typecheck`、定向测试、`pnpm build`、`pnpm test` 通过；真实账号/OAuth/网络同步若未运行，必须列为人工门禁，不能宣称已验证。

## 验证命令

- `pnpm typecheck`
- `node --import tsx --test tests/feed.test.ts tests/feed-sources.test.ts tests/feed-connectors.test.ts tests/feed-security.test.ts tests/web.test.ts tests/desktop-tui.test.ts`
- `pnpm build`
- `pnpm test`
- fresh install/pack：确认 vendored 依赖只解析 Molis Work 内路径，Node 版本门槛清楚。
- 浏览器/真实 Desktop：三种尺寸、Light/Dark、来源注册/暂停/恢复/同步、迁移 receipt、Feed → Start → Runtime auto-fill。

## 人工门禁与删除条件

- 不在自动测试中使用一骏真实 GitHub/Gmail 凭据或访问个人数据。
- 至少一次由一骏在 UI 明确确认的真实 Relay ownership transfer 后，检查 Source/Item/Material 数量、credential bound 状态和 content availability。
- 至少一次真实 GitHub 或 Gmail 同步、以及一个公开 Source 同步成功，才能把“真实账号/网络路径”标为人工通过。
- 只有迁移 receipt 完整、Molis Work 在 Relay 路径不可用时仍独立工作、且一骏另行明确要求删除，才允许删除 Relay；本任务不执行删除。
