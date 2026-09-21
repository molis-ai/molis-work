import type { ConnectorSetupLink } from "@molis-ai/molis-work-contracts/services/connector-host";

function link(label: string, url: string): ConnectorSetupLink {
  if (!url.startsWith("https://")) throw new Error(`setup_link_must_be_https:${url}`);
  return { label, url };
}

const MICROSOFT_GRAPH = [
  link("在 Graph Explorer 拿令牌", "https://developer.microsoft.com/graph/graph-explorer"),
  link("注册 Azure 应用", "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"),
] as const;

const GOOGLE_PLAYGROUND = link("在 OAuth Playground 拿令牌", "https://developers.google.com/oauthplayground");
const GOOGLE_CREDENTIALS = link("创建 OAuth 客户端", "https://console.cloud.google.com/apis/credentials");
const ATLASSIAN_API_TOKEN = link("创建 Atlassian API Token", "https://id.atlassian.com/manage-profile/security/api-tokens");

export const CONNECTOR_SETUP_LINKS = {
  github: [
    link("创建 Personal Access Token", "https://github.com/settings/tokens/new?scopes=notifications,read:user&description=Molis%20Work"),
    link("注册 OAuth App", "https://github.com/settings/applications/new"),
  ],
  gmail: [
    link("启用 Gmail API", "https://console.cloud.google.com/apis/library/gmail.googleapis.com"),
    GOOGLE_CREDENTIALS,
    GOOGLE_PLAYGROUND,
  ],
  "google-calendar": [
    link("启用 Calendar API", "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"),
    GOOGLE_CREDENTIALS,
    GOOGLE_PLAYGROUND,
  ],
  outlook: MICROSOFT_GRAPH,
  "google-drive": [
    link("启用 Drive API", "https://console.cloud.google.com/apis/library/drive.googleapis.com"),
    GOOGLE_CREDENTIALS,
    GOOGLE_PLAYGROUND,
  ],
  onedrive: MICROSOFT_GRAPH,
  sharepoint: MICROSOFT_GRAPH,
  dropbox: [link("打开 Dropbox App Console", "https://www.dropbox.com/developers/apps")],
  box: [link("打开 Box 开发者控制台", "https://app.box.com/developers/console")],
  notion: [link("创建 Notion Integration", "https://www.notion.so/my-integrations")],
  slack: [link("打开 Slack 应用后台", "https://api.slack.com/apps")],
  teams: MICROSOFT_GRAPH,
  discord: [link("打开 Discord Developer Portal", "https://discord.com/developers/applications")],
  feishu: [link("打开飞书开放平台", "https://open.feishu.cn/app")],
  wechat: [
    link("打开企业微信管理后台", "https://work.weixin.qq.com/wework_admin/frame#apps"),
    link("查看企业微信开发文档", "https://developer.work.weixin.qq.com/document/path/90665"),
  ],
  zoom: [link("打开 Zoom App Marketplace", "https://marketplace.zoom.us/develop/create")],
  gitlab: [link("创建 GitLab Personal Access Token", "https://gitlab.com/-/user_settings/personal_access_tokens")],
  bitbucket: [link("创建 Bitbucket App Password", "https://bitbucket.org/account/settings/app-passwords/")],
  vercel: [link("创建 Vercel Token", "https://vercel.com/account/tokens")],
  cloudflare: [link("创建 Cloudflare API Token", "https://dash.cloudflare.com/profile/api-tokens")],
  huggingface: [link("创建 Hugging Face Access Token", "https://huggingface.co/settings/tokens")],
  sentry: [link("创建 Sentry Auth Token", "https://sentry.io/settings/account/api/auth-tokens/")],
  supabase: [link("创建 Supabase Access Token", "https://supabase.com/dashboard/account/tokens")],
  linear: [link("打开 Linear API 设置", "https://linear.app/settings/account/security")],
  jira: [
    ATLASSIAN_API_TOKEN,
    link("查看 Jira Cloud 认证说明", "https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/"),
  ],
  confluence: [
    ATLASSIAN_API_TOKEN,
    link("查看 Confluence 认证说明", "https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/"),
  ],
  asana: [link("创建 Asana Personal Access Token", "https://app.asana.com/0/developer-console")],
  clickup: [link("打开 ClickUp Apps 设置", "https://app.clickup.com/settings/apps")],
  monday: [
    link("打开 monday 开发者后台", "https://monday.com/developers"),
    link("查看 monday.com 认证说明", "https://developer.monday.com/api-reference/docs/authentication"),
  ],
  airtable: [link("创建 Airtable Personal Access Token", "https://airtable.com/create/tokens")],
  loom: [link("查看 Loom API 说明", "https://support.atlassian.com/loom/docs/does-loom-have-an-open-api/")],
  figma: [link("打开 Figma 账号设置", "https://www.figma.com/settings")],
  canva: [link("打开 Canva 开发者平台", "https://www.canva.com/developers/integrations")],
  adobe: [link("打开 Adobe Developer Console", "https://developer.adobe.com/console")],
  salesforce: [link("查看 Salesforce Connected App 说明", "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm")],
  hubspot: [link("创建 HubSpot Private App", "https://app.hubspot.com/private-apps")],
  intercom: [link("打开 Intercom Developer Hub", "https://app.intercom.com/a/developer-signup")],
  stripe: [link("打开 Stripe API keys", "https://dashboard.stripe.com/apikeys")],
  x: [link("打开 X Developer Portal", "https://developer.x.com/en/portal/dashboard")],
  linkedin: [link("打开 LinkedIn 开发者后台", "https://www.linkedin.com/developers/apps")],
} as const satisfies Record<string, readonly ConnectorSetupLink[]>;

export function setupLinksFor(connectorId: string): readonly ConnectorSetupLink[] {
  const links = CONNECTOR_SETUP_LINKS[connectorId as keyof typeof CONNECTOR_SETUP_LINKS];
  if (!links?.length) throw new Error(`missing_setup_links:${connectorId}`);
  return links;
}
