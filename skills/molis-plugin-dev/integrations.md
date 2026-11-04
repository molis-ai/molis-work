# 接入：外部世界

Integration Plugin 把外部协议变成 Connector + Signal。Host 不写 GitHub/Gmail 分支。Feed 只消费已经变成 Item 的结果。账号设置可挂 `workbench.settings`；来源任务、立刻拉取、token、计划留在 Feed，不进 `feed.capture`。

## 形态

用 `definePollingIntegrationPlugin`：

```ts
export function createGithubIntegrationPlugin(input: { providerFor(binding: IntegrationBinding): IntegrationProviderPort; now?: () => Date }) {
  return definePollingIntegrationPlugin({
    manifest: githubIntegrationManifest,
    createProvider(context, binding) {
      context.requireGrant("network:github.com");
      context.requireGrant("secret:github");
      return input.providerFor(binding);
    },
    now: input.now,
  });
}
```

插件只启动一次；每个来源绑定时问一次 `createProvider(context, binding)`。`binding` 是 `{ source_id, connection_id, credential_ref, config }`，只有引用、没有密钥，连接是来源已经绑定的那一条，不是按服务去查的。来源的配置变了不用重启，下一次绑定就拿到新值。可选的 `presentAccount(cursor, currentAccountLabel, binding)` 说一次拉取之后来源的账号怎样显示：返回 `{ account_label, …要写进来源配置的字段 }`，返回 `null` 或不写这一项，来源的账号与配置都不变；Feed 照它写，宿主不按集成名选。

## 声明：服务和集成

Manifest 的 `connection_services` 写插件接触的服务和设置页上的卡（标题、分组、`auth_kind`、`auth.methods`、能力、`setup_links`、`auth_help`）；`integrations` 写对每个服务做什么：`kind: "source"`（Feed 拉取）或 `"document_import"`（成果库读文档，另写 `document_source`，和 `connection_methods`：它能用哪几种接入方式的连接读，如 `["token", "oauth"]`；成果库只收接入方式在这里面的连接）。`integrations[].service_id` 必须是同一份 Manifest 声明过的服务。平台按已装插件的声明拼出每个 Home 的登记；登记、设置页的目录卡、文档导入的来源名都从它来，宿主不再认任何服务名。

- 一个 id 先到先得：后装的插件声明已被占的 `service_id` 或 `integration_id`，启用失败（`plugin.integration_declaration_conflict`，写明 id 与持有者），已登记的不受影响。平台自己的卡先于插件。
- 声明不给连接权：有卡不等于能读这个服务已有的连接与凭据；要读连接走 `services.connections`，按安装逐个授权。
- `auth.methods` 里 `token` 要写 `label`（可写 `placeholder`）；`oauth` 写完整流程声明；远程 `mcp` 写下节的服务配置，`cli` 与本机 MCP 保留只写 `kind` 的槽。

`createProvider` 返回的 port 负责 `health` 和 `sync`（cursor、`normal` / `rebuild_cursor`）。真实 `health` 可以返回 `account: { login, account_id? }`，只有经过认证的服务响应中已验证的身份才填写；有稳定账号 id 时一并返回，显示名称和本地保存的标签不能替代身份。未返回时保持未知，不能从 message 文案解析账号。SDK 把它收成 Connector Driver 的 `poll` 和 Signal Adapter 的 `toSignalDraft`。不要在 Native 插件里直接 fetch GitHub。

现有：GitHub、Gmail、RSS、YouTube Channel、Catalog（按连接器 id 生成 Manifest）、Web Query。

## 权限

- `network:<host>`：实际要访问的主机。YouTube 公开 Feed 可以只有 network。
- `secret:<name>`：不可导出的凭据引用。Gmail/GitHub/Catalog 需要；Web Query 的 secret 可以 `required: false`。
- 不要在私人存储里存可导出的 token。

## OAuth 与账号

OAuth 流程写成数据：服务的 `auth.methods` 里写 `{ kind: "oauth", grant, … }`（类型 `PluginOAuthMethodDeclaration`，`packages/contracts/src/platform/plugin-integrations.ts`；形状检查在 `packages/plugin-sdk/src/oauth-declarations.ts`，宿主的解释器是 `apps/local-host/src/connector-oauth-declarations.ts`）。平台只有这一个解释器和通用回调 `/api/settings/connectors/methods/oauth/callback`，没有按服务写的 OAuth 代码，也没有插件钩子；写不成的往声明里补字段，不往宿主里加分支。回调按 state 找待完成记录，不按路径找插件；Gmail 和 Notion 在服务商控制台登记过的回调路径保留为别名，只有路径正好等于记录里的 `redirect_uri` 才收。只写 `{ kind: "oauth" }` 不带数据，或数据检查不过，整份 Manifest 以 `plugin.declaration_invalid` 被拒。

