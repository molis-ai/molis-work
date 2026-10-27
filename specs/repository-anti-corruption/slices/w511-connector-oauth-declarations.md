# W5-11：连接器 OAuth 从宿主的表移进官方集成插件的声明（设计稿）

状态：设计稿，只有设计、没有代码，§10 的问题等用户定（2026-10-27，W5-11 线，分支 `claude/w511-oauth-declarations`）。§7 里标「依赖 C 合入」的片，要等批次 C（`feature/anticorruption-closeout-c`，头 `fe93d322`；Notion 共享刷新在 `009b773f`）进 main 才动手；标「可以先做」的不碰 C 改过的文件。代码事实按 main `9efbf8d04` 和 C 头 `fe93d322` 核过；文中的行号与形状都是 C 头上的。号段：RAC-1080～1089、BL-790～799。新 S 号不预先写，§3.4 里写「待统筹核」。

## 0. 已经定了的，本稿照着写

- **主人是 Manifest**（FI-3 §3.4，`feed-inbox-integration-registry.md`）。OAuth 怎样授权，写在官方集成插件 Manifest 的 `connection_services[].auth.methods` 里，基本是数据、代码很少。宿主那三张表（`API_OAUTH_PROVIDERS`、`MCP_SERVERS`、`CONNECTOR_CLIS`）都删掉。特殊情况只能写成纯数据，或者写成不碰密钥库、连接记录和路由的纯函数（选哪种见 §10 Q1）。下面几样留在平台：
  - 回调路由；
  - state 与待完成记录；
  - 凭据先暂存、最后一次检查之后再生效；
  - 连接记录；
  - client id/secret 只给引用；
  - 同一份地址检查。
- **统筹 10-26 的三条裁定**（评论 6410517262）：
  - R1：回调路径一个都不改，留在平台当通用回调，按 state 找到声明它的插件。Gmail 那条挂在 `/api/feed/…` 下的路径也保留，但它的主人登记为平台。
  - R2：飞书 CLI 和 Lark MCP 不进第一批，继续用 CALL-CHAINS §10.1 的例外，等 OAuth 这一类做完再说。
  - R3：Alchemist 登记成例外，代码不改；删掉例外的条件是「Alchemist 重做并进 Plugin Runtime」。
- **W11-1**（文档，`f51982804`）已经合入。W11-3（连接器 OAuth）原来是 Codex 的 C4，现在归这条线。C4 工单评论 6390280424 里的结论照搬：
  - 平台的 state、回调必须完全一致、密钥只给引用、连接的提交、同一份地址检查、取消和撤权的尾检，这几样都不改。
  - S-57 固定的 API 来源和 OAuth 端点是两回事，Manifest 的声明哪一个都不放宽。
  - R-48 归 ac-kernel/PG-045；T1 安装信任归它的主人，本线不定新的信任策略。

## 1. 今天是什么样（C 头）

### 1.1 一套通用引擎，加三套专门流程

- **通用引擎**：`apps/local-host/src/connector-api-oauth.ts`（325 行）。
  - 数据是 `connector-api-oauth-providers.ts` 里的 `API_OAUTH_PROVIDERS`，约 38 项。每项有 `authorize`、`token`、`scope`、`pkce?`、`auth?: basic|post`、`format?: json|form`、`optionalSecret?`、`refresh?`、`parameters?`、`fields?`、`note?`，另有 `google()`、`microsoft()`、`atlassian()` 三个帮手。
  - `apiOAuthProvider(service, settings)` 用代码改写五家：
    - cloudflare：在 scope 后追加 `api_scopes`，只收 `*.read`；`client_auth` 可选 basic、post 或 none。
    - stripe：`stripe_scope` 只能是 read_only 或 read_write。
    - Microsoft：`tenant` 替换路径里的 `/common/`。
    - salesforce：`login_origin` 换掉来源，必须是 https，主机名以 `salesforce.com` 结尾，不带凭据或端口。
    - vercel：在路径后追加 `integration_slug` 和 `/new`。
  - `startApiOAuth` 先查本机来源和 `checkConnectorSetupSubmission`，再按顺序选客户端：重新授权时沿用原来的客户端，然后是产品 broker（`connectorBrokerOrigin`），然后是产品客户端（`connectorProductAuth`，读环境变量 `CONNECTOR_<SVC>_OAUTH_*`），最后是本人填的客户端。接着用 `withConnectorProtocols(store.begin(origin, configuration))` 拿 state，走 PKCE S256。
  - `exchange` 有两处怪癖：gitlab 刷新时要带 `redirect_uri`；clickup 不带 `grant_type` 和 `redirect_uri`。
  - `expiry` 对 monday 读 JWT 的 `exp`。
  - `enrichContext` 做两类事：
    - 从令牌响应里留下 workspace_id、sentry 的用户 id、salesforce 的 `instance_url`（会校验）和 vercel 的 team_id；
    - 另发请求：clickup 和 supabase 列出已授权的 workspace；jira 和 confluence 取 accessible-resources，按站点对上，得到 cloud_id 和 base。
  - `apiOAuthIdentity` 取身份：Google 系用 userinfo（取 `sub`）；catalog 的服务调 catalog 包里的 `catalogWhoami` 代码；Gmail 和 GitHub 用 `/user`。
  - `completeApiOAuth`：
    - 先 `store.consume(state, origin)`，返回的 redirect 必须等于 `config.redirectUri`；
    - 同一个连接串行执行；
    - 网络等待的前后各做一次 `assertConnectorAuthorizationPending`；
    - 重新授权时查 revision，并要求 account_id 不变；
    - 最后经 `submitConnectorActivation` 提交。
  - `resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl)`：同一个连接的刷新串行，保存前再查一次 revision。
