# S-57 扩展：多服务、按来源绑定账号、401 后刷新一次（PG-045 的前置）

状态：已定（用户 2026-10-24）。方向照稿批准，§3.1 三项按推荐定。防腐线 ac-kernel 按统筹 10-24 对 PG-045 的裁定写；X1 起每片都扩大安全边界，同一个 PR 里补 SECURITY-INVARIANTS 的行（S 号暂定）和拒绝测试，进集成批跑全量。代码事实按 main `61248691d` 核过。

## 1. 要解决的

Feed 有三类来源要用人的账号：`sync_kind` 是 `github`、`gmail`、`connector`（目录连接器）。今天取账号、取钥匙都是宿主替 Feed 写的：

- `apps/local-host/src/feed-source-service.ts` 的 `resolveConnection`：把连接的 `credential_ref` 和 Gmail 的三枚引用（`access`、`refresh`、`expiresAt`）抄进 Feed 的来源行。
- `apps/local-host/src/official-integrations.ts` 的 `defaultProviderFor`：按来源行建 Gmail 和目录连接器。
- `apps/local-host/src/catalog-connector.ts`：每次同步现取令牌，带 OAuth 附加信息（`apiOAuthContext`）。

PG-045 要求插件改用平台的 `services.connections`（S-57）。这件事随 Feed 迁到 Runtime 一起做（PG-093）。但 S-57 现在接不住 Feed，差三处：

1. **服务只有一个。** `CONNECTOR_REQUEST_SERVICES` 只登记了 `github → https://api.github.com`。
2. **一个槽只绑一个账号。** 绑定的键是「安装 + 插件 + 槽」，各项目共用。Feed 是一条来源一个账号：来源 id 由账号算出，换账号就是新来源。
3. **令牌过期不刷新。** 宿主取不到可用令牌就拒绝。Gmail 今天靠 `refresh_ref`、`expires_ref` 在宿主里续期（`connector-access.ts` 的 `resolveApiConnection`）。

本片只定边界和拆法，不写代码。

## 2. 新的信任边界

### 2.1 哪些服务可以登记，谁登记

- 登记表仍是平台的一张表：`packages/contracts/src/services/connector-host.ts` 的 `CONNECTOR_REQUEST_SERVICES`，只有平台代码改得动。
  - 插件的 Manifest 只写 `service_id`，永远不写地址。这条和 S-57 一样。
  - 新增一项算改安全边界：同一个 PR 里补 SECURITY-INVARIANTS 的行和拒绝测试，统筹审过才合。
- 一项登记写清四件事：
  - 来源：一个或几个精确的 `https://` 来源（协议、主机、端口都相同）。
  - 凭据怎么加：`bearer`。今天只有这一种；别的加法另开片。
  - 收哪些认证方式：沿用 `auth_methods`。
  - 能不能刷新：`refresh: "host" | "none"`，见 2.3。
- 按租户分地址的服务（Salesforce、Atlassian 等），来源取连接记录上连接时核过的那一个（`store.targetOrigin`，S-57 的 `boundConnection` 已经在用）。插件改不了。
- **第一批只登记 Feed 今天用到、能用 `bearer` 加到固定来源的服务**：
  - `gmail`：`https://gmail.googleapis.com`，可以刷新。
  - 目录连接器里属于这一类的那些。完整名单在实现片按 `plugins/official-integrations/catalog` 的定义逐项列，每项附来源和认证方式，统筹审。
- 下面这些不进第一批，归 W5-11（OAuth 移进官方集成插件）：
  - 要请求签名或 OAuth 附加信息的（`apiOAuthContext`）；
  - 走 CLI 的（飞书 CLI 的 `fetchImpl`）。

拒绝：

- Manifest 写了未登记的服务，SDK 解析时就拒。S-57 已有这条，扩展后照旧。
- 请求去登记来源之外的地址，拒绝；没绑账号的匿名请求也一样。
- 租户型服务的请求不在连接记录的来源上，拒绝。
- 登记了 `refresh: "none"` 的服务，宿主不刷新。

### 2.2 绑定：按来源，不按槽

推荐 **A：按记录绑定的槽**。槽声明加一项：

```
binding: "installation" | "per_record"
```

- `installation` 就是今天 S-57 的行为。
- `per_record` 的槽，由人给（安装、项目、槽、记录键）选一个账号。
  - 记录键由插件起名，例如 Feed 的来源 id。
  - 项目取调用上下文里可信的项目，不从输入读。
