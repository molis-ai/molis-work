# 全部 Connector 登录接入状态

2026-09-27。此表保留真实连接/授权发起证据，不是上线声明。最新逐服务配置要求和工程验证见 [configuration-readiness.md](configuration-readiness.md)；本轮暂停外部注册。正式授权域名 HTTPS 已可访问，Google/GitHub 的真实用户回调仍待验证。

17 个目录入口已通过生产 startMcpConnection 路径生成官方授权链接，其中 Jira/Confluence/Bitbucket/Loom 共用 Atlassian Rovo。随后 Notion 已获用户明确许可，完成真实授权、回调、原页自动更新及 45 个工具的只读发现；其他入口仅完成授权发起。官方 MCP 连接仅用于工具调用，不自动供 Feed API 同步。支持的官方 HTTP MCP 已接入 Coding/Agent 账号选择、刷新及断开控制；此新增链路通过本地协议与隔离 UI 验证，不能借用此前 Notion 工具发现证据宣称真实 Agent 使用已验收。

| 服务 | 当前证据与剩余依赖 |
| --- | --- |
| 模型 API (model-api) | 密钥型服务；保持供应商密钥获取→保存→模型设置验证。 |
| TypeSafe (typesafe) | 密钥型服务；保持 API Key 获取→消费功能验证。 |
| 图像模型 API (image-api) | 密钥型服务；保持密钥获取→Images 选择连接并验证。 |
| 远程 MCP (mcp-bearer) | 自定义服务令牌入口；无需伪装成统一账号登录。 |
| GitHub (github) | Molis OAuth 应用已创建，独立密钥 OAUTH_APP_GITHUB 已存 Cloudflare；正式 HTTPS 已通过健康检查，真实登录回调待完成。 |
| Gmail (gmail) | Molis Web 客户端已创建，密钥已存 Cloudflare，API 已启用；DNS/HTTPS 已可用，真实回调、隐私/域名审核及发布资格仍待完成。 |
| Google Calendar (google-calendar) | Molis Web 客户端已创建，密钥已存 Cloudflare，API 已启用；DNS/HTTPS 已可用，真实回调、隐私/域名审核及发布资格仍待完成。 |
| Outlook (outlook) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Google Drive (google-drive) | Molis Web 客户端已创建，密钥已存 Cloudflare，API 已启用；DNS/HTTPS 已可用，真实回调、隐私/域名审核及发布资格仍待完成。 |
| OneDrive (onedrive) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| SharePoint (sharepoint) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Dropbox (dropbox) | 注册接口实测返回 403 registration_not_supported，仅接受预注册 trusted partner。 |
| Box (box) | 授权元数据无 registration_endpoint；需注册产品应用。 |
| Notion (notion) | 用户许可后真实授权/回调成功；工具列表 45 个；未调用内容读写工具。 |
| Slack (slack) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Microsoft Teams (teams) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Discord (discord) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| 飞书 (feishu) | 保留本机 CLI 登录；首次应用配置、真实用户登录待验证。 |
| Lark (lark) | 需产品应用；现有 CLI/应用凭据为高级入口。 |
| 企业微信 (wechat) | 现有企业自建应用凭据路径；不能当作个人微信网页登录。 |
| Zoom (zoom) | 授权元数据无 registration_endpoint；需注册产品应用。 |
| GitLab (gitlab) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Bitbucket (bitbucket) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Vercel (vercel) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Cloudflare (cloudflare) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Hugging Face (huggingface) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Sentry (sentry) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Supabase (supabase) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Linear (linear) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Jira (jira) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Confluence (confluence) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Asana (asana) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| ClickUp (clickup) | 已实测生成官方授权 URL；未完成真实用户授权 |
| monday.com (monday) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Airtable (airtable) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Loom (loom) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Figma (figma) | 现有桌面 MCP 路径；远程自建客户端资格和应用配置待完成。 |
| Canva (canva) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Adobe (adobe) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Salesforce (salesforce) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| HubSpot (hubspot) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |
| Intercom (intercom) | 已实测生成官方授权 URL；未完成真实用户授权 |
| Stripe (stripe) | 已实测生成官方授权 URL；未完成真实用户授权 |
| X (x) | 授权元数据无 registration_endpoint；需注册产品应用。 |
| LinkedIn (linkedin) | 需要 Molis 产品 OAuth 应用配置、回调部署/发布资格及真实账号验证。 |

元数据核对使用 SDK discoverOAuthServerInfo，实际发起使用生产 startMcpConnection；临时 Home 已清除，动态注册得到的临时客户端不是用户账号授权。

官方限制参考：[Asana MCP 应用注册](https://developers.asana.com/docs/integrating-with-asanas-mcp-server)、[Figma MCP](https://developers.figma.com/docs/figma-mcp-server/)。Dropbox 拒绝来自其实际注册接口 https://www.dropbox.com/oauth2/register（HTTP 403）。
