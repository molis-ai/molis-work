# W5-11：连接器 OAuth 从宿主的表移进官方集成插件的声明（设计稿）

状态：设计稿，第二版，待增量评审（2026-10-27，W5-11 线，分支 `claude/w511-oauth-declarations`）。第一版的六个问题都按 A 定了（§10）。两轮评审的必须改 M1～M7、N1～N3 都已改进本稿，建议的取舍写在 §11；统筹和用户在 10-27 的裁定写在 §0 和 §10。本稿只有设计、没有代码。第 1、2 片等增量评审过了再叠在本分支上。§7 里标「依赖 C 合入」的片，要等批次 C（`feature/anticorruption-closeout-c`，头 `fe93d322`；Notion 共享刷新在 `009b773f`）进 main 才动手；标「可以先做」的不碰 C 改过的文件，也不 import 只在 C 上的东西。代码事实按 main `9efbf8d04` 和 C 头 `fe93d322` 核过，文中的行号与形状都是 C 头上的。号段：RAC-1080～1089、BL-790～799，统筹 10-27 核过，没有冲突。新 S 号分成三条，号码由合批会话核对后再定，§3.5 里写「待统筹核」。

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
  - 宿主构建的插件每次启用都拿到新的 `install_id`（`enableOnce`）；沙箱包 attach 时沿用原来的安装。
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
| `settings` | 本人在设置里填的字段 | `{ key, label, placeholder?, required?, use, pattern? 或 enum? }`；`use` 只能是 `path`、`scope`、`client_auth`、`tenant` 之一 |
| `identity` | 怎样取账号 | `{ url, account_id, label? }`；`url` 见下面的「带令牌的请求」；`account_id` 和 `label` 是 JSON 指针，或几个指针（用 `:` 连起来），可以指 `identity` 响应，也可以指 `token` 响应 |
| `keep` | 从令牌响应里留进连接上下文的字段 | `{ key, pointer, check }`；`check` 只能是 `tenant`（见下）或 `pattern` |
| `context` | 授权后另发的只读请求 | `{ key, url, pick }`；`pick` 是「取列表」，或者「按某个 setting 对上一项再取指针」（atlassian 的站点） |
| `quirks` | 已知的三种怪癖 | `refresh_redirect_uri`（gitlab）、`omit_token_params: ["grant_type","redirect_uri"]`（clickup）、`expiry: "jwt_exp"`（monday）；只收这几个值 |
| `note` | 设置页的一句说明 | 字符串 |

**来源可变的只有租户，范围由平台表定。**
- Manifest 不写主机后缀，也不写来源列表。端点主机是写死的；只有 `use: "tenant"` 的那一个 setting 能换来源，写成 `{tenant}/路径`。
- 平台检查这个值时，用的是平台表里这个服务的 `CONNECTOR_REQUEST_SERVICES[service].tenant.domain`，和今天 `salesforceOrigin` 是同一组规则：https，不带凭据、端口、路径，主机等于这个域或在它下面。平台表里没有 `tenant` 的服务，声明了 `use: "tenant"` 就是声明错误。
- `keep` 的 `check: "tenant"` 也一样：留下来的来源（salesforce 的 `instance_url`）必须过同一个检查，再钉进 `connector_connection_targets`。这一条不比今天的 `salesforce.com` 后缀松。
- SDK 不需要公共后缀表（M5）。第一版的 `origins` 列表和 `origin_setting` 都去掉了，`settings.use: "origin"` 也一起去掉（建议 9）。

**带令牌的请求（identity、context）只发往平台表允许的地方**（M2(b)）：
- 访问令牌能发到哪里，仍然只由平台定，这样和 S-69「Manifest 不写地址」不冲突。Manifest 只写路径和来源种类：
  - `url` 写成 `{service}/路径`：发往平台表 `origins` 里的某一个；
  - `{tenant}/路径`：发往钉在连接上的租户来源；
  - `{gateway}/路径`：发往 Atlassian 网关；
  - `{account}/路径`：发往平台表新加的一列 `account_origins`（下面说）。