- 插件发请求时写槽和记录键。宿主按这四项查绑定，查不到就匿名发，`authenticated: false`，和 S-57 一致。

备选 B：一个来源声明一个槽。不推荐：槽是 Manifest 里的固定名单，来源是用户运行时加的，数不过来。

边界：

- **只有人能绑。** 绑定动作沿用 `connectors.plugin_slot.bind`，只对 `user` 开放。
  - 输入加 `record_key`，形状一改就升到 `@2`。
  - 绑定时核对：这个安装存在，这个槽在它的 Manifest 里声明过，且是 `per_record`。这是 BL-350 的一半。
- **插件只能解除，不能绑。**
  - 插件删一条记录时，可以解除那条记录的绑定（`services.connections.release(slot, record_key)`）。解除只会让请求变成匿名，不会扩大权限。
  - 插件读不到任何账号的列表。
- **插件能看到的只有一份视图**（`services.connections.describe(slot, record_key)`）：有没有绑、账号显示名、连接状态（`connected`、`reauth_required`、`disconnected`）。没有 `connection_id`，没有任何凭据引用。
- **绑定分项目。** 同一个插件在两个项目里，同一个记录键是两条绑定。这顺带补上 S-57「不分项目」那条缺口：`installation` 的槽仍然不分项目。
- **卸载、丢弃数据时删掉这个安装的全部绑定**，两种槽都删（BL-356 已写，这里照做）。

拒绝：

- 插件、Agent、MCP、工作流调绑定动作，拒绝（S-57 已有，`@2` 照旧）。
- 绑定一个没声明、或不是 `per_record` 的槽，拒绝。
- 在项目甲绑的账号，项目乙同一个记录键用不上。
- 插件 A 用插件 B 绑过的记录键，用不上：绑定的键里有安装和插件。
- `describe` 的返回里没有 `connection_id` 和凭据引用。
- `release` 之后的请求是匿名的；插件没有办法重新绑上。
- RAC-347：按安装的槽不能由插件 `release`，有无记录键都以 `plugin.connections_release_unsupported` 拒绝；`per_record` 槽仍按原规则校验记录键，以 `connections_record_key_invalid` 拒绝无效值。调用在解除前、或等待 `beforeEffect` 期间取消、撤权、停用，或原调用复查不通过时，拒绝解除，持久化绑定保持原样。沙箱查询操作不能解除；`describe` 和 `release` 都须声明并获准该槽的 `effects.connections`，拒绝不得到达宿主连接端口。

### 2.3 刷新：只给引用，只在宿主里刷新

- 刷新用的东西（`refresh_ref`、`expires_ref` 和刷新后的新令牌）只存在宿主的连接库和密钥库里。插件的库里不再抄任何引用，见第 3 节。
- 发请求前，宿主发现令牌已过期，就先刷新再发。Gmail 今天的 `resolveUsableGmailAccessToken` 就是这样做的。
- 宿主带着凭据发出、固定来源答 401 时：登记了 `refresh: "host"`、连接也有刷新材料的，宿主强制刷新一次，再用同一个请求重发一次（BL-350）。
  - 没有可用刷新材料时，首次 401 的状态、可见响应头与正文原样交回，不问令牌端点、不重发、不标成要重连（RAC-349）。包括 GitHub 设备登录保存的普通密钥、API OAuth 未返回 refresh token，以及刷新引用仍在但对应材料已不存在的连接。
  - 插件请求用宿主内部的「有材料才强制刷新」模式；结果明确区分没有材料与已刷新。原有 API 读取者的普通读取、布尔强制刷新语义保持。材料存在时的令牌端点拒绝、网络错误、超时和 5xx 继续按 §4.1 处理，不当成没有材料。
  - 重发前再核一次原调用（`beforeEffect`），已取消、撤权、停用的就不重发。
  - 第二次还是 401，就把这个答复原样交回插件，不再重试，也不换账号。
  - 刷新本身失败时：把连接标成 `reauth_required`，拒绝这次请求，报 `connector.plugin_requests.connection_unavailable`，不改成匿名发出。
- 刷新得到的令牌不进答复，不进日志和调用记录（S-12）。

拒绝：

- 插件能看到的任何东西里都没有刷新材料或新令牌：答复、错误、`describe`、调用记录、日志。
- 第二次 401 原样交回，不重试第三次。
- 重发前调用被取消，就不重发；服务端收到的请求数不增加。
- `refresh: "none"` 的服务遇到 401，原样交回，不刷新。
- 刷新失败不匿名重发。

