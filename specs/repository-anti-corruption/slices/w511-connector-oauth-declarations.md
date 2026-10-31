# W5-11：连接器 OAuth 从宿主的表移进官方集成插件的声明（设计稿）

状态：设计稿，第八版（第 8 片 GitHub 已做，2026-10-31，T-066，写法见 §2.6「第 8 片落地的写法」，待评审；第 7 片 Notion 已做，2026-10-30，T-065，写法见 §2.6「第 7 片落地的写法」，待评审；第 6 片 Gmail 已做，2026-10-29，T-064，写法见 §2.6「第 6 片落地的写法」，待评审；第七版：旧 OAuth 连接的收尾按用户 10-27 改定；第八版：照第 2 片复核，占位文法只留一份、account 不取 `token:`、label_prefix 原样拼、context 只在授权时发）：第 2 片已做，写进 §2.1.1，评审过了（10-27），合同按评审收窄（§2.1.1「写死的三条」）；第 1 片已做，照第 1 片评审（M1～M3、四处对齐、context 收窄）和第 2 片复核改过，在分支上待复核（2026-10-27，W5-11 线，分支 `claude/w511-oauth-declarations`；合同、SDK 检查和解释器的写法定在 §2.1「第 1 片落地的写法」）。检查连接和读账号也改用解释器（统筹 10-27 选 A，§2.2「检查连接和读账号」，随第 4 片）；旧 OAuth 连接不保留绑定：用户 10-27 改定，旧连接只能新增，绑定由本人重新绑，不加只给旧连接走的分支（§10 Q2，第 5 片）。第一版的六个问题都按 A 定了（§10）。四轮评审的必须改 M1～M7、N1～N3、A1～A4 都已改进本稿，第四轮没有必须改，建议的取舍写在 §11；统筹和用户在 10-27 的裁定写在 §0 和 §10。第 1 片的代码在本分支上。第 4 片已合入 main（2026-10-29，T-062，#1439，`4772d0c59`；落地的写法见 §2.2「第 4 片落地的写法」）；第 5 片已做（2026-10-28，T-063，分支 `task/T063-ca`，待评审；落地的写法见 §2.6「第 5 片落地的写法」，`resolveApiConnection` 收成三支与旧 OAuth 连接的收尾挪到第 6～8 片）；其余各片还只有设计。第 1、2 片统筹 10-27 放行，叠在本分支上，按顺序一次一片。§7 里标「依赖 C 合入」的片，要等批次 C（`feature/anticorruption-closeout-c`，头 `fe93d322`；Notion 共享刷新在 `009b773f`）进 main 才动手；标「可以先做」的不碰 C 改过的文件，也不 import 只在 C 上的东西。代码事实按 main `9efbf8d04` 和 C 头 `fe93d322` 核过，文中的行号与形状都是 C 头上的。号段：RAC-1080～1089、BL-790～799，统筹 10-27 核过，没有冲突。新 S 号分成三条，号码由合批会话核对后再定，§3.5 里写「待统筹核」。

## 0. 已经定了的，本稿照着写

- **主人是 Manifest**（FI-3 §3.4，`feed-inbox-integration-registry.md`）。OAuth 怎样授权，写在官方集成插件 Manifest 的 `connection_services[].auth.methods` 里，写成数据。宿主的三张表都删掉：
  - `API_OAUTH_PROVIDERS`：本线删；
  - `MCP_SERVERS`：第二批删（BL-790）；
  - `CONNECTOR_CLIS`：等 BL-791。
- **特殊情况怎么写**：FI-3 允许写成纯数据，或者写成不碰密钥库、连接记录和路由的纯函数；本线按 Q1 只用数据。
- **下面这些留在平台**：
  - 回调路由；
  - state 与待完成记录；
  - 凭据先暂存、最后一次检查之后再生效；
  - 连接记录；
  - client id/secret 只给引用；
  - 同一份地址检查；
  - 访问令牌能发往哪里（S-69 的平台表）。
- **统筹 10-26 的三条裁定**（评论 6410517262）：
  - R1：回调路径一个都不改，留在平台当通用回调，按 state 找到声明它的插件。Gmail 那条挂在 `/api/feed/…` 下的路径也保留，主人登记为平台。
  - R2：飞书 CLI 和 Lark MCP 不进第一批，继续用 CALL-CHAINS §10.1 的例外。
  - R3：Alchemist 登记成例外，代码不改；删掉例外的条件是「Alchemist 重做并进 Plugin Runtime」。
- **从 C4 工单（评论 6390280424）照搬的**：
  - 平台的 state、回调必须完全一致、密钥只给引用、连接的提交、同一份地址检查、取消和撤权的尾检，这几样都不改；
  - S-57 固定的 API 来源和 OAuth 端点是两回事，Manifest 的声明哪一个都不放宽；
  - R-48 归 ac-kernel/PG-045；T1 安装信任归它的主人，本线不定新的信任策略。§2.8 的拒绝只是 T1 之前的底线。
- **统筹 10-27 的裁定**（评审之后）：
  - M5 选「整份 Manifest 不过」，和 `manifest.ts`、S-95 一致，不开诊断通道。SDK 不引公共后缀表，只做形状检查。
  - M3：Worker 留一份自己的数据，由测试钉住（§2.9）。凡是要重新部署 Worker 的改动，先报统筹；部署属于发布，是红线。
  - 疑问 1（Alchemist 绑的是 token 连接）：照 Q3「停用即拒」，插件声明的服务在插件停用后不再发送。但 token 连接那一半不在本线的片里，登记成 BL-794，写进 §9「不做」。RAC-1088 只管 OAuth 连接。
  - 疑问 2（刷新途中插件被停用，已经轮换出的 refresh token）：不存，后果写在 §2.6。
- **用户 10-27 的决定（N2 的另一半）**：选「只存新令牌」。等这次刷新的调用方全部取消后，刷新响应才回来，并且插件仍启用、授权没撤、连接仍有效：这时把轮换出的凭据写回原来那条连接，别的一概不写。这和 S-35 是同一个道理：只保住调用之前已有的连接，算平台维护凭据，不算调用方的业务记录（§2.6）。

## 1. 今天是什么样（C 头）

### 1.1 一套通用引擎，加三套专门流程

- **通用引擎**：`apps/local-host/src/connector-api-oauth.ts`（325 行）。
  - **数据**：`connector-api-oauth-providers.ts` 里的 `API_OAUTH_PROVIDERS`，约 38 项，加 github 的 web 授权码方法。
    - 每项有 `authorize`、`token`、`scope`、`pkce?`、`auth?: basic|post`、`format?: json|form`、`optionalSecret?`、`refresh?`、`parameters?`、`fields?`、`note?`。
    - 另有 `google()`（scope 带 `openid email`）、`microsoft()`、`atlassian()` 三个帮手。
  - **`apiOAuthProvider(service, settings)` 用代码改写五家**：
    - cloudflare：在 scope 后追加 `api_scopes`，只收 `*.read`；`client_auth` 可选 basic、post 或 none。
    - stripe：`stripe_scope` 只能是 read_only 或 read_write。
    - Microsoft：`tenant` 替换路径里的 `/common/`。
    - salesforce：`login_origin` 换掉来源，经 `salesforceOrigin` 检查（`connector-api-oauth-providers.ts:87-91`）：必须是 https，主机名以 `salesforce.com` 结尾，不带凭据或端口。
    - vercel：在路径后追加 `integration_slug` 和 `/new`。
  - **`startApiOAuth`**：
    - 先查本机来源和 `checkConnectorSetupSubmission`；
    - 再按顺序选客户端：重新授权时沿用原来的客户端；然后是产品 broker（`connectorBrokerOrigin`）；然后是产品客户端（`connectorProductAuth`，读 `CONNECTOR_<SVC>_OAUTH_*`）；最后是本人填的客户端。broker 和产品客户端都只按 service_id 取；
    - 接着用 `withConnectorProtocols(store.begin(origin, configuration))` 拿 state，走 PKCE S256。
  - **state 的格式**：protocol store 生成 32 字节，`/^[A-Za-z0-9_-]{43}$/`（`horizontal/connector-host/src/protocol-store.ts`）。
  - **`exchange` 有两处怪癖**：gitlab 刷新时要带 `redirect_uri`；clickup 不带 `grant_type` 和 `redirect_uri`。`expiry` 对 monday 读 JWT 的 `exp`。
  - **`enrichContext` 做两类事**：
    - 从令牌响应里留下 workspace_id、sentry 的用户 id、salesforce 的 `instance_url` 和 vercel 的 team_id；
    - 另发请求：clickup 和 supabase 列出已授权的 workspace；jira 和 confluence 取 `https://api.atlassian.com/oauth/token/accessible-resources`，按站点对上，得到 cloud_id，拼出 `https://api.atlassian.com/ex/<svc>/<cloud_id>`。
  - **`apiOAuthIdentity` 取身份**：
    - Google 系用 `https://openidconnect.googleapis.com/v1/userinfo`（取 `sub`）；
    - Gmail 用 `gmail/v1/users/me/profile`，GitHub 用 `/user`；
    - catalog 的服务调 catalog 包里的 `catalogWhoami` 代码；其中 Salesforce 发往 kept 的 instance 来源，Jira 和 Confluence 发往用 cloud_id 拼出的 base（`plugins/official-integrations/catalog/src/catalog.ts:605,629`）。
  - **身份与上下文请求今天用裸 `fetch`**（`jsonRequest`、`enrichContext`），不经 `public-https.ts` 的 `sendPublicHttps`。
  - **`completeApiOAuth`**：
    - 先 `store.consume(state, origin)`，返回的 redirect 必须等于 `config.redirectUri`；
    - 同一个连接串行执行；
    - 网络等待的前后各做一次 `assertConnectorAuthorizationPending`；
    - 重新授权时查 revision，并要求 account_id 不变；
    - 最后经 `submitConnectorActivation` 提交。
    - 拒绝时由 `finishConnectorAuthorization` 把状态记成 failed 或 cancelled，并清掉暂存的 secret。
  - **`resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl)`**：同一个连接的刷新排队（`serialized`），保存前再查一次 revision。
- **broker**：`apps/local-host/cloudflare/worker.ts:1` import 了 `API_OAUTH_PROVIDERS` 和 `apiOAuthProvider`，在 `:61,106,134,143` 用来拼授权地址、换令牌。Worker 单独部署，读不到 Manifest。
- **三套专门流程**：
  - **Gmail**：路由是 `gmail/client` 和 `gmail/oauth/start`，回调 `/api/feed/connectors/gmail/oauth/callback`（`connector-oauth-callbacks.ts`）。
    - 带入门流程的返回；
    - 重新授权要求邮箱相同；scope 只有 `gmail.readonly`；
    - 凭据经 `createOAuthCredentialStage` 生效；
    - 插件端的 `createGmailOAuth({secrets, hasSecret, environment})` 拿到了宿主的密钥库；
    - 客户端的引用是 `connector:gmail:client_id/client_secret`，环境变量是 `MOLIS_WORK_GMAIL_CLIENT_ID/SECRET`；
    - redirect 允许在回调前面多一段编码过的项目路径。
  - **Notion**：路由 `notion/oauth/start`，回调 `/api/settings/connectors/notion/oauth/callback`，宿主端是 `apps/local-host/src/notion-oauth.ts`，catalog 端是 `plugins/official-integrations/catalog/src/notion-oauth.ts`。
    - 重新授权要求 workspace 相同。
    - C 在 `009b773f` 给刷新加了参与者集合（`apps/local-host/src/notion-oauth.ts:23-62`）：一个调用方取消，不中止别的调用方；最后一个参与者离开时 `beforeEffect` 不过，响应整个丢弃。
  - **GitHub 设备授权**：路由 `github/client`、`github/device/{start,poll}`（`web-connectors-settings.ts`），宿主端 `apps/local-host/src/github-oauth.ts`、`apps/local-host/src/connector-github-device.ts`，插件端 `plugins/official-integrations/github/src/oauth.ts`。
    - 引用 `connector:github:client_id`，环境变量 `GITHUB_CLIENT_ID`。
    - 插件的报错文字（`github/src/oauth.ts:51`）写的却是 `MOLIS_WORK_GITHUB_CLIENT_ID`。
- **待完成记录有两份**：
  - 通用引擎的 protocol store；
  - `connector-oauth-targets.ts`：`Service = "gmail" | "notion"`，`STATE=/^[A-Za-z0-9_-]{16,128}$/`，TTL 10 分钟，存在文件密钥库的 `connector:<svc>:oauth:connection-target:<state>` 下。Gmail 另外还有一份 `connector:gmail:oauth:pending`。

### 1.2 取令牌按服务分支

`connector-access.ts` 的 `resolveApiConnection(home, id, control, service?, forceRefresh)` 按下面的顺序分：

1. cli 只给飞书（`feishuCliFetch`）。
2. 凭据引用是 `connector-protocol:<uuid>:access` 的，走通用 OAuth。
3. Notion 走 `resolveUsableNotionToken`。
4. Gmail 走 `resolveUsableGmailAccessToken`。
5. 其余用原样令牌。

被拒时经 `markRefreshRefused` 记在连接上。今天 Gmail、Notion、GitHub 设备授权的连接是 `auth_method: "oauth"`，引用 `connector-connection:<id>:access`；token 连接的引用是 `connector-connection:<id>:token`（`horizontal/connector-host/src/connection-store.ts:198`）。

### 1.3 方法列表、请求表与集成登记

- **方法列表**：`host-connector-methods.ts` 的 `connectorMethodsFor` 把三张表并成 `ConnectorMethodOption`，经 `connectors.methods.read@1` 给设置页。
- **合同里的方法**：非 token 的方法今天只有 `{ kind }`；SDK 的 `methodProblems` 拒绝任何多写的字段。声明问题经 `assertNoDeclarationProblems`（`packages/plugin-sdk/src/manifest.ts:267-269`）让整份 Manifest 不过。
- **访问令牌发往哪里**：只由平台表 `CONNECTOR_REQUEST_SERVICES`（`packages/contracts/src/services/connector-host.ts:192`，S-69）定：
  - 每个服务写精确的 `origins`；
  - 租户服务（salesforce、jira、confluence）写 `tenant.domain`，来源钉在连接上（`connector_connection_targets`，`connection-store.ts` 的 `assertTarget`）；
  - Atlassian 的 OAuth 令牌改发网关。
  - 宿主构建的插件 Manifest 不许写服务的 `origins`（`integration-registry.ts` 的 `enableOnce`）。
- **集成登记**：
  - 不只收宿主构建的插件。`integration-registry.ts:67-80` 的 `attach()` 会把签名沙箱包的 `connection_services` 登记进来（BL-530、S-95）；`detach` 会 `declarations.release(pluginId)`，放出 service_id。
  - `install_id` 由 `plugin_id` 和发布者签名算出（`installIdentity`），同一个包停用再启用拿到的还是同一个，所以它只判得出「换了 `plugin_id` 或发布者签名」；「停用过」由第 6 条的「现在没启用」判。沙箱包 attach 时沿用原来的安装。
- **`ConnectorAuthKind`**：有 `github | gmail | notion | feishu | token | none` 六种。workbench 的 `settings-view.ts` 和宿主的 `connector-directory.ts`、`platform-connection-services.ts` 都按它分支。

### 1.4 C 定下的形状，本稿不改

- `ConnectorCallControl { signal; beforeEffect(); current() }` 是必传参数，贯穿驱动、提供方和刷新。
- C 的 SDK 有 `controlledConnectorFetch(fetchImpl, control)`（`packages/plugin-sdk/src/connector-call.ts`，main 上还没有）。
- `connectorAccountControl(home, connectionId, caller)` 在 `connector-oauth-targets.ts`。
- 依赖 C 的片里，新的网络请求都经 `controlledConnectorFetch` 和 `sendPublicHttps` 发出，提交前调 `beforeEffect()`。第 1 片只有纯函数，不 import 这几样。

## 2. 设计：声明式的 OAuth 方法

### 2.1 Manifest 里的 `kind: "oauth"`

`PluginAuthMethodDeclaration` 的 oauth 一员加下面的字段，都是数据。写法在 `packages/contracts/src/platform/plugin-integrations.ts`，形状检查在 SDK 的 `integration-declarations.ts`，由同一份 `connectionMethodProblems` 读：

| 字段 | 意思 | 收什么 |
| --- | --- | --- |
| `grant` | `"authorization_code"` 或 `"device"`（§2.5） | 必填 |
| `authorize_url`、`token_url`、`refresh_url?`、`device_authorization_url?` | 授权服务的端点 | 完整的 `https://` 地址：不带账号密码、端口、查询或片段，主机是名字（不是 IP 字面量）；`{setting}` 只能出现在路径段里；或者写成 `{tenant}/路径`（见下） |
| `issuer?` | 授权服务的 issuer（RFC 9207） | `https://` 地址；写了，回调就必须带上相同的 `iss` |
| `scopes` | 要的权限 | 字符串数组；可以写 `{setting}` |
| `pkce` | `"S256"` 或不写 | 只收 S256 |
| `client_auth` | `"basic"`、`"post"` 或 `"none"`，或 `{ setting }` | 默认 post |
| `token_format` | `"form"` 或 `"json"` | 默认 form |
| `client_secret` | `"required"` 或 `"optional"` | 默认 required |
| `parameters` | 授权地址上固定的参数（如 `audience`、`owner=user`、`access_type=offline`） | 键值都是字符串；不许写 `client_id`、`redirect_uri`、`state`、`code_challenge*`、`response_type`，这几个由平台写 |
| `settings` | 本人在设置里填的字段 | `{ key, label, placeholder?, required?, default?, use, pattern? 或 enum? }`；`default` 是留空时的取值（Microsoft 的 `common`、Salesforce 的登录地址）；`use` 只能是 `path`、`scope`、`client_auth`、`tenant` 之一 |
| `identity` | 怎样取账号 | `{ url, method?, body?, headers?, query?, list?, account_id, label, label_prefix?, keep? }`，逐项的意思和 37 个服务的写法见 §2.1.1（第 2 片）。`url` 见下面的「带令牌的请求」；`account_id` 是几段，每段按顺序取第一个非空的来源，段之间用 `:` 连起来；`label` 是按顺序取第一个非空的来源；两者都只取 `identity:`、`context:`、`literal:` |
| `keep` | 从令牌响应里留进连接上下文的字段 | `{ key, pointer, check?, required? }`；`check` 只能是 `tenant`（见下）或 `pattern`。从 identity 响应里留的写在 `identity.keep`（§2.1.1） |
| `context` | 授权后另发的只读请求 | `{ key, url, method?, body?, headers?, query?, pick }`，每次授权都发，检查连接、读账号、刷新都不发（§2.2「检查连接和读账号」），取到的值写进连接上下文的这个 `key`（第一版的 `when_missing` 去掉，第 2 片评审；「键已在上下文里就不发」也去掉，第 1 片评审：发不发由调用方所处的环节定，不看上下文里有没有这个键）；`pick` 只有两种：`ids`（取列表里每一项的某个指针，按码点排序后用 `,` 连起来，clickup、supabase；列表为空时授权失败，见 §2.1.1）和 `match_setting`（按 `use: "tenant"` 那个 setting 的来源对上列表里的一项，取它的指针并按 `pattern` 校验，atlassian 的站点），写法见 §2.1.1 |
| `quirks` | 已知的三种怪癖 | `refresh_redirect_uri`（gitlab）、`omit_token_params: ["grant_type","redirect_uri"]`（clickup）、`expiry: "jwt_exp"`（monday）；只收这几个值 |
| `note` | 设置页的一句说明 | 字符串 |