- 路径里可以写 `{context.<key>}` 和 `{setting}`，按路径段编码。这样 Jira、Confluence 的身份地址可以用 cloud_id 拼出 base，Salesforce 的身份地址发往 kept 的 instance 来源（建议 8、第二轮建议 2）。
- **`account_origins`**：平台表给每个服务加这一列，只放「取账号和授权上下文」要用、又不在 `origins` 里的来源。例如：
  - Google 的 `https://openidconnect.googleapis.com`；
  - Atlassian 的 `https://api.atlassian.com`（accessible-resources）；
  - clickup、supabase 列 workspace 的 API 来源，如果它们不在 `origins` 里。
  - 第 2 片列出全部要补的来源。这一列和 `origins` 一样，是平台的表，改它要过 S-69 的评审。
- **端点和带令牌的请求是两回事**：
  - 授权、令牌、刷新、设备授权这几个端点，收到的是 code、verifier、client secret、refresh token，不收拿来调 API 的访问令牌，它们的约束是 §2.8 的 M1；
  - 访问令牌只发往上面这几种平台定的来源。

**模板展开之后再查一次地址。** 平台展开模板后，对每个地址都按 S-09、S-10 再查一遍。`use: "path"` 的值按 `pattern` 校验，并按路径段编码，不能带 `/`、`..` 或 `%2f`。

**检查不过，整份 Manifest 不过**（M5，统筹 10-27 裁定）：
- 和 `manifest.ts:267-269`、S-95 对 `origins` 的做法一样：`plugin.declaration_invalid`，在写任何记录之前拒绝，不开诊断通道。
- 宿主构建的插件写错了，是构建问题，测试会拦下来。
- 平台表在 contracts 里，SDK 读得到，所以下面两条也放在 SDK 的形状检查里：「`use: "tenant"` 只给平台表里有 `tenant` 的服务」，「`{account}` 只给有 `account_origins` 的服务」。本人填的租户值，在宿主里按 §2.1 查。

### 2.2 平台只有一个解释器

- **位置与输入输出**：新的解释器放在 `apps/local-host/src/connector-*.ts`（这个前缀已经归 `connector` 主人，不用改 `tooling/gates/error-owners.json`），替换 `apiOAuthProvider` 和 `connector-api-oauth.ts` 里按 service 分支的代码。
  - 输入是登记里本方法的当前声明，加上本人的 settings 和连接上钉住的租户来源。
  - 输出是授权地址、令牌请求、刷新请求、设备授权请求、身份与上下文请求，都只是描述，不发请求。
- **宿主不 import 插件的实现**：今天的 `catalogWhoami`、`notionAuthorizationUrl`、`notionOAuthToken`、`createGmailOAuth`、`createGithubDeviceFlow` 都不再被宿主引用。catalog 的 `CatalogConnectorSpec.identity` 从代码（`request(ctx) / read`）改成 §2.1 的 `identity` 数据。catalog 里共 40 处 `identity:`，第 2 片逐条写成数据。按 Q1 只用数据：要是有写不成的，就往平台的 `identity` 声明里补字段，不给插件钩子。
- **请求都走一条路**：凡是从 Manifest 来的请求，都经 `sendPublicHttps` 发出（M2(c)），`redirect: "error"`。具体是：令牌、刷新、设备授权、设备 poll、identity、context。DNS 固定之后再做最后的发送检查（S-10），依赖 C 的片再套上 `controlledConnectorFetch`。今天的 `jsonRequest`、`enrichContext` 里的裸 `fetch` 一起换掉。
- **设置页看到的不变**：`ConnectorMethodOption` 的形状和 `connectors.methods.read@1` 的输出不变，`client_secret_required`、`fields`、`note`、`login_ready` 都改由声明算出。

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
  - `identity` 发往 `{account}/v1/userinfo`（`openidconnect.googleapis.com`），`sub` 当 account_id，`email` 当 label。
  - 重新授权要求 account_id 不变，这是通用规则，从按邮箱改成按 `sub`（Q6）。
  - 入门流程的返回由发起授权的入口写进待完成记录的 `return_to`（`settings` 或 `onboarding`），插件不写。
  - redirect 允许带项目路径段，这条规则留在平台的别名表里（§3.1）。
  - gmail 包删掉 `src/oauth.ts`、`src/oauth-configuration.ts`、`src/oauth-pending.ts`、`src/oauth-token-lifecycle.ts`、`src/oauth-types.ts`、`src/token-refs.ts`，不再拿宿主的密钥库。