本段修复的定向验证：`node scripts/run-tests.mjs tests/security-invariants-connection-refresh.test.ts tests/connector-api-oauth.test.ts`。RAC-349 的无材料用例断言真实 HTTPS 服务只收到一次带凭据请求、令牌端点零请求、连接仍可读；`refresh: "none"` 用例只在隔离测试进程内替换单个服务的刷新声明，保留真实 OAuth 材料与生产请求链，不修改服务登记表。

## 3. 存量 Feed 来源的账号怎样改成现行形状

今天的形状在项目库 `sources` 表（`modules/sources`）：

- `credential_ref` 列和 `account_label` 列；
- `config_json` 里的 `connection_id`，以及 Gmail 的 `token_refs`。`token_refs` 由 `access`、`refresh`、`expiresAt` 三枚引用组成，就是 PG-045 说的 `refresh_ref`、`expires_ref`。

现行形状：

- 来源行不放任何账号或凭据引用。删掉 `credential_ref` 列，`config` 里不再有 `connection_id` 和 `token_refs`。
- 账号只记在连接库的绑定里：（Feed 的安装、项目、槽、来源 id）→ `connection_id`。槽按 `sync_kind` 各一个，都是 `per_record`。
- 账号显示名的主人是连接，来源行不再抄：`account_label` 列一并删掉，显示时经 `describe` 读。
- 来源 id 不变。换账号仍按 Feed 现在的规则新建来源，因为监听检查点和去重键按来源 id 记。新来源绑新账号。

按 `docs/system/CONTRACT-CHANGES.md` §3 第 4 条：

- 改 `sources` 的建库基线、升结构版本；版本不符的库被拒绝，不就地升级，读取时也不兜底旧字段。
- 产品代码里不写迁移，所以不登记进 `specs/repository-anti-corruption` 的保留机制。
- 开发 Home 用会话临时目录里的一次性脚本改，脚本不进仓库。脚本的做法：逐条有账号的来源，按它的 `connection_id` 写一条绑定，再清掉旧字段、升版本。

### 3.1 决定（用户 2026-10-24 定）

1. **存量账号带过去**（用户 2026-10-24 定）：一次性维护脚本逐条写绑定，人什么都不用做。脚本不进仓库，产品代码不写迁移。
2. **真实 Home 的那一次放进用户的维护时段**（用户 2026-10-24 定），和其他维护项同一时段：整份备份，先在一次性 Home 上演练，当次同意。开发 Home 现在就用一次性脚本改。
3. **`account_label` 删列**（用户 2026-10-24 定）：账号显示名只归连接，经 `describe` 读。

## 4. 拆片与前置

| 片 | 内容 | 前置 |
| --- | --- | --- |
| X1 | 登记表扩展：多来源、`refresh` 字段；第一批服务（GitHub、Gmail 加目录里以 `Bearer` 发到固定来源的 24 个）。租户来源拆成 BL-595（见 §4.1） | 本稿已定（用户 2026-10-24） |
| X2 | `per_record` 槽：SDK 声明检查、Runtime 客户端（`request` 带记录键、`describe`、`release`）、宿主的绑定键加项目和记录键（存法见 §4.1）、`connectors.plugin_slot.bind@2`（只认声明过的槽，即 BL-350 的绑定核对一半） | X1；叠在 X3 上，免得同改宿主端口时冲突 |
| X3 | 401 后刷新一次再重发一次（BL-350 的刷新一半），过期前预先刷新沿用各服务已有的做法；令牌端点明确拒绝时在宿主进程里标 `reauth_required`（见 §4.1） | X1 |
| X4 | 项目里卸载时删这个安装在本项目的 `per_record` 绑定，删项目时删该项目的 `per_record` 绑定（项目删除钩子，`ProjectDeletionService` 的删除跑）；按安装的绑定卸载时不删，见 §4.1 与 BL-596 | X2 |
| X5 | Feed 迁 Runtime 时改走 `services.connections`，删宿主的 `resolveConnection`、`defaultProviderFor` 里取钥匙的分支和 `catalog-connector.ts`；`sources` 建库基线改为第 3 节的形状 | X2、X3；随 PG-093 |
| — | 人选账号的界面（S0b-2b）：按安装的槽在「服务连接 › 插件用的账号」里选（已做，BL-350，RAC-653）；`per_record` 槽在插件显示记录的地方选，随 X5 | X2 |

