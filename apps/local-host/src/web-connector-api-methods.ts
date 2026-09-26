import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestHost, sendLocalWebJson as json } from "./web-http.js";
import { startApiOAuth, completeApiOAuth, ApiOAuthError } from "./connector-api-oauth.js";
import { cliAvailability, cliLoginJob, connectCli, ConnectorCliError, inspectCliConnection, startCliLogin } from "./connector-cli.js";
import { inspectApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { inspectMcpConnection } from "./connector-mcp.js";

const ROOT = "/api/settings/connectors/methods";
const ITEM = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/(verify|preview)$/u;
export async function handleConnectorApiMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home?: string): Promise<boolean> {
  const item = ITEM.exec(url.pathname);
  if (!home || (!item && !url.pathname.startsWith(`${ROOT}/oauth/`) && !url.pathname.startsWith(`${ROOT}/cli/`))) return false;
  try {
    const host = requestHost(request);
    if (!host) throw new ApiOAuthError("连接操作必须来自本机应用");
    const origin = `http://${host}`;
    if (request.method === "GET" && url.pathname === `${ROOT}/oauth/callback`) {
      const result = await completeApiOAuth(home, { origin, state: url.searchParams.get("state") || "", code: url.searchParams.get("code") || "", error: url.searchParams.get("error") || undefined });
      response.writeHead(302, { location: `/settings/connectors?connected=${encodeURIComponent(result.service_id)}`, "cache-control": "no-store" }); response.end(); return true;
    }
    if (request.method !== "POST") { json(response, 405, { error: "请使用应用内连接操作" }); return true; }
    const body = await readLocalWebBody(request);
    const str = (key: string) => typeof body[key] === "string" ? body[key] as string : "";
    if (url.pathname === `${ROOT}/oauth/start`) {
      const settings: Record<string, string> = {};
      if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) for (const [key, value] of Object.entries(body.settings)) if (typeof value === "string" && value.length < 2048) settings[key] = value;
      json(response, 200, await startApiOAuth(home, { serviceId: str("service_id"), displayName: str("display_name"), clientId: str("client_id"), clientSecret: str("client_secret"), settings, origin, redirectUri: str("redirect_uri"), connectionId: str("connection_id") || undefined }));
    } else if (url.pathname === `${ROOT}/oauth/complete`) json(response, 200, await completeApiOAuth(home, { origin, returnedUrl: str("returned_url") }));
    else if (url.pathname === `${ROOT}/cli/status`) json(response, 200, cliAvailability(str("service_id")));
    else if (url.pathname === `${ROOT}/cli/login`) json(response, 200, await startCliLogin(home, str("service_id")));
    else if (url.pathname === `${ROOT}/cli/job`) json(response, 200, cliLoginJob(home, str("job_id"), typeof body.input === "string" ? body.input : undefined, body.cancel === true));
    else if (url.pathname === `${ROOT}/cli/connect`) json(response, 200, await connectCli(home, { serviceId: str("service_id"), displayName: str("display_name") }));
    else if (item) {
      const row = withConnectorConnections(home, store => store.require(item[1]!));
      json(response, 200, row.auth_method === "mcp" ? await inspectMcpConnection(home, row.connection_id)
        : row.auth_method === "cli" ? await inspectCliConnection(home, row.connection_id, item[2] === "preview")
          : await inspectApiConnection(home, row.connection_id, item[2] === "preview"));
    } else json(response, 404, { error: "连接操作不存在" });
  } catch (error) {
    json(response, 400, { error: error instanceof ApiOAuthError || error instanceof ConnectorCliError || (item && error instanceof Error) ? error.message : "连接失败，请检查应用配置、回调地址及权限后重试" });
  }
  return true;
}