- **三套专门流程**：
  - **Gmail**：路由是 `gmail/client` 和 `gmail/oauth/start`，回调 `/api/feed/connectors/gmail/oauth/callback`（`connector-oauth-callbacks.ts`）。
    - 带入门流程（onboarding）的返回。
    - 重新授权要求邮箱相同。
    - 凭据经 `createOAuthCredentialStage` 生效。
    - 插件端的 `createGmailOAuth({secrets, hasSecret, environment})` 拿到了宿主的密钥库，违反「纯函数不碰密钥库」。
    - 客户端的引用是 `connector:gmail:client_id/client_secret`，环境变量是 `MOLIS_WORK_GMAIL_CLIENT_ID/SECRET`。
    - redirect 允许在回调前面多一段编码过的项目路径。
  - **Notion**：路由 `notion/oauth/start`，回调 `/api/settings/connectors/notion/oauth/callback`。
    - 走 `completeNotionOAuth`，重新授权要求 workspace 相同。
    - C 给刷新加了参与者集合（`notionRefreshParticipants`）：一个调用方取消，不会中止别的调用方。
  - **GitHub 设备授权**：路由 `github/client`、`github/device/{start,poll}`（`web-connectors-settings.ts`）。
    - `createGithubDeviceFlow`，引用 `connector:github:client_id`，环境变量 `GITHUB_CLIENT_ID`（插件里的报错文字写的是 `MOLIS_WORK_GITHUB_CLIENT_ID`，两处不一致）。
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

被拒时经 `markRefreshRefused` 记在连接上。`inspectApiConnection` 用 `catalogWhoami` 查身份，遇到 401 刷新一次（S-70）。

### 1.3 方法列表来自宿主的表

- `host-connector-methods.ts` 的 `connectorMethodsFor` 把三张表并成 `ConnectorMethodOption`，经 `connectors.methods.read@1` 给设置页。
- 合同里，非 token 的方法今天只有 `{ kind }`；SDK 的 `methodProblems` 拒绝任何多写的字段（「现在只写 kind，数据仍在平台的表里」）。
- `ConnectorAuthKind` 里有 `github | gmail | notion | feishu | token | none`。workbench 的 `settings-view.ts` 和宿主的 `connector-directory.ts`、`platform-connection-services.ts` 都按它分支。

### 1.4 C 定下的形状，本稿不改

- `ConnectorCallControl { signal; beforeEffect(); current() }` 是必传参数，贯穿驱动、提供方和刷新。
- SDK 有 `controlledConnectorFetch(fetchImpl, control)`（`packages/plugin-sdk/src/connector-call.ts`）。
- `connectorAccountControl(home, connectionId, caller)` 在 `connector-oauth-targets.ts`。
- 本稿所有新的网络请求都经 `controlledConnectorFetch` 发出，提交前调 `beforeEffect()`。

## 2. 设计：声明式的 OAuth 方法

### 2.1 Manifest 里的 `kind: "oauth"`

`PluginAuthMethodDeclaration` 的 oauth 一员加下面的字段，都是数据。写法在 `packages/contracts/src/platform/plugin-integrations.ts`，检查在 SDK 的 `integration-declarations.ts`，由同一份 `connectionMethodProblems` 读：

| 字段 | 意思 | 收什么 |
| --- | --- | --- |
| `grant` | `"authorization_code"` 或 `"device"`（§2.5） | 必填 |
| `authorize_url`、`token_url`、`refresh_url?`、`device_authorization_url?` | 端点 | https，主机是公网名，来源必须在本方法的 `origins` 里 |
| `origins` | 本方法会发请求的来源（授权、令牌、刷新、身份、上下文） | 与 S-95 的 `origins` 同一套检查：https、公网名，至多 8 个；另可写一条 `origin_setting`（见下） |
| `scopes` | 要的权限 | 字符串数组；可以写 `{setting}` |
| `pkce` | `"S256"` 或不写 | 只收 S256 |
| `client_auth` | `"basic"`、`"post"` 或 `"none"` | 默认 post |
| `token_format` | `"form"` 或 `"json"` | 默认 form |
| `client_secret` | `"required"` 或 `"optional"` | 默认 required |
| `parameters` | 授权地址上固定的参数（如 `audience`、`owner=user`、`access_type=offline`） | 键值都是字符串；不许写 `client_id`、`redirect_uri`、`state`、`code_challenge*`、`response_type`，这几个由平台写 |
| `settings` | 本人在设置里填的字段 | `{ key, label, placeholder?, required?, use, pattern? 或 enum? }`；`use` 只能是 `path`、`scope`、`client_auth`、`origin` 之一 |
| `origin_setting` | 只给 salesforce 这类登录来源由本人给的 | `{ key, host_suffix }`；值必须是 https、不带凭据或端口、主机以 `host_suffix` 结尾且是公网名；`host_suffix` 至少两段、不能是公共后缀本身 |
| `identity` | 怎样取账号 | `{ url, account_id, label? }`；`account_id` 和 `label` 是 JSON 指针，或几个指针（用 `:` 连起来），来源可以是 `identity` 响应，也可以是 `token` 响应 |
| `keep` | 从令牌响应里留进连接上下文的字段 | `{ key, pointer, check }`；`check` 只能是 `origin`（再过一遍地址检查）或 `pattern` |
| `context` | 授权后另发的只读请求 | `{ key, url, pick }`；`pick` 是「取列表」或「按某个 setting 对上一项再取指针」（atlassian 的站点） |
| `quirks` | 已知的三种怪癖 | `refresh_redirect_uri`（gitlab）、`omit_token_params: ["grant_type","redirect_uri"]`（clickup）、`expiry: "jwt_exp"`（monday）；只收这几个值 |
| `note` | 设置页的一句说明 | 字符串 |