- **S0b-2a**：BL-350 写的前置「S0b-2a 的外联服务先合入」，就是已合入的 #1081（`e0fe39027`，S-57）。统筹 2026-10-24 确认，没有另一片。
- **顺序**（统筹 2026-10-24）：X1 → X2、X3 → X4，都本地叠片；PG-007 排在 X4 之后。X5 随 PG-093。
- **BL-350**：拆进 X2（绑定核对）和 X3（刷新）。两片都合入后删掉 BL-350 这一行。
- **Alchemist**：不迁（BL-376），不在本片。
- **OAuth 附加信息与 CLI 型连接**：归 W5-11，不在本片。

### 4.1 实现中统筹 2026-10-24 的裁定（与上文稿子不同之处）

- **S 号**：X1 是 S-69，X2 是 S-71，X3 是 S-70（batch-36 合入时的实际号，统筹 2026-10-25 改）；合入那批由统筹按当时的末号再核。SI 表门禁要求号连续，分支上暂用本基线的下一号（X1 写 S-64，X2、X3 各写 S-65），合入时改，测试名同步改。
- **租户来源（X1）**：目录连接器的连接今天不在宿主里钉来源（`assertTarget` 只给模型、生图、MCP），租户型的服务登记不了，拆成 BL-595，排在 X4 之后：先在连接时把来源钉进连接记录，再登记 Jira、Confluence、Salesforce。凭据不是 `Bearer` 写法的几家（Discord、GitLab、Figma、Linear、ClickUp、Monday）另开「凭据加法」一片；飞书、Lark、企业微信与飞书 CLI 归 W5-11。
  - **已做（PG-045 非 OAuth 余项，ac-kernel）**：BL-595 与「凭据加法」一起做完。登记表的 `credential` 改成按连接种类写法（`{ token?, oauth? }`，取 `bearer`、`bot`、`bare`、`private-token`、`x-figma-token`、`basic`），`auth_methods` 并进它；租户型服务写 `tenant: { domain, gateway? }`、不写来源。连接时（`activateConnectorConnection`）把凭据核过的租户来源钉进 `connector_connection_targets`，在别的租户上重新授权先拒；请求只到钉住的来源，没钉的连接（之前存下的）拒、要重连，不补钉。Jira、Confluence 的 OAuth 令牌经宿主转到 Atlassian 网关，插件照写站点地址；`describe` 给租户型服务钉住的来源。插件不能自己写 `PRIVATE-TOKEN`、`X-Figma-Token`。测试 RAC-654～656（S-69 行）。
  - **#1290 首评接续（2026-10-25，Codex 承接原件；实现与验证中）**：保留没有固定租户来源的账号和已有绑定，在「插件用的账号」的选项、当前绑定与请求拒绝中明确说明要重新连接确认站点，并提供现有重连入口；未选的旧账号可见但可禁选。重连成功后同一连接固定来源、恢复可用。租户槽没绑账号时明确说请求会被拒，固定来源服务仍允许原匿名请求。只用连接已有的 `target_origin` 等事实派生页面，`describe` 用已存在的 `reauth_required` 表达没有来源的已绑定账号；不另存状态、不改 schema/状态枚举。`bind@1` 资格与版本保持，绑定不保证可请求，客户端保存反馈也须准确，请求继续严格拒绝。RAC-653/654/657 覆盖真实隔离 Home、页面操作、零外发与重连后仅固定来源收到请求；浏览器回归为 `tests/connector-tenant-reconnect.e2e.test.ts`。
  - **RAC-654 激活前拒绝**：租户服务带目标的授权若无法确定来源，在任何 secret、连接行、固定来源或协议配置写入之前以现有 `connector.connection.invalid` 拒绝；解析非法令牌或站点也只给此受控错误，不带材料或 catalog 内部错误。原连接、绑定、凭据与配置保持。同租户重连成功、异租户 `service_mismatch`、等待期间 revision 已变的拒绝均保留。直接调用生产激活入口的回归在 `tests/security-invariants-connection-activation.test.ts`，定向命令 `node scripts/run-tests.mjs tests/security-invariants-connection-activation.test.ts tests/security-invariants-connection-services.test.ts`；完整组合、全量与最终资源结算由 Claude carrier 接续。本题不含 OAuth C4、服务注册政策、Memory 或门禁预算修改。
  - **现有重连调用链**：服务详情的「更换令牌」表单仍提交原连接的 PATCH；无 `setup_id` 时也经 `activateConnectorConnection`，与 `setup.submit` 最终提交共用来源检查和 pin，不能直接换密钥后让原账号继续没有来源。仅改名和启停保持原入口与行为。第一轮 UI 原贡献固定自 `3c15b41`，Codex 只接其余激活拒绝、这条必需链路与保存/describe 投影差异；不是另写一套设置页。