- **Notion**：
  - 声明 basic、json、`owner=user`；`keep` 留 `workspace_id`；account_id 取令牌响应的 `/workspace_id`，label 取 `/workspace_name`。
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
  - **旧的 OAuth 连接**（M4）：`auth_method: "oauth"`，引用却不是 `connector-protocol:`（今天的 Gmail、Notion、GitHub 设备授权都是这样）。这种连接直接标 `reauth_required`，不发任何请求，也不落进 token 分支。按 Q2，读取时不认 OAuth 连接上旧的 `connector-connection:<id>:access` 引用；token 连接的 `connector-connection:<id>:token` 照旧。
- **签名不变**：`resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl)`，C 的调用方一处不改。
- **刷新之前，先核对连接绑定的声明**（M1(a)）：
  - 连接激活时，protocol 配置里记下 `plugin_id`、发布者，和端点指纹。端点指纹是令牌和刷新端点的地址、`client_auth`、`token_format` 规范化后的哈希。
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
- **声明它的插件没启用**（停用、卸载）时，OAuth 连接的刷新和发送都拒绝（Q3）：
  - 用一个新的错误码，主人名按 `tooling/gates/error-owners.json` 给这个文件的，用 `defineErrorCodes` 声明，名字实现时定。
  - 不发出任何请求，连接显示「方法不可用」，重新启用后恢复。
  - token 连接那一半见 §9 的 BL-794。
- **发送边界不变**：凭据只发往第一次绑定的来源（S-12），401 只刷新一次（S-70），`redirect: "error"`。

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
- **由测试钉住**：`tests/connector-oauth-broker.test.ts` 加一条：对 broker 服务的每个服务，Worker 那份展开出来的授权地址、令牌地址、scope、`client_auth`、`token_format`，都要和 Manifest 声明展开的相同。哪天两边不同，测试就失败；要改 Worker 那份，就是重新部署，先报统筹转用户，因为这是发布红线。
- **broker 流程里，声明指纹由宿主核**：
  - 发起时，待完成记录照样记下声明指纹；
  - 回调回到宿主时，照 §3.3 第 7 条核对。
  - Worker 用自己那份数据换令牌，和声明是否一致只靠上面的测试保证。这一点写进 §3.3。
  - 声明展开和 Worker 那份对不上的服务，宿主不提供 broker，退回产品客户端或本人填的客户端。

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
  - 插件：`plugin_id`、`install_id`（宿主构建的插件每次启用都换新的；沙箱包沿用原安装，建议 10）、发布者；
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
| S-69（补一句） | Manifest 写的 OAuth 端点不是请求来源：它们不收访问令牌；带访问令牌的 identity、context 只发往平台表的 `origins`、租户来源、网关和新加的 `account_origins` | RAC-1082 | M2 |
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
  - `packages/contracts/src/services/connector-host.ts`：
    - `ConnectorAuthKind` 收窄（§2.7）；
    - `ConnectorRequestService` 加 `account_origins`（§2.1）。
  - SDK `integration-declarations.ts`：`methodProblems` 从「只写 kind」改成按 §2.1 检查形状，`AUTH_KINDS` 跟着合同改。SDK 算共享核心，第 1 片本身就要跑全量（§7）。