**第 1 片落地的写法**（合同 `plugin-integrations.ts`，SDK `oauth-declarations.ts`，宿主 `connector-oauth-declarations.ts`）：
- 占位一律带名字空间：`{setting.<key>}`、`{context.<key>}`；地址开头的 `{service}`、`{tenant}`、`{gateway}` 只能写在最前面。占位必须占满一个路径段，填进去的值按路径段编码，带 `/`、`\`、`..`、`%2f`、`%5c`、`%2e` 的都拒绝。
- 来源写成一个字符串：`identity:/指针`、`context:键`、`literal:文字`；指针是 JSON Pointer。令牌响应里要用的值先经 `keep` 留进上下文，再写成 `context:` 取（第 2 片复核：这样授权和检查走同一条路，检查时手里没有令牌响应也取得到；写 `token:` 的整份不过）。`account_id` 是来源数组的数组，空数组就是 §2.1.1 的 `∅`。没有 `url` 的 identity 不发请求，也不许取 `identity:` 来源（今天的 Notion；第 4 片 Notion 加上 `url`，见 §2.2「检查连接和读账号」）。
- `scopes` 的一项可以正好是一个 `use: "scope"` 的 `{setting.<key>}`，留空就去掉；`use: "scope"` 的 `pattern`、`enum` 逐个空格分开的词检查（Cloudflare 的 `api_scopes`）。`use: "path"` 的 setting 必须写 `pattern` 或 `enum`；`use: "client_auth"` 的必须写 `enum`，取值在 `basic`、`post`、`none` 里。
- identity、context 的 `headers` 不许写平台写的头：`Authorization`、`Proxy-Authorization`、`Cookie`、`Host`、`Content-Length`、`Content-Type`、`Transfer-Encoding`、`Connection`、`Accept`、`User-Agent`，以及写令牌的 `PRIVATE-TOKEN`、`X-Figma-Token`。
- **只写 `{kind:"oauth"}`、不带数据的旧写法，到第 4 片之前照样收**：今天的内置 Manifest 都是这样写的，数据仍在平台的表里。第 4 片把它们都写成数据，同一个 PR 里让 SDK 把这种写法改成声明错误（§6.1）。
- 解释器只给描述，不发请求：设置检查、端点展开、授权地址、令牌和刷新请求、设备授权请求、identity 和 context 请求、账号与 label、`keep`、context 取值、过期时间、端点指纹。错误码用 `defineErrorCodes("connector.oauth_declarations", …)`。宿主入口按名字导出这些函数，测试从入口取。
- **每条规则只有一份**（第 1 片评审 M1）：公开主机名的判断、租户来源的判断、占位的文法、header 和 query 值的写法、setting 值的规则、JSON Pointer 的转义、码点排序，都是 SDK `oauth.ts` 的函数，从子路径 `@molis-ai/molis-work-plugin-sdk/oauth` 按名字导出，根入口不导出（统筹 10-27 照第 1 片复核定，同 `/highlight`、`/rich-text`；对外部插件作者只增不减）；平台写的请求头名单是 contracts 的常量 `OAUTH_PLATFORM_HEADERS`。SDK 的形状检查和宿主的解释器都 import 这一份，不各写一套。占位文法（第 2 片复核）只有 `oauthPlaceholder` 一个函数：`{client_id}`、地址开头的 `{service}`、`{tenant}`、`{gateway}`（第 4 片起加 `{account}`）、`{context.<key>}`、`{setting.<key>}`，`key` 是 `[a-z][a-z0-9_]{0,63}`。地址开头、路径的整段占位、header 和 query 的值、scopes 都用它认；原样照收的 `body` 和 `label_prefix`，也用它判断「有没有像占位的写法」（见 §2.1.1「写死的三条」）。解释器照同一份规则自己再拒一次：声明里的平台请求头、地址里的 userinfo、主机名里的占位，不靠 SDK 先拦。`isDeclaredOAuth` 是区分「带数据的 oauth」和裸 `{kind:"oauth"}` 的共用判断，第 3、4 片都用它。`public-https.ts` 的 `publicAddress` 查的是解析出的地址，是另一件事，不并进来。
- **租户由解释器自己算，调用方不传**（第 1 片评审 M2）：`{tenant}` 发往的来源，先取 `keep` 或 `identity.keep` 里唯一那项 `check: "tenant"` 留下的值（用时按平台表再查一次），没有再取 `use: "tenant"` 的 setting（`oauthPinnedTenant`）。SDK 拒绝两种声明：identity 或 context 写了 `{tenant}`，却既没有 `use: "tenant"` 的 setting，也没有在这之前留下 `check: "tenant"` 的值；`keep` 和 `identity.keep` 里加起来有不止一项 `check: "tenant"`。salesforce 的 identity 因此发往 kept 的 instance，不是登录地址。
- **SDK 和解释器对齐的四处**（第 1 片评审）：setting 的 `default` 也按这个 setting 自己的 `pattern`、`enum`、路径段规则和租户域检查，写错了整份不过；`match_setting.setting` 只能指向 `use: "tenant"` 的 setting；`ids` 的指针和其他指针一样还原 `~1`、`~0`；`list.min_by` 和 `ids` 都按 Unicode 码点排序，不用随 locale 变的 `localeCompare`。

**来源可变的只有租户，范围由平台表定。**
- Manifest 不写主机后缀，也不写来源列表。端点主机是写死的；只有 `use: "tenant"` 的那一个 setting 能换来源，写成 `{tenant}/路径`。
- 平台检查这个值时，用的是平台表里这个服务的 `CONNECTOR_REQUEST_SERVICES[service].tenant.domain`，和今天 `salesforceOrigin` 是同一组规则：https，不带凭据、端口、路径，主机等于这个域或在它下面。平台表里没有 `tenant` 的服务，声明了 `use: "tenant"` 就是声明错误。
- `keep` 的 `check: "tenant"` 也一样：留下来的来源（salesforce 的 `instance_url`）必须过同一个检查，再钉进 `connector_connection_targets`。这一条不比今天的 `salesforce.com` 后缀松。写了 `check: "tenant"` 的 keep 必须同时写 `required: true`（统筹 10-27，照第 1 片复核）：响应里没有就授权失败，之后连接里缺了这个值也拒绝，不悄悄退回登录来源，因为 identity 和后面的请求发到哪里不该悄悄变。写在 `identity.keep` 里的那项不一样：上下文里没有它时，解释器就用 tenant 设置，分不出这是那次 identity 请求本身还是之后的请求；两者结果一样，只是因为它也 `required`，授权时取不到就失败，连接里不会缺它。今天没有服务这样写。
- SDK 不需要公共后缀表（M5）。第一版的 `origins` 列表和 `origin_setting` 都去掉了，`settings.use: "origin"` 也一起去掉（建议 9）。

**带令牌的请求（identity、context）只发往平台表允许的地方**（M2(b)）：
- 访问令牌能发到哪里，仍然只由平台定，这样和 S-69「Manifest 不写地址」不冲突。Manifest 只写路径和来源种类：
  - `url` 写成 `{service}/路径`：发往平台表 `origins` 里的那一个。`{service}` 只给 `origins` 只有一项的服务；有几项的（cloudflare 有两项），写完整的 https 地址，它的来源必须正好是 `origins` 里的一项（第三轮建议 3）。不用序号写法，平台表换了顺序也不会悄悄换来源；
  - `{tenant}/路径`：发往钉在连接上的租户来源；
  - `{gateway}/路径`：发往 Atlassian 网关；
  - `{account}/路径`：发往 `account_origins`（下面说）。规则同 `{service}`：只有一项时用 `{account}`，几项时写完整地址，来源必须是其中一项。**`{account}` 和 `account_origins` 随第 4 片落地**（A4，统筹 10-27 选「挪到第 4 片」）：第 1 片的解释器只认 `{service}`、`{tenant}`、`{gateway}`，遇到 `{account}` 当未知占位拒绝。要用 `{account}` 的声明（Gmail 的 userinfo、Atlassian 的 accessible-resources，以及下面列的几家）都在第 4 片及以后才写进 Manifest，所以第 1 片不缺它。
- 路径里可以写 `{context.<key>}` 和 `{setting}`，按路径段编码。这样 Jira、Confluence 的身份地址可以用 cloud_id 拼出 base，Salesforce 的身份地址发往 kept 的 instance 来源（建议 8、第二轮建议 2）。
- **`account_origins`**：只放「取账号和授权上下文」要用、又不在 `origins` 里的来源。例如：
  - Google 的 `https://openidconnect.googleapis.com`；
  - Atlassian 的 `https://api.atlassian.com`（accessible-resources）；
  - adobe、bitbucket、feishu、lark 四个 OAuth 服务的身份来源（全部清单见 §2.1.1）。这四个今天**不在** `CONNECTOR_REQUEST_SERVICES` 里（C 头上核过），只补进 `account_origins`，**不加进 `origins`**，也不为它们在请求表里新开一行。
  - 它和 `origins` 一样是平台的表，改它要过 S-69 的评审。
- **`account_origins` 只给平台自己的 identity 和 context 请求用**（A2）：
  - 插件经 `services.connections` 发的请求（S-69，由 `connector-plugin-requests.ts:88,133` 执行）只认 `origins` 和钉住的租户来源，不认 `account_origins`。经 gmail 连接请求 `https://openidconnect.googleapis.com`，照今天一样被拒（RAC-1082）。
  - 为了实现时不会把它并进插件请求的放行集合，`account_origins` 不写成 `ConnectorRequestService` 的一个字段，而是 `connector-host.ts` 里单独的一张表 `CONNECTOR_ACCOUNT_ORIGINS`（service_id → 来源列表），只许解释器所在的那一个文件 import 它（第四轮建议 1：今天读请求表做执法的还有 `connector-request-credentials.ts:34`、`plugin-connection-slots-http.ts:39`、`sandbox-package.ts:146`，反过来写「只许一个文件」，以后新增的执法文件也自动在范围里）。名字仍叫 `account_origins`，含义不变。
  - 不放进请求表还有一个原因：`createCallConnectionsPort` 的 `callService`（`connector-plugin-requests.ts:132-135`）对不在请求表里的服务，退回签名包自己写的来源（S-95）。把那四个服务加进请求表、`origins` 留空，就会改掉它们今天在 S-95 下的行为。单独一张表，这四个服务在插件请求一侧一个字节不变。
  - 这样写不比今天松：今天 identity 和 context 用裸 `fetch` 发往同一批主机，没有来源限制；新稿限定了来源，还加了 DNS 固定（§2.2）。
- **端点和带令牌的请求是两回事**：
  - 授权、令牌、刷新、设备授权这几个端点，收到的是 code、verifier、client secret、refresh token，不收拿来调 API 的访问令牌，它们的约束是 §2.8 的 M1；
  - 访问令牌只发往上面这几种平台定的来源。

**模板展开之后再查一次地址。** 平台展开模板后，对每个地址都按 S-09、S-10 再查一遍。`use: "path"` 的值按 `pattern` 校验，并按路径段编码，不能带 `/`、`..` 或 `%2f`。

**检查不过，整份 Manifest 不过**（M5，统筹 10-27 裁定）：
- 和 `manifest.ts:267-269`、S-95 对 `origins` 的做法一样：`plugin.declaration_invalid`，在写任何记录之前拒绝，不开诊断通道。
- 宿主构建的插件写错了，是构建问题，测试会拦下来。
- 平台表在 contracts 里，SDK 读得到（只读，不改 `connector-host.ts`），所以下面几条也放在 SDK 的形状检查里：
  - 「`use: "tenant"` 只给平台表里有 `tenant` 的服务」，第 1 片；
  - 「`{service}` 只给 `origins` 只有一项的服务；identity、context 的 `url` 写完整地址时，来源必须在 `origins` 里」，第 1 片。这条只管 identity 和 context 的 `url`，不管 `authorize_url`、`token_url`、`refresh_url`、`device_authorization_url`：端点本来就不在 `origins` 里（如 `oauth2.googleapis.com`），它们的约束是上面的端点规则和 §2.8（第四轮建议 2）；
  - 「`{account}` 只给 `CONNECTOR_ACCOUNT_ORIGINS` 里有的服务，完整地址的来源必须在其中」，第 4 片，和这张表一起加。

  本人填的租户值，在宿主里按 §2.1 查。

### 2.1.1 逐个服务的 identity 数据（第 2 片）

第 2 片只读代码，产出就是这一节，没有改代码。数据照 C 头上今天的行为抄：catalog 的 `identity`（`catalog.ts`）、宿主的 `readIdentity`（`provider.ts:61-73`）、`apiOAuthIdentity` 和 `enrichContext`（`connector-api-oauth.ts:199-244`）。第 4 片把它们写进各自的 Manifest。

**今天账号 id 是怎样算的**，数据要原样算出同一个值：
- Google 三个服务：取 userinfo 的 `sub`，不带前缀。
- GitHub web：取 `/user` 的 `id`，不带前缀。
- catalog 的服务：`前缀:id`。
  - 前缀按顺序取第一个非空的：响应的 `team_id`、`data.me.account.id`、`organization_id`、`app.id_code`、`team_user.team_id`，再是上下文的 `workspace_id`、`cloud_id`、`team_id`。都没有就是空串，所以多数服务的 account_id 以 `:` 开头。
  - id 按一张 18 项的通用列表取第一个非空的（`id`、`sub`、`user_id`、`portalId`、`account_id`、`accountId`、`uuid`、`gotrue_id`、`team_user.user_id`、`data.open_id`、`data.id`、`data.gid`、`user.id`、`user.permissionId`、`data.viewer.id`、`data.me.id`，monday 先取 `data.me.id`，非 sentry 再取列表第一项的 `id`）。
- 另有两个后缀：sentry 再接 `:令牌响应的 user.id`；clickup、supabase 再接 `:workspaces:已授权工作区`。

下面每个服务只写出通用列表在**它自己的响应**上实际会取到的那几项，顺序不变。真实响应里可能同时出现的几项，都按今天的顺序列出来：bitbucket 先 `account_id` 再 `uuid`，salesforce 先 `sub` 再 `user_id`，cloudflare、supabase 先 `id`。这样今天已经存在的、走通用流程的 catalog 连接，重新授权时算出的 account_id 不变。

**写法**（表里用的简写）：
- 请求：`GET`、`POST` 后面跟 `url`（`{service}`、`{tenant}`、`{gateway}`、`{account}` 见 §2.1），`body` 是固定的 JSON。
  - 令牌怎样写，取平台请求表这个服务的 `credential.oauth`（monday 是 `bare`，其余是 `bearer`）；不在请求表里的四个服务（adobe、bitbucket、feishu、lark）用 `bearer`。
  - 都带 `Accept: application/json` 和平台的 User-Agent。
- `headers`、`query`：值只能是固定字符串、`{client_id}`（这次授权用的公开 client id）或 `{context.<key>}`。取值为空的 query 参数不写。不许写 `Authorization`、`Cookie`、`Host`，以及 `Content-Length` 一类由平台写的头。
- account_id 写成几段，段之间用 `:` 连起来。每段是一组来源，按顺序取第一个非空的：
  - `i:/指针`：identity 响应；
  - `c:key`：连接上下文；
  - `"字面量"`：固定字符串。
  - 写成 `∅` 的段固定是空串，对应今天的「没有前缀」。前缀那一段取不到就是空串，其余每一段取不到，就是「服务未返回稳定账号身份」，授权失败。
- `label`：按顺序取第一个非空的来源，都取不到就是「无法读取账号身份」。
- account_id 和 label 都不取令牌响应：要用的值先由 `keep` 留进上下文，写成 `c:key`（第 2 片复核）。下表 keep 一栏里的 `t:/指针` 指令牌响应，只出现在那里。
- `identity.keep`：从 identity 响应里留进连接上下文的键，后面的 Feed 要用。
- `list: { min_by: "/id" }`：响应是列表时，取 `/id` 最小的那一项，按 Unicode 码点比较（第 1 片评审：`localeCompare` 随运行环境的 locale 变；sentry 的 id 是数字串，两种比较结果相同，今天的连接不受影响）。只有 sentry 用。第一版写的「上下文里已经有 `org` 时取 `slug` 相同的那项」删掉（第 2 片评审）：授权流程里上下文从来没有 `org`，那条路只在 Feed 读取时走，归插件代码。

**写死的三条**（第 2 片评审，第 1 片的 SDK 检查拒绝违反的声明）：
1. `body` 是固定的 JSON，里面不展开任何占位：哪个字符串（含键名）里有一对最内层的花括号，去掉首尾空白、改成小写后按占位文法（§2.1「每条规则只有一份」）读得出来，比如 `{context.team}`、`{ Context.team }`，整份不过。这和路径用的是同一份文法：同样的写法在路径里也报错。GraphQL 的 `{ viewer { … } }` 不是占位写法，照收。`{ viewer { id name email } }`、`query { me { id } }`、`{viewer{id}}` 都照收，有用例。代价：花括号里只有一个字段、字段名又正好是占位名的（`{ service }`、`query{tenant}`），会被当成占位拒掉；看的是最内层那对花括号，所以嵌在里面的也一样：以后 GraphQL 里只要有一层只剩一个字段、字段名正好是占位名，比如 `{ me { tenant } }`，整份就被拒。今天的 37 个服务没有这样写的：写 `body` 的只有 dropbox、linear、monday，写 `label_prefix` 的只有 x，评审 10-27 核过，没有一家会被拒。
2. `list` 只有 `min_by` 一个键。
3. `label_prefix` 是字面量，不当模板展开，带占位写法的整份不过；原样拼在 label 前面，不看 label 开头（第 2 片复核删了「已经以它开头就不再加」：只有响应异常时才走得到，那时显示成 `@@名字`，记进 RAC-1080 的有意不同）。

**只给一个服务用的字段**，各留一个理由：
- `list.min_by`（sentry）：一个令牌能看到几个组织，取 id 最小的那个，account_id 才稳定。
- `label_prefix`（x）：去掉它，已有连接显示的「@名字」就变了；它是一个固定字符串，不求值。
- `{client_id}`（adobe）：adobe 的身份接口要在 query 和 `X-Api-Key` 里带公开的 client id，不是密钥。

