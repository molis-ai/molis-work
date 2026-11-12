import type { PluginConnectionLink } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

// Each service owns the label even where several services use the same official address.
const CONNECTOR_SETUP_LINKS: Readonly<Record<string, readonly PluginConnectionLink[]>> = {
  "google-calendar": [{ label: { key: "google-calendar.setup.enable-calendar-api" }, url: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" }, { label: { key: "google-calendar.setup.create-oauth-client" }, url: "https://console.cloud.google.com/apis/credentials" }, { label: { key: "google-calendar.setup.get-a-token-in-oauth-playground" }, url: "https://developers.google.com/oauthplayground" }],
  outlook: [{ label: { key: "outlook.setup.get-a-token-in-graph-explorer" }, url: "https://developer.microsoft.com/graph/graph-explorer" }, { label: { key: "outlook.setup.register-azure-app" }, url: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }],
  "google-drive": [{ label: { key: "google-drive.setup.enable-drive-api" }, url: "https://console.cloud.google.com/apis/library/drive.googleapis.com" }, { label: { key: "google-drive.setup.create-oauth-client" }, url: "https://console.cloud.google.com/apis/credentials" }, { label: { key: "google-drive.setup.get-a-token-in-oauth-playground" }, url: "https://developers.google.com/oauthplayground" }],
  onedrive: [{ label: { key: "onedrive.setup.get-a-token-in-graph-explorer" }, url: "https://developer.microsoft.com/graph/graph-explorer" }, { label: { key: "onedrive.setup.register-azure-app" }, url: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }],
  sharepoint: [{ label: { key: "sharepoint.setup.get-a-token-in-graph-explorer" }, url: "https://developer.microsoft.com/graph/graph-explorer" }, { label: { key: "sharepoint.setup.register-azure-app" }, url: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }],
  dropbox: [{ label: { key: "dropbox.setup.open-dropbox-app-console" }, url: "https://www.dropbox.com/developers/apps" }],
  box: [{ label: { key: "box.setup.open-box-developer-console" }, url: "https://app.box.com/developers/console" }],
  notion: [{ label: { key: "notion.setup.create-notion-integration" }, url: "https://www.notion.so/my-integrations" }, { label: { key: "notion.setup.notion-oauth-setup-guide" }, url: "https://developers.notion.com/guides/get-started/authorization" }],
  slack: [{ label: { key: "slack.setup.open-slack-app-dashboard" }, url: "https://api.slack.com/apps" }],
  teams: [{ label: { key: "teams.setup.get-a-token-in-graph-explorer" }, url: "https://developer.microsoft.com/graph/graph-explorer" }, { label: { key: "teams.setup.register-azure-app" }, url: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" }],
  discord: [{ label: { key: "discord.setup.open-discord-developer-portal" }, url: "https://discord.com/developers/applications" }],
  feishu: [{ label: { key: "feishu.setup.open-feishu-open-platform" }, url: "https://open.feishu.cn/app" }, { label: { key: "feishu.setup.install-and-configure-the-official-feishu-cli" }, url: "https://github.com/larksuite/cli" }],
  lark: [{ label: { key: "lark.setup.open-lark-open-platform" }, url: "https://open.larksuite.com/app" }],
  wechat: [{ label: { key: "wechat.setup.open-the-wecom-admin-console" }, url: "https://work.weixin.qq.com/wework_admin/frame#apps" }, { label: { key: "wechat.setup.view-wecom-developer-documentation" }, url: "https://developer.work.weixin.qq.com/document/path/90665" }],
  zoom: [{ label: { key: "zoom.setup.open-zoom-app-marketplace" }, url: "https://marketplace.zoom.us/develop/create" }],
  gitlab: [{ label: { key: "gitlab.setup.create-gitlab-personal-access-token" }, url: "https://gitlab.com/-/user_settings/personal_access_tokens" }],
  bitbucket: [{ label: { key: "bitbucket.setup.create-atlassian-api-token" }, url: "https://id.atlassian.com/manage-profile/security/api-tokens" }],
  vercel: [{ label: { key: "vercel.setup.create-vercel-token" }, url: "https://vercel.com/account/tokens" }],
  cloudflare: [{ label: { key: "cloudflare.setup.create-cloudflare-api-token" }, url: "https://dash.cloudflare.com/profile/api-tokens" }],
  huggingface: [{ label: { key: "huggingface.setup.create-hugging-face-access-token" }, url: "https://huggingface.co/settings/tokens" }],
  sentry: [{ label: { key: "sentry.setup.create-sentry-auth-token" }, url: "https://sentry.io/settings/account/api/auth-tokens/" }],
  supabase: [{ label: { key: "supabase.setup.create-supabase-access-token" }, url: "https://supabase.com/dashboard/account/tokens" }],
  linear: [{ label: { key: "linear.setup.open-linear-api-settings" }, url: "https://linear.app/settings/account/security" }],
  jira: [{ label: { key: "jira.setup.create-atlassian-api-token" }, url: "https://id.atlassian.com/manage-profile/security/api-tokens" }, { label: { key: "jira.setup.view-jira-cloud-authentication-guide" }, url: "https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/" }],
  confluence: [{ label: { key: "confluence.setup.create-atlassian-api-token" }, url: "https://id.atlassian.com/manage-profile/security/api-tokens" }, { label: { key: "confluence.setup.view-confluence-authentication-guide" }, url: "https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/" }],
  asana: [{ label: { key: "asana.setup.create-asana-personal-access-token" }, url: "https://app.asana.com/0/developer-console" }],
  clickup: [{ label: { key: "clickup.setup.open-clickup-apps-settings" }, url: "https://app.clickup.com/settings/apps" }],
  monday: [{ label: { key: "monday.setup.open-monday-developer-dashboard" }, url: "https://monday.com/developers" }, { label: { key: "monday.setup.view-monday-com-authentication-guide" }, url: "https://developer.monday.com/api-reference/docs/authentication" }],
  airtable: [{ label: { key: "airtable.setup.create-airtable-personal-access-token" }, url: "https://airtable.com/create/tokens" }],
  loom: [{ label: { key: "loom.setup.view-loom-api-guide" }, url: "https://support.atlassian.com/loom/docs/does-loom-have-an-open-api/" }],
  figma: [{ label: { key: "figma.setup.open-figma-account-settings" }, url: "https://www.figma.com/settings" }],
  canva: [{ label: { key: "canva.setup.open-canva-developer-platform" }, url: "https://www.canva.com/developers/integrations" }],
  adobe: [{ label: { key: "adobe.setup.open-adobe-developer-console" }, url: "https://developer.adobe.com/console" }],
  salesforce: [{ label: { key: "salesforce.setup.view-salesforce-connected-app-guide" }, url: "https://help.salesforce.com/s/articleView?id=sf.connected_app_create.htm" }],
  hubspot: [{ label: { key: "hubspot.setup.view-hubspot-service-key-setup" }, url: "https://developers.hubspot.com/changelog/service-keys" }],
  intercom: [{ label: { key: "intercom.setup.open-intercom-developer-hub" }, url: "https://app.intercom.com/a/developer-signup" }],
  stripe: [{ label: { key: "stripe.setup.open-stripe-api-keys" }, url: "https://dashboard.stripe.com/apikeys" }],
  x: [{ label: { key: "x.setup.open-x-developer-portal" }, url: "https://developer.x.com/en/portal/dashboard" }],
  linkedin: [{ label: { key: "linkedin.setup.open-linkedin-developer-dashboard" }, url: "https://www.linkedin.com/developers/apps" }],
};

export function setupLinksFor(connectorId: string): readonly PluginConnectionLink[] {
  return Object.hasOwn(CONNECTOR_SETUP_LINKS, connectorId) ? CONNECTOR_SETUP_LINKS[connectorId]! : [];
}