`{setting}` 只能出现在路径段和 scope 里，不能出现在主机名里；要换来源只能用 `origin_setting`。平台把模板展开后再做一遍地址检查（S-09、S-10），展开的结果必须落在 `origins` 或 `origin_setting` 允许的范围里。`use: "path"` 的值按 `pattern` 校验，并按路径段编码，不能带 `/`、`..` 或 `%2f`。

**检查不过就不登记这个方法**，并留一条诊断，这一点沿用 FI-3 §3.4。同一个 service 的别的方法照常可用；这和 S-95 对 `origins` 的做法一样。

### 2.2 平台只有一个解释器

- 新的解释器放在宿主的连接器 OAuth 一处，替换 `apiOAuthProvider` 和 `connector-api-oauth.ts` 里按 service 分支的代码。具体放哪个文件，实现时按大单元门禁定（`connector-api-oauth.ts` 已经 325 行，拆成「声明展开」和「授权流程」两块）。
  - 输入是登记里本方法的当前声明，加上本人的 settings。
  - 输出是授权地址、令牌请求、刷新请求、身份与上下文请求。
- 宿主不 import 任何插件的实现。今天的 `catalogWhoami`、`notionAuthorizationUrl`、`notionOAuthToken`、`createGmailOAuth`、`createGithubDeviceFlow` 都不再被宿主引用；catalog 的 `CatalogConnectorSpec.identity` 从代码（`request(ctx) / read`）改成 §2.1 的 `identity` 数据。
  - catalog 里共 40 处 `identity:`；`read` 能不能都写成指针，实现第一片先数清。写不成的记在本稿，按 Q1 的选择办。
- `ConnectorMethodOption` 的形状和 `connectors.methods.read@1` 的输出不变：`client_secret_required`、`fields`、`note`、`login_ready` 都改由声明算出。

### 2.3 客户端凭据还是平台的

插件只声明公开的数据。客户端还是今天这四种来源，按今天的顺序选：

1. 重新授权沿用原来的客户端；
2. 产品 broker；
3. 产品客户端（环境变量）；
4. 本人填的客户端。

client id 和 secret 只以引用存在平台的密钥库里（S-12），插件既拿不到 id/secret，也拿不到令牌。

环境变量名统一成 `CONNECTOR_<SVC>_OAUTH_CLIENT_ID/SECRET/<FIELD>`。Gmail 的 `MOLIS_WORK_GMAIL_CLIENT_*` 和 GitHub 的 `GITHUB_CLIENT_ID` 改名，不留旧名（见 Q5）。`productApiLoginReady` 里 intercom 的特例改成声明里的 `client_secret`。

### 2.4 Gmail 和 Notion 并进通用流程

- **Gmail**：声明一个 Google 的 oauth 方法，`identity` 取 `sub` 当 account_id、`email` 当 label。
  - 重新授权要求 account_id 不变，这是通用规则。今天按邮箱判断「是不是同一个账号」，改成按 `sub`，更严。
  - 入门流程的返回不是插件的事，由发起授权的入口写进 state 的 `return_to`（`settings` 或 `onboarding`），回调按它跳回。
  - redirect 允许带项目路径段，这条规则留在平台的别名表里（§3.1），插件不写。
  - 插件端删掉 `oauth.ts`、`oauth-configuration.ts`、`oauth-pending.ts`、`oauth-token-lifecycle.ts` 和 `token-refs.ts`，也就不再拿宿主的密钥库。
- **Notion**：声明 basic、json、`owner=user`，`keep` 留下 `workspace_id`，account_id 取 `/workspace_id`，label 取 `/workspace_name`。
  - 重新授权要求 workspace 相同，正好是 account_id 不变。
  - catalog 包删掉 `notion-oauth.ts`。
  - C 的不变量（一个调用方取消，不中止共用同一次刷新的别的调用方）挪到通用刷新上，由 RAC-1085 钉住（§2.6）。
- 待完成记录只剩通用的 protocol store。`connector-oauth-targets.ts` 里的 `Service` 和 `connector:<svc>:oauth:connection-target:` 前缀，以及 `connector:gmail:oauth:pending`，都删掉；`oauthRefreshGuard`、`oauthConnectionRefs` 并进通用刷新。`connectorAccountControl` 不动，C 的调用方照旧用它。