第一版 §2.1 表里的 `context.when_missing` 删掉：37 个服务一个都没用（第 2 片评审）。

| 服务 | 请求 | account_id | label | 另外留下的 |
| --- | --- | --- | --- | --- |
| gmail、google-calendar、google-drive | `GET {account}/v1/userinfo` | `[i:/sub]` | `/email`、`/name`、`/sub` | |
| github（web） | `GET {service}/user` | `[i:/id]` | `/login` | |
| outlook | `GET {service}/v1.0/me` | `∅ : [i:/id]` | `/userPrincipalName`、`/mail`、`/displayName` | |
| onedrive、sharepoint、teams | `GET {service}/v1.0/me` | `∅ : [i:/id]` | `/userPrincipalName`、`/displayName` | |
| dropbox | `POST {service}/2/users/get_current_account`，`body: null` | `∅ : [i:/account_id]` | `/email`、`/name/display_name` | |
| box | `GET {service}/2.0/users/me` | `∅ : [i:/id]` | `/login`、`/name` | |
| notion | `GET {service}/v1/users/me`，`headers: { "Notion-Version": "2022-06-28" }`（第 4 片加，只为检查时验证令牌，§2.2「检查连接和读账号」） | `[c:workspace_id]` | `c:workspace_name`，没有时取 `i:/bot/workspace_name`（第 4 片加：经产品 broker 授权时令牌响应不带 workspace 名，只有 bot 自己的应答里有） | `keep: workspace_id ← t:/workspace_id`（必填）、`workspace_name ← t:/workspace_name` |
| slack | `GET {service}/api/auth.test` | `[i:/team_id] : [i:/user_id]` | `/user`、`/team` | |
| discord | `GET {service}/api/v10/users/@me` | `∅ : [i:/id]` | `/username`、`/global_name` | |
| feishu | `GET {account}/open-apis/authen/v1/user_info`（`https://open.feishu.cn`） | `∅ : [i:/data/open_id]` | `/data/name`、`/data/open_id` | |
| lark | `GET {account}/open-apis/authen/v1/user_info`（`https://open.larksuite.com`） | `∅ : [i:/data/open_id]` | `/data/name`、`/data/open_id` | |
| zoom | `GET {service}/v2/users/me` | `∅ : [i:/id]` | `/email`、`/display_name` | |
| gitlab | `GET {service}/api/v4/user` | `∅ : [i:/id]` | `/username`、`/name` | |
| bitbucket | `GET {account}/2.0/user`（`https://api.bitbucket.org`） | `∅ : [i:/account_id, i:/uuid]` | `/display_name`、`/username` | |
| vercel | `GET {service}/v2/user`，`query: { teamId: "{context.team_id}" }` | `[c:team_id] : [i:/user/id]` | `/user/username`、`/user/email` | `keep: team_id ← t:/team_id` |
| cloudflare | `GET https://dash.cloudflare.com/oauth2/userinfo`（`origins` 有两项，写完整地址） | `∅ : [i:/id, i:/sub]` | `/email`、`/sub` | |
| huggingface | `GET {service}/oauth/userinfo` | `∅ : [i:/sub]` | `/preferred_username` | `identity.keep: name ← /preferred_username` |
| sentry | `GET {service}/api/0/organizations/`，`list: { min_by: "/id" }` | `∅ : [i:/id] : [c:oauth_user_id]` | `/name`、`/slug` | `identity.keep: org ← /slug`；`keep: oauth_user_id ← t:/user/id`（必填） |
| supabase | `GET {service}/v1/profile` | `∅ : [i:/id, i:/gotrue_id] : "workspaces" : [c:authorized_workspaces]` | `/primary_email`、`/username`、`/gotrue_id` | `context: authorized_workspaces ← GET {service}/v1/organizations`，`pick: ids "/*/id"` |
| linear | `POST {service}/graphql`，`body: { query: "{ viewer { id name email } }" }` | `∅ : [i:/data/viewer/id]` | `/data/viewer/name`、`/data/viewer/email` | |
| jira | `GET {gateway}/ex/jira/{context.cloud_id}/rest/api/3/myself` | `[c:cloud_id] : [i:/accountId]` | `/displayName`、`/emailAddress` | `context: cloud_id ← GET {account}/oauth/token/accessible-resources`（`https://api.atlassian.com`），`pick: match_setting site_url → /url，取 /id`，`pattern` 为 36 位 uuid |
| confluence | `GET {gateway}/ex/confluence/{context.cloud_id}/wiki/rest/api/user/current` | `[c:cloud_id] : [i:/accountId]` | `/displayName`、`/email` | 同 jira |
| asana | `GET {service}/api/1.0/users/me` | `∅ : [i:/data/gid]` | `/data/name`、`/data/email` | |
| clickup | `GET {service}/api/v2/user` | `∅ : [i:/user/id] : "workspaces" : [c:authorized_workspaces]` | `/user/username`、`/user/email` | `context: authorized_workspaces ← GET {service}/api/v2/team`，`pick: ids "/teams/*/id"` |
| monday | `POST {service}/v2`，`body: { query: "{ me { id name email account { id } } }" }`，`headers: { "API-Version": "2024-10" }` | `[i:/data/me/account/id] : [i:/data/me/id]` | `/data/me/name`、`/data/me/email` | |
| airtable | `GET {service}/v0/meta/whoami` | `∅ : [i:/id]` | `/email`、`/id` | |
| figma | `GET {service}/v1/me` | `∅ : [i:/id]` | `/handle`、`/email` | |
| canva | `GET {service}/rest/v1/users/me` | `[i:/team_user/team_id] : [i:/team_user/user_id]` | `/team_user/user_id`、`/user/display_name`、`/profile/display_name` | |
| adobe | `GET {account}/ims/userinfo/v2`（`https://ims-na1.adobelogin.com`），`query: { client_id: "{client_id}" }`，`headers: { "X-Api-Key": "{client_id}" }` | `∅ : [i:/sub]` | `/email`、`/name`、`/sub` | |
| salesforce | `GET {tenant}/services/oauth2/userinfo`（kept 的 instance） | `[i:/organization_id] : [i:/sub, i:/user_id]` | `/preferred_username`、`/name` | `keep: instance ← t:/instance_url`，`check: tenant`，`required: true` |
| hubspot | `GET {service}/integrations/v1/me` | `∅ : [i:/portalId]` | `/hub_domain`、`/hub_id`、`/portalId` | |
| intercom | `GET {service}/me`，`headers: { "Intercom-Version": "2.13" }` | `[i:/app/id_code] : [i:/id]` | `/email`、`/name` | |
| stripe | `GET {service}/v1/account` | `∅ : [i:/id]` | `/display_name`、`/email`、`/id` | |
| x | `GET {service}/2/users/me` | `∅ : [i:/data/id]` | `/data/username`、`/data/name`，`label_prefix: "@"` | `identity.keep: user_id ← /data/id` |
| linkedin | `GET {service}/v2/userinfo` | `∅ : [i:/sub]` | `/name`、`/email`、`/sub` | |

几处要说明的：
- **notion** 按 §2.4 换成令牌响应里的 workspace：今天通用流程算出的是 `workspace:bot-id`，以后是 `workspace`。Q2 定了 Notion 的连接都要重新授权，所以不会有「同一账号」比对失败的旧连接。
- **x** 今天在响应里没有用户名时，label 写成 `X`；数据里不再保留这个兜底，取不到就按「无法读取账号身份」失败。这是有意的收紧，评审核过（10-27）：我们申请的 scope 有 `users.read`，`/2/users/me` 默认就带 `id`、`name`、`username`，`username` 是每个账号都有的；取不到还会退到 `/data/name`，两项都没有只会是异常响应。`label_prefix` 原样拼上：没有用户名、名字又以 `@` 开头时显示 `@@名字`，今天的旧实现去掉了一个 `@`，这是有意不同（第 2 片复核）。
- **clickup、supabase** 的 identity 里没有 id 时，今天 `readIdentity` 不写 `account_id`，随后拼出 `undefined:workspaces:…` 这样的坏数据，不报错。照数据写，这时报「服务未返回稳定账号身份」，授权失败。这是有意的改动。
- **clickup、supabase 已授权的工作区为空时，授权失败**（统筹 10-27 接受的行为变化）：今天 `ids` 取到空列表时写成空串，拼出 `…:workspaces:` 这样的 account_id，连接照样建起来，但连不到任何工作区。以后报 `connector.oauth_declarations.context_missing`，告诉本人下一步：「这个账号在服务里还没有可授权的工作区或组织，先建一个或加入一个，再重新连接」。
- **cloudflare、supabase** 的 `/id`：C 头上的契约夹具（`tests/connector-provider-contracts.test.ts`）只给了 `sub`、`gotrue_id`。今天的通用列表在 `id` 存在时会先取它，所以数据里照样先写 `/id`。
- **两条 Atlassian 的路**（第四轮建议 3）：两条都发往 `api.atlassian.com`，但用途不同，所以两边都要列，不是重复。
  - accessible-resources 在拿到 cloud_id **之前**调，只能走 `{account}`；
  - identity 和以后的 API 调用走 `{gateway}`，用的是钉在连接上的 cloud_id（C `connector-host.ts:161-166`）。
- **header 和 query 的值**只收固定字符串、`{client_id}` 和 `{context.<key>}`。`{client_id}` 是公开的 client id（adobe 要它），不是密钥。
- **令牌的写法从平台表来**：monday 的 OAuth 令牌今天就以 `bare` 发送（`mondayHeaders`），和请求表的 `credential.oauth: "bare"` 一致。Manifest 里不写令牌怎么放。

**要补进 `account_origins`（第 4 片落成 `CONNECTOR_ACCOUNT_ORIGINS`）的来源**，就这些：

| 服务 | 来源 | 用途 |
| --- | --- | --- |
| gmail、google-calendar、google-drive | `https://openidconnect.googleapis.com` | identity |
| jira、confluence | `https://api.atlassian.com` | context（accessible-resources，拿到 cloud_id 之前） |
| feishu | `https://open.feishu.cn` | identity |
| lark | `https://open.larksuite.com` | identity |
| bitbucket | `https://api.bitbucket.org` | identity |
| adobe | `https://ims-na1.adobelogin.com` | identity |

- 别的服务的 identity 和 context 都落在请求表已有的 `origins`、租户来源或网关里：clickup 的 `api.clickup.com`、supabase 的 `api.supabase.com`、cloudflare 的 `dash.cloudflare.com` 都已经在 `origins` 里。所以 §2.1 原来列的「clickup、supabase 列 workspace 的来源」不用补。
- feishu、lark、bitbucket、adobe 只进这张表，不进 `origins`，也不在请求表里开新行（A2）。
- 请求表不能加行，还有一个原因（第四轮评审补充）：`sandbox-package.ts:146-148` 按「服务在不在请求表里」决定签名包能不能自己写 `origins`。加一行，签名包的这项结果也会跟着变。

**第 2 片顺带发现、要改进本稿的**：
- **声明的写法要比第一版多几样**，第 1 片的合同照这一节写：
  - identity 要能写 `method`、`body`、`headers`、`query`、`list`、`label_prefix`、`keep`；
  - account_id 要能写分段和「第一个非空」；
  - context 的 `pick` 收成 `ids` 和 `match_setting` 两种。
  - 都只是数据，Q1 不变。
- **宿主另外两处 `catalogWhoami`，OAuth 连接和 token 连接都走**（第一版这里写成「只给 token 连接用」，写错了，第 2 片评审纠正）：
  - `connector-access.ts:110-125` 的 `inspectApiConnection`（检查连接）和 `connector-account-actions.ts:67-77` 的 `readConnectorAccount`（`connectors.account.read`），每一条 catalog 的 API 连接都走，OAuth 连接也走：401 或 `needs_auth`、`auth_method === "oauth"` 时先强制刷新，再查一次。
  - 授权改用声明之后，这两处要是还调插件代码，同一个 OAuth 服务就有两套身份算法。已经对出来的不一致：Notion 检查给 `workspace:bot`，连接上存的是 `workspace`；sentry 检查少了 `:user`；clickup、supabase 检查少了 `:workspaces:…`；x 检查仍兜底显示「X」。
  - **统筹 10-27 选 A**：两处按 `auth_method` 分开，OAuth 那一支改调解释器，和授权用同一份声明、同一个算法；token 那一支照旧调 `catalogWhoami`，记成 BL-795。做法见 §2.2「检查连接和读账号」。
  - token 连接要先经 `parseToken`、`prepare` 把粘贴的串拆开或换成令牌（飞书和 Lark 的 app 凭据、企业微信、Jira 的 `site|email|token`），这些不是 OAuth 声明能写的，所以 BL-795 只剩 token 连接。

### 2.2 平台只有一个解释器

- **位置与输入输出**：新的解释器放在 `apps/local-host/src/connector-*.ts`（这个前缀已经归 `connector` 主人，不用改 `tooling/gates/error-owners.json`），替换 `apiOAuthProvider` 和 `connector-api-oauth.ts` 里按 service 分支的代码。
  - 输入是登记里本方法的当前声明，加上本人的 settings 和连接上钉住的租户来源。
  - 输出是授权地址、令牌请求、刷新请求、设备授权请求、身份与上下文请求，都只是描述，不发请求。
- **宿主不 import 插件的实现**：OAuth 流程里，今天的 `catalogWhoami`、`notionAuthorizationUrl`、`notionOAuthToken`、`createGmailOAuth`、`createGithubDeviceFlow` 都不再被宿主引用。OAuth 方法的身份改由 §2.1.1 的 `identity` 数据算；catalog 里共 40 处 `identity:`（`types.ts` 1 处，`catalog.ts` 39 处），其中 37 个有 OAuth 方法的服务，第 2 片已经逐条写成数据，wechat、loom 没有 OAuth 方法。检查连接和读账号的 OAuth 那一支也改调解释器（下面「检查连接和读账号」）；token 连接的 whoami 还在 catalog 的代码里，宿主照旧 import，见 BL-795。按 Q1 只用数据：要是有写不成的，就往平台的 `identity` 声明里补字段，不给插件钩子。
- **请求都走一条路**：凡是从 Manifest 来的请求，都经 `sendPublicHttps` 发出（M2(c)），`redirect: "error"`。具体是：令牌、刷新、设备授权、设备 poll、identity、context。DNS 固定之后再做最后的发送检查（S-10），依赖 C 的片再套上 `controlledConnectorFetch`。今天的 `jsonRequest`、`enrichContext` 里的裸 `fetch` 一起换掉。
- **设置页看到的不变**：`ConnectorMethodOption` 的形状和 `connectors.methods.read@1` 的输出不变，`client_secret_required`、`fields`、`note`、`login_ready` 都改由声明算出。

**检查连接和读账号**（统筹 10-27 选 A，随第 4 片）：
- `inspectApiConnection` 和 `readConnectorAccount` 按连接的 `auth_method` 分两支。`oauth` 那一支取登记里这个服务的当前声明，用连接上存的上下文发 identity 请求（`oauthAccountRequest`），再用 `oauthAccount` 算 account_id 和 label，和授权时是同一个函数；401 时先强制刷新再查一次，和今天一样。token 那一支不变。
- 检查时没有令牌响应，所以 account_id 和 label 本来就不取令牌响应（§2.1，第 2 片复核）：令牌响应里的值授权时经 `keep` 留进上下文，检查和授权一样写成 `context:` 读。Notion 取 `c:workspace_id`、`c:workspace_name`，sentry 取 `c:oauth_user_id`，vercel 取 `c:team_id`；sentry 和 vercel 的这两个键名和 C 头 `enrichContext`（`connector-api-oauth.ts:205,207`）今天存的相同，已有的连接检查时取得到。
- **context 请求发不发，由调用方所处的环节说清楚**（第 2 片复核）：授权时发，每次授权都发；检查连接、读账号、刷新都不发，`context:` 来源读连接上存的上下文（clickup、supabase 的 `authorized_workspaces` 是授权时存下的值）。不看上下文里有没有这个键。C 头今天也是这样：`enrichContext` 刷新时也会跑（`:313`），clickup、supabase、jira、confluence 靠 `!config.context.<key>` 跳过（`:208`、`:218`），所以行为不变。这样检查时不会因为用户新加了工作区而算出另一个 account_id。第 4 片配用例：检查、读账号、刷新各一次，断言没有发 context 请求，account_id 和授权时相同。
- **Notion 的 identity 加上 `url`**：`GET {service}/v1/users/me`，带 catalog 今天就发的 `Notion-Version` 头。不写 `url` 的话，检查什么请求都不发，就看不出令牌还能不能用。account_id 和 label 照旧取令牌响应经 `keep` 留下的 workspace（`c:workspace_id`、`c:workspace_name`），授权时多发这一次请求，只是验证令牌。
- **副作用**：改完之后，检查返回的 `verified_account.account_id` 就是连接上存的那个。在这之前用旧检查记下 `expected_account` 的等待项（`connector-ready-checker.ts:42` 比的是两次检查记下的值），会停在「当前检查尚未确认所选账号」，要重新检查一次。这和 Q2「不迁移、重新授权」一致，不另写兼容读取。第 4 片配一条用例：旧检查记下的等待项保持 pending，重新检查后满足。
- 动手前先核 C 合入后这两个文件的形状：C 改过它们（`9efbf8d04..fe93d322`，`connector-access.ts` 40 行、`connector-account-actions.ts` 24 行）。

