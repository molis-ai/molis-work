import type { CatalogFetch } from "./types.js";

export interface NotionOAuthTokens {
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  workspaceName: string;
  botId: string;
}

export class NotionOAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "NotionOAuthError";
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Notion OAuth 缺少 ${field}`);
  return value.trim();
}

export function notionAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.search = new URLSearchParams({
    owner: "user",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    state: input.state,
  }).toString();
  return url.toString();
}

export async function notionOAuthToken(input: {
  clientId: string;
  clientSecret: string;
  grant: { type: "authorization_code"; code: string; redirectUri: string } | { type: "refresh_token"; refreshToken: string };
  fetchImpl?: CatalogFetch;
}): Promise<NotionOAuthTokens> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const body = input.grant.type === "authorization_code"
    ? { grant_type: "authorization_code", code: input.grant.code, redirect_uri: input.grant.redirectUri }
    : { grant_type: "refresh_token", refresh_token: input.grant.refreshToken };
  const response = await fetchImpl("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json();
  const data = json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  if (!response.ok) throw new NotionOAuthError(response.status, typeof data.error === "string" ? `Notion OAuth: ${data.error}` : `Notion OAuth HTTP ${response.status}`);
  return {
    accessToken: requiredText(data.access_token, "access_token"),
    refreshToken: requiredText(data.refresh_token, "refresh_token"),
    workspaceId: requiredText(data.workspace_id, "workspace_id"),
    workspaceName: typeof data.workspace_name === "string" ? data.workspace_name.trim() : "",
    botId: requiredText(data.bot_id, "bot_id"),
  };
}