### 2.5 GitHub 设备授权成为平台的一种 grant

- 声明写成 `grant: "device"`：`device_authorization_url`、`token_url`、`scopes`、`identity`（`/user` 的 `id` 和 `login`）。
- 平台按 RFC 8628 实现一份，路由是通用的 `/api/settings/connectors/methods/device/start` 和 `…/device/poll`，替换 `github/device/*` 与 `github/client`。
  - 两条都是 S-03 的变更请求（Origin、控制令牌、一次性键）。
  - device_code 只存在平台的待完成记录里，绑定同 §3.2；页面只拿到 `user_code`、`verification_uri` 和平台给的 poll 句柄。
  - poll 按响应里的 `interval` 限速，`slow_down` 时把间隔加大；过期或被拒都终止，不写任何记录。
- GitHub 的 web 授权码方法（`API_OAUTH_PROVIDERS.github`）同时声明，两种 grant 并列，设置页照今天列出来。

### 2.6 刷新与调用控制

- `resolveApiConnection` 收成三支：
  1. cli（飞书，例外）；
  2. OAuth：读登记里声明这个连接的插件的当前声明，交给通用刷新；
  3. token。
  按服务写的 Notion 和 Gmail 两支删掉。
- 签名不变：`resolveApiOAuthToken(home, id, control, forceRefresh, fetchImpl)`，C 的调用方一处不改。
- **共用的刷新**：同一个连接同时只有一次刷新在途，等它的调用方是一个参与者集合。
  - 一个参与者取消，只把自己移出集合；
  - 最后一个参与者取消，网络请求才中止；
  - 结果在 `beforeEffect()` 之后，按读取时的 revision 提交。
  这就是 C 在 `009b773f` 给 Notion 做的那套，推广到所有 OAuth 连接。今天通用引擎的 `serialized` 只是排队，换成这套。
- **声明它的插件没启用**（停用、卸载、声明不过检查）时，刷新和发送都拒绝，用一个新的错误码（主人名按 `tooling/gates/error-owners.json` 给这个文件的，用 `defineErrorCodes` 声明，名字实现时定），不发出任何请求。连接显示「方法不可用」，重新启用后恢复。见 Q3。
- 发送边界不变：凭据只发往第一次绑定的来源（S-12），401 只刷新一次（S-70），`redirect: "error"`。

### 2.7 `auth_kind` 收窄

`ConnectorAuthKind` 去掉 `github`、`gmail`、`notion`，留下 `feishu`（CLI 例外）、`token`、`none`，再加 `oauth`。下面这些地方按服务分支的写法，改成按方法种类：

- `settings-view.ts`；
- `connector-directory.ts`（用 `GITHUB_CLIENT_ID_REF` 和 `readProductEnv("GITHUB_CLIENT_ID")` 判断已就绪）；
- `platform-connection-services.ts`；
- catalog 生成 Manifest 的 `catalogIntegrationManifest`（今天 notion→notion）；
- gmail 和 github 的 `manifest.json`。

## 3. 通用回调：路由、绑定与拒绝

### 3.1 路径

| 路径 | 今天谁用 | 以后 |
| --- | --- | --- |
| `/api/settings/connectors/methods/oauth/callback` | 通用引擎，broker 回到同一路径 | 平台的通用回调 |
| `/api/settings/connectors/notion/oauth/callback` | Notion | 平台的别名，主人是平台（R1） |
| `/api/feed/connectors/gmail/oauth/callback`（可带一段项目路径） | Gmail | 平台的别名，主人是平台（R1） |
| `/api/settings/connectors/methods/mcp/callback` | MCP 的授权 | 第二批再看（§4.2），本批不动 |

三条路径进同一个处理器，**按 state 找到待完成记录，不按路径找插件**。别名只在一种情况下收：这条路径（含项目段）正好等于该记录里存的 `redirect_uri`。路径和 state 对不上，就按「redirect 不符」拒绝。为什么留别名：已经在 Google、Notion 控制台登记的 redirect URI 不用改（R1）。

### 3.2 state 绑了什么

- **state 本身**：平台用 CSPRNG 生成，至少 128 位，格式沿用 `STATE`。只能用一次：`consume` 是原子的，先删后用。TTL 10 分钟。
- **待完成记录**存在平台的 protocol store，记下：
  - 发起时的本机来源（origin）和 `redirect_uri`；
  - 插件：`plugin_id`、安装代次（install generation）、发布者；
  - `service_id`，以及本方法声明的指纹（规范化后的哈希）；
  - 连接目标：新建，或重新授权某个连接及其 revision；
  - 发起它的设置提交（`checkConnectorSetupSubmission` 的结果）和 `return_to`；
  - PKCE verifier、客户端来源（product、broker 或 custom）、展开后的 settings。
- **发起**（`…/oauth/start`）是 S-03 的变更请求，要 Origin、控制令牌和一次性键。
- **回调**是浏览器跳回来的 GET，没有 S-03 那三样，但必须同时满足两条：
  - Host 是本机回环地址，且等于记录里的来源（S-09 的同一份判断）；
  - 查询里有 state 和 code，没有 `error`。