- **读取不兜底**：
  - 旧形状的 Manifest（只有 `{kind:"oauth"}`）不会出现：内置插件在同一个 PR 里改；外部包带数据的 oauth 被 §2.8 拒绝。外部包只写 `{kind:"oauth"}` 而不带数据的，同样是声明错误，整份不过。
  - 存量连接：`auth_method: "oauth"` 却没有 `connector-protocol:` 引用的，直接 `reauth_required`（§2.6、Q2）。token 连接不受影响。
- **新错误码**：都用 `defineErrorCodes` 声明，不新写 Error 子类。
- **升级须知**：`docs/releases/CHANGELOG.md` 的 `[Unreleased]`「升级须知」写两条：
  - Gmail、Notion、GitHub 设备授权的连接要重新授权（Q2）；
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
  - `connector-api-oauth`、`connector-oauth-choice`、`connector-oauth-broker`（加 §2.9 的 Worker 对照）；
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
| 1 | 合同加字段，SDK 的形状检查（整份不过），宿主里的解释器纯函数：模板展开、租户检查、令牌与身份请求的组装、端点指纹。只用夹具测试，不接路由，不删表，不发请求 | **可以先做**：C 没碰 `plugin-integrations.ts`；不 import `ConnectorCallControl`、`controlledConnectorFetch`；新文件叫 `apps/local-host/src/connector-*.ts`，不改 `error-owners.json`。SDK 算共享核心，要跑全量：分支先推，全量进合批会话开的集成批，本机不跑，测试 `--jobs 1` | `packages/contracts` 的 `plugin-integrations.ts`、`connector-host.ts`（`account_origins`），SDK 的 `integration-declarations.ts`，宿主的一个新文件 |
| 2 | catalog 里 40 处 `identity` 逐条写成数据；列出要补进 `account_origins` 的来源 | **可以先做**：只读 catalog 包，产出写进本稿 §2.1 | 无代码 |
| 3 | 通用回调、判断顺序、待完成记录合成一份（§3），§2.8 的拒绝 | 依赖 C 合入 | `connector-api-oauth.ts`、`connector-oauth-targets.ts`、`connector-oauth-callbacks.ts`、`web-connector-api-methods.ts`、`integration-registry.ts` |
| 4 | catalog 和 github web 的数据写进 Manifest，删掉 `API_OAUTH_PROVIDERS`，`connectorMethodsFor` 改读登记；产品客户端和 broker 只给宿主构建的声明；Worker 数据挪到 `cloudflare/providers.ts`，并加对照测试 | 依赖 C 合入 | catalog 包、`host-connector-methods.ts`、`connector-product-auth.ts`、`cloudflare/worker.ts` |
| 5 | 共用刷新推广到全部 OAuth 连接，加连接上的绑定和最后一道检查，改掉 C「最后一个离开就丢弃」那一处；`resolveApiConnection` 收成三支，旧 OAuth 连接标 `reauth_required` | 依赖 C 合入（先确认 `apps/local-host/src/notion-oauth.ts` 合入后的形状） | `connector-access.ts`、`connector-api-oauth.ts`、`apps/local-host/src/notion-oauth.ts` |
| 6 | Gmail 并进通用流程 | 依赖 C 合入，在 3、5 之后 | gmail 包、`gmail-oauth.ts`、入门流程 |
| 7 | Notion 并进通用流程 | 依赖 C 合入，在 3、5 之后 | catalog 包、两份 `notion-oauth.ts` |
| 8 | GitHub 设备授权（§2.5），收窄 `auth_kind` | 依赖 C 合入，在 4 之后 | github 包、`github-oauth.ts`、`connector-github-device.ts`、`web-connectors-settings.ts`、workbench、`connector-directory.ts` |
| 9 | 文档：§10.1、privileges（§5 的措辞）、EXTENSION-POINTS、SECURITY-INVARIANTS（拿到合批会话给的 S 号之后）、CHANGELOG | 在 3～8 之后 | `docs/`、`specs/` |
| 10 | 第二批：`MCP_SERVERS` 的数据 | 另开一片（BL-790），依赖 C 合入 | `connector-mcp.ts`、catalog 包 |