**第 4 片落地的写法**（2026-10-28，T-062；Codex 预审意见的处理逐条写在 PR 正文）：
- **声明放在哪**：catalog 37 个服务的方法在 `plugins/official-integrations/catalog/src/oauth-methods.ts`（`CATALOG_OAUTH_METHODS`），GitHub 的网页授权码和 Gmail 的方法写进各自的 Manifest。Gmail、Notion 的专门流程不动（第 6、7 片）；通用流程上的 Gmail 连接（入门流程）已由解释器算。三份内置 Manifest 升版：catalog 1.3.0、GitHub 1.4.0、Gmail 1.2.0。
- **光写 `kind: "oauth"` 的方法整份不过**：平台表删了，光写 kind 就没有流程可走，SDK 报「要把授权流程写成数据」。
- **Atlassian 照 A**：jira、confluence 的 `site_url` 是 `use: "tenant"` 的设置，`cloud_id` 由授权时的 context 请求（`{account}/oauth/token/accessible-resources`，`match_setting`）取；解释器把 `site_url` 和网关 `base`（`https://api.atlassian.com/ex/<服务>/<cloud_id>`）写进上下文，`cloud_id` 不是路径安全的值就拒（`context_missing`）。
- **发送**：令牌、刷新、identity、context 都经 `connector-oauth-send.ts` 的 `publicOAuthFetch` 交给 `sendPublicHttps`，地址解析之后、连接之前再查本次授权仍在等待、声明仍是钉住的那份、调用仍有效。流程函数的 `fetchImpl` 参数只留给测试。
- **检查连接和读账号**：通用流程的 OAuth 连接（`connector-protocol:` 引用）走 `readApiOAuthAccount`，401 先强制刷新一次，再 401 或 403 算要重新授权；专门流程（Gmail、Notion、GitHub 设备授权）的连接照旧。声明这个服务的插件停用后，刷新和读账号都拒。上面「副作用」那条的用例在 `tests/security-invariants-owned-checks.test.ts`「S-27 RAC-1080 a wait recorded from an older check」。
- **指纹**只算声明本身（`sha256(JSON.stringify(method))`），不再含平台表的条目。
- **产品客户端**（`connector-product-auth.ts`）：声明里的设置读部署配置 `<前缀>_<KEY>`；`login_ready` 由声明算（broker，或声明不要求 secret，或部署配了 secret）。原来给 intercom 的特例删了，intercom 照它的声明算。
- **Microsoft 的租户**改成 pattern `common|organizations|consumers|<GUID>`，区分大小写，比原来稍严。
- **没做的一条**：本节原写「SDK 加 `token:` 来源要有对应的 `keep`」。第 2 片复核以后 account 已不取 `token:`（§2.1.1），这条不再适用，不加。
- **Notion 的 label 兜底**：label 先取令牌响应经 `keep` 留下的 `c:workspace_name`，没有时取 identity 应答的 `i:/bot/workspace_name`（`plugins/official-integrations/catalog/src/oauth-methods.ts` 的 notion 一项）。经产品 broker 授权时令牌响应不带 workspace 名，这时 label 是 bot 应答里那个 workspace 的名字。这一取法是 Claude A 按 §2.1.1 自定的，没有另外的裁定（T-062 二审建议 2、3）。
- **有意的不同**：通用流程上的 GitHub 连接，读账号不再返回 `scopes`（解释器只算 account_id 和 label）。
- **S 号**：不另开。S-69 补了 `CONNECTOR_ACCOUNT_ORIGINS` 一句，S-101 改了指纹和发送的措辞。

### 2.3 客户端凭据还是平台的

- **四种来源，顺序不变**。插件只声明公开的数据，客户端还是今天这四种，按今天的顺序选：
  1. 重新授权沿用原来的客户端；
  2. 产品 broker；
  3. 产品客户端（环境变量）；
  4. 本人填的客户端。
- **产品客户端和 broker 只给宿主构建的声明**（M1(b)）：只有 `HOST_BUILD_TRUST` 装上的插件、它声明的方法，才用得上。别的插件声明了同一个 service_id，也拿不到产品 secret。
- **本人填的 client secret** 在第一次换令牌时钉住令牌端点的来源；之后令牌端点换了来源，这份 secret 不再发送，要本人重新填。
- **只给引用**：client id 和 secret 只以引用存在平台的密钥库里（S-12）。
- **插件拿不到的东西**（M6）：
  - 插件拿不到 OAuth 流程里的 code、PKCE verifier、client secret 和 refresh token。
  - 访问令牌今天在 Feed 同步时经 `resolveToken` 交给 catalog、github、gmail 的 provider（`apps/local-host/src/catalog-connector.ts:18-26`、`plugins/official-integrations/github/src/provider.ts:124-144`）。这是 PG-045、PG-093 已经登记的缺口，不属本线，本线不动它，也不声称插件拿不到访问令牌。
- **环境变量**：名字统一成 `CONNECTOR_<SVC>_OAUTH_CLIENT_ID/SECRET/<FIELD>`（Q5，用户 10-27 定）。
  - `MOLIS_WORK_GMAIL_CLIENT_*` 和 `GITHUB_CLIENT_ID` 改名，不留旧名；
  - `connector-directory.ts:53-55` 一起改，`github/src/oauth.ts:51` 随文件删掉；
  - 升级须知写进 CHANGELOG；
  - `productApiLoginReady` 里 intercom 的特例改成看声明里的 `client_secret`。

### 2.4 Gmail 和 Notion 并进通用流程

- **Gmail**：
  - 声明用通用的 Google 预设：`openid email` 加 `gmail.readonly`（第二轮建议 3；Q2 定了要重新授权，scope 变了也不多花代价）。
  - `identity` 发往 `{account}/v1/userinfo`（`openidconnect.googleapis.com`，第 4 片补进 `account_origins`），`sub` 当 account_id，`email` 当 label。
  - 重新授权要求 account_id 不变，这是通用规则，从按邮箱改成按 `sub`（Q6）。
  - 入门流程的返回由发起授权的入口写进待完成记录的 `return_to`（`settings` 或 `onboarding`），插件不写。
  - redirect 允许带项目路径段，这条规则留在平台的别名表里（§3.1）。
  - gmail 包删掉 `src/oauth.ts`、`src/oauth-configuration.ts`、`src/oauth-pending.ts`、`src/oauth-token-lifecycle.ts`、`src/oauth-types.ts`、`src/token-refs.ts`，不再拿宿主的密钥库。
- **Notion**：
  - 声明 basic、json、`owner=user`；`keep` 留 `workspace_id`、`workspace_name`；account_id 取令牌响应的 `/workspace_id`，label 取 `/workspace_name`，令牌响应没带时取 identity 应答的 `/bot/workspace_name`（第 4 片加，§2.2「第 4 片落地的写法」）；identity 发 `GET {service}/v1/users/me`，为检查连接时验证令牌（§2.2「检查连接和读账号」），也是 label 的兜底。
  - 重新授权要求 workspace 相同，正好就是 account_id 不变。
  - 删掉 `plugins/official-integrations/catalog/src/notion-oauth.ts` 和 `apps/local-host/src/notion-oauth.ts`。
- **待完成记录只剩通用的 protocol store**（43 位 state）。下面这些删掉：
  - `connector-oauth-targets.ts` 里的 `Service`、`STATE` 和 `connector:<svc>:oauth:connection-target:` 前缀；
  - `connector:gmail:oauth:pending`。

  `oauthRefreshGuard`、`oauthConnectionRefs` 并进通用刷新。`connectorAccountControl` 不动。

### 2.5 GitHub 设备授权成为平台的一种 grant

- **声明**：`grant: "device"`，带 `device_authorization_url`、`token_url`、`scopes`、`identity`（`{service}/user` 的 `id` 和 `login`）。
- **路由**：平台按 RFC 8628 实现一份，路由是通用的 `/api/settings/connectors/methods/device/start` 和 `…/device/poll`，替换 `github/device/*` 与 `github/client`。两条都是 S-03 的变更请求（Origin、控制令牌、一次性键）。
- **device_code 只存在平台的待完成记录里**，绑定和 §3.2 一样。poll 句柄就是这条记录的 43 位 state。
- **页面拿到什么**：页面只拿到 `user_code`、`verification_uri`（或 `verification_uri_complete`）和 poll 句柄。两个地址先查过再交给页面：https，不带账号密码和端口，来源和本方法的 `device_authorization_url` 或 `authorize_url` 相同。查不过，这次设备授权就终止。
- **每次 poll 和最后提交之前**，都重查 §3.3 的第 6、7、9 条：插件仍启用、安装代次和声明指纹没变、没有取消。任何一条不过就终止。
- **限速由平台做**：平台自己按响应里的 `interval` 限速，不只靠页面。间隔没到的 poll 直接回「稍后」，不向 GitHub 发请求；收到 `slow_down` 就把间隔加大。
- **终止时写什么**：过期、被拒、插件停用，都结束这条记录。允许写和禁止写的，和 §3.4 相同。
- **两种 grant 并列**：GitHub 的 web 授权码方法同时声明，设置页照今天列出来。

### 2.6 刷新与调用控制

- **`resolveApiConnection` 收成三支**：
  1. cli（飞书，例外）；
  2. OAuth：`auth_method: "oauth"`，并且凭据引用是 `connector-protocol:`；
  3. token：`auth_method: "token"`。
  - 按服务写的 Notion、Gmail 两支删掉。
  - **旧的 OAuth 连接**（M4）：`auth_method: "oauth"`，引用却不是 `connector-protocol:`（今天的 Gmail、Notion、GitHub 设备授权都是这样）。这种连接直接标 `reauth_required`，不发任何请求，也不落进 token 分支。按 Q2，读取时不认 OAuth 连接上旧的 `connector-connection:<id>:access` 引用；token 连接的 `connector-connection:<id>:token` 照旧。这种连接不能就地重连成原来那条，只能新增一条，怎样收尾见 §10 Q2「10-27 用户改定」。
- **签名不变**：`resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl)`，C 的调用方一处不改。
- **刷新之前，先核对连接绑定的声明**（M1(a)）：
  - 连接激活时，protocol 配置里记下 `plugin_id`、发布者，和端点指纹。端点指纹是令牌和刷新端点的地址、`client_auth`、`token_format` 规范化后的哈希。salesforce 这类 `{tenant}/路径` 的端点，指纹取模板本身，不取展开后的地址；展开后的租户来源仍由 `connection-store` 的 `assertTarget` 钉住。这样本人改一下 login 来源，不会被当成「换了主人」（第三轮建议 2）。
  - 刷新和发送前，现在声明这个 service_id 的插件要满足三条：
    - 是同一个 `plugin_id`；
    - 发布者相同；
    - 端点指纹相同。
  - 任何一条不同，就标 `reauth_required`，refresh token 和 client secret 一个字节都不发。
  - 这和 `connection-store` 的 `assertTarget`「首个落点」是同一个思路。
- **共用的刷新**：同一个连接同时只有一次刷新在途，等它的调用方是一个参与者集合。
  - 一个参与者取消，只把自己移出集合。
  - 刷新请求一旦发出，不因为参与者走光而中止，只受超时约束。原因是有的服务每次刷新都换一个新的 refresh token（Microsoft、Atlassian、X 等）：请求到了服务方，旧的 refresh token 就可能已经作废。
  - **最后一道检查**（N2(a)）：在 `beforeEffect()` 之后，提交之前，查这几条：
    - 声明它的插件仍启用；
    - 安装代次（`install_id`）和刷新开始时相同；
    - 端点指纹相同；
    - 授权没撤；
    - 连接仍在，revision 和读取时相同。
  - **结果怎样处理**：
    - **都过，还有参与者在等**：照常提交，把新令牌交给参与者。
    - **都过，参与者已经全部取消**（N2(b)，用户 10-27 定「只存新令牌」）：把轮换出的凭据（access token、新的 refresh token、过期时间）写回原来那条连接的引用，别的一概不写，包括调用记录里的业务内容、来源状态和同步游标。划界和 S-35 相同：这一步只保住调用之前已有的连接，算平台维护凭据，不算哪个调用方的业务记录。
    - **插件停用、撤权、卸载，或者安装变了**：轮换出的凭据一律不存（疑问 2，统筹 10-27 裁定，依据是 AGENTS「被取消、撤权、停用的调用不写业务记录」和 §3.4 的「凭据不许写」）。后果是服务方那边旧的 refresh token 已经作废。插件重新启用后第一次使用时，刷新会失败（`invalid_grant`），由那一次正常调用把连接标成 `reauth_required`。这是第二条新 S 的拒绝场景之一。
  - **要改 C 的写法**：C 在 `009b773f` 的写法是最后一个参与者离开就丢掉响应，和上面的「都过，参与者已经全部取消」不一致，本线第 5 片要改这一处。动手前先确认 C 合入之后 `apps/local-host/src/notion-oauth.ts` 的形状，再把这套搬到通用刷新上。
  - **C 的验收要反过来，在同一个 PR 里写明**（A3）：C 的 `tests/connector-oauth-choice.test.ts`「FI-C-02 Notion shared refresh … stops when both leave」断言了两件事：两个调用方都取消时请求的 signal 被中止；`store.get(access)` 为 null。按用户 10-27 的决定，这两条都反过来：请求不中止，新的 access token 写回原连接。第 5 片在同一个 PR 里改这个测试和 C 的 spec（`feed-inbox-runtime-plugins.md` 的 FI-C-02 行），两处都写明「用户 10-27 定：只存新令牌」，并告知 C 线，免得看起来是为变绿改了别的线的断言。
  - **和 AGENTS 硬约束的关系**（A3）：AGENTS 写的是「被取消、撤权、停用的调用不再写任何业务记录」。写回凭据是和 S-35 同一类的例外：S-35 恢复调用之前的位置，这里保住调用之前已有的连接。第 9 片在 `AGENTS.md` 里 S-35 那句旁边补上这一条（用户 2026-10-27 定），并在 `docs/system/SECURITY-INVARIANTS.md` 登记（新 S 第 2 条）。
- **声明它的插件没启用**（停用、卸载）时，OAuth 连接的刷新和发送都拒绝（Q3）：
  - 用一个新的错误码，主人名按 `tooling/gates/error-owners.json` 给这个文件的，用 `defineErrorCodes` 声明，名字实现时定。
  - 不发出任何请求，连接显示「方法不可用」，重新启用后恢复。
  - token 连接那一半见 §9 的 BL-794。
- **发送边界不变**：凭据只发往第一次绑定的来源（S-12），401 只刷新一次（S-70），`redirect: "error"`。

**第 5 片落地的写法**（2026-10-28，T-063）：

- **连接上的绑定**：通用流程激活时，protocol 配置里多一项 `binding: { plugin_id, publisher_id, endpoint }`，别的声明一概不存（`install_id`、方法指纹、`issuer` 仍只在待完成记录里）。`endpoint` 是 `oauthEndpointFingerprint`：`token_url`、`refresh_url`（没有写 `null`）、`client_auth`（默认 `post`）、`token_format`（默认 `form`）四项按这个顺序，模板照写、不展开，整体 sha256。`connector-api-oauth.ts` 的 `boundMethod` 每次取令牌都查（access token 没过期也查）、读账号也查：现在声明这个服务的插件不在就是下一条；在，但绑定缺了或三项有一项不同，抛 `refused` 的 `ApiOAuthError`，`resolveApiConnection` 照 S-70 记下拒绝标记，连接显示 `reauth_required`，一个请求都不发。本片之前建的通用流程连接没有绑定，同样标 `reauth_required`，就地重新授权后得到绑定，不写兼容读取（【王一骏裁定 T-063】第 2 题选 A，2026-10-28，#1332）。
- **声明它的插件没启用**（Q3）：`connector.oauth.method_unavailable`（`defineErrorCodes("connector.oauth", …)`，类别 `unavailable`），发生在任何请求之前，不记拒绝标记，重新启用（同一安装）就恢复。插件请求回 `connector.plugin_requests.connection_unavailable`；连接检查记下这个码；`connectors.account.read` 的消息是「方法不可用：…」。Alchemist 市场脉搏原来的 `catch` 就退回匿名，不用改（RAC-1088）。
- **共用刷新**：`apps/local-host/src/connector-shared-refresh.ts` 的 `startSharedRefresh`，通用流程（`resolveApiOAuthToken`）和 Notion（`notion-oauth.ts`，第 7 片随文件删）共用。取消是调用的 signal 因取消而中止：中止原因是类别 `cancelled` 或 `timeout` 的错误（动作网关在调用方断开时、调用自己的时限），或 `AbortError`、`TimeoutError`（`connector-shared-refresh.ts` 的 `cancelledBy`）。失去授权是 `current()` 或 `beforeEffect()` 抛错而 signal 没中止，也包括平台撤权时以别的原因中止 signal：插件实例停止（`actions.plugin_unavailable`）、调用的监视器看到授权已失（`createExecutionLifetime` 以检查的错误中止）、连接已改变（`invalidateConnectorRequests`）。这一条是 #1479 二审建议 3 查出的：只看 signal 中止与否，这些真撤权会被当成取消而写回（2026-10-29 改）。发出之前要至少一个参与者仍有效（发送检查用刷新自己的控制，`sendPublicHttps` 解析地址后、开连接前再查一次）；刷新请求自己的 signal 只有超时，参与者走光也不中止：通用流程是 `answer` 的 25 秒，Notion 的发送同样是 25 秒（#1479 二审必修 1：原来带的是共用刷新那个永不中止的 signal，只剩 undici 的默认时限，2026-10-29 改）。响应回来以后 `settle()` 逐个等参与者的 `beforeEffect()`，它自己不给结论；调用方在自己最后一次 `await` 之后、与写入同一段同步代码里问 `outcome()`，再核一遍参与者：还有有效的是 `deliver`；没有，且有一个失去授权，是 `discard`；全是取消，是 `write_back`（#1479 统筹裁定 T-063，Notion 也一样，2026-10-29 改）。刷新在途期间来的调用一律加入它（参与者都走了也加入），刷新结束才从表里拿掉；排在回调或上一次刷新后面、轮到之前就走了的调用什么都不发。
- **页面关掉、插件自己中止也是取消**（T-218，#1479 二审建议 1，王一骏 2026-10-29 定另开单）：第 5 片合入时，这两种真取消的中止原因不是取消，换到的令牌被丢掉，令牌会轮换的服务因此要重新授权。现在：
  - 插件页面关掉（不带收尾动作的 `finish`、收尾动作结束后的关闭）和页面请求结束（响应 `finish`/`close`），页面的请求以 `actions.cancelled` 中止（`plugin-page-authority.ts` 的 `left`）。
  - 进程内的插件用自己的 `request.signal` 中止请求，不论原因，平台都换成 `actions.cancelled`（`packages/plugin-runtime/src/connections-service.ts` 的 `ownSignal`，只用在 `createPluginConnectionsClient`）；平台给调用的 signal 原因照旧。
  - 沙箱集成没有自己的 signal（broker 不收插件给的 signal）：它的请求带的是 broker 这次调用的生命周期（`packages/plugin-sandbox/src/broker.ts` 的 `context.signal`），由平台中止，集成停用或卸载时是 `sandbox.stopped`。这是平台的原因，`createCallConnectionsClient` 原样交下去，不经 `ownSignal` 改写，共用刷新照旧 `discard`。另外 `apps/local-host/src/sandbox-integration.ts` 的 `live()` 在 `stop()` 一开始就失败（先置撤回标记），运行时撤回上下文后 `requireGrant` 也让它失败：运行时要等 `stop()` 返回才把状态存成停用，安装记录在这之前仍是运行中（T-218 二审 M1）。
  - 两者都只在中止那一刻调用仍有授权时算取消：页面的 activation 已撤回或 `assertCurrent` 不过、插件的 `requireGrant` 或调用的 `current()` 不过，就以那个错误中止，仍是撤权、`discard`。不然，一个已被撤权、平台还没来得及中止的插件，能借自己的中止把撤权变成取消（main 上插件用默认的 `AbortError` 中止本来就算取消）。
  - 撤权的中止点不变：页面 activation 撤回、过期、项目删除仍以 `actions.forbidden` 关页面。
  - 写入的三分法因此不变：还有有效的参与者是 `deliver`；没有，但有一个失去授权，是 `discard`（有的取消、有的失去授权也是）；全是取消，是 `write_back`。
  - 测试：`tests/security-invariants-oauth-shared-refresh.test.ts` 的 RAC-2458～2462；真实沙箱 broker 停止时什么都不写是 `tests/security-invariants-call-connections.test.ts` 的 RAC-2463（只在 darwin 上跑）；`live()` 撤回是 `tests/sandbox-integration.test.ts` 的 RAC-2464（只在 darwin 上跑）。
