import type { PluginMcpMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";
import type { LocalMcpLaunchInput, LocalMcpServerDeclaration, LocalMcpStdioDeclaration } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

/** Remote MCP data owned by each catalog integration, consumed by the common Host path. */
const METHODS: Readonly<Record<string, PluginMcpMethodDeclaration>> = {
  "google-drive": { kind: "mcp", endpoint: "https://drivemcp.googleapis.com/mcp/v1", auth: "either", registration: "manual" },
  "google-calendar": { kind: "mcp", endpoint: "https://calendarmcp.googleapis.com/mcp/v1", auth: "either", registration: "manual" },
  "outlook": { kind: "mcp", endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_MailTools", auth: "either", registration: "manual", endpoint_pattern: { source: "^https:\\/\\/agent365\\.svc\\.cloud\\.microsoft\\/agents\\/tenants\\/[0-9a-f-]{36}\\/servers\\/mcp_MailTools$", flags: "iu" } },
  "onedrive": { kind: "mcp", endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_OneDriveRemoteServer", auth: "either", registration: "manual", endpoint_pattern: { source: "^https:\\/\\/agent365\\.svc\\.cloud\\.microsoft\\/agents\\/tenants\\/[0-9a-f-]{36}\\/servers\\/mcp_OneDriveRemoteServer$", flags: "iu" } },
  "sharepoint": { kind: "mcp", endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_SharePointRemoteServer", auth: "either", registration: "manual", endpoint_pattern: { source: "^https:\\/\\/agent365\\.svc\\.cloud\\.microsoft\\/agents\\/tenants\\/[0-9a-f-]{36}\\/servers\\/mcp_SharePointRemoteServer$", flags: "iu" } },
  "teams": { kind: "mcp", endpoint: "https://agent365.svc.cloud.microsoft/agents/tenants/{tenantId}/servers/mcp_TeamsServer", auth: "either", registration: "manual", endpoint_pattern: { source: "^https:\\/\\/agent365\\.svc\\.cloud\\.microsoft\\/agents\\/tenants\\/[0-9a-f-]{36}\\/servers\\/mcp_TeamsServer$", flags: "iu" } },
  "salesforce": { kind: "mcp", endpoint: "https://api.salesforce.com/platform/mcp/v1/{serverName}", auth: "either", registration: "manual", endpoint_pattern: { source: "^https:\\/\\/api\\.salesforce\\.com\\/platform\\/mcp\\/v1\\/(?:sandbox\\/)?[A-Za-z0-9_-]+$", flags: "u" } },
  "canva": { kind: "mcp", endpoint: "https://mcp.canva.com/mcp", auth: "oauth", registration: "manual" },
  "notion": { kind: "mcp", endpoint: "https://mcp.notion.com/mcp", auth: "oauth" },
  "dropbox": { kind: "mcp", endpoint: "https://mcp.dropbox.com/mcp", auth: "oauth", registration: "manual" },
  "box": { kind: "mcp", endpoint: "https://mcp.box.com", auth: "oauth", registration: "manual" },
  "slack": { kind: "mcp", endpoint: "https://mcp.slack.com/mcp", auth: "oauth", registration: "manual" },
  "gitlab": { kind: "mcp", endpoint: "https://gitlab.com/api/v4/mcp", auth: "oauth" },
  "vercel": { kind: "mcp", endpoint: "https://mcp.vercel.com", auth: "oauth" },
  "cloudflare": { kind: "mcp", endpoint: "https://mcp.cloudflare.com/mcp", auth: "either" },
  "huggingface": { kind: "mcp", endpoint: "https://huggingface.co/mcp", auth: "either" },
  "sentry": { kind: "mcp", endpoint: "https://mcp.sentry.dev/mcp", auth: "either", token_scheme: "Sentry-Bearer" },
  "supabase": { kind: "mcp", endpoint: "https://mcp.supabase.com/mcp?read_only=true", auth: "either" },
  "linear": { kind: "mcp", endpoint: "https://mcp.linear.app/mcp/readonly", auth: "either" },
  "asana": { kind: "mcp", endpoint: "https://mcp.asana.com/v2/mcp", auth: "oauth", registration: "manual" },
  "clickup": { kind: "mcp", endpoint: "https://mcp.clickup.com/mcp", auth: "oauth" },
  "monday": { kind: "mcp", endpoint: "https://mcp.monday.com/mcp", auth: "either" },
  "airtable": { kind: "mcp", endpoint: "https://mcp.airtable.com/mcp", auth: "either" },
  "jira": { kind: "mcp", endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  "confluence": { kind: "mcp", endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  "bitbucket": { kind: "mcp", endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  "loom": { kind: "mcp", endpoint: "https://mcp.atlassian.com/v2/mcp", auth: "oauth" },
  "stripe": { kind: "mcp", endpoint: "https://mcp.stripe.com", auth: "either" },
  "intercom": { kind: "mcp", endpoint: "https://mcp.intercom.com/mcp", auth: "either" },
  "hubspot": { kind: "mcp", endpoint: "https://mcp.hubspot.com", auth: "oauth", registration: "manual" },
  "zoom": { kind: "mcp", endpoint: "https://zoom.us/mcp/meeting/streamable", auth: "oauth", registration: "manual" },
  "x": { kind: "mcp", endpoint: "https://api.x.com/mcp", auth: "either", registration: "manual" },
  figma: { kind: "mcp", endpoint: "https://mcp.figma.com/mcp", auth: "oauth", registration: "manual" },
};

export function catalogMcpMethod(serviceId: string): PluginMcpMethodDeclaration | undefined {
  return Object.hasOwn(METHODS, serviceId) ? METHODS[serviceId] : undefined;
}

/**
 * The catalog's MCP servers that run on this machine (D3 A, M11): `stdio` ones the Host starts itself, `loopback` ones a desktop
 * app already serves on a fixed local address. The Host reads only these flags and never names a service.
 */
/**
 * The Feishu/Lark MCP server: the `@larksuiteoapi/lark-mcp` package the Host pins, given the app credentials and the open-platform
 * origin, with the user's token when the connection has one and the app's tenant token otherwise.
 */
const LARK_MCP: LocalMcpStdioDeclaration = Object.freeze({
  package: "@larksuiteoapi/lark-mcp",
  entry: "dist/cli.js",
  args: ["mcp"],
  environment: (input: LocalMcpLaunchInput): Record<string, string> => ({
    APP_ID: input.client_id, APP_SECRET: input.client_secret, LARK_DOMAIN: input.origin,
    LARK_TOKEN_MODE: input.access_token ? "user_access_token" : "tenant_access_token",
    ...(input.access_token ? { USER_ACCESS_TOKEN: input.access_token } : {}),
  }),
});
export const CATALOG_LOCAL_MCP_SERVERS: Readonly<Record<string, LocalMcpServerDeclaration>> = Object.freeze({
  feishu: { endpoint: "https://open.feishu.cn/", stdio: LARK_MCP },
  lark: { endpoint: "https://open.larksuite.com/", stdio: LARK_MCP },
  figma: { endpoint: "http://127.0.0.1:3845/mcp", loopback: true, auth: "none" },
});