- **GitHub 的刷新（X1）**：GitHub App 的用户令牌 8 小时过期，API OAuth 本来就能刷新，登记成 `refresh: "host"`。
- **`per_record` 绑定的存法（X2，统筹定 ①）**：沿用 Home connectors 库的 `connector_bindings`，不改结构、不升版本。`scope_id` 本来就是不透明的作用域键，扩成「安装 / 项目 / 记录」仍在这一列的本义里，真实 Home 不受影响。四条防隐患的要求：
  1. 只有 connector-host 里一个函数拼、一个函数解 `scope_id`，别处不写这个字符串。插件只给记录键：限长，不含 `/`、`:` 和控制字符，不合的以错误码拒（有拒绝测试）。项目只从调用上下文来。
  2. 查找只做精确匹配。卸载时按安装删：`scope_id = 'plugin-installation:<安装>'`，或带分隔符的前缀 `'plugin-installation:<安装>/'`（`substr` 比较，不用 `LIKE`），安装 `abc` 不会删到 `abcd`；测试里放一对互为前缀的安装 id。
  3. 删项目时删该项目的 `per_record` 绑定：connector-host 导出按项目删的函数，同样带分隔符锚定（`/project:<项目>/record:`），由 `ProjectDeletionService` 调；测试里放一对互为前缀的项目 id。放在 X4，和卸载一起做。
  4. 编码写在这里和 `connection-store.ts` 的注释里；表的主人不变。以后真要拆成列，再走维护时段，这轮不做。
- **卸载时删哪些绑定（X4，统筹 2026-10-24 裁 ①）**：安装编号在每个项目和 Home 里都一样，按安装的绑定由各处的同一安装共用。所以项目里卸载只删这个安装在本项目的 `per_record` 绑定（前缀锚定到 `plugin-installation:<安装>/project:<项目>/record:`），删项目删该项目所有插件的 `per_record` 绑定（项目删除钩子 `plugin-connections`）。按安装的那条本应在「最后一处也卸载」时删，但 Home 目录库的 `project_plugins` 只收内置插件，第三方与创作台生成的插件只记在各项目库，宿主问不到；不开全部项目库去扫，这条留到人解除，记 BL-596。
- **刷新被拒的标记（X3，统筹裁）**：不改库、不删密钥，在宿主进程里标。只在令牌端点明确拒绝时标（OAuth `invalid_grant`、`invalid_client`，或 HTTP 400、401）；网络错误、超时、5xx 不标，只拒这一次。标了之后连接列表、插件连接槽的读取（X2 起还有 `describe`）显示 `reauth_required`，带它的请求在发出之前就以 `connection_unavailable` 拒，不再每次打令牌端点。标记跟着连接的版本（`updated_at`）走：人重连或强制刷新成功就清，宿主重启后没有，下次请求再试一次刷新、被拒再标。它是从令牌端点的回答推出来的状态，不是存下来的事实；以后要持久化再走维护时段。

### 4.2 X4 核对与 BL-596 怎样判断「最后一处」（2026-10-26，基于 batch-41 `8cc441315`；BL-596 部分是设计，待统筹裁）

**X4 已做，不用再改代码。** 项目里卸载只删本安装在本项目的 `per_record` 绑定：`forgetInstallationRecords`（`apps/local-host/src/plugin-installation-cleanup.ts`）调 `forgetInstallationProjectBindings`，经 `ConnectorConnectionStore.forgetInstallationProjectBindings`，匹配 `plugin-installation:<安装>/project:<项目>/record:` 前缀，用 `substr` 不用 `LIKE`（`horizontal/connector-host/src/plugin-binding-scopes.ts` 的 `installationProjectBindingsWhere`，分隔符锚定），项目执行器、Home 执行器和创作台的 `forget` 都走它。删项目时 `project-deleted-owners.ts` 的 `plugin-connections` 步骤调 `forgetProjectConnectionBindings`，匹配 `/project:<项目>/record:`（`projectBindingsWhere`），所有插件的该项目绑定都删，账号本身和按安装的槽留着。证据：`tests/security-invariants-connection-records.test.ts` 的 `S-71 RAC-470`（真 `ProjectDeletionService` 删项目；放了互为前缀的 `<id>0`、`x<id>`、另一个安装、按安装的槽、`home`）与 `S-71 RAC-471`（`INSTALL`/`INSTALLx`、`p-1`/`p-10`/`p`，非法 id 匹配 0 行）；`tests/installed-plugin-host.test.ts` 的 `S-71 RAC-471`（创作台卸载只带走本项目）；`tests/security-invariants-installation-records.test.ts` 的 `S-45 S-71 RAC-472`（项目卸载不论是否保留数据都删，Home 卸载只删原文件登记，授权删除失败的重装拒绝）。