- 第 1、2 片可以和 C 并行，等增量评审过了再开。
- 第 3～8 片都碰 C 改过的连接器文件，等 C 进 main 后按表里的顺序做，每片一个 PR，交给评审会话。
- 统筹 10-27 的负载控制下，一次只跑一项重活。

## 8. 验收

| 编号 | 验收 | 怎样证明 |
| --- | --- | --- |
| RAC-1080 | 连接器方法列表（`connectors.methods.read@1`）只由登记里启用插件的声明算出，宿主里没有按服务写的 OAuth 表；输出形状不变 | 迁移前后逐个服务整份比对 `ConnectorMethodOption`；扫描宿主源码，没有 `API_OAUTH_PROVIDERS`，也不 import 插件的实现或 `cloudflare/providers.ts` |
| RAC-1081 | 下面这些声明错误都让**整份 Manifest** 抛 `plugin.declaration_invalid`，在写任何记录之前：非 https、带账号密码或端口、主机是 IP、`{setting}` 出现在主机里、平台保留的参数名、未知的 quirk、`use: "tenant"` 用在平台表里没有 `tenant` 的服务上、`{account}` 用在没有 `account_origins` 的服务上；另外，签名沙箱包里带数据的 oauth 被集成登记拒绝（§2.8） | SDK 形状检查逐条用例；`integration-registry` 的 `attach` 拒绝用例 |
| RAC-1082 | 模板展开后再查一次：tenant、slug 带 `/`、`..`、`%2f`，租户值带端口或凭据、不在 `tenant.domain` 下，kept 的 `instance_url` 不在 `tenant.domain` 下，都在发出任何请求之前拒绝；identity、context 只发往平台表定的来源；从 Manifest 来的请求都经 `sendPublicHttps` | 解释器的纯函数用例；发起授权并断言没有网络请求的用例；用假的 `sendPublicHttps` 断言每类请求都经过它 |
| RAC-1083 | 回调第 1～7 条：拒绝，不发任何请求，只写 §3.4 左边一列，右边一列一个字节不变；Host 不对时 state 不被消耗；带 `error` 的回调消耗 state；三条别名路径只收记录里的那一条；声明了 `issuer` 时 `iss` 缺了或不同都拒绝 | 安全用例（进 `test:security`）：记录令牌端点的请求次数，回调前后对比连接、凭据、protocol 配置和绑定 |
| RAC-1084 | 回调第 8、9 条：令牌请求已经发出，换到的令牌不暂存、不提交；发起之后插件停用、升级或者声明改了，这次回调拒绝 | 安全用例；Gmail 和 Notion 原来的过时回调用例改到这里 |
| RAC-1085 | 共用刷新：同一个连接只有一次刷新在途，一个参与者取消不中止别人，刷新请求发出后不因参与者走光而中止。参与者全部取消、响应回来、插件仍启用：轮换出的凭据写回原连接，别的记录一个字节不变。同样的情形下插件停用了：凭据不存；重新启用后第一次使用得到 `invalid_grant`，连接标 `reauth_required`。连接绑定的插件、发布者或端点指纹变了：不发 refresh token，标 `reauth_required` | 延续 C 给 Notion 的用例，推广到 Gmail、一个轮换 refresh token 的服务（Microsoft）和一个 catalog 服务；拒绝场景进 `test:security` |
| RAC-1086 | 设备授权：start 和 poll 缺 S-03 那三样就拒；device_code 不出现在任何响应里；`verification_uri` 不合规就终止；间隔没到的 poll 不发请求，`slow_down` 后加大间隔；每次 poll 和提交前重查第 6、7、9 条；过期、被拒、插件停用都终止，只写 §3.4 左边一列 | 安全用例加一个假的设备端点 |
| RAC-1087 | 插件拿不到 OAuth 流程里的 code、verifier、client secret 和 refresh token：Gmail、Notion、GitHub 包里没有密钥库的端口。服务换主人（官方集成停用，同一 service_id 由别的插件声明）后，产品客户端、本人的 client secret 和 refresh token 都不发往新声明的端点 | 包导入检查；换主人的拒绝用例，用一个声明了别的 `token_url` 的测试插件 |
| RAC-1088 | Alchemist 例外，**只管 OAuth 连接**：GitHub 集成插件启用时，脉冲照样带令牌；插件停用时，脉冲退回匿名，令牌不发出去。token 连接不变（BL-794） | 宿主用例，对 `api.github.com` 用假的 fetch；token 连接那一条只断言「行为和今天相同」 |
| RAC-1089 | 旧的 OAuth 连接（`auth_method: "oauth"`、没有 `connector-protocol:` 引用）直接 `reauth_required`，不发任何请求，也不走 token 分支；token 连接照旧。Gmail、Notion、GitHub 设备授权和一个 catalog 服务的完整流程（发起 → 回调 → 连接可用 → 刷新 → 重新授权）在通用流程上走通，设置页和入门流程的返回不变 | 宿主用例加端到端用例（假的提供方）；浏览器用例按 PARALLEL-DEVELOPMENT 排时段 |

