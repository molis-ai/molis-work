/** Official API OAuth protocols. MCP has its own resource authorization lifecycle. */
export interface ApiOAuthProvider {
  authorize: string;
  token: string;
  scope: string;
  pkce?: boolean;
  auth?: "basic" | "post";
  format?: "json" | "form";
  optionalSecret?: boolean;
  refresh?: string;
  parameters?: Record<string, string>;
  fields?: Array<{ key: string; label: string; placeholder?: string; required?: boolean }>;
  note?: string;
}
const google = (scope: string): ApiOAuthProvider => ({ authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", scope: `openid email ${scope}`, pkce: true, parameters: { access_type: "offline", prompt: "consent" } });
const microsoft = (scope: string): ApiOAuthProvider => ({ authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", scope: `offline_access User.Read ${scope}`, pkce: true, optionalSecret: true, fields: [{ key: "tenant", label: "租户 ID（个人账号或多租户应用可留空）", placeholder: "common" }] });
const atlassian = (scope: string): ApiOAuthProvider => ({ authorize: "https://auth.atlassian.com/authorize", token: "https://auth.atlassian.com/oauth/token", format: "json", scope: `offline_access ${scope}`, parameters: { audience: "api.atlassian.com", prompt: "consent" }, fields: [{ key: "site_url", label: "Atlassian 站点", placeholder: "https://your-team.atlassian.net", required: true }] });
export const API_OAUTH_PROVIDERS: Readonly<Record<string, ApiOAuthProvider>> = {
  github: { authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", scope: "notifications read:user", pkce: true },
  gmail: google("https://www.googleapis.com/auth/gmail.readonly"),
  "google-calendar": google("https://www.googleapis.com/auth/calendar.readonly"),
  "google-drive": google("https://www.googleapis.com/auth/drive.readonly"),
  outlook: microsoft("Mail.Read"), onedrive: microsoft("Files.Read.All"), sharepoint: microsoft("Sites.Read.All"), teams: microsoft("Chat.Read Team.ReadBasic.All Channel.ReadBasic.All"),
  dropbox: { authorize: "https://www.dropbox.com/oauth2/authorize", token: "https://api.dropboxapi.com/oauth2/token", scope: "account_info.read files.metadata.read files.content.read", pkce: true, optionalSecret: true, parameters: { token_access_type: "offline" } },
  box: { authorize: "https://account.box.com/api/oauth2/authorize", token: "https://api.box.com/oauth2/token", scope: "", note: "读权限在 Box 应用后台配置。" },
  notion: { authorize: "https://api.notion.com/v1/oauth/authorize", token: "https://api.notion.com/v1/oauth/token", scope: "", auth: "basic", format: "json", parameters: { owner: "user" } },
  slack: { authorize: "https://slack.com/oauth/v2/authorize", token: "https://slack.com/api/oauth.v2.access", scope: "channels:read,groups:read,im:read,mpim:read,users:read", note: "安装应用的 Bot 授权；聊天读取仍受工作区和频道成员权限限制。" },
  discord: { authorize: "https://discord.com/oauth2/authorize", token: "https://discord.com/api/oauth2/token", scope: "identify guilds", auth: "basic", pkce: true, note: "用户 OAuth 可读取身份与加入的服务器；消息能力由 Bot 授权单独提供。" },
  feishu: { authorize: "https://accounts.feishu.cn/open-apis/authen/v1/authorize", token: "https://accounts.feishu.cn/oauth/v3/token", scope: "offline_access im:chat:readonly wiki:wiki:readonly contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly", pkce: true },
  lark: { authorize: "https://accounts.larksuite.com/open-apis/authen/v1/authorize", token: "https://open.larksuite.com/open-apis/authen/v2/oauth/token", scope: "offline_access im:chat:readonly wiki:wiki:readonly contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly", pkce: true, format: "json" },
  zoom: { authorize: "https://zoom.us/oauth/authorize", token: "https://zoom.us/oauth/token", scope: "", auth: "basic", note: "在 Zoom 应用中启用用户、会议与录制的读取权限。" },
  gitlab: { authorize: "https://gitlab.com/oauth/authorize", token: "https://gitlab.com/oauth/token", scope: "read_user read_api", pkce: true, optionalSecret: true },
  bitbucket: { authorize: "https://bitbucket.org/site/oauth2/authorize", token: "https://bitbucket.org/site/oauth2/access_token", scope: "", auth: "basic", note: "Consumer 中配置 account、repository、pullrequest 读取权限。" },
  vercel: { authorize: "https://vercel.com/integrations/", token: "https://api.vercel.com/v2/oauth/access_token", scope: "", fields: [{ key: "integration_slug", label: "Integration slug", required: true }], note: "使用 Vercel REST Integration；在后台配置固定回调和读取权限。" },
  cloudflare: { authorize: "https://dash.cloudflare.com/oauth2/auth", token: "https://dash.cloudflare.com/oauth2/token", scope: "openid offline_access", pkce: true, optionalSecret: true, fields: [{ key: "api_scopes", label: "应用已批准的只读 API scopes（空格分隔，点号格式）", required: true }, { key: "client_auth", label: "Client 认证方式（basic / post / none）", placeholder: "basic" }], note: "从官方 OAuth Scopes API 选择需要的只读权限；不使用 Wrangler 的冒号格式 scope。" },
  huggingface: { authorize: "https://huggingface.co/oauth/authorize", token: "https://huggingface.co/oauth/token", scope: "openid profile email read-repos", auth: "basic", pkce: true },
  sentry: { authorize: "https://sentry.io/oauth/authorize/", token: "https://sentry.io/oauth/token/", scope: "org:read project:read event:read", pkce: true },
  supabase: { authorize: "https://api.supabase.com/v1/oauth/authorize", token: "https://api.supabase.com/v1/oauth/token", scope: "", auth: "basic", pkce: true, note: "读取权限在 Supabase OAuth 应用中配置。" },
  linear: { authorize: "https://linear.app/oauth/authorize", token: "https://api.linear.app/oauth/token", scope: "read", pkce: true },
  jira: atlassian("read:jira-user read:jira-work"), confluence: atlassian("read:confluence-user read:confluence-content.all search:confluence"),
  asana: { authorize: "https://app.asana.com/-/oauth_authorize", token: "https://app.asana.com/-/oauth_token", scope: "", pkce: true, note: "在应用中启用所需的用户、工作区和任务读取权限。" },
  clickup: { authorize: "https://app.clickup.com/api", token: "https://api.clickup.com/api/v2/oauth/token", scope: "", format: "json" },
  monday: { authorize: "https://auth.monday.com/oauth2/authorize", token: "https://auth.monday.com/oauth_ms/oauth/token", scope: "me:read account:read boards:read updates:read", format: "json", pkce: true, note: "当前 app version 必须先启用新版 OAuth 2.1。" },
  airtable: { authorize: "https://www.airtable.com/oauth2/v1/authorize", token: "https://www.airtable.com/oauth2/v1/token", scope: "schema.bases:read data.records:read user.email:read", pkce: true, auth: "basic", optionalSecret: true },
  figma: { authorize: "https://www.figma.com/oauth", token: "https://api.figma.com/v1/oauth/token", refresh: "https://api.figma.com/v1/oauth/refresh", scope: "current_user:read file_content:read file_metadata:read file_comments:read", auth: "basic", pkce: true },
  canva: { authorize: "https://www.canva.com/api/oauth/authorize", token: "https://api.canva.com/rest/v1/oauth/token", scope: "profile:read design:meta:read", auth: "basic", pkce: true },
  adobe: { authorize: "https://ims-na1.adobelogin.com/ims/authorize/v2", token: "https://ims-na1.adobelogin.com/ims/token/v3", scope: "openid,profile,email,offline_access", note: "Adobe Console 中启用 User Authentication；产品 API 权限取决于应用获准范围。" },
  salesforce: { authorize: "https://login.salesforce.com/services/oauth2/authorize", token: "https://login.salesforce.com/services/oauth2/token", scope: "openid api refresh_token", pkce: true, fields: [{ key: "login_origin", label: "Salesforce 登录地址", placeholder: "https://login.salesforce.com" }] },
  hubspot: { authorize: "https://app.hubspot.com/oauth/authorize", token: "https://api.hubapi.com/oauth/2026-03/token", scope: "oauth crm.objects.contacts.read" },
  intercom: { authorize: "https://app.intercom.com/oauth", token: "https://api.intercom.io/auth/eagle/token", scope: "", note: "Intercom 应用要求已注册的 HTTPS 回调；可在下方填写回调并粘贴授权返回地址。" },
  stripe: { authorize: "https://connect.stripe.com/oauth/authorize", token: "https://connect.stripe.com/oauth/token", scope: "read_only", fields: [{ key: "stripe_scope", label: "应用授权范围：Extension 填 read_only，普通 Connect 填 read_write", placeholder: "read_only" }], note: "Client Secret 填平台 Secret Key。普通 Connect 的 read_write 会授予写权限；Molis Work 的 API 预览仍只读。" },
  x: { authorize: "https://x.com/i/oauth2/authorize", token: "https://api.x.com/2/oauth2/token", scope: "tweet.read users.read offline.access", auth: "basic", pkce: true, optionalSecret: true },
  linkedin: { authorize: "https://www.linkedin.com/oauth/v2/authorization", token: "https://www.linkedin.com/oauth/v2/accessToken", scope: "openid profile email", note: "应用需开通 Sign In with LinkedIn。普通 OIDC 不提供帖子 Feed 权限。" },
};

export function apiOAuthProvider(service: string, settings: Record<string, string> = {}): ApiOAuthProvider {
  const base = API_OAUTH_PROVIDERS[service];
  if (!base) throw new Error("此服务没有已核实的 API OAuth 流程");
  const provider = { ...base };
  if (service === "cloudflare") {
    if (!settings.api_scopes?.trim() || !settings.api_scopes.trim().split(/\s+/u).every(scope => /^[a-z][a-z0-9_.-]*\.read$/u.test(scope))) throw new Error("请填写应用已批准的点号格式只读 OAuth scopes");
    provider.scope += ` ${settings.api_scopes.trim()}`;
    if (settings.client_auth && !["basic", "post", "none"].includes(settings.client_auth)) throw new Error("Client 认证方式应为 basic、post 或 none");
    provider.auth = settings.client_auth === "post" ? "post" : "basic";
    provider.optionalSecret = settings.client_auth === "none";
  }
  if (service === "stripe" && settings.stripe_scope) {
    if (!["read_only", "read_write"].includes(settings.stripe_scope)) throw new Error("Stripe 授权范围应为 read_only 或 read_write");
    provider.scope = settings.stripe_scope;
  }
  if (settings.tenant) {
    if (!/^(common|organizations|consumers|[0-9a-f-]{36})$/iu.test(settings.tenant)) throw new Error("Microsoft 租户 ID 无效");
    provider.authorize = provider.authorize.replace("/common/", `/${settings.tenant}/`);
    provider.token = provider.token.replace("/common/", `/${settings.tenant}/`);
  }
  if (service === "salesforce" && settings.login_origin) {
    const origin = salesforceOrigin(settings.login_origin);
    provider.authorize = `${origin}/services/oauth2/authorize`;
    provider.token = `${origin}/services/oauth2/token`;
  }
  if (service === "vercel") {
    if (!/^[a-z0-9][a-z0-9-]{0,100}$/u.test(settings.integration_slug ?? "")) throw new Error("请填写 Vercel Integration slug");
    provider.authorize += `${settings.integration_slug}/new`;
  }
  return provider;
}
export function salesforceOrigin(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port || !/(^|\.)salesforce\.com$/u.test(url.hostname)) throw new Error("Salesforce 地址必须是官方 Salesforce HTTPS 域名");
  return url.origin;
}