### 3.3 拒绝（每一条都不发令牌请求、不写任何业务记录）

1. state 格式不对、不存在、已经用过（重放）。
2. 过期（超过 TTL）。
3. Host 不是回环地址，或和记录里的来源不同。
4. 回调路径（含项目段）不等于记录里的 `redirect_uri`。
5. 查询里有 `error`，或者缺 code。
6. 声明它的插件现在没启用，或安装代次、发布者变了（停用、卸载、升级、撤权）。
7. 本方法声明的指纹和记录里的不同：发起之后 Manifest 改了。
8. 重新授权时连接的 revision 变了，或者换回来的 account_id 不是原来的账号。
9. 等网络期间被取消或撤权：今天的 `assertConnectorAuthorizationPending` 前后两次检查，加上 `ConnectorCallControl.beforeEffect()`。

令牌请求本身同样要经过两道检查：声明的地址检查，以及最后发送前按 DNS 固定的检查（S-10），并且 `redirect: "error"`。提交只经 `submitConnectorActivation`，凭据先暂存，最后一次检查之后才生效（`connector-oauth-commit.ts`）。插件从头到尾看不到 code、令牌和 client secret。

### 3.4 安全不变量

| 编号 | 内容 | 断言拒绝的测试 |
| --- | --- | --- |
| 新 S（待统筹核） | 连接器 OAuth 的端点、身份与上下文请求只来自启用中的插件声明，并且都在声明的 `origins` 或 `origin_setting` 里；模板展开后再检查一次；声明不过检查，这个方法就不登记 | RAC-1081、RAC-1082 |
| 新 S（待统筹核） | 通用回调按 state 找记录，state 只能用一次、10 分钟过期，并绑定来源、redirect、插件与安装代次、声明指纹和连接目标；§3.3 的每一条都拒绝，且不发令牌请求、不写记录 | RAC-1083、RAC-1084 |
| 新 S（待统筹核） | 设备授权的 device_code 只在平台里；start 和 poll 是 S-03 的变更请求；过期、被拒或插件停用都终止，不写记录 | RAC-1086 |
| S-37（改证据列） | OAuth 的取消、过时的回调、固定的 revision：Gmail 和 Notion 的用例改成通用回调上的同一组 | RAC-1084、RAC-1085 |
| S-12（改证据列） | 凭据只发往第一次绑定的来源；插件拿不到客户端凭据，也拿不到令牌 | RAC-1087 |
| S-09 | 回调的 Host 判断用同一份 `isLoopbackHostname` | RAC-1083 |
| S-69/S-70 | 不变，只改证据列里的文件名 | 现有用例 |

三个新 S 号合成一条还是分成三条，由统筹看在途 PR 之后定。

## 4. 第一批迁哪些，不迁哪些

### 4.1 第一批

- **catalog 包生成的全部 API OAuth 服务**，即今天 `API_OAUTH_PROVIDERS` 的条目。数据从宿主移进 catalog 包，由 `catalogIntegrationManifest` 写进各自的 Manifest：
  - Google 系：gmail、google-calendar、google-drive；
  - Microsoft 系：outlook、onedrive、sharepoint、teams；
  - 其余：dropbox、box、notion、slack、discord、feishu 的 OAuth、lark 的 OAuth、zoom、gitlab、bitbucket、vercel、cloudflare、huggingface、sentry、supabase、linear、jira、confluence、asana、clickup、monday、airtable、figma、canva、adobe、salesforce、hubspot、intercom、stripe、x、linkedin。
  - gmail 和 github 自己有 `manifest.json`，数据直接写在那里。
- **Gmail 专门流程**：并进通用流程（§2.4）。
- **Notion 专门流程**：并进通用流程（§2.4）。
- **GitHub 设备授权**：成为平台的 device grant（§2.5）。
- 删掉 `connector-api-oauth-providers.ts`、`gmail-oauth.ts`、`github-oauth.ts`、`notion-oauth.ts`，以及 `web-connectors-settings.ts` 里的 `notion/oauth/start`、`github/*`、`gmail/*` 路由，`connector-oauth-callbacks.ts` 并进通用回调。

### 4.2 第二批（另开一片，见 Q4）

`MCP_SERVERS` 里约 40 项远程 MCP 的数据（endpoint、auth、registration、endpointPattern、tokenScheme），写成 `kind: "mcp"` 的声明，`connector-mcp.ts` 的表删掉。标了 `stdio:true` 的飞书和 lark 除外。figma 的本机 `127.0.0.1:3845` 也要单独定：本机地址不能过公网的地址检查，跟着 4.3 的本地进程一起处理。

### 4.3 不在第一批，原因

- **飞书 CLI（`CONNECTOR_CLIS`）、飞书和 Lark 的 stdio MCP**：它们不是网络授权，是在本机起一个进程或二进制。
  - 密钥在 CLI 自己的状态里，平台只能引用（受管 CLI 的私有状态，S-12）。
  - 安装和启动 CLI 是 S-37 和受管二进制的边界，不是 OAuth 的 state 和回调。
  - 要迁，得先有一份平台服务管「本地进程连接」（声明二进制、版本、参数、私有状态目录，以及谁能启动），这份服务今天没有。
  - 所以继续用 CALL-CHAINS §10.1 的例外（R2），后续记成 BL-791。