**BL-596（按安装的槽，`plugin-installation:<安装>`）：判断「最后一处」的做法。**

- **事实**：`install_id` 是 `installIdentity`（插件 id 加发布者签名），各项目和 Home 里一样；每处安装的记录只在自己的库里（`plugin_runtime_installs`）。统筹 2026-10-24 那句「不开全部项目库去扫」是在 `heldInstalls`（`plugin-holders.ts`，A3 / S-82）之前定的；现在这个只读读取已经是平台的做法：安装、换版本、启用时用它推名字的属主，规则的「最后一个安装」也用它（`pluginHeldElsewhere`），读不了就按「还占着」算。
- **推荐做法（不新增状态）**：卸载时问 `heldInstalls`「除了我这一处（范围加 `install_id`），别处还有没有 `state !== "uninstalled"` 的同一个 `install_id`」。没有，就删这个安装的整组绑定：键恰好是 `plugin-installation:<安装>` 的按安装槽，加 `plugin-installation:<安装>/` 前缀的所有按记录绑定（Home 安装分在各项目名下的也在其中），同样 `substr` 锚定。放在 `forgetInstallationRecords` 里，它已经是项目执行器、Home 执行器、创作台和「丢弃重装」四条路的唯一汇合点。读不了任何一个库（`heldInstalls` 抛错）就留着、记一条 `plugin_holders_unreadable` 日志，和规则的做法一致：多留一行孤儿绑定无害，错删别处还在用的绑定不行。
- **保留私有数据的记录不算「占着」**：§5.1 已定，授权不论是否保留数据都随卸载走，保留后重装必须重新绑定账号。所以判断用 `state !== "uninstalled"`，不用 S-82 的 `holdsInstall`（后者把保留数据的卸载记录也算占着，那是名字的口径）。
- **删项目**：`plugin-connections` 步骤跑时项目已不在目录里（目录先改名成暂存目录、目录事务已提交），`heldInstalls` 读不到它，这正是想要的。步骤不需要读被删项目的库：对「`connector_bindings` 里有按安装槽的每个 `install_id`」各问一次「别处还装着吗」，没有的删。代价是一次 `heldInstalls`，只发生在删项目和卸载时。
- **并发与失败**：一个 Home 只有一个执行进程，「读 → 判断 → 删」是同步一气，中间没有 `await`。两个项目同时卸载最后两处：先跑的看见另一处已卸载或还装着，不论哪种，后跑的都会再判断一次；删是幂等的。漏掉的方向只有「多留」，没有「错删」，因为被排除的只有自己，别处读不到就算占着。刚好此时有人在另一个项目新装：绑定被删，新装的那一处没有账号，人再选一次，没有泄漏。
- **不选的做法**：Home 一级的安装登记表（BL-596 原稿）要在每次安装和卸载时从项目 Runtime 跨库写 Home 库，两处各记一份同一个事实，崩在中间会不一致；而且没登记过的存量安装需要一次回填，回填前判断会错删，回填只能靠维护脚本。除非统筹不接受 `heldInstalls` 这个读取，否则不选。
- **对现有 Home 的影响**：只对「此后发生的卸载」生效，不动已经存在的孤儿行；删项目那一步按「有绑定的 `install_id`」判断，会顺带清掉此前遗留的孤儿行（这些行本就不被任何安装用到）。若统筹要求孤儿行留给维护脚本，删项目步骤改成只判断「该项目暂存目录里的安装」，要读被删项目的暂存库，复杂得多，不推荐。
- **验收（RAC-861～869，实现时写）**：两个项目都装着，卸载一处，按安装槽和别处的按记录绑定留着；卸载最后一处，槽和该安装所有按记录绑定都没了、相邻的 `INSTALLx`、另一发布者的同名插件、账号本身都在；另一处只剩保留数据的卸载记录，也算「最后一处」；Home 安装算一处；读不了的项目库让槽留着；删最后一个装它的项目让槽没了；创作台和丢弃重装两条路同样。要新 S 号（S-71 的补充或新号）先问统筹；实现后删 BL-596 一行，S-71 与 `SECURITY-INVARIANTS.md` 的缺口条目改写。

