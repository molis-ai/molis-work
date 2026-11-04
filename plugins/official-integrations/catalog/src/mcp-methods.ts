import type { PluginMcpMethodDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin-integrations";

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
