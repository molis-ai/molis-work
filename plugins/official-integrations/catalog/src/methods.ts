import type {
  ConnectorMethodKind,
  ConnectorMethodOption,
  ConnectorMethodSupport,
  ConnectorSetupLink,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { setupLinksFor } from "./setup-links.js";

type OfficialConnectorMethod = ConnectorMethodOption;

function officialLink(label: string, url: string): ConnectorSetupLink {
  if (!url.startsWith("https://")) throw new Error(`connector_method_link_must_be_https:${url}`);
  return { label, url };
}

function method(
  kind: ConnectorMethodKind,
  support: ConnectorMethodSupport,
  label: string,
  url: string,
  note: string,
): OfficialConnectorMethod {
  return { kind, support, note, links: [officialLink(label, url)] };
}

const oauth = (label: string, url: string, note = "官方支持 OAuth；Molis Work 尚未接入此服务的授权回调。") =>
  method("oauth", "external", label, url, note);
const cli = (label: string, url: string, note = "官方 CLI 可单独登录；Molis Work 尚未读取它的本机授权。") =>
  method("cli", "external", label, url, note);
const mcp = (label: string, url: string, note = "官方 MCP 可连接兼容客户端；Molis Work 尚未把它接成此服务的 Connector。") =>
  method("mcp", "external", label, url, note);
const token = (id: string, note = "在官方取得所需权限的令牌或应用凭据后，可在此粘贴。", linkIndex = 0) => {
  const source = setupLinksFor(id)[linkIndex];
  if (!source) throw new Error(`missing_token_setup_link:${id}`);
  return method("token", "paste", source.label, source.url, note);
};

/** Every id in the current official integration catalog, plus GitHub and Gmail. */
export const OFFICIAL_CONNECTOR_METHODS: Readonly<Record<string, readonly OfficialConnectorMethod[]>> = {
  github: [
    method("oauth", "in_app", "注册 GitHub OAuth App", "https://github.com/settings/applications/new", "应用内支持 Device Flow；首次使用需配置自己的 OAuth App Client ID。"),
    cli("查看 GitHub CLI 登录方式", "https://cli.github.com/manual/gh_auth_login"),
    token("github", "创建有 notifications 和 read:user 权限的 PAT 后，可在此粘贴。"),
    mcp("查看 GitHub 官方 MCP", "https://github.com/github/github-mcp-server"),
  ],
  gmail: [
    method("oauth", "in_app", "创建 Google OAuth 客户端", "https://console.cloud.google.com/apis/credentials", "应用内支持 Gmail 只读 OAuth；需要自己的 Google Cloud 客户端和本机回调配置。"),
    token("gmail", "在 OAuth Playground 获取 gmail.readonly 用户访问令牌后可粘贴；到期后需更新。", 2),
    mcp("查看 Gmail 官方 MCP（开发者预览）", "https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server", "Google Workspace 开发者预览资格必需；Molis Work 尚未接入。"),
  ],
  "google-calendar": [
    oauth("创建 Google OAuth 客户端", "https://console.cloud.google.com/apis/credentials"),
    token("google-calendar", "在 OAuth Playground 获取 calendar.readonly 用户访问令牌后可粘贴；到期后需更新。", 2),
    mcp("查看 Calendar 官方 MCP（开发者预览）", "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server", "Google Workspace 开发者预览资格必需；Molis Work 尚未接入。"),
  ],
  outlook: [
    oauth("注册 Microsoft Entra 应用", "https://learn.microsoft.com/en-us/graph/auth-register-app-v2"),
    cli("查看 Microsoft Graph PowerShell", "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands", "可用 Connect-MgGraph 登录并调用 Graph；Molis Work 不读取 PowerShell 会话。"),
    token("outlook", "Graph Explorer 可获取用于测试的用户令牌；长期使用需自己注册应用。"),
  ],
  "google-drive": [
    oauth("创建 Google OAuth 客户端", "https://console.cloud.google.com/apis/credentials"),
    token("google-drive", "在 OAuth Playground 获取 Drive 用户访问令牌后可粘贴；到期后需更新。", 2),
    mcp("查看 Drive 官方 MCP（开发者预览）", "https://developers.google.com/workspace/drive/api/guides/configure-mcp-server", "Google Workspace 开发者预览资格必需；Molis Work 尚未接入。"),
  ],
  onedrive: [oauth("注册 Microsoft Entra 应用", "https://learn.microsoft.com/en-us/graph/auth-register-app-v2"), cli("查看 Microsoft Graph PowerShell", "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands", "可用 Connect-MgGraph 登录并调用 Graph；Molis Work 不读取 PowerShell 会话。"), token("onedrive", "Graph Explorer 可获取用于测试的用户令牌；长期使用需自己注册应用。")],
  sharepoint: [oauth("注册 Microsoft Entra 应用", "https://learn.microsoft.com/en-us/graph/auth-register-app-v2"), cli("查看 Microsoft Graph PowerShell", "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands", "可用 Connect-MgGraph 登录并调用 Graph；Molis Work 不读取 PowerShell 会话。"), token("sharepoint", "Graph Explorer 可获取用于测试的用户令牌；长期使用需自己注册应用。")],
  dropbox: [
    oauth("查看 Dropbox OAuth 指南", "https://developers.dropbox.com/oauth-guide"),
    token("dropbox", "在 Dropbox App Console 创建应用并取得访问令牌后可粘贴。"),
    mcp("查看 Dropbox 官方 MCP（Beta）", "https://help.dropbox.com/integrations/connect-dropbox-mcp-server", "Dropbox 官方远程 MCP 处于 Beta；Molis Work 尚未接入。"),
  ],
  box: [
    oauth("查看 Box OAuth 认证", "https://developer.box.com/guides/authentication/oauth2/"),
    cli("查看 Box 官方 CLI", "https://developer.box.com/guides/cli/"),
    token("box", "Box Developer Console 可创建应用和临时开发者令牌；开发者令牌会过期。"),
    mcp("查看 Box 官方 MCP", "https://developer.box.com/guides/box-mcp/", "Box 企业管理员可能需要先启用 MCP；Molis Work 尚未接入。"),
  ],
  notion: [
    method("oauth", "in_app", "查看 Notion OAuth 配置", "https://developers.notion.com/guides/get-started/authorization", "应用内支持 Notion API OAuth；需创建 Public connection 并配置本机回调。"),
    cli("查看 Notion 官方 CLI", "https://developers.notion.com/cli/get-started/overview", "Notion CLI 可通过浏览器登录并调用 API；Molis Work 尚未读取其本机授权。"),
    token("notion", "创建内部集成令牌，并把要访问的页面共享给集成。"),
    mcp("查看 Notion 官方 MCP", "https://developers.notion.com/guides/mcp/get-started-with-mcp", "需另行授权；不会继承当前 Notion API OAuth 已选择的页面。Molis Work 尚未接入。"),
  ],
  slack: [
    oauth("创建 Slack 应用并安装到工作区", "https://api.slack.com/apps"),
    token("slack", "将应用安装到工作区后取得相应 Bot 或用户令牌。"),
    mcp("查看 Slack 官方 MCP", "https://docs.slack.dev/ai/slack-mcp-server/", "需要符合 Slack 应用和工作区条件；Molis Work 尚未接入。"),
  ],
  teams: [oauth("注册 Microsoft Entra 应用", "https://learn.microsoft.com/en-us/graph/auth-register-app-v2"), cli("查看 Microsoft Graph PowerShell", "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands", "可用 Connect-MgGraph 登录并调用 Graph；Molis Work 不读取 PowerShell 会话。"), token("teams", "Graph Explorer 可获取用于测试的用户令牌；长期使用需自己注册应用。")],
  discord: [
    oauth("查看 Discord OAuth2", "https://discord.com/developers/docs/topics/oauth2", "Discord OAuth2 用于用户授权；当前 Molis Work 的服务器数据 Connector 使用 Bot Token，尚未接入 OAuth。"),
    token("discord", "在 Developer Portal 创建 Bot，把它加入目标服务器后粘贴 Bot Token。"),
  ],
  feishu: [
    oauth("查看飞书用户身份验证", "https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token", "官方支持用户 OAuth；Molis Work 当前通过飞书 CLI 完成用户授权。"),
    method("cli", "in_app", "安装与配置飞书官方 CLI", "https://github.com/larksuite/cli", "应用内可唤起官方 CLI 登录，并使用已批准的用户只读权限。"),
    token("feishu", "企业自建应用需 app_id:app_secret；使用租户应用身份。"),
    mcp("查看飞书官方 MCP", "https://github.com/larksuite/lark-openapi-mcp"),
  ],
  lark: [
    oauth("查看 Lark 用户授权", "https://open.larksuite.com/document/server-docs/authentication-management/access-token/get-user-access-token"),
    cli("查看 Lark 官方 CLI", "https://github.com/larksuite/cli", "同一官方 CLI 支持 Lark 环境；Molis Work 的 Lark Connector 尚未复用其登录。"),
    token("lark", "国际版 Lark 自建应用需 app_id:app_secret。"),
    mcp("查看 Lark 官方 MCP", "https://github.com/larksuite/lark-openapi-mcp"),
  ],
  wechat: [token("wechat", "这里接入企业微信自建应用的 CorpID 与 Secret；个人微信无此官方 API。")],
  zoom: [
    oauth("查看 Zoom OAuth 应用", "https://developers.zoom.us/docs/integrations/oauth/"),
    token("zoom", "使用 Zoom OAuth 用户访问令牌；到期后需更新。"),
    mcp("查看 Zoom 官方 MCP", "https://developers.zoom.us/docs/mcp/servers/"),
  ],
  gitlab: [
    oauth("查看 GitLab OAuth 应用", "https://docs.gitlab.com/integration/oauth_provider/"),
    cli("查看 GitLab CLI 登录", "https://docs.gitlab.com/cli/"),
    token("gitlab", "创建具备 read_api 或 read_user 权限的 PAT。"),
    mcp("查看 GitLab 官方 MCP", "https://docs.gitlab.com/user/model_context_protocol/mcp_server/", "GitLab 官方 MCP 处于 Beta；Molis Work 尚未接入。"),
  ],
  bitbucket: [
    oauth("查看 Bitbucket OAuth 2.0", "https://developer.atlassian.com/cloud/bitbucket/rest/intro/#authentication"),
    method("token", "paste", "创建 Atlassian API Token", "https://id.atlassian.com/manage-profile/security/api-tokens", "Bitbucket App Password 已停用；请用 API Token 或 OAuth 用户访问令牌。"),
    mcp("查看 Atlassian Rovo MCP", "https://developer.atlassian.com/cloud/rovo-mcp/", "Bitbucket 工作区需关联 Atlassian 组织；Molis Work 尚未接入。"),
  ],
  vercel: [oauth("查看 Vercel OAuth 集成", "https://vercel.com/docs/integrations/create-integration/marketplace-api"), cli("查看 Vercel CLI", "https://vercel.com/docs/cli"), token("vercel"), mcp("查看 Vercel 官方 MCP", "https://vercel.com/docs/agent-resources/vercel-mcp", "官方 MCP 处于 Beta，客户端可能需获准；Molis Work 尚未接入。")],
  cloudflare: [oauth("查看 Cloudflare OAuth", "https://developers.cloudflare.com/fundamentals/oauth/"), cli("查看 Wrangler CLI", "https://developers.cloudflare.com/workers/wrangler/"), token("cloudflare"), mcp("查看 Cloudflare 官方 MCP", "https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/")],
  huggingface: [oauth("查看 Hugging Face OAuth", "https://huggingface.co/docs/hub/oauth"), cli("查看 Hugging Face CLI", "https://huggingface.co/docs/huggingface_hub/guides/cli"), token("huggingface"), mcp("查看 Hugging Face 官方 MCP", "https://huggingface.co/docs/hub/agents-mcp")],
  sentry: [oauth("查看 Sentry OAuth 应用", "https://docs.sentry.io/organization/integrations/integration-platform/"), token("sentry"), mcp("查看 Sentry 官方 MCP", "https://github.com/getsentry/sentry-mcp")],
  supabase: [oauth("查看 Supabase OAuth 应用", "https://supabase.com/docs/guides/integrations/build-a-supabase-integration"), cli("查看 Supabase CLI", "https://supabase.com/docs/guides/local-development/cli/getting-started"), token("supabase"), mcp("查看 Supabase 官方 MCP", "https://supabase.com/docs/guides/ai-tools/mcp")],
  linear: [oauth("查看 Linear OAuth 应用", "https://linear.app/developers/oauth-2-0-authentication"), token("linear"), mcp("查看 Linear 官方 MCP", "https://linear.app/docs/mcp")],
  jira: [oauth("查看 Atlassian OAuth 2.0", "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/"), token("jira"), mcp("查看 Atlassian Rovo MCP", "https://developer.atlassian.com/cloud/rovo-mcp/")],
  confluence: [oauth("查看 Atlassian OAuth 2.0", "https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/"), token("confluence"), mcp("查看 Atlassian Rovo MCP", "https://developer.atlassian.com/cloud/rovo-mcp/")],
  asana: [oauth("查看 Asana OAuth 应用", "https://developers.asana.com/docs/oauth"), token("asana"), mcp("查看 Asana 官方 MCP", "https://developers.asana.com/docs/integrating-with-asanas-mcp-server", "Asana MCP 的授权与普通 REST API 授权分开；Molis Work 尚未接入。")],
  clickup: [oauth("查看 ClickUp OAuth", "https://developer.clickup.com/docs/authentication"), token("clickup"), mcp("查看 ClickUp 官方 MCP", "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server", "ClickUp 官方 MCP 处于公开 Beta；Molis Work 尚未接入。")],
  monday: [oauth("查看 monday OAuth", "https://developer.monday.com/apps/docs/oauth"), token("monday"), mcp("查看 monday 官方 MCP", "https://developer.monday.com/api-reference/docs/integrate-with-monday-mcp")],
  airtable: [oauth("查看 Airtable OAuth", "https://airtable.com/developers/web/api/oauth-reference"), token("airtable"), mcp("查看 Airtable 官方 MCP", "https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server")],
  loom: [
    method("token", "paste", "查看 Loom API 可用性", "https://support.atlassian.com/loom/docs/does-loom-have-an-open-api/", "Loom 不提供公开 API 令牌；当前令牌入口仅适用于已有企业或合作方凭据。"),
    mcp("查看 Atlassian Rovo MCP", "https://developer.atlassian.com/cloud/rovo-mcp/", "Loom 工作区需关联 Atlassian 站点；Molis Work 尚未接入。"),
  ],
  figma: [oauth("查看 Figma OAuth 应用", "https://developers.figma.com/docs/rest-api/authentication/"), token("figma"), mcp("查看 Figma 官方 MCP", "https://developers.figma.com/docs/figma-mcp-server/", "仅 Figma MCP Catalog 中获准的客户端可连接；Molis Work 尚未接入。")],
  canva: [oauth("查看 Canva Connect OAuth", "https://www.canva.dev/docs/connect/authentication/"), token("canva", "Canva 没有 PAT；可在自己的 OAuth 应用取得访问令牌后粘贴，到期需更新。"), mcp("查看 Canva 官方 MCP", "https://www.canva.dev/docs/apps/mcp/")],
  adobe: [oauth("查看 Adobe 用户授权", "https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/"), token("adobe", "使用 Adobe IMS 用户访问令牌；多数情况下还需要 Client ID。")],
  salesforce: [oauth("查看 Salesforce OAuth", "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm"), cli("查看 Salesforce CLI 登录", "https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_login_web.html", "Salesforce CLI 可登录 org 并查询数据；Molis Work 不读取本机 org 授权。"), token("salesforce", "填写 Salesforce 实例地址与访问令牌。"), mcp("查看 Salesforce Hosted MCP", "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html", "Hosted MCP 可能要求企业配置并消耗 Flex Credits；Molis Work 尚未接入。")],
  hubspot: [oauth("查看 HubSpot OAuth", "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth"), token("hubspot", "在 Settings → Integrations → Service Keys 创建只读 Service Key；既有 Private App Token 仍可使用。"), mcp("查看 HubSpot 官方 MCP", "https://developers.hubspot.com/ai-tools/mcp")],
  intercom: [oauth("查看 Intercom OAuth", "https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth"), token("intercom", "仅连接自己的 Private App；公共应用应按官方要求使用 OAuth。"), mcp("查看 Intercom 官方 MCP", "https://developers.intercom.com/docs/guides/mcp", "官方 MCP 当前仅支持美国托管的工作区；Molis Work 尚未接入。")],
  stripe: [oauth("查看 Stripe Connect OAuth", "https://docs.stripe.com/connect/oauth-reference"), cli("查看 Stripe CLI", "https://docs.stripe.com/stripe-cli"), token("stripe", "优先创建权限受限的 API Key；不要粘贴 Publishable Key。"), mcp("查看 Stripe 官方 MCP", "https://docs.stripe.com/mcp")],
  x: [oauth("查看 X OAuth 2.0 PKCE", "https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code", "需用户上下文与 tweet.read、users.read；Molis Work 尚未接入授权回调。"), token("x", "需要 OAuth 用户访问令牌；App-only Bearer 不适用于当前身份接口。")],
  linkedin: [oauth("查看 LinkedIn OAuth 2.0", "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow"), token("linkedin", "需要 OpenID 会员访问令牌；帖子权限另需审批。")],
};

export function officialMethodsFor(connectorId: string): readonly OfficialConnectorMethod[] {
  const methods = OFFICIAL_CONNECTOR_METHODS[connectorId];
  if (!methods?.length) throw new Error(`missing_official_connector_methods:${connectorId}`);
  return methods;
}
