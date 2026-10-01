# Connector 配置准备检查

2026-09-27。当前目录 45 项：39 项有 API OAuth 实现，另 6 项采用密钥、企业应用或 MCP。用户决定暂停逐一注册应用；本轮只核对官方协议、修复实现及受控测试，没有新增外部应用、授权或部署。此文件是后续配置的交接入口；真实账号证据仍见 [provider-readiness.md](provider-readiness.md)。

## 结论与证据边界

所有 39 个 API OAuth 通过生产 Host 的本机直连及 Host→Worker 两套受控流程：授权参数→回调→换码→服务身份→持久化→刷新轮换（服务不返回刷新令牌时验证重新授权）。凭据、响应、网络均为独立测试样本，不是供应商实网授权。覆盖全部目录不意味着每种账号、地区、套餐和每个消费 API 都已实网验证。

本轮修复 GitLab 刷新缺少 redirect_uri、Sentry 取错用户身份、Worker 忽略 HTTP 200 内的业务错误；飞书换码统一使用官方 SDK 的 v2 JSON 协议；Asana 显式请求 users/workspaces/tasks 只读 scopes，避免新建细粒度应用缺 scope；Hugging Face 允许官方支持的无密钥 PKCE 应用；Airtable 地址对齐官方文档的规范域名。HubSpot 的官方账号响应为 portalId，现有实现支持，未按猜测修改。

`tests/connector-provider-contracts.test.ts` 的预期端点/响应独立于生产映射。首次运行 79 项中 GitLab、Sentry 的直连/代理共 4 项失败；修复后通过。额外验证 Sentry 同组织不同用户不能覆盖已有账号、缺失用户 ID 不保存令牌、公开 PKCE 客户端不发送 secret、Broker 不转发 Sentry 姓名邮箱、HTTP 200 错误仍失败。验证结果与命令见 [verification.md](verification.md)。

## 日后启用的共同步骤

1. 按下表选择正确应用类型，登记产品身份、实际隐私政策及权限。固定 Web 回调 `https://auth.molis.ai/callback`。API 和 MCP 是不同授权资源，不互相复用 token/client。
2. 每个服务只保存一个完整 Worker Secret：`OAUTH_APP_<SERVICE>`，连字符变下划线且大写。内容为 `{"clientId":"实际值","clientSecret":"实际值","settings":{…}}`；公开客户端可省略 secret。保留现有 `ENVELOPE_KEY` 与其他服务配置。此轮修复尚未部署，启用相关服务前需部署最新代码。
3. 对照 `/providers` 确認已配置。测试环境将 `MOLIS_WORK_CONNECTOR_BROKER_ORIGIN` 指向代理，将 `MOLIS_WORK_CONNECTOR_BROKER_SERVICES` 仅设为本次待验服务。
4. 真账号验证登录、同意/拒绝、回调、身份、一个实际只读消费动作、到期刷新、重连及断开。通过后才启用给用户；应用审核或管理员许可未获批时不能标记公开可用。

产品应用是我们配置一次，普通用户不填 Client ID/Secret。若选本机直连，只适用于服务接受的 loopback 回调/原生公开客户端或受控内部 Host，不把 confidential secret 打进安装包。无 refresh token 的服务到期需重新登录。断开本机连接清除本机凭据，不等于撤销供应商后台的授权；需要彻底撤销时到供应商已授权应用页面处理。

## 39 项 API OAuth 配置表

所有行均“工程受控流程通过；真实账号未验收”，Google/GitHub 的已配置和 Notion MCP 的真实证据另列，不能借用为 API 实网证据。Scope 的权威执行值在 `connector-api-oauth-providers.ts`；下表强调配置选择和消费边界。