- **figma 的本机 MCP**：同上，本机来源。
- **Alchemist 的 GitHub 脉冲**：见 §5。

## 5. Alchemist 例外

- **今天怎样用 OAuth**：`apps/local-host/src/alchemist-pulse-github.ts` 以 `SCOPE="home"`、`CONSUMER="alchemist"`、`SLOT="pulse-github"`，经 `store.binding` 绑定一个 GitHub 连接（令牌或 OAuth）。
  - `boundToken` 调 `resolveApiConnection(home, id, connectorAccountControl(...), "github")`，C 只给它加了 control 参数。
  - 只给 `https://api.github.com` 加 Bearer；出错就退回匿名，并记一行宿主日志。
  - 它不发起授权，也没有自己的回调，只是宿主里一个 Home 级的消费者直接取令牌。
- **这一轮**：代码不改（R3，用户 10-21 定、BL-376：不迁移，防腐收尾之后删掉重做）。
  - §2.6 之后，它取令牌走通用刷新。GitHub 集成插件没启用时被拒，沿用它现在的退回匿名，这一点由 RAC-1088 钉住。
  - 不删 Alchemist，也不删创作台。
- **例外到什么时候**：Alchemist 重做、进 Plugin Runtime，并经 `services.connections` 的槽（S-57）拿连接为止（BL-376）。到那天删掉这一行例外，以及 `resolveApiConnection` 里还收的 `service` 参数。
- **措辞要改的地方**：
  - `privileges.md` PG-045 第 218 行，句尾改成「OAuth 的数据与流程已由 W5-11 移进集成插件的声明；Alchemist 的 GitHub 脉冲仍在宿主里直接取令牌，不迁（用户 10-21，BL-376），等它重做进 Plugin Runtime、经 `services.connections` 拿连接时删掉」。
  - PG-092 第 288 行加同样的一句。
  - `docs/system/CALL-CHAINS.md` §10.1 第 278 行：「按服务的 OAuth（Gmail、GitHub、Notion、飞书）」改成只剩「飞书 CLI 与 stdio MCP（R2）」和「Alchemist 脉冲（R3）」两行，各写删除条件。
  - `docs/system/EXTENSION-POINTS.md` F3「自带 OAuth」从 12 改成 1，剩下的那个是 Alchemist。

## 6. 合同变更、读取兼容与快照

### 6.1 合同

按 `docs/system/CONTRACT-CHANGES.md` 第一阶段办：没有兼容期，所有消费者在同一个 PR 里一起改。

- `packages/contracts/src/platform/plugin-integrations.ts`：oauth 一员加 §2.1 的字段，加 `grant: "device"`。
- `packages/contracts/src/services/connector-host.ts`：`ConnectorAuthKind` 收窄（§2.7）。
- SDK `integration-declarations.ts`：`methodProblems` 从「只写 kind」改成按 §2.1 检查；`AUTH_KINDS` 跟着合同改。SDK 算共享核心，改它要按共享核心跑全量（见 §7 第 9 片）。
- 读取不兜底：
  - 旧形状的 Manifest（只有 `{kind:"oauth"}`）不会出现：内置插件在同一个 PR 里改，外部插件今天进不了集成登记（BL-530 只先做 `source`，且不声明 oauth）。
  - 存量连接按 Q2 处理，读取时不认旧的 `connector-connection:` 引用。
- 新错误码都用 `defineErrorCodes` 声明，不新写 Error 子类。
- `docs/releases/CHANGELOG.md` 的 `[Unreleased]`「升级须知」写一条：
  - Gmail、Notion、GitHub 设备授权的连接要重新授权（若 Q2 选 A）；
  - 产品客户端的环境变量改名（若 Q5 选 A）。

### 6.2 快照与名字

- **API 快照**（`pnpm api:update`）：`tooling/gates/api/contracts/platform/plugin-integrations.txt`、`…/services/connector-host.txt`，以及 SDK 的快照。
- **动作快照**（`pnpm actions:update`）：
  - `connectors.methods.read@1` 和 `connectors.setup.*` 的输出形状按 §2.2 不变，预计快照不动；如果动了，按 CONTRACT-CHANGES 升 `version`。
  - 设备授权的两条新路由只是设置页用的 HTTP，不注册成动作（今天的 `github/device/*` 也不是动作）。
- **MCP 工具名**：不变。没有新动作，`connectors.*` 的名字一个不改。
- **Manifest 的 `version`**：不改。CONTRACT-CHANGES 写明内置插件的 Manifest 跟宿主的版本走，本线不改版本号。
- **路由**：
  - `github/device/*`、`github/client`、`gmail/client`、`gmail/oauth/start`、`notion/oauth/start` 删掉，换成通用的 `methods/oauth/start` 和 `methods/device/*`。workbench 里调它们的地方同一个 PR 改。
  - 三条回调路径不变（§3.1）。

### 6.3 测试清单