- **最后一道检查与写入**：`settle()` 之后，通用流程再读一次登记：同一个 `install_id`、绑定仍相符；连接仍在、revision 和读取时相同。`discard` 或任何一条不过，什么都不写，调用方得到错误。`deliver` 写三个凭据引用和 protocol 配置里轮换出的 context；`write_back` 只写 access、refresh、expires 三个引用（Notion 只有 access、refresh），protocol 配置、连接、拒绝标记一个字节不动。
- **签名**：`resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl, owners, network)`，前五个和 C 相同；`network`（测试替换地址解析用）原来由 `connector-access.ts` 用第一个调用方的控制包成 `fetch` 传进来，现在传原样，由刷新用自己的控制组装发送函数，不然发送检查只看第一个调用方。
- **问题 1（取消和失去授权怎样分）**：【王一骏裁定 T-063 · 更正】（2026-10-28，#1332，取代先前那条的第 1 题）选 A：取消也只存新令牌（10-27）；失去授权的整次 `discard`，换到的令牌不存。裁定的说法是「signal 中止算取消，`current()` 失败而 signal 没中止算失去授权」；#1479 二审查出平台撤权有时也中止 signal，所以落地时取消只认因取消而中止的（见上一条），平台以别的原因中止的仍算失去授权，与裁定「撤权就不存」的本意一致。所以 C 的 Notion 两条、S-95 S-97 沙箱 broker 那条都按「取消也只存新令牌」反过来，`docs/system/SECURITY-INVARIANTS.md` 的 S-95 行同步写明并改测试名；「撤权时不写回」由 `tests/security-invariants-oauth-shared-refresh.test.ts` 的 RAC-1085 那条钉住。
- **挪到第 6～8 片的**（Gmail 的一半第 6 片已做，见下面「第 6 片落地的写法」；Notion 的一半第 7 片已做，见「第 7 片落地的写法」；GitHub 的随第 8 片）：`resolveApiConnection` 收成三支、旧形状 OAuth 连接一律 `reauth_required`、设置页的「请新增连接」提示和 RAC-1089。第 6～8 片之前，Gmail、Notion、GitHub 设备授权的专门流程还在，新建的连接仍是旧形状；本片就标旧形状，从本片合入到第 8 片合入之间，这三个服务连新增的连接都用不了。挪过去以后每片合入时 main 都能用，最后的样子和设计相同，也不加只给旧连接走的分支。Gmail 的刷新在第 6 片并进通用流程之前保持原样（取消的 Gmail 刷新不写回，`tests/connector-call-control.test.ts`）。
- **测试**：`tests/security-invariants-oauth-shared-refresh.test.ts`（进 `test:security`；RAC-1085 共用、取消、只存新令牌、失去授权、插件停用或换成别的插件；RAC-1087 绑定不符或没有；RAC-1088 插件停用）、`tests/connector-api-oauth.test.ts`（S-97 那条反过来；Alchemist 的 RAC-1088）、`tests/connector-oauth-choice.test.ts`（C 的 FI-C-02 两条反过来，加一条「走光后新来的调用加入在途的刷新」）、`tests/security-invariants-connector-oauth-callback.test.ts`（保存的配置只钉 `binding`）、`tests/security-invariants-call-connections.test.ts`（沙箱 broker 那条：取消后请求不中止、只存新令牌）、`tests/security-invariants-connection-services.test.ts`（S-69 两条手造的通用流程连接补上绑定，与授权留下的一样）。轮换 refresh token 的情形由 asana 的替身演（每次刷新换一个新的），Microsoft 和 Gmail 的那一条随第 6 片。

**第 6 片落地的写法**（2026-10-29，T-064，分支 `task/T064-ca`）

- **Gmail 走通用流程**：删 `gmail-oauth.ts`、gmail 包的 `oauth*.ts` 与 `token-refs.ts`、`gmail/client`、`gmail/oauth/start` 两个路由、`connector-oauth-callbacks.ts` 的 Gmail 一支、`connector-oauth-targets.ts` 里 Gmail 的待完成目标；设置页和入门流程都调 `methods/oauth/start`。包里不再有密钥库端口（RAC-2482）。
- **回调别名**：新 `connector-oauth-callback-paths.ts` 是平台的别名表，现在只有 Gmail 的 `/api/feed/connectors/gmail/oauth/callback`（可带一段 `/projects/<段>`）；通用处理器 `web-connector-api-methods.ts` 同时认它。不给回调地址的发起，默认用该服务的别名（Gmail 就是它在 Google 控制台登记过的那条），所以 `ConnectorMethodOption.oauth` 多一个可选的 `callback_path`，设置页照着显示要登记的地址；别名只在 `redirect_uri` 正好等于记录里存的那一条时才收（规则 3 不变），发起时也只收本服务自己的别名（RAC-2481）。
- **入门流程的返回**：新 `connector-oauth-return.ts`。发起的入口（`oauth/start` 带 `onboarding_id`、`desktop`）把 `returnTo` 写进待完成记录（宿主私有，不进合同，激活时不存）；`beginOAuthReturn` 让 journey 等这个 state，回调在规则 4 之前 `assertOAuthReturnPending`（被更新的发起顶掉就拒），成功、取消、失败各自 `finishOAuthReturn`（只在 journey 仍等这个 state 时才写），页面跳转由 `oauthReturnLocation` 给。插件不写返回（RAC-2477）。
- **旧形状**：`connector-oauth-shape.ts` 的 `replacedOAuthShape`——`auth_method: "oauth"`、凭据不是 `connector-protocol:`、服务不在 `OWN_FLOW`（Notion 第 7 片已删，只剩 GitHub，第 8 片删空后就是 §2.6 最终的规则，不加只给旧连接走的分支）。`resolveApiConnection` 对它不发请求，`if_available` 回 `null`，其余抛“请新增一条连接，并把原来绑在它上面的来源重新绑定到新连接”，不落进 token 分支；列表状态（`shownState`）直接是 `reauth_required`，视图多一个 `reauth_note`，设置页照着显示。Gmail 供应商读取（`gmail-connector.ts`）不再读 `connector-connection:<id>:access` 的旧令牌。`resolveApiConnection` 里只剩 cli、OAuth（通用）、Notion（第 7 片删）、token 几支（RAC-2479）。
- **重新授权旧连接**：`startApiOAuth` 对没有通用配置的连接（旧形状）不再要求填 Client ID，按新连接同样的方式取 broker 或产品客户端；回调规则 8 比不到原账号，得到“请新增一条连接，并把原来绑在这条连接上的来源重新绑定到新连接”，只写 §3.4 左边一列（RAC-2480）。
- **共用刷新**：`SharedRefresh` 多一个 `open`，`outcome()` 得出 `discard` 之后为 `false`；`resolveApiOAuthToken`（和 Notion）只加入 `open` 的刷新，之后来的有效调用在连接的队列里另排一次（#1479 二审建议 1，RAC-2483）。
- **环境变量**：Gmail 的产品客户端只认 `MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_ID/SECRET`（`connector-product-auth.ts` 读 `CONNECTOR_<SVC>_OAUTH_*`，`readProductEnv` 加 `MOLIS_WORK_` 前缀），旧名 `MOLIS_WORK_GMAIL_CLIENT_*`、设置页存的 `connector:gmail:client_*`、`MOLIS_WORK_PUBLIC_BASE_URL` 的 Gmail 回调都不读；卡片和入门流程的“可连接”由声明算（`connectorLoginReady`），`gmail_oauth_configured` 字段删除（RAC-2485、RAC-2486）。
- **测试**：`tests/gmail-oauth.test.ts` 重写成通用流程上的 Gmail（RAC-2476、2477、2478、2481、2484、2485/2486，S-09 的“Gmail's return address must be a loopback host”改在通用发起上断言同一件事）、`tests/security-invariants-oauth-non-protocol.test.ts`（RAC-2479、2480、2482）、`tests/security-invariants-oauth-shared-refresh.test.ts` 加 RAC-2483；`tests/gmail-factory-boundaries.test.ts` 只剩 provider 的两条（RAC-127/128），OAuth 实例的三条随代码删；`context-onboarding`、`connector-connections`、`connector-setup`、`connector-call-control`、`security-invariants-connector-*` 里按 Gmail 专门流程写的断言改成通用流程。

**第 7 片落地的写法**（2026-10-30，T-065，分支 `task/T065-ca`，方案经统筹核准：issue #1332 评论 6539926249、6539939254）

- **Notion 走通用流程**：删两份 `notion-oauth.ts`（宿主、catalog 包）、`connector-oauth-callbacks.ts`、`connector-oauth-commit.ts`、`notion/oauth/start` 路由、`connector-oauth-targets.ts` 里 Notion 的待完成目标、`connector-access.ts` 的 Notion 一支、catalog 的 `notionAuthorizationUrl` 等导出和 provider 里“Notion 的 401 重试”特判。声明早已在 `oauth-methods.ts`（`client_auth: "basic"`、`token_format: "json"`、`parameters: { owner: "user" }`、工作区做账号）。
- **回调别名带主机**：别名表 `connector-oauth-callback-paths.ts` 每项多一个可选的 `host`；Notion 的是 `localhost`（Notion 不收数字 IP 的回调）。`oauthCallbackOrigin(服务, 来源)` 把本机来源的主机名换成别名的主机名，保留协议和端口；默认回调、`isOAuthCallbackAliasFor` 都用它。回调规则 2 因此变成：来源等于记录来源，或等于该服务别名主机换算后的来源（别名主机只能是 `localhost`，类型就是 `"localhost"`；发起的来源是 Host 本来就接受的回环地址 `127.0.0.1` 或 `[::1]`，同端口同协议，用 contracts 的 `isLoopbackHttpOrigin` 判）；没有声明 `host` 的服务没有这条放宽，非本机 Host、另一个端口、`127.0.0.2`、`[::ffff:127.0.0.1]` 照旧拒绝（RAC-2534）。`ConnectorMethodOption.oauth` 多一个可选的 `callback_host`，设置页照着显示要登记的地址。
- **旧形状**：`OWN_FLOW` 只剩 `github`；凭据不是 `connector-protocol:` 的 Notion OAuth 连接标 `reauth_required`，不读、不刷新、不发请求（RAC-2536）；PAT 连接不受影响。
- **环境变量**：Notion 的产品客户端只认 `MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_ID/SECRET`，旧名 `MOLIS_WORK_NOTION_CLIENT_*`、设置页存的 `connector:notion:client_*` 不读；`notion_oauth_configured` 字段删除（RAC-2537）。
- **共用刷新**：Notion 的刷新就是通用的 `resolveApiOAuthToken`；`complete` 的最后一道检查多比一项：发出的 refresh token 仍是库里的那个（原 Notion 流程有这一项，通用流程没有），变了就写不进去（RAC-2538）。
- **留给后面的**：`ConnectorAuthKind` 里的按服务取值（`github`、`gmail`、`notion`）随第 8 片收窄；Feed 的 `source-service.ts:144` 里 gmail 的 `token_refs` 不在本片也不在第 8 片，留给 Feed 线，单列在交接里。
- **测试**：新 `tests/notion-oauth.test.ts`（RAC-2533～2539，其中 RAC-2538 是原 `connector-oauth-choice.test.ts` “FI-C-02 … Notion” 一组搬过来，断言不放宽）；`connector-oauth-choice`、`security-invariants-oauth-shared-refresh`、`connector-connections`、`connector-setup`、`security-invariants-connector-intent`、`connector-method-directory`、`security-invariants-oauth-non-protocol` 里的 Notion 专门流程用例改成通用流程上的同一组。

**第 8 片落地的写法**（2026-10-31，T-066，分支 `task/T066-ca`，叠在第 7 片（#1669）上，方案经统筹核准：issue #1332 评论 6540397434；S 号暂定 S-104）

- **设备授权是平台的 grant**：新 `connector-device-oauth.ts`：`startDeviceOAuth`、`pollDeviceOAuth`、`registerConnectorDevicePolling`。路由是通用的 `methods/device/start`、`methods/device/poll`；GitHub 的 `github/device/*`、`github/client` 路由与 `github-oauth.ts`、`connector-github-device.ts`、github 包的 `oauth.ts` 删除。`device_code` 存在记录的 `device` 秘密里（`clear()` 一并清掉），页面拿到 `user_code`、验证地址和 state。
- **提交只有一份**：回调的收尾抽成 `commitApiOAuth`（令牌检查、账号、第 9、8 条、凭据、本人意图确认、返回页），回调与设备授权共用；回调的用例一条没放宽。
- **每条记录各自限速**：`nextPollAt`、`interval` 在 `DeviceConfiguration` 里；间隔没到回 `pending` 不发请求；一次 poll 不论成败都把下一次推后一个间隔；`slow_down` 只加这一条记录的间隔（+5 秒，上限 60 秒）。
- **验证地址按 origin 全等**：`verificationAddress` 用解析后的 `URL.origin` 与设备授权请求地址的 origin 比；https、不带账号密码、端口、片段；`verification_uri_complete` 同样判。`user_code` 只收字母数字空格连字符。
- **按 grant 取方法**：`oauthOwner(服务, grant)` 取对应的 `oauth` 方法；`OAuthConfiguration.grant` 存在记录里，之后的刷新与绑定检查用同一个方法。SDK 的重复检查改为 `oauth` 按 grant 各一个（GitHub 同时声明 `authorization_code` 与 `device`）。
- **`OWN_FLOW` 删光，`ConnectorAuthKind` 收窄**为 `oauth | feishu | token | none`；GitHub、Gmail、Notion 的 Manifest 都写 `auth_kind: "oauth"`。旧形状（`auth_method: "oauth"` 而凭据不是 `connector-protocol:`）对所有服务一律 `reauth_required`，不再有按服务的例外。
- **环境变量与设置页**：产品客户端只认 `MOLIS_WORK_CONNECTOR_GITHUB_OAUTH_CLIENT_ID`；`github_client_id_configured` 与 `connector:github:client_id` 不再读。设置页的主按钮在 `oauth.device.login_ready` 时走设备授权，自带应用仍走网页授权码。
- **没碰的**：Feed 的 `source-service.ts:144` 里 gmail 的 `token_refs` 留给 Feed 线，单列在交接里。
- **测试**：新 `tests/github-oauth.test.ts`（RAC-2540～2549）；`connector-setup`、`security-invariants-connector-intent`、`security-invariants-connector-scope` 里的 GitHub 设备授权用例改走通用路由与 `oauthNetwork`；`connector-method-directory`、`connector-oauth-choice`、`connectors-settings-behaviors`、`plugin-global-settings` 的 `auth_kind` 与按钮断言随之更新；`tests/github-device-flow.test.ts` 删除（内容并入上面几份）。

### 2.7 `auth_kind` 收窄

`ConnectorAuthKind` 去掉 `github`、`gmail`、`notion`，留下 `feishu`（CLI 例外）、`token`、`none`，再加 `oauth`。下面这些地方原来按服务分支，改成按方法种类：

- `settings-view.ts`；
- `connector-directory.ts`；
- `platform-connection-services.ts`；
- catalog 的 `catalogIntegrationManifest`；
- gmail 和 github 的 `manifest.json`。

### 2.8 T1 之前，只有宿主构建的插件能写带数据的 oauth（M1(c)）

- **拒绝**：签名沙箱包（`attach()`、安装预览）的 Manifest 里，只要有带数据的 `kind: "oauth"` 方法，集成登记就拒绝，抛 `plugin.declaration_invalid`，在写任何记录之前。
  - 写法照 `integration-registry.ts:139-141` 拒宿主构建写 `origins` 的那段，方向反过来。
  - 配一个拒绝测试（RAC-1081）。
- **为什么**：服务换主人时，产品客户端、本人的 secret 和 refresh token 会被引走。§2.3 和 §2.6 已经各挡了一道，这里在入口再挡一道。
- **以后怎样放开**：将来向外部包放开，要等 T1 的主人定出按签名区分的安装信任，并且外部包的声明必须写 `issuer`（RFC 9207，见 §3.3 第 5 条）。这两件记成 BL-792，本线不做。
- **要在 privileges 里登记**：这是「按签名区分的安装信任」的一条，在 PG-045 的说明里加一句。

### 2.9 broker Worker 留自己的一份数据（M3）

- **怎样拆**：`apps/local-host/cloudflare/worker.ts` 改 import 自己目录里的 `cloudflare/providers.ts`。这份文件是今天 `API_OAUTH_PROVIDERS` 和 `apiOAuthProvider` 的原样拷贝，只给 Worker 用，宿主源码不许 import 它（门禁或测试扫描）。照 loopback 的做法，Worker 单独留一份。
- **不用重新部署**：Worker 的行为一个字节都不变，所以不需要重新部署。Gmail 走 broker 时 Worker 用的还是 `google()`，本来就带 `openid email`。
- **由测试钉住**：`tests/connector-oauth-broker.test.ts` 加一条对照测试（A1；第 4 片落地时放在 `tests/connector-provider-contracts.test.ts`「A1」，那个文件本来就读 Worker 那份和解释器，放进 broker 用例会让它引用包内部的计数变大）：
  - 对照的是 `cloudflare/providers.ts` 里的**每一项**，不只是已经配置成 broker 的那些。Worker 那份展开出来的授权地址、令牌地址、scope、`client_auth`、`token_format`，都要和 Manifest 声明展开的相同。
  - `providers.ts` 里有、Manifest 里没有的服务，同样算失败；反过来，Manifest 里有、`providers.ts` 里没有的，只是不能走 broker，不算失败。
  - 哪天两边不同，测试就红，不能合入。要改 Worker 那份，就是重新部署，先报统筹转用户，因为这是发布红线。