- `grant`：`authorization_code` 或 `device`（RFC 8628，平台按通用的 `methods/device/start`、`methods/device/poll` 驱动）；同一服务可各写一条，其他 kind 每种一条。
- 端点 `authorize_url`、`token_url`、`refresh_url`、`device_authorization_url`：完整 `https://` 地址（不带账号密码、端口、查询、片段，主机是名字），或写成 `{tenant}/路径`。写了 `issuer`，回调就必须带相同的 `iss`（RFC 9207）。
- `scopes`、`pkce`（只收 `S256`）、`client_auth`（`basic`、`post`、`none` 或 `{ setting }`，默认 post）、`token_format`（`form`、`json`）、`client_secret`（`required`、`optional`）、`parameters`（授权地址上的固定参数；`client_id`、`redirect_uri`、`state`、`code_challenge*`、`response_type` 由平台写，不许出现）、`quirks`（只收 `refresh_redirect_uri`、`omit_token_params`、`expiry: "jwt_exp"` 三种已知怪癖）、`note`。
- `settings`：本人在设置里填的字段，`use` 只能是 `path`、`scope`、`client_auth`、`tenant`；`use: "path"` 必须写 `pattern` 或 `enum`，`default` 也按它们检查。
- `identity`：怎样取账号，account_id 是几段、段间用 `:` 连起来，每段取第一个非空的来源；`label` 同理。来源写成 `identity:/JSON指针`、`context:键`、`literal:文字`，不取令牌响应：令牌响应里要用的值先用 `keep` 留进连接上下文，再写成 `context:` 读，授权、检查连接和读账号走同一条路。重新授权必须还是同一个 account_id，换了账号得到“请新增一条连接”。`context` 请求只在授权时发，检查、读账号、刷新都不发。
- 占位只有一份文法（`@molis-ai/molis-work-plugin-sdk/oauth` 的 `oauthPlaceholder`，SDK 的检查和宿主的解释器读同一份）：`{client_id}`、地址开头的 `{service}`、`{tenant}`、`{gateway}`、`{account}`，以及 `{context.<key>}`、`{setting.<key>}`。占位占满一个路径段，值按路径段编码，带 `/`、`\`、`..`、编码过的斜杠的拒绝；展开后每个地址再按 S-09、S-10 查一遍。`body`、`label_prefix` 原样照收、不展开，写得像占位的整份不过；`headers` 不许写平台自己写的头（`OAUTH_PLATFORM_HEADERS`）。
- 带访问令牌的 identity、context 请求只发往平台登记的地方，Manifest 只写路径：`{service}/路径` 发往 `CONNECTOR_REQUEST_SERVICES` 的来源（有几项的写完整地址，来源必须是其中一项），`{tenant}/路径` 发往钉在连接上的租户来源，`{gateway}` 发往 Atlassian 网关，`{account}` 发往只给平台自己用的 `CONNECTOR_ACCOUNT_ORIGINS`（S-69）。授权、令牌、刷新、设备授权这几个端点收的是 code、verifier、client secret、refresh token，不收访问令牌。
- 来源可变的只有租户：Manifest 不写主机后缀，只有 `use: "tenant"` 的那一个 setting 能换来源，范围是平台表里该服务 `tenant.domain` 之下；平台表里没有 `tenant` 的服务写 `use: "tenant"` 是声明错误。`keep` 的 `check: "tenant"` 必须同时 `required: true`，响应里没有就授权失败，不悄悄退回登录来源。
- 客户端凭据仍归平台，按顺序取：重新授权沿用原客户端、产品 broker、产品客户端（环境变量 `MOLIS_WORK_CONNECTOR_<服务>_OAUTH_CLIENT_ID`、`…_CLIENT_SECRET`，服务名大写、连字符改下划线）、本人填的客户端。broker 和产品客户端只给宿主构建的声明，别的插件声明同一个 service_id 也拿不到；client id/secret 只以引用存密钥库，插件拿不到 code、verifier、client secret 和 refresh token。broker Worker（`apps/local-host/cloudflare/`）留自己的 `providers.ts`，与 Manifest 声明由 `tests/connector-provider-contracts.test.ts` 钉住；改 Worker 就是重新部署，属发布，先报用户。
- 回调、刷新、设备授权怎样判断和拒绝，是 S-95、S-101、S-106（`docs/system/SECURITY-INVARIANTS.md`）：声明它的插件停用、换了安装或发布者、方法指纹变了，授权和刷新都拒绝，连接标 `reauth_required`；拒绝只写取走的授权记录与状态，不动连接、凭据和 protocol 配置。旧形状的 OAuth 连接（凭据不是 `connector-protocol:`）不读、不刷新，只能新增。

账号检查（whoami）用连接器动作 `connectors.account.read`（GitHub 1.2.0 起，Catalog 连接器 1.1.0 起），不是插件自己登记的 behavior；连接 / 断开是设置页动作。这些都**不进** `feed.capture`。

项目 MCP 的来源插件是来历，不能作为连接运行寿命或其他消费者授权。Host 共用目录保留项目范围，每次调用核对当前调用者与工作区权限；项目配置只引用 Home 凭据 owner，不能把 SDK 进程内的 credential ref 当成持久密钥。停用连接保留凭据，但所有消费者都须拒绝调用；移除不删除已有业务成果。

## 远程 MCP 声明

Host 构建的集成在 `connection_services[].auth.methods` 写 `{ kind: "mcp", endpoint, auth }`；`endpoint` 是无凭据的 HTTPS 地址，`auth` 为 `oauth`、`bearer`、`either` 或 `none`。可选 `registration: "manual"`，省略表示 dynamic；可选 `endpoint_pattern: { source, flags }`，source 以 `^` 开头、`$` 结尾，flags 只收 `u` 或 `iu`；特殊头只收 `token_scheme: "Sentry-Bearer"`。配置属于服务所在插件，Host 的目录、准备接入与真实连接从同一声明读取。

SDK 校验数据形状，外部签名安装包暂不能携带带数据的 OAuth 或 MCP 方法：预览和 attach 都以 `plugin.declaration_invalid` 拒绝，已有登记不变。只写 kind 不会给包新增远程配置权。部署 OAuth 客户端只用于 Host 原始构建声明的同一身份、签名、完整方法与默认资源；同名服务或相同地址不能取得它。

连接保存稳定安装身份、发布者签名、完整方法指纹及所选地址和认证模式；pending、held 和每次在途操作另固定当前安装世代，等待后及最终写入前复核原快照。正常重启后的新操作可重新捕获当前世代；停用再启用不能恢复旧在途请求，held 释放也重新核验。旧远程连接缺少来源 pin 时须重新连接，不按 service id 补猜。Agent 缓存同时绑定当前世代，来源重启后须重新连接其工具选择。Host 解析 MCP 账号时可交出可信的同步 `assertCurrent`，闭包固定本次原声明与安装世代，不序列化进 SDK 配置。Agent 库让同一闭包覆盖凭据桥的等待、连接/刷新、工具调用后续配置和工作区读取、调用者等待、实际 SDK 网络派发及结果交付；validate 返回或缓存 revision 相同都不代表后续自动获准。旧调用不能在末尾换捕新世代；失效前已发出的外部请求不回滚，但晚到正文不交付且不通知 succeeded。回归：`tests/connector-mcp.test.ts` 的「RAC2885 Agent source withdrawal after validate」「RAC2885 Agent source withdrawal during an actual in-flight tool」。

飞书/Lark stdio 与 Figma 本机服务的生命周期仍留 BL-791。Figma 默认本机、none；显式 HTTPS 仅原远程地址，oauth/manual，均不自动选择产品客户端。

## Catalog 连接器

`plugins/official-integrations/catalog` 按 `connectorId` 生成 `plugin_id: io.molis.work.integration.<id>`、权限主机、标题，以及它自己的 `connection_services` 与 `integrations`。新目录连接器先看 catalog spec，不要复制一份 GitHub 插件。

## 不要做的

- 在 Feed Native 里写 provider if/else。
- 把来源设置按钮放进消息详情的判断池。
- 为「以后可能有的 webhook」先声明 Listener 空壳。没有真实 poll/sync 路径就不要做 integration。
- 用 mock health 当已连接。`status === "mock"` 在 SDK 里会收成 error。

业务模块引用账号连接时，可用 contracts 的 `defineConnectorUsagesAction` 声明只读使用位置查询，返回自己当前保存的对象引用和已有业务动作。输入输出类型为 `molis.connector-usages.input.v1` / `molis.connector-usages.output.v1`；Home 的 `connectors.usages.read` 按类型发现，再以原调用者身份调用。不要另存绑定、导出凭据或替其他模块报告。报告中的动作参数只含非敏感对象 id 等已知部分；可见的使用位置不授予执行权限，目录与派出仍各自检查。公开 RSS 等没有账号的来源不生成账号引用。模型的当前配置不等于每个任务都选择该模型，不能据此列出所有推理动作。