- **要改的**（今天按服务写的用例，改成在通用流程上断言同一件事）：
  - `connector-api-oauth`、`connector-oauth-choice`、`connector-oauth-broker`；
  - `gmail-oauth`、`gmail-factory-boundaries`（第 153、181 行写着 W5-11）；
  - `github-device-flow`、`connector-connections`（Gmail 和 Notion 的过时回调）；
  - `connector-authorization-recovery`（ASC-35）、`connector-reconnect-regressions`、`connector-setup`、`connectors-settings-behaviors`、`context-onboarding`（Gmail 入门的返回）；
  - `connector-provider-contracts`、`integration-registry`、`plugin-global-settings`；
  - `security-invariants-connection-refresh`、`security-invariants-connector-intent`、`security-invariants-connection-services`（第 60 行写着 W5-11）、`security-invariants-call-connections`；
  - `connector-call-control`、`catalog-connectors`、`catalog-trust-boundaries`、`feed-connectors`；
  - `artifact-document-import`、`sandbox-integration`、`sandbox-integration-home`（只改 `auth_kind` 的写法）。
- **新加的**：§8 每个 RAC 号一组，拒绝类的进 `pnpm test:security`。
- 代码注释里写着 W5-11 的地方，做完时一起改掉：
  - `host-connector-methods.ts:51`
  - `sandbox-package.ts:144`
  - `plugin-integrations.ts:22`
  - `github/src/index.ts:49`
  - `gmail/src/index.ts:52`

## 7. 切片顺序

| # | 片 | 前提 | 碰的文件 |
| --- | --- | --- | --- |
| 1 | 合同加字段、SDK 检查、平台解释器的纯函数部分（模板展开、地址检查、令牌请求的组装），只用夹具测试；不接路由，不删表 | **可以先做** | `packages/contracts` 的 `plugin-integrations.ts`、SDK 的 `integration-declarations.ts`、宿主里一个新文件；C 没碰这几处（`plugin-integrations.ts` 只改注释，会在合并时对齐） |
| 2 | 数 catalog 的 `identity.read`，写成数据；写不成的记下来（Q1） | **可以先做**（只读 catalog 包，产出写进本稿） | 无代码 |
| 3 | 通用回调与 state 绑定（§3），待完成记录合成一份 | 依赖 C 合入 | `connector-api-oauth.ts`、`connector-oauth-targets.ts`、`connector-oauth-callbacks.ts`、`web-connector-api-methods.ts` |
| 4 | catalog 与 github web 的数据写进 Manifest，删 `API_OAUTH_PROVIDERS`，`connectorMethodsFor` 改读登记 | 依赖 C 合入 | catalog 包、`host-connector-methods.ts`、`connector-product-auth.ts` |
| 5 | 共用刷新推广到所有 OAuth 连接，`resolveApiConnection` 收成三支（§2.6） | 依赖 C 合入（C 的 `009b773f`） | `connector-access.ts`、`connector-api-oauth.ts`、`notion-oauth.ts` |
| 6 | Gmail 并进通用流程 | 依赖 C 合入，且在 3、5 之后 | gmail 包、`gmail-oauth.ts`、入门流程 |
| 7 | Notion 并进通用流程 | 依赖 C 合入，且在 3、5 之后 | catalog 包、`notion-oauth.ts` |
| 8 | GitHub 设备授权（§2.5），收窄 `auth_kind` | 依赖 C 合入，且在 4 之后 | github 包、`github-oauth.ts`、`web-connectors-settings.ts`、workbench、`connector-directory.ts` |
| 9 | 文档、§10.1、privileges、EXTENSION-POINTS、SECURITY-INVARIANTS（拿到统筹给的 S 号后）、CHANGELOG；跑共享核心的全量 | 在 3～8 之后 | `docs/`、`specs/` |
| 10 | 第二批：`MCP_SERVERS` 的数据（§4.2） | 另开一片，依赖 C 合入 | `connector-mcp.ts`、catalog 包 |

1、2 可以和 C 并行。3～8 都碰 C 改过的连接器文件，等 C 进 main 后按上表的顺序做，每片一个 PR，交给评审会话。

## 8. 验收