- **一致性只靠这条测试**（A1）：宿主源码不 import `providers.ts`，Worker 的 `/providers` 也只返回已配置的服务名（`worker.ts:86-88`），不返回端点，所以宿主运行时没法知道两边对不对得上，也不在运行时比。某个服务暂时不能走 broker，就从 `MOLIS_WORK_CONNECTOR_BROKER_SERVICES` 里拿掉，退回产品客户端或本人填的客户端。
- **测试管不到已部署的版本**：测试保证的是仓库里的 Worker 代码；已部署的是哪一版，以部署记录为准。`cloudflare/README.md` 写着 9 月 27 日的修复还没部署。
- **broker 流程里，声明指纹由宿主核**：
  - 发起时，待完成记录照样记下声明指纹；
  - 回调回到宿主时，照 §3.3 第 7 条核对。
  - Worker 用自己那份数据换令牌，和声明是否一致只靠上面的测试保证。这一点写进 §3.3。
- **第 4 片一起改的文字**（第三轮建议 1）：`cloudflare/README.md` 第一句「reuses the Host's provider definitions」改成「用自己目录里的 `providers.ts`，由对照测试钉住」；`tests/connector-oauth-broker.test.ts` 里「imports nothing from the workspace」那句注释一起改准。
- **合入不是发版**（M3，评审第三轮核过）：broker 是 `molis-oauth`（`auth.molis.ai`），手动 `wrangler deploy` 部署；`Workers Builds: molis-work-production` 是另一个账号的另一个 Worker。第 4 片的 PR 说明写上这一节；第一次合入前，请用户在 Cloudflare 后台确认一次 `molis-work-production` 的构建没有指向 `apps/local-host/cloudflare`，由统筹提醒。

## 3. 通用回调：路由、绑定、判断顺序与拒绝

### 3.1 路径

| 路径 | 今天谁用 | 以后 |
| --- | --- | --- |
| `/api/settings/connectors/methods/oauth/callback` | 通用引擎，broker 回到同一路径 | 平台的通用回调 |
| `/api/settings/connectors/notion/oauth/callback` | Notion | 平台的别名，主人是平台（R1） |
| `/api/feed/connectors/gmail/oauth/callback`（可带一段项目路径） | Gmail | 平台的别名，主人是平台（R1） |
| `/api/settings/connectors/methods/mcp/callback` | MCP 的授权 | 第二批再看（BL-790），本批不动 |

- 三条路径进同一个处理器，**按 state 找到待完成记录，不按路径找插件**。
- 别名只在一种情况下收：这条路径（含项目段）正好等于该记录里存的 `redirect_uri`。
- 留别名的原因是，已经在 Google、Notion 控制台登记的 redirect URI 不用改（R1）。

### 3.2 state 绑了什么

- **state**：protocol store 生成的 32 字节、43 位 base64url（`/^[A-Za-z0-9_-]{43}$/`，建议 1），只能用一次，TTL 10 分钟。
- **待完成记录**存在平台的 protocol store，记下：
  - 发起时的本机来源和 `redirect_uri`；
  - 插件：`plugin_id`、`install_id`（由 `plugin_id` 和发布者签名算出，同一个包重新启用不变；沙箱包沿用原安装，建议 10）、发布者；
  - `service_id`，以及本方法的声明指纹：整个方法声明规范化后的哈希，端点指纹（§2.6）也在里面；
  - 连接目标：新建，或者重新授权某个连接及其 revision；
  - 设置提交的核对结果（`checkConnectorSetupSubmission`）和 `return_to`；
  - PKCE verifier、客户端来源（product、broker 或 custom）、展开后的 settings、声明的 `issuer`。
- **发起**（`…/oauth/start`）是 S-03 的变更请求：Origin、控制令牌、一次性键。
- **回调**是浏览器跳回来的 GET，没有 S-03 那三样，靠 Host 回环和 state。

### 3.3 判断顺序（N1）

1. **先查 Host**，这一步不碰 store：Host 必须是本机回环地址（S-09 的同一份 `isLoopbackHostname`），并且等于某个可能的来源。不过就直接回错误页，state 不动。原因是从外面伪造来的请求不该能烧掉别人的 state。
2. **原子 consume**：先删后用，拿到记录。state 格式不对、不存在、已经用过（重放）、过期，都在这一步拒绝。**从这里开始，任何失败都结束这条记录**：状态记成 failed 或 cancelled，同一个 state 不能再用。
3. **网络请求之前判断，测试断言「没有发出任何请求」**：
   - 第 1 条：state 格式、存在、重放、过期（第 2 步）；
   - 第 2 条：Host 和记录里的来源不同；
   - 第 3 条：回调路径（含项目段）不等于记录里的 `redirect_uri`；
   - 第 4 条：查询里有 `error`，或者缺 code。带 `error` 的回调同样要 consume；
   - 第 5 条：记录里有 `issuer`，回调却没带 `iss`，或者带的不同（RFC 9207，建议 2）；
   - 第 6 条：声明它的插件现在没启用，或者 `install_id`、发布者变了（停用、卸载、升级、撤权）；
   - 第 7 条：本方法现在的声明指纹和记录里的不同，也就是发起之后 Manifest 改了。broker 流程同样核这一条；Worker 那份数据和声明是否一致，由 §2.9 的测试保证。
4. **令牌请求之后判断，测试断言「没有生效」，不断言「没有发出请求」**：
   - 第 8 条：重新授权时连接的 revision 变了，或者换回来的 account_id 不是原来的账号；
   - 第 9 条：等网络期间被取消或撤权（`assertConnectorAuthorizationPending` 前后两次检查，加 `ConnectorCallControl.beforeEffect()`），或者第 6、7 条在网络等待之后不再成立。
   - 第 8、9 条换到的令牌**不暂存、不提交，直接丢掉**。服务方有撤销端点的，平台尽力撤销一次，失败不影响拒绝；这一点写成建议，不进验收。
5. **都过，就提交**：令牌请求经 §2.2 的同一条发送路径。提交只经 `submitConnectorActivation`：凭据先暂存，最后一次检查之后才生效（`connector-oauth-commit.ts`）。

### 3.4 拒绝时允许写什么、禁止写什么（M7）

| 允许写 | 禁止写 |
| --- | --- |
| consume 掉待完成记录（含带 `error` 的回调） | 连接记录：新建、改 revision、改账号 |
| 授权会话的状态改成 failed 或 cancelled（`finishConnectorAuthorization`），带错误码，不带输入内容 | 凭据：access、refresh、过期时间、client secret，含暂存区里新写的 |
| 清掉这次暂存的 secret | protocol 配置（连接激活后的那份） |
| 宿主日志里一行诊断（S-12 的规则照旧） | 来源绑定、`connector_connection_targets` |

拒绝测试就照这张表断言：左边可以有变化，右边必须一个字节不变。§2.6 的「插件停用后轮换出的 refresh token 不存」也按右边这一列断言。

### 3.5 安全不变量

| 编号 | 内容 | 断言拒绝的测试 | 前提 |
| --- | --- | --- | --- |
| 新 S 第 1 条（待统筹核） | 连接器 OAuth 的声明来自宿主构建的插件；外部包带数据的 oauth 在写任何记录之前拒绝；声明检查不过，整份 Manifest 不过；模板展开后再查一次地址；租户来源只在平台表的 `tenant.domain` 下；带访问令牌的请求（identity、context）只发往平台表定的来源；连接钉住激活时的插件、发布者和端点指纹，换了主人就 `reauth_required`，refresh token 和 client secret 不发 | RAC-1081、RAC-1082、RAC-1087 | M5（已定整份不过） |
| 新 S 第 2 条（待统筹核） | 通用回调按 §3.3 的顺序判断：Host 先于 store；consume 之后任何失败都结束记录；第 1～7 条不发请求；第 8、9 条换到的令牌不生效；拒绝只写 §3.4 左边一列。刷新的最后一道检查同样只写左边：插件停用、撤权、卸载、安装变了，轮换出的凭据不存，下一次使用时得到 `invalid_grant` 并标 `reauth_required` | RAC-1083、RAC-1084、RAC-1085 | M7、N1 |
| 新 S 第 3 条（待统筹核） | 设备授权：device_code 只在平台里；start 和 poll 是 S-03 的变更请求；`verification_uri` 先查再交给页面；每次 poll 和提交前重查第 6、7、9 条；平台自己限速；过期、被拒、插件停用都终止，只写 §3.4 左边一列 | RAC-1086 | M7、建议 1 |
| S-37（改证据列） | OAuth 的取消、过时的回调、固定的 revision：Gmail 和 Notion 原来的用例改成通用回调上的同一组 | RAC-1084、RAC-1085 | |
| S-12（改证据列和措辞） | 插件拿不到 OAuth 流程里的 code、verifier、client secret 和 refresh token；访问令牌交给同步 provider 的缺口归 PG-045、PG-093，不写成「插件拿不到令牌」 | RAC-1087 | M6 |
| S-69（补两句） | Manifest 写的 OAuth 端点不是请求来源：它们不收访问令牌；带访问令牌的 identity、context 只发往平台表的 `origins`、租户来源、网关和新加的 `account_origins`。`account_origins` 只给平台的 identity 和 context 请求用；插件经 `services.connections` 的请求只认 `origins` 和钉住的租户来源（A2） | RAC-1082 | M2、A2 |
| S-09、S-10、S-70 | 不变，只改证据列里的文件名 | 现有用例 | |

## 4. 第一批迁哪些，不迁哪些

### 4.1 第一批

- **catalog 生成的 API OAuth 服务**：就是今天 `API_OAUTH_PROVIDERS` 里除 gmail、github 以外的全部条目。数据从宿主移进 catalog 包，由 `catalogIntegrationManifest` 写进各自的 Manifest：
  - Google 系：google-calendar、google-drive；
  - Microsoft 系：outlook、onedrive、sharepoint、teams；
  - 其余：dropbox、box、notion、slack、discord、feishu 的 OAuth、lark 的 OAuth、zoom、gitlab、bitbucket、vercel、cloudflare、huggingface、sentry、supabase、linear、jira、confluence、asana、clickup、monday、airtable、figma、canva、adobe、salesforce、hubspot、intercom、stripe、x、linkedin。
- **自己有 `manifest.json` 的两个**：gmail 和 github，数据直接写在那里（建议 7：gmail 不在 catalog 里）。
  - Gmail 专门流程并进通用流程（§2.4）；
  - Notion 专门流程并进通用流程（§2.4）；
  - GitHub 设备授权成为平台的 device grant（§2.5），web 授权码方法同时声明。
- **删除名单**（建议 7 补全）：
  - 宿主：`apps/local-host/src/connector-api-oauth-providers.ts`、`apps/local-host/src/gmail-oauth.ts`、`apps/local-host/src/github-oauth.ts`、`apps/local-host/src/connector-github-device.ts`、`apps/local-host/src/notion-oauth.ts`；
  - 插件：`plugins/official-integrations/catalog/src/notion-oauth.ts`、`plugins/official-integrations/github/src/oauth.ts`，以及 gmail 包 §2.4 列的六个文件；
  - 路由：`web-connectors-settings.ts` 里的 `notion/oauth/start`、`github/*`、`gmail/*`；
  - `connector-oauth-callbacks.ts` 并进通用回调；
  - Worker 那份数据挪到 `apps/local-host/cloudflare/providers.ts`（§2.9）。

### 4.2 第二批（BL-790）

- `MCP_SERVERS` 里约 40 项远程 MCP 的数据（endpoint、auth、registration、endpointPattern、tokenScheme），写成 `kind: "mcp"` 的声明，`connector-mcp.ts` 的表删掉。
- 不含标了 `stdio:true` 的飞书和 lark，也不含 figma 的本机 `127.0.0.1:3845`。

### 4.3 不在第一批，原因

- **飞书 CLI（`CONNECTOR_CLIS`）、飞书和 Lark 的 stdio MCP、figma 的本机 MCP**：这些不是网络授权，是在本机起一个进程或连本机地址。
  - 密钥在 CLI 自己的状态里（受管 CLI 的私有状态，S-12）；
  - 安装和启动 CLI 是 S-37 和受管二进制的边界；
  - 本机地址也过不了公网的地址检查。
  - 要迁，得先有一份平台服务管「本地进程连接」（BL-791）。在那之前继续用 CALL-CHAINS §10.1 的例外（R2）。
- **Alchemist 的 GitHub 脉冲**：见 §5。

## 5. Alchemist 例外

- **今天怎样用 OAuth**：`apps/local-host/src/alchemist-pulse-github.ts` 以 `SCOPE="home"`、`CONSUMER="alchemist"`、`SLOT="pulse-github"`，经 `store.binding` 绑定一个 GitHub 连接，token 或 OAuth 都收（`:21,33`）。
  - `boundToken` 调 `resolveApiConnection(home, id, connectorAccountControl(...), "github")`，C 只给它加了 control 参数。
  - 只给 `https://api.github.com` 加 Bearer，出错就退回匿名，并记一行宿主日志。
  - 它不发起授权，也没有自己的回调，只是宿主里一个 Home 级的消费者直接取令牌。
- **这一轮**：代码不改（R3）。出处是 2026-10-23「本轮不删」：PG-092 `privileges.md:288`、BL-376 `specs/BACKLOG.md:162`。10-21 那份「防腐收尾后删掉重做」的计划不执行（N3）。不删 Alchemist，也不删创作台。
- **§2.6 之后会怎样**：
  - 绑的是 **OAuth 连接**：取令牌走通用刷新。GitHub 集成插件没启用时被拒，沿用它现在的退回匿名（RAC-1088 只管这一半）。
  - 绑的是 **token 连接**：插件停用后照样发往 `api.github.com`。今天就是这样，不算放宽；拒绝 token 连接是 BL-794，不在本线。
- **例外到什么时候**：Alchemist 重做、进 Plugin Runtime，并经 `services.connections` 的槽（S-57）拿连接为止。到那天删掉这一行例外，以及 `resolveApiConnection` 里还收的 `service` 参数。
- **措辞要改的地方**（第 9 片做）：
  - **`privileges.md` PG-045 第 218 行**：句尾改成「OAuth 的数据与流程已由 W5-11 移进集成插件的声明；T1 之前只有宿主构建的插件能写带数据的 oauth（按签名区分的安装信任，W5-11 §2.8）；Alchemist 的 GitHub 脉冲仍由宿主绑定、直接取令牌，不迁、本轮不删（2026-10-23，PG-092、BL-376），等它重做进 Plugin Runtime、经 `services.connections` 拿连接时删掉」。行尾那句 10-21 的旧说法一起换掉。
  - **PG-092 第 288 行**：加同样的一句，出处写 10-23。
  - **`privileges.md` 第 327 行**：「Alchemist 10-21 定不迁，防腐收尾后删除」改成 10-23 的现行说法。
  - **`docs/system/CALL-CHAINS.md` §10.1 第 278 行**：「按服务的 OAuth（Gmail、GitHub、Notion、飞书）」只剩两行，各写删除条件：
    - 飞书 CLI 与本机 MCP（R2、BL-791）；
    - Alchemist 脉冲（R3）。
  - **`docs/system/EXTENSION-POINTS.md` F3**：F3 数的是「新增一个 OAuth 服务要改几处」，现在是 12，目标是 1（只改 Manifest）。本线做完后改成 1（建议 6），不涉及 Alchemist。

## 6. 合同变更、读取兼容与快照

### 6.1 合同

按 `docs/system/CONTRACT-CHANGES.md` 第一阶段办：没有兼容期，所有消费者在同一个 PR 里一起改。

- **合同的改动**：
  - `packages/contracts/src/platform/plugin-integrations.ts`：oauth 一员加 §2.1 的字段，加 `grant: "device"`。
  - `packages/contracts/src/services/connector-host.ts`（C 改过这个文件，所以都在依赖 C 合入的片里）：
    - 新加单独的一张表 `CONNECTOR_ACCOUNT_ORIGINS`（§2.1，A2、A4），第 4 片；`ConnectorRequestService` 和 `CONNECTOR_REQUEST_SERVICES` 不改；
    - `ConnectorAuthKind` 收窄（§2.7），第 8 片。
  - SDK `integration-declarations.ts`：`methodProblems` 从「只写 kind」改成按 §2.1 检查形状，`AUTH_KINDS` 跟着合同改。第 1 片做除 `{account}` 以外的检查，`{account}` 那条随第 4 片加。SDK 算共享核心，第 1 片和第 4 片都要跑全量（§7）。
- **读取不兜底**：
  - 旧形状的 Manifest（只有 `{kind:"oauth"}`）在第 4 片之后不会出现：内置插件在第 4 片的 PR 里一起改，第 1 片到第 4 片之间 SDK 照收这种写法（§2.1「第 1 片落地的写法」）；外部包带数据的 oauth 被 §2.8 拒绝。外部包只写 `{kind:"oauth"}` 而不带数据的，同样是声明错误，整份不过。
  - 存量连接：`auth_method: "oauth"` 却没有 `connector-protocol:` 引用的，直接 `reauth_required`（§2.6、Q2）。token 连接不受影响。
- **新错误码**：都用 `defineErrorCodes` 声明，不新写 Error 子类。
- **升级须知**：`docs/releases/CHANGELOG.md` 的 `[Unreleased]`「升级须知」写两条：
  - Gmail、Notion、GitHub 设备授权的连接要重新新增，原来绑在这些连接上的 Feed 来源由本人在来源详情里换到新连接（换后是独立的新来源，旧来源暂停，原消息保留；Notion 没有 Feed 来源，文档导入每次选连接）；Alchemist 市场脉搏的 GitHub 账号要在它的「来源设置」里重新选，没重新选之前脉冲用匿名搜索（限额较低）；旧连接由本人删掉（Q2，用户 10-27 改定；入口按 C `143d57bb5` 核过，见 §10 Q2 第 4 步）；
  - 产品客户端的环境变量改名（Q5）。

### 6.2 快照与名字

- **API 快照**（`pnpm api:update`）：`tooling/gates/api/contracts/platform/plugin-integrations.txt`、`…/services/connector-host.txt`，以及 SDK 的快照。
- **动作快照**（`pnpm actions:update`）：`connectors.methods.read@1` 和 `connectors.setup.*` 的输出形状不变，预计快照不动；如果动了，按 CONTRACT-CHANGES 升 `version`。设备授权的两条新路由只是设置页用的 HTTP，不注册成动作。
- **MCP 工具名**：不变。
- **Manifest 的 `version`**：不改。内置插件的 Manifest 跟宿主的版本走，本线不改版本号。
- **路由**：
  - `github/device/*`、`github/client`、`gmail/client`、`gmail/oauth/start`、`notion/oauth/start` 删掉，换成通用的 `methods/oauth/start` 和 `methods/device/*`。workbench 里调它们的地方在同一个 PR 里改。
  - 三条回调路径不变。
- **Worker**：只换 import 路径，行为不变，不重新部署（§2.9）。

### 6.3 测试清单

