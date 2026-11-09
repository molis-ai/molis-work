import type { PluginConnectionLink, PluginConnectionWord } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { ConnectorMethodKind, ConnectorMethodSupport } from "@molis-ai/molis-work-contracts/services/connector-host";
import { setupLinksFor } from "./setup-links.js";

export interface OfficialConnectorMethod {
  readonly kind: ConnectorMethodKind;
  readonly support: ConnectorMethodSupport;
  readonly note: PluginConnectionWord;
  readonly connected_note?: PluginConnectionWord;
  readonly links: readonly PluginConnectionLink[];
}

/** Guide choices of the actual catalog service declarations. Dedicated integration packages own their own choices. */
export const OFFICIAL_CONNECTOR_METHODS: Readonly<Record<string, readonly OfficialConnectorMethod[]>> = {
  "google-calendar": [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "google-calendar.guide.oauth-link" }, url: "https://console.cloud.google.com/apis/credentials" }] },
    { kind: "token", support: "paste", note: { key: "google-calendar.guide.token-note" }, links: [setupLinksFor("google-calendar")[2]!] },
    { kind: "mcp", support: "external", note: { key: "google-calendar.guide.mcp-note" }, connected_note: { key: "google-calendar.guide.mcp-connected-note" }, links: [{ label: { key: "google-calendar.guide.mcp-link" }, url: "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server" }] },
  ],
  outlook: [
    { kind: "mcp", support: "external", note: { key: "outlook.guide.mcp-note" }, connected_note: { key: "outlook.guide.mcp-note" }, links: [{ label: { key: "outlook.guide.mcp-link" }, url: "https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "outlook.guide.oauth-link" }, url: "https://learn.microsoft.com/en-us/graph/auth-register-app-v2" }] },
    { kind: "cli", support: "external", note: { key: "outlook.guide.cli-note" }, links: [{ label: { key: "outlook.guide.cli-link" }, url: "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands" }] },
    { kind: "token", support: "paste", note: { key: "outlook.guide.token-note" }, links: [setupLinksFor("outlook")[0]!] },
  ],
  "google-drive": [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "google-drive.guide.oauth-link" }, url: "https://console.cloud.google.com/apis/credentials" }] },
    { kind: "token", support: "paste", note: { key: "google-drive.guide.token-note" }, links: [setupLinksFor("google-drive")[2]!] },
    { kind: "mcp", support: "external", note: { key: "google-drive.guide.mcp-note" }, connected_note: { key: "google-drive.guide.mcp-connected-note" }, links: [{ label: { key: "google-drive.guide.mcp-link" }, url: "https://developers.google.com/workspace/drive/api/guides/configure-mcp-server" }] },
  ],
  onedrive: [
    { kind: "mcp", support: "external", note: { key: "onedrive.guide.mcp-note" }, connected_note: { key: "onedrive.guide.mcp-note" }, links: [{ label: { key: "onedrive.guide.mcp-link" }, url: "https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "onedrive.guide.oauth-link" }, url: "https://learn.microsoft.com/en-us/graph/auth-register-app-v2" }] },
    { kind: "cli", support: "external", note: { key: "onedrive.guide.cli-note" }, links: [{ label: { key: "onedrive.guide.cli-link" }, url: "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands" }] },
    { kind: "token", support: "paste", note: { key: "onedrive.guide.token-note" }, links: [setupLinksFor("onedrive")[0]!] },
  ],
  sharepoint: [
    { kind: "mcp", support: "external", note: { key: "sharepoint.guide.mcp-note" }, connected_note: { key: "sharepoint.guide.mcp-note" }, links: [{ label: { key: "sharepoint.guide.mcp-link" }, url: "https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "sharepoint.guide.oauth-link" }, url: "https://learn.microsoft.com/en-us/graph/auth-register-app-v2" }] },
    { kind: "cli", support: "external", note: { key: "sharepoint.guide.cli-note" }, links: [{ label: { key: "sharepoint.guide.cli-link" }, url: "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands" }] },
    { kind: "token", support: "paste", note: { key: "sharepoint.guide.token-note" }, links: [setupLinksFor("sharepoint")[0]!] },
  ],
  dropbox: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "dropbox.guide.oauth-link" }, url: "https://developers.dropbox.com/oauth-guide" }] },
    { kind: "token", support: "paste", note: { key: "dropbox.guide.token-note" }, links: [setupLinksFor("dropbox")[0]!] },
    { kind: "mcp", support: "external", note: { key: "dropbox.guide.mcp-note" }, connected_note: { key: "dropbox.guide.mcp-connected-note" }, links: [{ label: { key: "dropbox.guide.mcp-link" }, url: "https://help.dropbox.com/integrations/connect-dropbox-mcp-server" }] },
  ],
  box: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "box.guide.oauth-link" }, url: "https://developer.box.com/guides/authentication/oauth2/" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "box.guide.cli-link" }, url: "https://developer.box.com/guides/cli/" }] },
    { kind: "token", support: "paste", note: { key: "box.guide.token-note" }, links: [setupLinksFor("box")[0]!] },
    { kind: "mcp", support: "external", note: { key: "box.guide.mcp-note" }, connected_note: { key: "box.guide.mcp-connected-note" }, links: [{ label: { key: "box.guide.mcp-link" }, url: "https://developer.box.com/guides/box-mcp/" }] },
  ],
  notion: [
    { kind: "oauth", support: "in_app", note: { key: "notion.guide.oauth-note" }, links: [{ label: { key: "notion.guide.oauth-link" }, url: "https://developers.notion.com/guides/get-started/authorization" }] },
    { kind: "cli", support: "external", note: { key: "notion.guide.cli-note" }, links: [{ label: { key: "notion.guide.cli-link" }, url: "https://developers.notion.com/cli/get-started/overview" }] },
    { kind: "token", support: "paste", note: { key: "notion.guide.token-note" }, links: [setupLinksFor("notion")[0]!] },
    { kind: "mcp", support: "external", note: { key: "notion.guide.mcp-note" }, connected_note: { key: "notion.guide.mcp-connected-note" }, links: [{ label: { key: "notion.guide.mcp-link" }, url: "https://developers.notion.com/guides/mcp/get-started-with-mcp" }] },
  ],
  slack: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "slack.guide.oauth-link" }, url: "https://api.slack.com/apps" }] },
    { kind: "token", support: "paste", note: { key: "slack.guide.token-note" }, links: [setupLinksFor("slack")[0]!] },
    { kind: "mcp", support: "external", note: { key: "slack.guide.mcp-note" }, connected_note: { key: "slack.guide.mcp-connected-note" }, links: [{ label: { key: "slack.guide.mcp-link" }, url: "https://docs.slack.dev/ai/slack-mcp-server/" }] },
  ],
  teams: [
    { kind: "mcp", support: "external", note: { key: "teams.guide.mcp-note" }, connected_note: { key: "teams.guide.mcp-note" }, links: [{ label: { key: "teams.guide.mcp-link" }, url: "https://learn.microsoft.com/en-us/microsoft-agent-365/tooling-servers-overview" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "teams.guide.oauth-link" }, url: "https://learn.microsoft.com/en-us/graph/auth-register-app-v2" }] },
    { kind: "cli", support: "external", note: { key: "teams.guide.cli-note" }, links: [{ label: { key: "teams.guide.cli-link" }, url: "https://learn.microsoft.com/powershell/microsoftgraph/authentication-commands" }] },
    { kind: "token", support: "paste", note: { key: "teams.guide.token-note" }, links: [setupLinksFor("teams")[0]!] },
  ],
  discord: [
    { kind: "oauth", support: "external", note: { key: "discord.guide.oauth-note" }, links: [{ label: { key: "discord.guide.oauth-link" }, url: "https://discord.com/developers/docs/topics/oauth2" }] },
    { kind: "token", support: "paste", note: { key: "discord.guide.token-note" }, links: [setupLinksFor("discord")[0]!] },
  ],
  feishu: [
    { kind: "oauth", support: "external", note: { key: "feishu.guide.oauth-note" }, links: [{ label: { key: "feishu.guide.oauth-link" }, url: "https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token" }] },
    { kind: "cli", support: "in_app", note: { key: "feishu.guide.cli-note" }, links: [{ label: { key: "feishu.guide.cli-link" }, url: "https://github.com/larksuite/cli" }] },
    { kind: "token", support: "paste", note: { key: "feishu.guide.token-note" }, links: [setupLinksFor("feishu")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "feishu.guide.mcp-link" }, url: "https://github.com/larksuite/lark-openapi-mcp" }] },
  ],
  lark: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "lark.guide.oauth-link" }, url: "https://open.larksuite.com/document/server-docs/authentication-management/access-token/get-user-access-token" }] },
    { kind: "cli", support: "external", note: { key: "lark.guide.cli-note" }, links: [{ label: { key: "lark.guide.cli-link" }, url: "https://github.com/larksuite/cli" }] },
    { kind: "token", support: "paste", note: { key: "lark.guide.token-note" }, links: [setupLinksFor("lark")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "lark.guide.mcp-link" }, url: "https://github.com/larksuite/lark-openapi-mcp" }] },
  ],
  wechat: [
    { kind: "token", support: "paste", note: { key: "wechat.guide.token-note" }, links: [setupLinksFor("wechat")[0]!] },
  ],
  zoom: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "zoom.guide.oauth-link" }, url: "https://developers.zoom.us/docs/integrations/oauth/" }] },
    { kind: "token", support: "paste", note: { key: "zoom.guide.token-note" }, links: [setupLinksFor("zoom")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "zoom.guide.mcp-link" }, url: "https://developers.zoom.us/docs/mcp/servers/" }] },
  ],
  gitlab: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "gitlab.guide.oauth-link" }, url: "https://docs.gitlab.com/integration/oauth_provider/" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "gitlab.guide.cli-link" }, url: "https://docs.gitlab.com/cli/" }] },
    { kind: "token", support: "paste", note: { key: "gitlab.guide.token-note" }, links: [setupLinksFor("gitlab")[0]!] },
    { kind: "mcp", support: "external", note: { key: "gitlab.guide.mcp-note" }, connected_note: { key: "gitlab.guide.mcp-connected-note" }, links: [{ label: { key: "gitlab.guide.mcp-link" }, url: "https://docs.gitlab.com/user/model_context_protocol/mcp_server/" }] },
  ],
  bitbucket: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "bitbucket.guide.oauth-link" }, url: "https://developer.atlassian.com/cloud/bitbucket/rest/intro/#authentication" }] },
    { kind: "token", support: "paste", note: { key: "bitbucket.guide.token-note" }, links: [setupLinksFor("bitbucket")[0]!] },
    { kind: "mcp", support: "external", note: { key: "bitbucket.guide.mcp-note" }, connected_note: { key: "bitbucket.guide.mcp-connected-note" }, links: [{ label: { key: "bitbucket.guide.mcp-link" }, url: "https://developer.atlassian.com/cloud/rovo-mcp/" }] },
  ],
  vercel: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "vercel.guide.oauth-link" }, url: "https://vercel.com/docs/integrations/create-integration/vercel-api-integrations" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "vercel.guide.cli-link" }, url: "https://vercel.com/docs/cli" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("vercel")[0]!] },
    { kind: "mcp", support: "external", note: { key: "vercel.guide.mcp-note" }, connected_note: { key: "vercel.guide.mcp-connected-note" }, links: [{ label: { key: "vercel.guide.mcp-link" }, url: "https://vercel.com/docs/agent-resources/vercel-mcp" }] },
  ],
  cloudflare: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "cloudflare.guide.oauth-link" }, url: "https://developers.cloudflare.com/fundamentals/oauth/" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "cloudflare.guide.cli-link" }, url: "https://developers.cloudflare.com/workers/wrangler/" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("cloudflare")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "cloudflare.guide.mcp-link" }, url: "https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/" }] },
  ],
  huggingface: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "huggingface.guide.oauth-link" }, url: "https://huggingface.co/docs/hub/oauth" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "huggingface.guide.cli-link" }, url: "https://huggingface.co/docs/huggingface_hub/guides/cli" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("huggingface")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "huggingface.guide.mcp-link" }, url: "https://huggingface.co/docs/hub/agents-mcp" }] },
  ],
  sentry: [
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "sentry.guide.cli-link" }, url: "https://cli.sentry.dev/" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "sentry.guide.oauth-link" }, url: "https://docs.sentry.io/organization/integrations/integration-platform/" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("sentry")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "sentry.guide.mcp-link" }, url: "https://github.com/getsentry/sentry-mcp" }] },
  ],
  supabase: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "supabase.guide.oauth-link" }, url: "https://supabase.com/docs/guides/integrations/build-a-supabase-integration" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "supabase.guide.cli-link" }, url: "https://supabase.com/docs/guides/local-development/cli/getting-started" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("supabase")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "supabase.guide.mcp-link" }, url: "https://supabase.com/docs/guides/ai-tools/mcp" }] },
  ],
  linear: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "linear.guide.oauth-link" }, url: "https://linear.app/developers/oauth-2-0-authentication" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("linear")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "linear.guide.mcp-link" }, url: "https://linear.app/docs/mcp" }] },
  ],
  jira: [
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "jira.guide.cli-link" }, url: "https://developer.atlassian.com/cloud/acli/guides/introduction/" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "jira.guide.oauth-link" }, url: "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("jira")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "jira.guide.mcp-link" }, url: "https://developer.atlassian.com/cloud/rovo-mcp/" }] },
  ],
  confluence: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "confluence.guide.oauth-link" }, url: "https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("confluence")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "confluence.guide.mcp-link" }, url: "https://developer.atlassian.com/cloud/rovo-mcp/" }] },
  ],
  asana: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "asana.guide.oauth-link" }, url: "https://developers.asana.com/docs/oauth" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("asana")[0]!] },
    { kind: "mcp", support: "external", note: { key: "asana.guide.mcp-note" }, connected_note: { key: "asana.guide.mcp-connected-note" }, links: [{ label: { key: "asana.guide.mcp-link" }, url: "https://developers.asana.com/docs/integrating-with-asanas-mcp-server" }] },
  ],
  clickup: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "clickup.guide.oauth-link" }, url: "https://developer.clickup.com/docs/authentication" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("clickup")[0]!] },
    { kind: "mcp", support: "external", note: { key: "clickup.guide.mcp-note" }, connected_note: { key: "clickup.guide.mcp-connected-note" }, links: [{ label: { key: "clickup.guide.mcp-link" }, url: "https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server" }] },
  ],
  monday: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "monday.guide.oauth-link" }, url: "https://developer.monday.com/apps/docs/oauth" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("monday")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "monday.guide.mcp-link" }, url: "https://developer.monday.com/api-reference/docs/integrate-with-monday-mcp" }] },
  ],
  airtable: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "airtable.guide.oauth-link" }, url: "https://airtable.com/developers/web/api/oauth-reference" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("airtable")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "airtable.guide.mcp-link" }, url: "https://support.airtable.com/articles/9897799762-using-the-airtable-mcp-server" }] },
  ],
  loom: [
    { kind: "mcp", support: "external", note: { key: "loom.guide.mcp-note" }, connected_note: { key: "loom.guide.mcp-note" }, links: [{ label: { key: "loom.guide.mcp-link" }, url: "https://developer.atlassian.com/cloud/rovo-mcp/" }] },
  ],
  figma: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "figma.guide.oauth-link" }, url: "https://developers.figma.com/docs/rest-api/authentication/" }] },
    { kind: "token", support: "paste", note: { key: "common.connector.paste-token" }, links: [setupLinksFor("figma")[0]!] },
    { kind: "mcp", support: "external", note: { key: "figma.guide.mcp-note" }, connected_note: { key: "figma.guide.mcp-note" }, links: [{ label: { key: "figma.guide.mcp-link" }, url: "https://developers.figma.com/docs/figma-mcp-server/" }] },
  ],
  canva: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "canva.guide.oauth-link" }, url: "https://www.canva.dev/docs/connect/authentication/" }] },
    { kind: "token", support: "paste", note: { key: "canva.guide.token-note" }, links: [setupLinksFor("canva")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "canva.guide.mcp-link" }, url: "https://www.canva.dev/docs/apps/mcp/" }] },
  ],
  adobe: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "adobe.guide.oauth-link" }, url: "https://developer.adobe.com/developer-console/docs/guides/authentication/UserAuthentication/" }] },
    { kind: "token", support: "paste", note: { key: "adobe.guide.token-note" }, links: [setupLinksFor("adobe")[0]!] },
  ],
  salesforce: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "salesforce.guide.oauth-link" }, url: "https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm" }] },
    { kind: "cli", support: "external", note: { key: "salesforce.guide.cli-note" }, links: [{ label: { key: "salesforce.guide.cli-link" }, url: "https://developer.salesforce.com/docs/platform/salesforce-cli-reference/guide/cli_reference_org_login_web.html" }] },
    { kind: "token", support: "paste", note: { key: "salesforce.guide.token-note" }, links: [setupLinksFor("salesforce")[0]!] },
    { kind: "mcp", support: "external", note: { key: "salesforce.guide.mcp-note" }, connected_note: { key: "salesforce.guide.mcp-connected-note" }, links: [{ label: { key: "salesforce.guide.mcp-link" }, url: "https://developer.salesforce.com/docs/platform/hosted-mcp-servers/guide/hosted-mcp-servers-overview.html" }] },
  ],
  hubspot: [
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "hubspot.guide.cli-link" }, url: "https://developers.hubspot.com/docs/developer-tooling/local-development/agent-cli/guide" }] },
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "hubspot.guide.oauth-link" }, url: "https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/oauth" }] },
    { kind: "token", support: "paste", note: { key: "hubspot.guide.token-note" }, links: [setupLinksFor("hubspot")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "hubspot.guide.mcp-link" }, url: "https://developers.hubspot.com/ai-tools/mcp" }] },
  ],
  intercom: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "intercom.guide.oauth-link" }, url: "https://developers.intercom.com/docs/build-an-integration/learn-more/authentication/setting-up-oauth" }] },
    { kind: "token", support: "paste", note: { key: "intercom.guide.token-note" }, links: [setupLinksFor("intercom")[0]!] },
    { kind: "mcp", support: "external", note: { key: "intercom.guide.mcp-note" }, connected_note: { key: "intercom.guide.mcp-connected-note" }, links: [{ label: { key: "intercom.guide.mcp-link" }, url: "https://developers.intercom.com/docs/guides/mcp" }] },
  ],
  stripe: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "stripe.guide.oauth-link" }, url: "https://docs.stripe.com/connect/oauth-reference" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "stripe.guide.cli-link" }, url: "https://docs.stripe.com/stripe-cli" }] },
    { kind: "token", support: "paste", note: { key: "stripe.guide.token-note" }, links: [setupLinksFor("stripe")[0]!] },
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "stripe.guide.mcp-link" }, url: "https://docs.stripe.com/mcp" }] },
  ],
  x: [
    { kind: "mcp", support: "external", note: { key: "common.connector.mcp-external" }, links: [{ label: { key: "x.guide.mcp-link" }, url: "https://github.com/xdevplatform/xurl" }] },
    { kind: "cli", support: "external", note: { key: "common.connector.cli-external" }, links: [{ label: { key: "x.guide.cli-link" }, url: "https://github.com/xdevplatform/xurl" }] },
    { kind: "oauth", support: "external", note: { key: "x.guide.oauth-note" }, links: [{ label: { key: "x.guide.oauth-link" }, url: "https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code" }] },
    { kind: "token", support: "paste", note: { key: "x.guide.token-note" }, links: [setupLinksFor("x")[0]!] },
  ],
  linkedin: [
    { kind: "oauth", support: "external", note: { key: "common.connector.oauth-external" }, links: [{ label: { key: "linkedin.guide.oauth-link" }, url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow" }] },
    { kind: "token", support: "paste", note: { key: "linkedin.guide.token-note" }, links: [setupLinksFor("linkedin")[0]!] },
  ],
};

export function officialMethodsFor(connectorId: string): readonly OfficialConnectorMethod[] {
  return Object.hasOwn(OFFICIAL_CONNECTOR_METHODS, connectorId) ? OFFICIAL_CONNECTOR_METHODS[connectorId]! : [];
}