## 5. 安全不变量与验收编号（暂定）

S 号按合入顺序取，下面写的都是暂定。合入时以 SECURITY-INVARIANTS 当时的末号为准，改掉文里和测试名里的号。

| 暂定号 | 管什么 | 拒绝测试（每条至少一个） | 验收编号 |
| --- | --- | --- | --- |
| S-69 | 请求服务只能由平台登记；来源精确，租户型服务取连接记录上的来源；凭据按登记的写法（BL-595 后不止 `bearer`） | 未登记的服务被 SDK 拒；登记来源之外的地址被拒（匿名也拒）；租户型服务请求别的租户来源被拒 | RAC-346 |
| S-71 | `per_record` 槽的绑定只由人建，键是安装、项目、槽、记录键；插件只能解除，只能看到不含凭据的视图；卸载时删干净 | 非 `user` 调绑定被拒；绑没声明的槽被拒；跨项目、跨插件用不上；`describe` 里没有凭据引用；`release` 后匿名；卸载后重装不沿用账号 | RAC-347、RAC-348 |
| S-70 | 刷新只在宿主做，401 后刷新一次、重发一次；重发前复核调用；刷新材料和新令牌不进插件能看到的任何地方 | 第二次 401 原样交回；重发前取消就不发，服务端请求数不增加；`refresh: "none"` 不刷新；刷新失败不匿名重发；答复、错误、日志里都没有令牌 | RAC-349 |

RAC-346～349 是本线旧号段（RAC-330～349）的末尾。X 片另用统筹 2026-10-24 给的号段：RAC-470～479、RAC-520～539、BL-595～604。表里的 S 号以 §4.1 为准（S-69、S-71、S-70）。

### 5.1 卸载时回收授权（#1276，统筹 2026-10-25 裁定）

连接绑定和原文件登记是安装的授权，不是插件自己的私有数据。项目或 Home 卸载安装时，不论 `retain_private_data`，共同执行器都调用现有 `forgetInstallationRecords`：项目只删该插件、安装在本项目的原文件登记与 `per_record` 绑定；Home 只删该插件、安装的空串项目原文件登记。文件本身、账号、其他项目（包括前缀相邻 id）、其他安装和项目操作之外的 Home 登记均保留。按安装的槽及 Home 安装分在各项目名下的按记录绑定仍按 BL-596 保留；X4 的项目卸载规则与创作台 RAC-471 的 `keepData: true` 也删除绑定保持不变。

保留私有数据与 KV 的既有规则不变。保留数据后重装，也必须由本人重新选原文件、重新绑定账号。丢弃重装继续经 `keptDataDiscarded` → `discardInstallationOwnerData` 回收残留授权；#1255/FIX5 将该清理前移到新安装发布之前，本片保留 helper 内的授权清理，不另改私有库、KV 或 ledger 算法。与其回执合成时，`uninstalled` 顺序为原指令清理 → 既有按数据选择的私有清理 → 无条件授权清理 → 返回私有清理说明，不把授权清理放到 `return` 之后。

卸载时授权删除可能失败，安装记录此时已是 `uninstalled`。重装不能因保留数据而绕过清理：Runtime 在注册代码、保存新安装前，经同步的 `PluginExecutor.prepareReinstall` 再调用同一授权 owner；失败保留原卸载记录并拒绝发布，恢复后重试须清掉旧授权。这个端口只清授权，不删除私有 KV，不能从同步安装中启动允许返回 Promise 的 `uninstalled` 钩子。无新增持久状态或读取兼容；同一 Runtime 与关闭后新建的 Runtime 均从既有卸载记录执行该检查。故障回归对真实 SQLite 的原文件登记删除、以及原文件已删除但绑定删除失败的部分完成状态注入失败，证明故障持续时拒绝发布、解除后授权不可用而 KV 保留。