- **要改的**：今天按服务写的用例，改成在通用流程上断言同一件事。
  - `connector-api-oauth`、`connector-oauth-choice`（FI-C-02 的两条断言按 N2 反过来，见 §2.6，第 5 片）、`connector-oauth-broker`（加 §2.9 的 Worker 对照）；
  - `gmail-oauth`、`gmail-factory-boundaries`（第 153、181 行）；
  - `github-device-flow`、`connector-connections`（Gmail 和 Notion 的过时回调）；
  - `connector-authorization-recovery`（ASC-35）、`connector-reconnect-regressions`、`connector-setup`、`connectors-settings-behaviors`、`context-onboarding`；
  - `connector-provider-contracts`、`integration-registry`、`plugin-global-settings`；
  - `security-invariants-connection-refresh`、`security-invariants-connector-intent`、`security-invariants-connection-services`（第 60 行）、`security-invariants-call-connections`；
  - `connector-call-control`、`catalog-connectors`、`catalog-trust-boundaries`、`feed-connectors`；
  - `artifact-document-import`、`sandbox-integration`、`sandbox-integration-home`（只改 `auth_kind` 的写法）。
- **新加的**：§8 每个 RAC 号一组，拒绝类的进 `pnpm test:security`。
- **代码注释里写着 W5-11 的地方**，做完时一起改掉：
  - `host-connector-methods.ts:51`
  - `sandbox-package.ts:144`
  - `plugin-integrations.ts:22`
  - `github/src/index.ts:49`
  - `gmail/src/index.ts:52`

## 7. 切片顺序

| # | 片 | 前提 | 碰的文件 |
| --- | --- | --- | --- |
| 1 | 合同加字段，SDK 的形状检查（整份不过，不含 `{account}`），宿主里的解释器纯函数：模板展开（只认 `{service}`、`{tenant}`、`{gateway}`）、租户检查、令牌与身份请求的组装、端点指纹。只用夹具测试，不接路由，不删表，不发请求 | **已做**（2026-10-27，照第 1 片评审改过，待复核；测试 `tests/connector-oauth-declarations.test.ts`，RAC-1080 先比对 12 个服务：每个夹具写 §2.1.1 的 account_id 和 label 字面量作期望值，`catalogWhoami` 只作旁证，有意不同的标 `intended` 并断言确实不同，其余随第 4 片）。**可以先做**：只改 C 没碰的 `plugin-integrations.ts`；`connector-host.ts` 只读不改（A4，统筹 10-27，不开例外）；不 import `ConnectorCallControl`、`controlledConnectorFetch`；新文件叫 `apps/local-host/src/connector-*.ts`，不改 `error-owners.json`。SDK 算共享核心，要跑全量：分支先推，全量进合批会话开的集成批，本机不跑，测试 `--jobs 1` | `packages/contracts` 的 `plugin-integrations.ts`，SDK 的 `integration-declarations.ts`、新的 `oauth-declarations.ts`、`oauth.ts` 和它的子路径 `/oauth`（`package.json` 的 `exports` 多一项，跑 `pnpm api:update`），宿主的新文件 `connector-oauth-declarations.ts`，`apps/local-host/src/index.ts` 加一行按名字导出（C 也改了这个文件，但在 Feed 那几行，不挨着 `startApiOAuth` 那行），新测试 `tests/connector-oauth-declarations.test.ts` |
| 2 | catalog 里 40 处 `identity` 逐条写成数据；列出要补进 `account_origins` 的来源，含 adobe、bitbucket、feishu、lark（只进 `account_origins`，不进 `origins`） | **已做**（2026-10-27）：产出是 §2.1.1，顺带改了 §2.1 的 identity、keep、context 三行，记了 BL-795 | 无代码 |
| 3 | 通用回调、判断顺序、待完成记录合成一份（§3），§2.8 的拒绝。§2.8 的拒绝最晚和解释器第一次接进请求流程同时落地，哪一片先接就在哪一片，不能晚（第 1 片评审）；从解释器描述发出的请求一律带 `redirect: "error"` | **通用流程已做**（2026-10-28，T-010，分支 `task/T010-m`，待评审）：通用回调按 §3.3 的顺序判断，记录按 state 原子取走（`protocol-store.ts` 的 `take`），发起时钉住声明服务的宿主构建插件（插件、安装、发布者）、方法指纹和 `issuer`，回调在令牌请求前后各查一次；§2.8 的拒绝在登记表的 `assertFree`（挂上与安装预览共用），解释器还没接进请求流程，所以先于它落地；通用流程的请求本来就都带 `redirect: "error"`，从解释器描述发出的请求随第 4 片接入时沿用同一个发送函数。Gmail、Notion 的待完成记录与回调并进通用流程留给第 6、7 片（`connector-oauth-targets.ts`、`connector-oauth-callbacks.ts` 本片未动）。测试 `tests/security-invariants-connector-oauth-callback.test.ts`（S-101，暂定号）、`tests/integration-registry.test.ts`「RAC-1081 a signed package's data-bearing oauth method」 | `connector-api-oauth.ts`、`web-connector-api-methods.ts`、`integration-registry.ts`、`horizontal/connector-host/src/protocol-store.ts` |
| 4 | `CONNECTOR_ACCOUNT_ORIGINS` 按第 2 片的清单加进 contracts，SDK 加 `{account}` 的检查，解释器认 `{account}`（A4）；catalog 和 github web 的数据写进 Manifest，删掉 `API_OAUTH_PROVIDERS`，`connectorMethodsFor` 改读登记；产品客户端和 broker 只给宿主构建的声明；Worker 数据挪到 `cloudflare/providers.ts`，加对照测试，改 `cloudflare/README.md` 第一句和测试注释（§2.9）；PR 说明写上 §2.9「合入不是发版」；检查连接和读账号的 OAuth 那一支改调解释器，SDK 加「`token:` 来源要有对应的 `keep`」（§2.2「检查连接和读账号」，统筹 10-27 选 A）。放在第 4 片，是因为声明到这一片才写进 Manifest，授权、检查、读账号在同一个 PR 里一起换，中间没有两套算法并存的时候 | **已合入 main**（2026-10-29，T-062，#1439；写法见 §2.2「第 4 片落地的写法」，A1 对照测试在 `tests/connector-provider-contracts.test.ts`）。原来的前提：依赖 C 合入（先核 C 改过的 `connector-access.ts`、`connector-account-actions.ts`）；改 SDK，全量进集成批；第一次合入前用户在 Cloudflare 后台确认一次 | `packages/contracts` 的 `connector-host.ts`、SDK 的 `integration-declarations.ts`、catalog 包、`host-connector-methods.ts`、`connector-product-auth.ts`、`connector-access.ts`、`connector-account-actions.ts`、`cloudflare/worker.ts`、`cloudflare/providers.ts`、`cloudflare/README.md` |
| 5 | 共用刷新推广到全部 OAuth 连接，加连接上的绑定和最后一道检查，改掉 C「最后一个离开就丢弃」那一处；同一个 PR 里把 C 的 FI-C-02 两条断言和 spec 行反过来，写明用户 10-27 的决定，告知 C 线（A3） | **已做**（2026-10-28，T-063，分支 `task/T063-ca`，待评审；写法见 §2.6「第 5 片落地的写法」）。原排在本片的 `resolveApiConnection` 收成三支、旧 OAuth 连接标 `reauth_required` 与它的收尾挪到第 6～8 片（理由同上） | `connector-access.ts`、`connector-api-oauth.ts`、新的 `connector-shared-refresh.ts`、`apps/local-host/src/notion-oauth.ts`、`tests/connector-oauth-choice.test.ts`、`specs/…/feed-inbox-runtime-plugins.md` |
| 6 | Gmail 并进通用流程；`resolveApiConnection` 删掉 Gmail 那一支（从第 5 片挪来）；共用刷新在 `settle()` 得出 `discard` 之后不再收新的参与者，之后来的有效调用另排一次刷新，不拿到「已失去授权」（#1479 二审建议 1） | **已做**（2026-10-29，T-064，分支 `task/T064-ca`，待评审；写法见 §2.6「第 6 片落地的写法」）。依赖 C 合入，在 3、5 之后 | gmail 包、`gmail-oauth.ts`、入门流程、`connector-access.ts` |
| 7 | Notion 并进通用流程；`resolveApiConnection` 删掉 Notion 那一支（从第 5 片挪来） | **已做**（2026-10-30，T-065，分支 `task/T065-ca`，待评审；写法见 §2.6「第 7 片落地的写法」）。依赖 C 合入，在 3、5 之后 | catalog 包、两份 `notion-oauth.ts`、`connector-access.ts` |
| 8 | GitHub 设备授权（§2.5），收窄 `auth_kind`；旧形状的 OAuth 连接一律标 `reauth_required`、设置页提示重新新增连接和重新绑定来源、重连得到「请新增连接」（§2.6「旧的 OAuth 连接」、§10 Q2「10-27 用户改定」，RAC-1089；从第 5 片挪来：三种专门流程都换掉以后再标，中间 main 上一直能用） | **已做**（2026-10-31，T-066，分支 `task/T066-ca`，叠在第 7 片上，待评审；写法见 §2.6「第 8 片落地的写法」）。依赖 C 合入，在 4 之后 | github 包、`github-oauth.ts`、`connector-github-device.ts`、`web-connectors-settings.ts`、workbench、`connector-directory.ts` |
| 9 | 文档：§10.1、privileges（§5 的措辞）、EXTENSION-POINTS、SECURITY-INVARIANTS（拿到合批会话给的 S 号之后，含写回凭据这条例外）、CHANGELOG；`AGENTS.md` 在 S-35 那句旁边补上写回凭据的例外（A3） | 在 3～8 之后 | `docs/`、`specs/`、`AGENTS.md` |
| 10 | 第二批：`MCP_SERVERS` 的数据 | 另开一片（BL-790），依赖 C 合入 | `connector-mcp.ts`、catalog 包 |

- 第 1、2 片可以和 C 并行，统筹 10-27 已放行；第 2 片先做，第 1 片的合同照 §2.1.1 的写法。
- 第 3～8 片都碰 C 改过的连接器文件，等 C 进 main 后按表里的顺序做，每片一个 PR，交给评审会话。
- 统筹 10-27 的负载控制下，一次只跑一项重活。

## 8. 验收

| 编号 | 验收 | 怎样证明 |
| --- | --- | --- |
| RAC-1080 | 连接器方法列表（`connectors.methods.read@1`）只由宿主构建的插件声明算出（`connector-directory.ts` 的 `HOST_DECLARED`，取自 `builtinIntegrationDeclarations()`，不看插件是否启用：插件停用时列表照样显示它的 OAuth 方法，开始授权时才拒；2026-10-29 照 T-062 二审建议 6 改写，原写「登记里启用插件的声明」与代码不符），宿主里没有按服务写的 OAuth 表；输出形状不变 | 迁移前后逐个服务整份比对 `ConnectorMethodOption`；扫描宿主源码，没有 `API_OAUTH_PROVIDERS`，也不 import `cloudflare/providers.ts`；OAuth 流程的文件不 import 插件的实现（token 连接的 whoami 见 BL-795）；37 个服务逐个用 C 头 `tests/connector-provider-contracts.test.ts` 的夹具，新的 identity 数据算出的 account_id 与 label 等于夹具里照 §2.1.1 写下的字面量；旧的 `readIdentity` 只作旁证，和字面量相同，按 §2.1.1 有意不同的（Notion；clickup、supabase 的后缀；sentry 只和 `readIdentity` 不同，授权时和 C 头 `apiOAuthIdentity` 一样是 `:org:user`；x 的兜底，以及响应异常时显示 `@@名字`；clickup、supabase 缺 id；工作区为空）在夹具里写明理由，并断言旧的确实不同（第 1 片评审 M3，第 2 片复核重写 sentry 和 x 两项）；同一个 OAuth 服务，授权、检查连接（`inspectApiConnection`）、读账号（`connectors.account.read`）三处算出的 account_id 和 label 相同，Notion、sentry、clickup、supabase、x 至少各一条（第 4 片）；检查连接和读账号的 OAuth 那一支不 import `catalogWhoami` |
| RAC-1081 | 下面这些声明错误都让**整份 Manifest** 抛 `plugin.declaration_invalid`，在写任何记录之前：非 https、带账号密码或端口、主机是 IP、`{setting}` 出现在主机里、平台保留的参数名、未知的 quirk、`use: "tenant"` 用在平台表里没有 `tenant` 的服务上、`{service}` 用在 `origins` 不止一项的服务上、identity 和 context 的完整地址来源不在 `origins` 里（端点不套这一条，第四轮建议 2）；第 4 片起再加：`{account}` 用在 `CONNECTOR_ACCOUNT_ORIGINS` 里没有的服务上（第 1 片里 `{account}` 是未知占位，同样整份不过）；另外，签名沙箱包里带数据的 oauth 被集成登记拒绝（§2.8） | SDK 形状检查逐条用例（`{account}` 那条随第 4 片）；`integration-registry` 的 `attach` 拒绝用例 |
| RAC-1082 | 模板展开后再查一次：tenant、slug 带 `/`、`..`、`%2f`，租户值带端口或凭据、不在 `tenant.domain` 下，kept 的 `instance_url` 不在 `tenant.domain` 下，都在发出任何请求之前拒绝；identity、context 只发往平台表定的来源；从 Manifest 来的请求都经 `sendPublicHttps`。**插件的请求不认 `account_origins`**（A2）：插件经 gmail 连接的槽（`services.connections`）请求 `https://openidconnect.googleapis.com/v1/userinfo`，被拒，不发出、不带凭据；adobe、bitbucket、feishu、lark 加进 `account_origins` 之后，插件请求一侧的行为和今天相同 | 解释器的纯函数用例；发起授权并断言没有网络请求的用例；用假的 `sendPublicHttps` 断言每类请求都经过它；`account_origins` 的拒绝用例进 `test:security`（第 4 片，和这张表一起加），另扫描宿主源码，只有解释器所在的那一个文件 import `CONNECTOR_ACCOUNT_ORIGINS` |
| RAC-1083 | 回调第 1～7 条：拒绝，不发任何请求，只写 §3.4 左边一列，右边一列一个字节不变；Host 不对时 state 不被消耗；带 `error` 的回调消耗 state；三条别名路径只收记录里的那一条；声明了 `issuer` 时 `iss` 缺了或不同都拒绝 | 安全用例（进 `test:security`）：记录令牌端点的请求次数，回调前后对比连接、凭据、protocol 配置和绑定 |
| RAC-1084 | 回调第 8、9 条：令牌请求已经发出，换到的令牌不暂存、不提交；发起之后插件停用、升级或者声明改了，这次回调拒绝 | 安全用例；Gmail 和 Notion 原来的过时回调用例改到这里 |
| RAC-1085 | 共用刷新：同一个连接只有一次刷新在途，一个参与者取消不中止别人，刷新请求发出后不因参与者走光而中止。参与者全部取消、响应回来、插件仍启用：轮换出的凭据写回原连接，别的记录一个字节不变。同样的情形下插件停用了：凭据不存；重新启用后第一次使用得到 `invalid_grant`，连接标 `reauth_required`。连接绑定的插件、发布者或端点指纹变了：不发 refresh token，标 `reauth_required` | 延续 C 给 Notion 的用例，推广到 Gmail、一个轮换 refresh token 的服务（Microsoft）和一个 catalog 服务；拒绝场景进 `test:security` |
| RAC-1086 | 设备授权：start 和 poll 缺 S-03 那三样就拒；device_code 不出现在任何响应里；`verification_uri` 不合规就终止；间隔没到的 poll 不发请求，`slow_down` 后加大间隔；每次 poll 和提交前重查第 6、7、9 条；过期、被拒、插件停用都终止，只写 §3.4 左边一列 | 安全用例加一个假的设备端点 |
| RAC-1087 | 插件拿不到 OAuth 流程里的 code、verifier、client secret 和 refresh token：Gmail、Notion、GitHub 包里没有密钥库的端口。服务换主人（官方集成停用，同一 service_id 由别的插件声明）后，产品客户端、本人的 client secret 和 refresh token 都不发往新声明的端点 | 包导入检查；换主人的拒绝用例，用一个声明了别的 `token_url` 的测试插件 |
| RAC-1088 | Alchemist 例外，**只管 OAuth 连接**：GitHub 集成插件启用时，脉冲照样带令牌；插件停用时，脉冲退回匿名，令牌不发出去。token 连接不变（BL-794） | 宿主用例，对 `api.github.com` 用假的 fetch；token 连接那一条只断言「行为和今天相同」 |
| RAC-1089 | 旧的 OAuth 连接（`auth_method: "oauth"`、没有 `connector-protocol:` 引用）直接 `reauth_required`，不发任何请求，也不走 token 分支；token 连接照旧。旧形状的连接点重新授权，换到令牌后得到「请新增连接」，不会悄悄认成原来的账号：连接、凭据、protocol 配置和来源的绑定一个字节不变，也不新建连接（§10 Q2「10-27 用户改定」）。Gmail、Notion、GitHub 设备授权和一个 catalog 服务的完整流程（发起 → 回调 → 连接可用 → 刷新 → 重新授权）在通用流程上走通，设置页和入门流程的返回不变 | 宿主用例加端到端用例（假的提供方）；旧形状连接重连的用例三种旧连接各一条，`account_label` 与这次算出的 account_id、label 都相同时同样得到「请新增连接」；Alchemist 市场脉搏绑着旧 GitHub 连接、该连接要求重新授权以后，对 `api.github.com` 的假 fetch 收到的请求不带它的令牌（不修「退成匿名」本身，见 §10 Q2 第 4 步）；浏览器用例按 PARALLEL-DEVELOPMENT 排时段 |
| RAC-2476 | Gmail 的完整流程在通用流程上走通：发起（默认回调是它登记过的别名）→ 别名回调 → 连接可用（通用凭据引用、account_label 是邮箱）→ 取令牌，授权用 `openid email gmail.readonly` | 宿主用例，假的 Google（`tests/gmail-oauth.test.ts`） |
| RAC-2477 | 入门流程发起的 Gmail 授权，成功、取消、失败都回到入门页（带 `desktop`），journey 只在仍等这个 state 时才改；被更新的发起顶掉的旧回调得到失败页、不改 journey、不建连接；journey 不在选来源阶段或不存在时不能发起 | 同上 |
| RAC-2478 | Gmail 重新授权要求 Google 的 `sub` 不变（邮箱变了照过），`sub` 不同则拒，连接和凭据一个字节不变 | 同上 |
| RAC-2479 | 旧形状的 Gmail 连接：列表状态 `reauth_required` 并带提示，`resolveApiConnection` 不发请求、不落进 token 分支，`if_available` 回 `null`；token 连接与 Notion、GitHub（各自的专门流程还在）照旧 | 安全用例（`tests/security-invariants-oauth-non-protocol.test.ts`） |
| RAC-2480 | 旧形状的 Gmail 连接点重新授权，换到令牌后得到“请新增一条连接，并把原来绑在这条连接上的来源重新绑定到新连接”，`account_label` 与这次算出的邮箱相同时同样如此；连接、旧凭据、protocol 配置一个字节不变，不新建连接，state 被消耗 | 同上 |
| RAC-2481 | 回调别名只在路径（含一段项目段）正好等于记录里存的 `redirect_uri` 时收；别的服务不能用 Gmail 的别名发起，别的主机、带查询参数的地址、两段项目路径、别的前缀都不是回调 | 宿主用例（`tests/gmail-oauth.test.ts`） |
| RAC-2482 | Gmail 包里没有 `oauth*.ts`、`token-refs.ts`，也不引用密钥库；Host 没有 `gmail/client`、`gmail/oauth/start` 路由 | 安全用例，读包源码 + 真实路由处理器 |
| RAC-2483 | 共用刷新的答案要丢弃（`outcome()` 得 `discard`）之后不再收新参与者（`open` 为 `false`），仍会交付的刷新照收 | `tests/security-invariants-oauth-shared-refresh.test.ts` |
| RAC-2484 | Gmail 的刷新轮换 refresh token 并写回同一条连接；Google 拒绝刷新则连接标 `reauth_required` | `tests/gmail-oauth.test.ts`（RAC-1085 的 Gmail 一条） |
| RAC-2485 | Gmail 的产品客户端只读 `MOLIS_WORK_CONNECTOR_GMAIL_OAUTH_CLIENT_ID/SECRET`，旧名 `MOLIS_WORK_GMAIL_CLIENT_*` 不读 | 同上 |
| RAC-2486 | “可连接”（卡片、入门流程）由声明算：产品客户端配齐或 broker 配了才为真 | 同上 |
| RAC-2533 | Notion 的完整流程在通用流程上走通：发起 → 别名回调 → 连接可用（通用凭据引用、账号是工作区、标签是工作区名，缺工作区名时取 identity 应答里的）→ 取令牌、刷新、检查；`notion/oauth/start` 路由和旧回调路径不存在 | `tests/notion-oauth.test.ts` |
| RAC-2534 | Notion 的默认回调是 `http://localhost:<端口>/api/settings/connectors/notion/oauth/callback`；发起的来源是 `127.0.0.1` 或 `[::1]`（或本来就是 `localhost`）、同协议同端口时回调才收，到达的 Host 必须是 `localhost:<同一端口>`，另一个端口、`127.0.0.2`、`localhost.evil.example`、`[::ffff:127.0.0.1]`、非本机 Host 都被拒且不建连接；Gmail（有别名、没有 `host`）与 Asana（没有别名）拿 Notion 的 `localhost` 地址发起、或在 `localhost` 到达都被拒；包声明的服务没有更多：别名按服务 id 查，服务 id 全局唯一，签名包带数据的 `oauth` 方法在安装预览时就被拒（`assertFree`）；被拒的每个到达都断言了状态码或失败页，以及它的 state 是否已用掉（本机来源不同的拒绝在规则 2，state 取走；非本机 Host 在规则 1，记录不动） | 同上 |
| RAC-2535 | Notion 的令牌请求是 Basic 认证加 JSON 体（含 `redirect_uri`）；重新授权同一工作区（改了名）通过，另一个工作区在规则 8 被拒、什么都不写 | 同上 |
| RAC-2536 | 旧形状的 Notion OAuth 连接：`reauth_required` 并带提示，不读、不刷新、不发请求，`if_available` 回 `null`；PAT 连接照读 | 同上 |
| RAC-2537 | Notion 的产品客户端只读 `MOLIS_WORK_CONNECTOR_NOTION_OAUTH_CLIENT_ID/SECRET`；旧名与设置页存的客户端不读 | 同上 |
| RAC-2538 | 共用刷新的取消、走光后保留新令牌且下次刷新用新的 refresh token、25 秒自己的时限、走光后新来的调用加入在途刷新、期间 refresh token 或连接变了什么都不写（原 FI-C-02 Notion 一组，断言不放宽） | 同上 |
| RAC-2539 | Host 和 catalog 里没有只给 Notion 的 OAuth 代码、路由和密钥名 | 同上，读源码 |