| 编号 | 验收 | 怎样证明 |
| --- | --- | --- |
| RAC-1080 | 连接器方法列表（`connectors.methods.read@1`）只由登记里启用插件的声明算出，宿主里没有按服务写的 OAuth 表；输出形状不变 | 整份比对迁移前后每个服务的 `ConnectorMethodOption`；门禁扫描宿主源码里没有 `API_OAUTH_PROVIDERS`，也不 import 插件的实现 |
| RAC-1081 | 声明检查：非 https、私网或本机主机名、端点不在 `origins` 里、`{setting}` 出现在主机名、平台保留的参数名、`origin_setting` 的后缀太宽、未知的 quirk，都让这个方法不登记，并留诊断；同一 service 的别的方法照常可用 | SDK 检查的逐条用例，加登记的集成用例 |
| RAC-1082 | 模板展开后再检查一次：tenant、slug 带 `/`、`..`、`%2f`，login_origin 带端口、凭据，或主机后缀对不上，都在发出任何请求之前拒绝 | 解释器的纯函数用例，加一个启动授权、断言没有网络请求的用例 |
| RAC-1083 | 回调：state 格式不对、未知、重放、过期，Host 不是回环地址或和来源不同，路径和 redirect 不符，带 `error`，都拒绝，不发令牌请求、不写记录；三条别名路径只收存在记录里的那一条 | 安全用例（进 `test:security`），记录令牌端点的请求次数并扫描 Home 里的写入 |
| RAC-1084 | 发起之后插件停用、卸载、升级或者声明改了，这次回调拒绝，不写记录；重新授权时 revision 变了，或者账号不同，拒绝 | 安全用例；Gmail 和 Notion 原来的过时回调用例改到这里 |
| RAC-1085 | 共用刷新：同一个连接只有一次刷新在途；一个参与者取消不中止别人；最后一个参与者取消才中止请求；提交前查 revision | 延续 C 给 Notion 的用例，推广到 Gmail 和一个 catalog 服务 |
| RAC-1086 | 设备授权：start 和 poll 缺 S-03 那三样就拒；device_code 不出现在任何响应里；`slow_down` 时加大间隔；过期、被拒、插件停用都终止，不写记录 | 安全用例，加一个假的设备端点 |
| RAC-1087 | 插件拿不到客户端凭据和令牌：Gmail、Notion、GitHub 包里没有密钥库的端口；集成插件的 binding 只有引用；凭据只发往第一次绑定的来源 | 包导入检查，加 S-12 的扫描用例 |
| RAC-1088 | Alchemist 例外：GitHub 集成插件启用时，脉冲照样带令牌；插件停用时，脉冲退回匿名，并且不把令牌发出去 | 宿主用例，对 `api.github.com` 用假的 fetch |
| RAC-1089 | Gmail、Notion、GitHub 设备授权和 catalog 服务的完整流程（发起 → 回调 → 连接可用 → 刷新 → 重新授权）在通用流程上走通，设置页和入门流程的返回不变 | 端到端用例用假的提供方；浏览器用例按 PARALLEL-DEVELOPMENT 排时段 |

## 9. 后续（BL）

- **BL-790**：第二批，`MCP_SERVERS` 数据写成 `kind: "mcp"` 的声明（§4.2）。
- **BL-791**：本地进程连接的平台服务。做完它，飞书 CLI、飞书和 Lark 的 stdio MCP、figma 本机 MCP 才能迁（§4.3）。
- **BL-792**：catalog 里写不成数据的 `identity.read`（§7 第 2 片的结果；如果数出来是 0，删掉这一行）。
- **BL-793**：BL-690（OAuth 移走之后对 connection_methods 的检查）在本线第 4 片做完后重新评估；BL-694（外部的 document_import）不受本线影响，本线只把 OAuth 移出宿主，不移文档读取。

BL-794～799 留空。

## 10. 要问用户的问题

每题第一个选项是推荐。

- **Q1　Manifest 写不下的特殊情况，怎么办？**
  - A（推荐）**只用数据**：§2.1 的字段覆盖今天全部五家改写、三种怪癖和身份/上下文；以后再遇到新的特殊情况，就往平台的声明里加字段，插件里没有代码钩子。好处是宿主不跑插件代码，审一份数据就够。
  - B　插件可以给一个纯函数钩子（只拿响应、返回字段，不碰密钥库、记录和路由）。写起来更灵活，但宿主要执行插件代码，外部插件得进沙箱才能用，审查也更难。
- **Q2　开发 Home 上已经有的 Gmail、Notion、GitHub 设备授权连接怎么办？**（它们用的是 `connector-connection:<id>:*` 引用，不是通用的 protocol 形状。）
  - A（推荐）**不写迁移，标成「需要重新授权」**：用现有的恢复流程（ASC-35）重连，来源的绑定保留。CONTRACT-CHANGES 的读取兼容从第一个装到开发机之外的版本才开始算；这台机器上没有真实 Home。
  - B　写一次性的维护脚本，把引用改成新形状。这要先写进 `specs/repository-anti-corruption` 的保留机制，经你确认。
- **Q3　声明它的插件停用了，已有的 OAuth 连接怎么办？**
  - A（推荐）**刷新和发送都拒**，连接显示「方法不可用」，重新启用就恢复；Alchemist 退回匿名。
  - B　按停用前最后一份声明的快照继续刷新。但这样停用插件就没有实际效果，而且声明的主人已经不在了。
- **Q4　`MCP_SERVERS` 的数据放在同一片，还是第二批？**
  - A（推荐）**第二批另开一片**（BL-790）：MCP 有动态客户端注册和自己的回调，混进来会让第一批的评审和回归变大。
  - B　和第一批一起做，一次把三张表里的两张删掉。
- **Q5　产品客户端的环境变量统一改名吗？**
  - A（推荐）**统一成 `CONNECTOR_<SVC>_OAUTH_CLIENT_ID/SECRET`**：`MOLIS_WORK_GMAIL_CLIENT_*` 和 `GITHUB_CLIENT_ID` 不留旧名，在 CHANGELOG 写升级须知。今天 GitHub 的报错文字和代码读的变量名已经不一致。
  - B　保留这两组旧名，平台多认这两个特例。
- **Q6　Gmail 判断「重新授权是同一个账号」，从按邮箱改成按 Google 的 `sub`，可以吗？**
  - A（推荐）**按 `sub`**：和通用规则一致，邮箱改名也不会把账号认错。
  - B　Gmail 保留按邮箱。这样声明里就要多一个字段：「重新授权时比较的指针」。