| 验收编号 | 必须观察的结果 | 证明 |
| --- | --- | --- |
| RAC-472 | 真实项目 Runtime 的宿主内与 `execution: "sandbox"` 变体，保留/不保留数据卸载都立即拒绝旧原文件登记、删除本项目记录绑定；保留数据重装仍保留私有 KV，但不恢复授权；丢弃重装的既有 helper 也清理残留授权；相邻项目、Home 空串登记、相邻/另一安装、共享安装槽和账号不变，原文件内容不变。授权删除失败或部分完成后，同一与新 Runtime 的重装均在发布前重试清理，仍失败则卸载记录、代次和不可用状态不变，解除后无旧授权且 KV 保留 | `tests/security-invariants-installation-records.test.ts` 的 `S-45 S-71 RAC-472` 成功路径与真实删除故障变体；创作台原入口另由 `tests/installed-plugin-host.test.ts` 的 RAC-471 保持 |
| RAC-473 | 真实 Home Runtime 的两个执行变体，所有卸载选择均只清本安装的空串原文件登记；同安装各项目登记、另一安装、Home 安装在各项目的按记录绑定、按安装槽与账号均保留；保留私有 KV 后重装不能恢复原授权，丢弃重装仍清残留登记。真实原文件删除故障持续时，同一与新 Runtime 都拒绝发布；恢复后只撤销本安装空串授权，KV 与项目绑定不变 | `tests/security-invariants-installation-records.test.ts` 的 `S-45 RAC-473` 成功路径与真实删除故障变体 |

### 5.2 R55 插件账号保存的长期回归（#1308 首评 §7.2，2026-10-25）

负责人：Codex R55 长期回归专职。仅补测试，产品修复 `0f0bdb83a` 已由载体 `50823b548` 包含；原 29 项与 TEST6403388677 的临时组件证据按原范围复用，不重做修复或全量。验收在本项达到工程回归可用，不代表完整 Host 授权、持久化、视觉或用户验收。

`tests/connector-plugin-slots.e2e.test.ts` 使用既有公开 renderer 的完整设置页，随当前构建取得真实 HTML、dataset、请求助手与连接脚本，在公共 test-kit 的专用 Chrome 和独立 profile 中运行；本机 HTTP 在收到请求后持有响应，再分别给成功或拒绝。没有复制保存算法、保存旧 JS、增加生产测试出口或导入例外。每个变体的浏览器、HTTP 与临时目录由测试清理；运行器另提供隔离 Home。

| 验收编号 | 必须观察的结果 | 证明 |
| --- | --- | --- |
| RAC-657 | Home 与含中文、空格、斜杠、`&?"+#%` 的项目视图均成功保存新账号后，再拒绝另一选择：等待期间保留上次 `saved`，`disabled`/`aria-busy` 为 true；失败后 `value` 回最近成功账号、`saved` 不被失败覆盖、错误可见，finally 恢复可操作；第三次保存成功。真实 HTML/dataset 发出的每次请求均为预期 POST、精确 URL 与安装/插件/槽/服务/账号 body，项目仅解码一次即等于原 ID。 | `tests/connector-plugin-slots.e2e.test.ts` 的 Home、encoded Project 两个 RAC-657 R55 变体；运行 `node scripts/run-tests.mjs --jobs 1 --verbose --retries 0 tests/connector-plugin-slots.e2e.test.ts`。HTTP 受控，仅证明生产页面组件路径。 |

定向验证（2026-10-25）：测试提交 `99c2851cc` 经本树构建，在明确绑定整机共享浏览器 FIFO 后 2/2 通过、自然退出 0，4.025 秒，无失败/取消/跳过；类型、单文件 Biome、源与构建导入检查、相对 `50823b548` 的健康门禁均通过。首跑虽也 2/2，但作者的 `TMPDIR` 设置同时改变槽位目录，未作共享 FIFO 证据；错误、首跑原件与更正后运行均保留在 `/tmp/molis-r55-picker-regression-20261025/`。独立增量审验按最终提交及原始记录结算；原批次、组合 full、资源结算及 main 采用仍归 PIPE/唯一 Claude carrier。

## 6. 还没核的

- 目录连接器里有多少能直接用 `bearer` 加到固定来源，要在 X1 里逐项核。这里只按 `catalog.ts` 里出现的 API 地址粗看过，大约 30 个服务，其中 Salesforce 等是租户地址。
- Gmail 的刷新今天走 `apps/local-host/src/gmail-oauth.ts` 的 `resolveUsableGmailAccessToken`。别的服务的刷新由各自的 OAuth 代码做，在 X3 里统一成「按服务登记的刷新」时，要逐个核它们现在的刷新入口。