| 服务 | 应用、权限与附加配置 | 当前消费能力与启用条件 / 官方依据 |
| --- | --- | --- |
| GitHub | OAuth App，notifications、read:user；支持 PKCE | 用户身份、通知；组织访问受用户权限约束。已有产品凭据，待真实回调。[官方流程](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) |
| Gmail | Google Web Client；openid/email + gmail.readonly；启用 Gmail API | 邮件读取。Testing 用户名单、敏感/受限权限审核、政策与域名验证仍需处理。[Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) |
| Google Calendar | 同一 Google Client 可复用；calendar.readonly；启用 Calendar API | 主日历与事件；仍需独立服务入口配置和实测。[Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) |
| Google Drive | drive.readonly；启用 Drive API | 文件列表/正文授权；不是只凭 Google 身份就能读取文件。[Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) |
| Outlook | Entra 委托应用；User.Read、Mail.Read、offline_access；settings.tenant 可选 | 邮件；应用支持的账号类型要匹配个人/工作账号及租户策略。[Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) |
| OneDrive | Entra；User.Read、Files.Read.All、offline_access；tenant 可选 | 最近文件；管理员同意、实际文件权限仍适用。[Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) |
| SharePoint | Entra；User.Read、Sites.Read.All、offline_access；tenant 可选 | 已关注站点；需要具备 SharePoint 的组织账号和租户许可。[Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) |
| Teams | Entra；User.Read、Chat.Read、Team.ReadBasic.All、Channel.ReadBasic.All、offline_access | 聊天列表；按组织账号验证，不将个人账号或 Work IQ 的许可当成已满足。[Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) |
| Dropbox | Scoped App；account_info.read、files.metadata.read、files.content.read；offline 已请求；选对 App Folder/Full Dropbox | 文件列表；API OAuth 与需要 trusted partner 的官方 MCP 注册分别配置。[Dropbox](https://docs.dropboxapi.com/dropbox-api/docs/oauth) |
| Box | OAuth 2.0 用户应用；控制台启用读取文件和用户权限 | 根目录文件；企业管理员及应用分发策略适用，不能用短期 developer token 代替产品 OAuth。[Box](https://developer.box.com/guides/authentication/oauth2/) |
| Notion | Public integration；Basic + JSON；选择共享页面及集成读取能力 | API 页面搜索；workspace_id + bot ID 识别授权。此前真实通过的是 MCP，不是此 API 应用。[Notion](https://developers.notion.com/guides/get-started/authorization) |
| Slack | Bot OAuth V2；channels/groups/im/mpim:read、users:read；安装到工作区 | 当前 Feed 是频道列表，非完整消息历史；工作区批准和成员权限适用。返回 Bot token；不用 authed_user token 代替。[Slack](https://docs.slack.dev/authentication/installing-with-oauth/) |
| Discord | 用户 OAuth；identify、guilds；confidential Basic + form | 身份及服务器列表，非 Bot 消息权限。现有 S256 参数保留，普通 OAuth 文档未明确该扩展，真实应用需确认接受；不能以测试样本证明服务支持。[Discord](https://docs.discord.com/developers/topics/oauth2) |
| 飞书 | 飞书应用；用户授权/回调和所需 im/wiki/contact/calendar/docx 只读权限；offline_access | 用户身份、会话/文档。换码/刷新采用 open.feishu.cn/authen/v2 的 JSON；发布范围、管理员权限单独验收。[官方授权代码](https://github.com/larksuite/lark-openapi-mcp/blob/main/src/auth/provider/oauth.ts) |
| Lark | 国际版应用，凭据与飞书不可混用；同类用户权限 | open.larksuite.com JSON 换码及国际版 user_info；不是 tenant_access_token。[官方授权代码](https://github.com/larksuite/lark-openapi-mcp/blob/main/src/auth/provider/oauth.ts) |
| Zoom | 用户 General/OAuth 应用；后台开启用户资料及会议列表只读权限 | /users/me 和会议列表；不用 Server-to-Server 账号令牌。公开安装需满足 Marketplace 要求。[Zoom](https://developers.zoom.us/docs/integrations/oauth/) |
| GitLab | GitLab.com OAuth App；read_user、read_api；可公开 PKCE | 身份/活动；刷新必须带原 redirect_uri，已修复。当前不是任意自建域名。[GitLab](https://docs.gitlab.com/api/oauth2/) |
| Bitbucket | OAuth consumer；后台配置 account、repository、pullrequest 读取权限 | 用户/仓库；Basic 换码刷新。Rovo MCP 另走其官方认证。[Bitbucket](https://developer.atlassian.com/cloud/bitbucket/rest/intro/) |
| Vercel | REST API Integration；settings.integration_slug 必填；设置用户与部署读取权限 | team_id 带入后续请求；不是简单 Sign in with Vercel 身份应用，权限/项目范围在安装时选择。[Vercel](https://vercel.com/docs/integrations/create-integration/vercel-api-integrations) |
| Cloudflare | OAuth client；settings.api_scopes 填已批准的点号格式只读 scopes（域名列表需相应 Zone 权限）；client_auth=basic/post/none | 身份及域名列表；私有客户端仅账户成员能用，公开需域名验证与完整品牌。不要填 Wrangler 冒号格式 scope。[Cloudflare](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/) |
| Hugging Face | OAuth App；openid/profile/email/read-repos；支持 confidential 或无 secret PKCE | 账号个人模型列表；组织资源另受用户所选范围限制；并非自动获得推理计费能力。[HF](https://huggingface.co/docs/hub/oauth) |
| Sentry | OAuth App；org:read、project:read、event:read | 选定组织的错误；token 响应 user.id 与组织 ID 一起固定身份，已修复；刷新仍保留身份。[Sentry](https://docs.sentry.io/api/auth/) |
| Supabase | Management API OAuth App；后台开启组织、用户资料、项目列表读取权限 | 组织/项目，非项目 anon key；授权组织集合纳入账号绑定。[Supabase](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration) |
| Linear | OAuth App；read；S256 | viewer/Issue；真实工作区范围和应用分发资格待验。[Linear](https://linear.app/developers/oauth-2-0-authentication) |
| Jira | Atlassian 3LO；read:jira-user、read:jira-work、offline_access；settings.site_url 必填 | accessible-resources 解析 cloud_id 后访问 Jira。当前配置固定站点；面向不同客户的多站点选择 UX 尚未实现，不能只填统一 secret 就宣称全租户可用。[Atlassian](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/) |
| Confluence | 同类 3LO；read:confluence-user、read:confluence-content.all、search:confluence、offline_access；site_url 必填 | 用户/内容搜索；同上固定站点限制，权限与 Jira 分别申请。[Atlassian](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/) |
| Asana | OAuth App 选 scoped permissions：users:read、workspaces:read、tasks:read | 身份/当前用户任务；授权 URL 已补 scope，不再依赖 Full permissions。当前 Feed 使用首个工作区。[Asana](https://developers.asana.com/docs/oauth) |
| ClickUp | OAuth App；HTTPS 回调 | JSON 仅传 client_id/secret/code；授权团队集合保存，当前 Feed 取首个团队；当前无 refresh token，到期/撤销需重连。[ClickUp](https://developer.clickup.com/docs/authentication) |
| monday.com | 当前 app version 开启 OAuth 2.1；me/account/boards/updates:read | JSON + PKCE；JWT exp 作到期调度，刷新保存新 token。旧 OAuth endpoint 不混用。[monday](https://developer.monday.com/apps/docs/migrating-to-the-new-oauth-flow) |
| Airtable | OAuth integration；schema.bases:read、data.records:read、user.email:read；用户选择资源 | Base 列表；Basic confidential 或公开 PKCE；轮换刷新令牌持久化。[Airtable](https://airtable.com/developers/web/api/oauth-reference) |
| Figma | OAuth App；current_user:read、file_content:read、file_metadata:read、file_comments:read | 当前 API 只验证身份，无 Feed；设计读取使用 MCP。刷新专用 /v1/oauth/refresh，不能复用 token 路径。[Figma](https://developers.figma.com/docs/rest-api/oauth-apps/) |
| Canva | Connect integration；profile:read、design:meta:read；Basic + PKCE | 设计列表；公开分发/审核与开发用户限制需处理。S256 遵循文档参数定义。[Canva](https://www.canva.dev/docs/connect/authentication/) |
| Adobe | Developer Console User Authentication；openid,profile,email,offline_access | 当前只验证 IMS 身份，无 Feed；开发模式测试用户、生产批准及具体产品 API 权限分别处理。[Adobe](https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/) |
| Salesforce | 用户 OAuth 应用；openid/api/refresh_token；settings.login_origin 可选官方 Salesforce 域名 | 返回 instance_url 后访问该组织。API 权限、组织策略、Task 对象读取许可需满足；不是 client_credentials。[Salesforce](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm) |
| HubSpot | 用户 OAuth 应用；oauth、crm.objects.contacts.read；使用 2026-03 token endpoint | /integrations/v1/me 的 portalId 固定账号，联系人只读；按账户套餐/应用分发资格实测。[新端点](https://developers.hubspot.com/changelog/v1-oauth-api-deprecation) · [身份响应](https://developers.hubspot.com/docs/api-reference/legacy/account/account-information/v1/get-integrations-v1-me) |
| Intercom | Public app OAuth；固定 HTTPS 回调；后台开启会话和管理员资料读取 | /me 和会话；无常规 refresh token。必须走云端或有效 HTTPS 回调，不能靠本机配置假装一键就绪。[Intercom](https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth) |
| Stripe | Connect/Extension；Client Secret 为平台 Secret Key；settings.stripe_scope 明确 read_only 或 read_write | 账号及事件。read_only 适用于 Extension；普通 Connect 需要 read_write，授权会含写权限，不能包装为只读授权。[Stripe](https://docs.stripe.com/connect/oauth-reference) |
| X | OAuth 2.0 App；tweet.read、users.read、offline.access；选择匹配的 confidential/public 类型 | 用户身份/本人帖子；开发者 API 资格及费用由 X 决定。App-only Bearer 不可替代用户 OAuth。[X](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code) |
| LinkedIn | 开通 Sign In with LinkedIn using OpenID Connect；openid/profile/email | 当前只读会员资料，无帖子 Feed；普通应用不保证可程序化刷新，失效后重连。[LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow) |

## 其余 6 项与其他登录方式

| 目录项 | 核对结果与启用条件 |
| --- | --- |
| 模型 API（model-api） | 按模型供应商保存 Key，再在模型设置/Jelly 选择；没有统一 OAuth 注册可替代供应商开通、余额和模型权限。验证密钥保存仅证明凭据入库，实际模型调用单独验收。 |
| TypeSafe（typesafe） | Key 型；Functions/Experiments 使用所选连接；账号服务可用性和真实执行待业务环境验证，不改成虚假的 OAuth 按钮。 |
| 图像模型 API（image-api） | Key 型；Images 需选对应供应商/模型/连接，生成请求可能计费，尚未进行真实生成。 |
| 远程 MCP（mcp-bearer） | 仅保存指定服务器 Bearer，需在 Coding 配置真实 MCP URL 并连接验证工具；不是通用 OAuth 服务身份。 |
| 企业微信（wechat） | 企业自建应用 corpid:corpsecret → tenant/app token；应用可见范围、可信 IP 和部门读取许可需配置。不是个人微信登录，也不使用用户 OAuth Broker。原路径保留。 |
| Loom（loom） | 仅官方 Atlassian Rovo MCP；无实现的通用 Loom REST OAuth，不能通过创建 OAuth App 激活不存在的 Feed。依赖 Atlassian 站点、账户内容权限和 MCP 能力。 |

MCP/CLI 不需要重复实现 API OAuth：官方 MCP 经 SDK 发现其认证元数据，有动态注册的服务按官方流程授权，无动态注册的服务需要对应 MCP 客户端/合作伙伴资格。Dropbox、Box、Zoom、X 的 MCP 预配置不能使用上表的 REST client 顶替；Google Workspace 和 Microsoft Work IQ 的预览/租户许可亦不能由创建一般 OAuth 应用解决。Notion MCP 已真实通过，其余证据见 [provider-readiness.md](provider-readiness.md)，官方入口见 [逐服务方法参考](../connector-all-methods/provider-verification.md)。

官方 HTTP MCP 的已授权账号现在可在 Coding 设置中选择，自动带入地址并由 Host 刷新凭据；仍需用户连接及选择本轮工具，外部调用沿用宿主审查。项目尚未启用 Coding 时提供启用入口。本机 stdio、旧 SSE、专用认证头保留原生操作，不冒充可选 HTTP 账号；当前接入证据是本地协议集成，真实供应商 Agent 使用待验。

CLI 入口使用各自已实现的固定登录/身份命令，受安装版本、账号和组织限制；`connector-cli.test.ts` 已覆盖官方身份形状、账号变更、断开及取消等受控行为。没有实际安装/授权的 CLI 不能据此宣称实网可用。

## 尚不能承诺的部分

- Jira/Confluence 面向任意用户的多站点选择仍是实现缺口；当前仅已配置站点或官方 Rovo MCP 路径可用。Asana/ClickUp 当前 Feed 只消费首个工作区/团队。
- Figma、Adobe、LinkedIn 的 API 连接只有身份能力，连接成功不会产生尚未实现的 Feed；Discord/Slack 列表也不等于消息内容权限。
- 所有真实供应商登录、读取、刷新仍需其应用、账号和批准；不能用受控测试保证未来平台政策/协议永不变化。飞书/Lark 的网页正文提取受限，本轮协议依据官方 larksuite 源代码；Salesforce Help 正文受动态加载限制，当前实现合同覆盖不能代替其管理员后台实测。
- 此轮未发布 Worker 和桌面产物，未启用新服务白名单，未继续隐私政策、Google 验证 TXT 或其他外部配置。