## 9. 不做与后续（BL）

- **BL-790**：第二批，`MCP_SERVERS` 的数据写成 `kind: "mcp"` 的声明（§4.2）。
- **BL-791**：本地进程连接的平台服务。做完它，飞书 CLI、飞书和 Lark 的 stdio MCP、figma 的本机 MCP 才能迁（§4.3）。
- **BL-792**：向外部包放开带数据的 oauth 声明。前提有两个：
  - T1 的主人定出按签名区分的安装信任；
  - 外部包的声明必须写 `issuer`（RFC 9207）。

  在那之前按 §2.8 拒绝。
- **BL-793**：BL-690（OAuth 移走之后对 connection_methods 的检查）在第 4 片做完后重新评估。BL-694（外部的 document_import）不受本线影响。
- **BL-794**（不做，统筹 10-27 裁定）：插件停用之后，它声明的服务的 **token 连接**也不再发送。包括 Alchemist 绑的 GitHub token 连接，以及 `services.connections` 经 `resolveApiConnection` 发出的 token。今天就是照样发送，本线不放宽也不收紧；本线只收 OAuth 连接（§2.6、RAC-1088）。

BL-795～799 留空。

## 10. 问题与答复（已定）

六题都选 A。Q2、Q5 由用户本人定，Q1、Q3、Q4、Q6 由统筹定（按 10-22 的授权），日期都是 2026-10-27。另一个选项留在下面，作为备查。

- **Q1　Manifest 写不下的特殊情况，怎么办？**　**已定：A，只用数据**（统筹，10-27）。
  - A **只用数据**：§2.1 的字段覆盖今天五家的改写、三种怪癖和身份/上下文（含 `{context.*}`）。以后遇到新的特殊情况，就往平台的声明里加字段，插件里没有代码钩子。理由：这符合「缺什么补进平台」，宿主不跑插件代码。
  - B（未选）插件给一个纯函数钩子。
- **Q2　开发 Home 上已经有的 Gmail、Notion、GitHub 设备授权连接怎么办？**（它们是 `auth_method: "oauth"`，用的是 `connector-connection:<id>:access` 引用，不是通用的 protocol 形状。）　**已定：A，不写迁移**（用户本人，10-27）。
  - A **不写迁移，标成「需要重新授权」**：走现有的恢复流程（ASC-35）重连，来源的绑定保留。读取时不认 **OAuth 连接上**的旧引用；token 连接的 `connector-connection:<id>:token` 照旧（M4）。
  - B（未选）写一次性的维护脚本。
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
- **开工安排**：第 1、2 片等增量评审过了再叠在本分支上，推远端，不开 PR，回报 SHA；第 3～8 片照旧等 C 合入。

## 11. 评审建议的取舍

两轮评审的建议都采纳了，没有不采纳的：

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