## 9. 不做与后续（BL）

- **BL-790**：第二批，`MCP_SERVERS` 的数据写成 `kind: "mcp"` 的声明（§4.2）。
- **BL-791**：本地进程连接的平台服务。做完它，飞书 CLI、飞书和 Lark 的 stdio MCP、figma 的本机 MCP 才能迁（§4.3）。
- **BL-792**：向外部包放开带数据的 oauth 声明。前提有两个：
  - T1 的主人定出按签名区分的安装信任；
  - 外部包的声明必须写 `issuer`（RFC 9207）。

  在那之前按 §2.8 拒绝。
- **BL-793**：BL-690（OAuth 移走之后对 connection_methods 的检查）在第 4 片做完后重新评估。BL-694（外部的 document_import）不受本线影响。
- **BL-794**（不做，统筹 10-27 裁定）：插件停用之后，它声明的服务的 **token 连接**也不再发送。包括 Alchemist 绑的 GitHub token 连接，以及 `services.connections` 经 `resolveApiConnection` 发出的 token。今天就是照样发送，本线不放宽也不收紧；本线只收 OAuth 连接（§2.6、RAC-1088）。

- **BL-795**（第 2 片发现）：token 连接的 whoami 还由宿主 import catalog 包的 `catalogWhoami`（`connector-access.ts:117,121`、`connector-account-actions.ts:67,72` 的 token 那一支；OAuth 那一支第 4 片改调解释器，§2.2）。token 要先经 `parseToken`、`prepare` 拆开或换成令牌，不是 OAuth 声明能写的。和 BL-794 同属 token 连接那一半，本线不做；做的时候按「宿主不跑插件代码」另想办法（token 方法的声明，或由插件自己的动作回报身份）。

BL-796～799 留空。

## 10. 问题与答复（已定）

六题都选 A。Q2、Q5 由用户本人定，Q1、Q3、Q4、Q6 由统筹定（按 10-22 的授权），日期都是 2026-10-27。另一个选项留在下面，作为备查。

- **Q1　Manifest 写不下的特殊情况，怎么办？**　**已定：A，只用数据**（统筹，10-27）。
  - A **只用数据**：§2.1 的字段覆盖今天五家的改写、三种怪癖和身份/上下文（含 `{context.*}`）。以后遇到新的特殊情况，就往平台的声明里加字段，插件里没有代码钩子。理由：这符合「缺什么补进平台」，宿主不跑插件代码。
  - B（未选）插件给一个纯函数钩子。
- **Q2　开发 Home 上已经有的 Gmail、Notion、GitHub 设备授权连接怎么办？**（它们是 `auth_method: "oauth"`，用的是 `connector-connection:<id>:access` 引用，不是通用的 protocol 形状。）　**已定：A，不写迁移**（用户本人，10-27）。
  - A **不写迁移，标成「需要重新授权」**：~~走现有的恢复流程（ASC-35）重连，来源的绑定保留。~~（这句被下面「10-27 用户改定」取代，留作备查。）读取时不认 **OAuth 连接上**的旧引用；token 连接的 `connector-connection:<id>:token` 照旧（M4）。
  - B（未选）写一次性的维护脚本。
  - **10-27 用户改定：旧连接不保留绑定，改为新增连接、由本人重新绑定**（用户本人，2026-10-27，经统筹转达）。上面 A 里「走 ASC-35 重连、来源的绑定保留」一句由这条取代。
    - 为什么：C 头上就地重新授权时，`connector-api-oauth.ts:122-126` 对每条 `auth_method: "oauth"` 的连接都带上 `previousRevision`，回调在 `:278-279` 要求旧连接的 protocol 上下文里有 `account_id`，且和这次算出的相等。旧的 Gmail、Notion、GitHub 设备授权连接没有 protocol 上下文，所以必定报「请新增连接」。第五版想过按连接表的 `account_label` 列比对来认原账号，但那条分支只有旧连接会走，按 AGENTS 属于新增兼容逻辑，**不做**。
    - 怎样做（第 5 片），不加只给旧连接用的读取分支：
      1. **标记**：旧连接按 §2.6 标 `reauth_required`，不发请求。这是 §2.6 已有的拒绝，不是另一条读取路。
      2. **提示**：设置页给它的提示写清楚两件事：「这条连接要重新新增」和「原来绑在它上面的来源要重新绑定到新连接」，旁边给「新增连接」和「删除这条连接」。提示文字由 §2.6 标记时给出，设置页照着显示，不按服务或按「是不是旧连接」另写一支。
      3. **重连**：本人仍点「重新授权」时，走通用的就地重新授权：回调比 protocol 上下文里的 `account_id`，旧连接没有，就得到「请新增连接」，只写 §3.4 左边一列（消耗 state），连接、凭据、protocol 配置和绑定一个字节不变，也不新建连接。这条错误的文字和第 2 条一样写明要新增连接、重新绑定来源。
      4. **收尾**：旧连接不由平台删，也不由平台改绑；本人新增连接、在来源的设置里换到新连接后，用现有的删除入口删掉旧连接。
         - **入口已核（只读，C 分支 `feature/anticorruption-closeout-c` 的 `143d57bb5`，10-27）：有，本线不另开。** 换连接在 Feed 来源详情的「使用的账号连接」下拉（`plugins/native/feed/src/ui.ts:427`，`data-source-config-field="connection_id"`）；`apps/workbench/src/scripts/client/navigation-feed-sources.ts:92-120` 列出该服务的全部连接和状态（可用、需要重新授权、已断开），原连接不可用时提示「原连接已不可用，请重新选择或前往 Connectors」。保存走 `feed.source.update` 带 `connection_id`（`plugins/native/feed/src/source-actions.ts:36`），只接受 github、gmail、connector 三种同步方式。
         - **注意，这不是就地改绑**（`plugins/native/feed/src/source-service.ts:131-205`）：换到另一个连接时，按项目、连接器、方式和新 `connection_id` 算出一个新来源 id，建出独立的新来源，旧来源暂停，原消息保留，追加事件「来源已切换到另一账号连接」；新来源 id 原来没有时才复制外发规则。界面上写着「更换账号会创建独立来源并暂停旧来源，原消息会保留。」所以 §6.1 的升级须知要写明：换连接会建出新来源、暂停旧来源，原消息保留，不是把原来源的绑定原样迁过去。
         - **删除**：`connectors.connection.remove`（`apps/local-host/src/connector-management-actions.ts:42`，`change()` 在 `:66`）比对版本，不可撤销；删凭据和 protocol 配置，保留业务结果；不因为还有来源在用而拦下。谁在用由 `connectors.usages.read` 另读，汇总 `feed.connection.usages`（`plugins/native/feed/src/query-actions.ts:27`）、模型和生图三家。
         - **另一处长期绑定：Alchemist 市场脉搏的 GitHub 账号**（评审 10-27 指出，原先这里写的「长期绑定只在 Feed 来源上」不对）。C 上 `apps/local-host/src/alchemist-pulse-github.ts:8,31-47`：绑定记在连接登记表 `home/alchemist/pulse-github`，整个 Home 共用一条；`auth_method` 是 token 或 oauth 的 GitHub 连接都能选，所以旧的 GitHub 设备授权连接可能绑在这里。旧连接按第 1 条标「需要重新授权」以后，`boundToken` 里 `resolveApiConnection` 抛错被接住，脉冲**悄悄退成匿名搜索**（限额较低），只写一条宿主日志 `pulse_token_unavailable`；这个槽也**不在** `connectors.usages.read` 里，删除连接时看不到它在用。重新选的入口是现成的：Alchemist 市场脉搏的「来源设置」（动作 `alchemist.pulse.github.configure`）。Alchemist 不迁移、以后删（`specs/repository-anti-corruption` 的 Alchemist 决定），所以「退成匿名」和「不在 usages 里」这两件只在这里写明，本线不修；升级须知（§6.1）写一句「市场脉搏的 GitHub 账号要重新选」；RAC-1089 加一条断言：旧 GitHub 连接要求重新授权以后，脉冲不再拿它的令牌发请求。
         - **Notion**：C 上没有 Feed 来源用 Notion；成果库的文档导入（`apps/local-host/src/artifact-document-import.ts:89-92`）每次导入时选连接，不留长期绑定：没给连接、该服务只有一条已连接的就用它，多条就要求本人选。所以 Notion 只需新增连接，没有来源要换。
    - 第 5 片配用例（RAC-1089）：三种旧连接各一条，点重连得到「请新增连接」，不会悄悄认成原来的账号，`account_label` 与这次算出的 account_id、label 都相同时也一样；连接和绑定一个字节不变。
    - 代价：GitHub、Gmail 的 Feed 来源都要本人换一次连接（换后是新来源，旧来源暂停、原消息保留），市场脉搏的 GitHub 账号要重新选，Notion 只需新增连接；写进升级须知（§6.1）。
- **Q3　声明它的插件停用了，已有的 OAuth 连接怎么办？**　**已定：A，刷新和发送都拒**（统筹，10-27）。
  - A **刷新和发送都拒**，连接显示「方法不可用」，重新启用就恢复；Alchemist 退回匿名。理由：和「被停用的调用不再写业务记录」一致。token 连接那一半是 BL-794。
  - B（未选）按停用前最后一份声明的快照继续刷新。
- **Q4　`MCP_SERVERS` 的数据放在同一片，还是第二批？**　**已定：A，第二批另开一片**（统筹，10-27）。
  - A **第二批另开一片**（BL-790）。
  - B（未选）和第一批一起做。
- **Q5　产品客户端的环境变量统一改名吗？**　**已定：A，统一改名**（用户本人，10-27）。
  - A **统一成 `CONNECTOR_<SVC>_OAUTH_CLIENT_ID/SECRET`**：`MOLIS_WORK_GMAIL_CLIENT_*` 和 `GITHUB_CLIENT_ID` 不留旧名，升级须知写进 CHANGELOG。统筹核过，CI 不用这几个变量。
  - B（未选）保留这两组旧名。
- **Q6　Gmail 判断「重新授权是同一个账号」，从按邮箱改成按 Google 的 `sub`？**　**已定：A，按 `sub`**（统筹，10-27）。
  - A **按 `sub`**：和通用规则一致；Gmail 的声明用带 `openid email` 的通用 Google 预设。因为 Q2 不迁移，旧连接不会被认错。
  - B（未选）保留按邮箱。

评审之后又定的（10-27）：

- **统筹定**：
  - 新 S 号分成三条，每条各有一个拒绝测试（§3.5）。号码由合批会话核对 main 和在途 PR 后再定，本稿继续写「待统筹核」。
  - M5 整份不过；M3 Worker 留一份数据，由测试钉住；疑问 1 登记 BL-794；疑问 2 不存。都见 §0。
- **用户定**：N2 的另一半选「只存新令牌」（§2.6）。
- **开工安排**：第 1、2 片叠在本分支上，推远端，不开 PR，回报 SHA；第 3～8 片照旧等 C 合入。

第三轮评审之后（10-27）：

- **统筹定**：A4 选「挪到第 4 片」，第 1 片不碰 `connector-host.ts`，不开例外（§2.1、§7）。
- **开工安排**：第 2 片等统筹通知（W5-10 推完 e1、e2、e3、a1 之后，同时最多两条线写代码）；第 1 片等 A2、A4 的增量复核过了再开。
- **M3 核过**：第 4 片合入不是发版；第一次合入前请用户在 Cloudflare 后台确认一次，统筹提醒（§2.9）。

第 2 片评审之后（10-27）：

- **用户定**：旧 OAuth 连接只能新增，绑定由本人重新绑，不加兼容路；按 `account_label` 比对认原账号那条分支不做（§10 Q2「10-27 用户改定」，第 5 片）。

## 11. 评审建议的取舍

四轮评审的建议都采纳了，没有不采纳的：

| 建议 | 采纳与否 | 落在哪里 |
| --- | --- | --- |
| state 以 protocol store 的 43 位为准 | 采纳 | §3.2 |
| 核 RFC 9207 的 `iss` | 采纳：声明了 `issuer` 就必须核；外部包放开时必须写 | §2.1、§3.3 第 5 条、BL-792 |
| 设备授权：`verification_uri` 先核、poll 句柄是 state、每次 poll 重查、平台限速 | 采纳 | §2.5 |
| 第 1 片不 import C 上的东西；新文件叫 `connector-*.ts`；改正「`plugin-integrations.ts` 只改注释」；第 1 片要跑全量 | 采纳 | §1.4、§2.2、§7 |
| Alchemist 的出处改成 10-23「本轮不删」 | 采纳（第二轮升为必须改，N3） | §5 |
| F3 的含义 | 采纳，改正 | §5 |
| 删除名单补全，`notion-oauth.ts` 写全路径，gmail 不在 catalog 里 | 采纳 | §2.4、§4.1 |
| 身份地址用 `{context.*}` 拼出来 | 采纳 | §2.1 |
| `settings.use: "origin"` 和 `origin_setting` 重复 | 采纳：两个都去掉，换成平台表定域的 `use: "tenant"` | §2.1 |
| 安装代次写成具体字段 | 采纳：`install_id` | §3.2、§2.6 |
| Gmail 用带 openid 的通用 Google 预设 | 采纳 | §2.4 |
| Q5 改名时 `github/src/oauth.ts:51` 的报错一起处理 | 采纳：那个文件随删除名单删掉，`connector-directory.ts:53-55` 一起改 | §2.3 |
| §3.4 拆三条，并写明各自的前提 | 采纳 | §3.5 |
| 第 8、9 条换到的令牌，服务方有撤销端点的就撤销 | 采纳为尽力而为，不进验收 | §3.3 |
| 第三轮建议 1：`cloudflare/README.md` 第一句和测试注释「imports nothing from the workspace」随第 4 片改 | 采纳 | §2.9、§7 第 4 片 |
| 第三轮建议 2：`{tenant}/路径` 的端点指纹取模板，不取展开后的地址 | 采纳 | §2.6 |
| 第三轮建议 3：`origins` 有几项时怎样选 | 采纳第一种：`{service}` 只给一项的服务，几项时写完整地址、来源必须在 `origins` 里；不用 `{service:0}` 序号，平台表换顺序时不会悄悄换来源 | §2.1、RAC-1081 |
| 第三轮建议 4：§6.3 注明 FI-C-02 的两条断言按 N2 反过来 | 采纳 | §6.3、§2.6、§7 第 5 片 |
| 第四轮建议 1：只许解释器所在的那一个文件 import `CONNECTOR_ACCOUNT_ORIGINS` | 采纳 | §2.1、RAC-1082 |
| 第四轮建议 2：「完整地址的来源须在 `origins` 里」只管 identity、context 的 `url` | 采纳，第 1 片照这个意思实现 | §2.1 |
| 第四轮建议 3：Atlassian 的 `{gateway}` 和 accessible-resources 的 `{account}` 分开写明 | 采纳 | §2.1.1 |
