import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { cliRequestInstallation, preparedCliRequest, installPreparedCli, connectPreparedCli } from "./connector-cli-setup.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readLocalWebBody, requestHost, sendLocalWebJson as json } from "./web-http.js";
import { startApiOAuth, completeApiOAuth, ApiOAuthError } from "./connector-api-oauth.js";
import { cliAvailability, cliLoginJob, connectCli, ConnectorCliError, inspectCliConnection, startCliLogin } from "./connector-cli.js";
import { inspectApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { inspectMcpConnection } from "./connector-mcp.js";
import { connectorAuthorizationFailed } from "./connector-authorization-return.js";
import type { ConnectorMcpDirectory, ConnectorMcpTool } from "./connector-mcp-actions.js";
import { connectorAuthorizationStatus } from "./connector-authorization-status.js";
import { saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import { startConnectorSetupSubmission } from "./connector-setup-submission.js";
import { OAUTH_CALLBACK, oauthCallbackAlias } from "./connector-oauth-callback-paths.js";
import { oauthReturnLocation, requestedOAuthReturn } from "./connector-oauth-return.js";

const ROOT = "/api/settings/connectors/methods";
/** Where the service came back to: the generic callback, or an alias the service's redirect URI was registered under (W5-11 §3.1). */
const isOAuthCallback = (pathname: string) => pathname === OAUTH_CALLBACK || oauthCallbackAlias(pathname) !== undefined;
const ITEM = /^\/api\/settings\/connectors\/connections\/([a-z0-9-]+)\/(verify|preview)$/u;
export async function handleConnectorApiMethodsHttp(request: IncomingMessage, response: ServerResponse, url: URL, home: string | undefined,
  mcpTools: ConnectorMcpDirectory["remember"], beforeEffect: () => void | Promise<void>): Promise<boolean> {
  const item = ITEM.exec(url.pathname);
  if (!home || (!item && !isOAuthCallback(url.pathname) && !url.pathname.startsWith(`${ROOT}/oauth/`) && !url.pathname.startsWith(`${ROOT}/cli/`))) return false;
  try {
    const host = requestHost(request);
    if (!host) throw new ApiOAuthError("连接操作必须来自本机应用");
    const origin = `http://${host}`;
    if (request.method === "GET" && isOAuthCallback(url.pathname)) {
      const result = await completeApiOAuth(home, { origin, callback: `${origin}${url.pathname}`, state: url.searchParams.get("state") || "",
        code: url.searchParams.get("code") || "", error: url.searchParams.get("error") || undefined, iss: url.searchParams.get("iss") ?? undefined });
      response.writeHead(302, { location: result.status === "pending" ? `/capabilities/connections?setup=${result.authorization_id}`
        : oauthReturnLocation("return_to" in result ? result.return_to : undefined, "connected")
          ?? `/settings/connectors?connected=${encodeURIComponent(result.service_id)}&connection=${encodeURIComponent(result.connection.connection_id)}`, "cache-control": "no-store" }); response.end(); return true;
    }
    if (request.method !== "POST") { json(response, 405, { error: "请使用应用内连接操作" }); return true; }
    const body = await readLocalWebBody(request);
    const str = (key: string) => typeof body[key] === "string" ? body[key] as string : "";
    if (url.pathname === `${ROOT}/oauth/start`) {
      const settings: Record<string, string> = {};
      if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) for (const [key, value] of Object.entries(body.settings)) if (typeof value === "string" && value.length < 2048) settings[key] = value;
      let returnTo: ReturnType<typeof requestedOAuthReturn>;
      try { returnTo = requestedOAuthReturn(home, body); } catch (refused) { throw new ApiOAuthError(refused instanceof Error ? refused.message : "请从来源清单重新发起连接"); }
      json(response, 200, await startApiOAuth(home, { serviceId: str("service_id"), displayName: str("display_name"), clientId: str("client_id"), clientSecret: str("client_secret"), settings, origin, redirectUri: str("redirect_uri"), connectionId: str("connection_id") || undefined, setupId: str("setup_id") || undefined, returnTo }));
    } else if (url.pathname === `${ROOT}/oauth/complete`) json(response, 200, await completeApiOAuth(home, { origin, returnedUrl: str("returned_url") }));
    else if (url.pathname === `${ROOT}/cli/install`) json(response, 200, await installPreparedCli(home, str("setup_id"), { beforeEffect }));
    else if (url.pathname === `${ROOT}/cli/status`) {
      const installed = str("setup_id") ? cliRequestInstallation(home, str("setup_id"), str("service_id")) : undefined;
      json(response, 200, { ...cliAvailability(str("service_id")), ...(installed ? { installed: true } : {}) });
    }
    else if (url.pathname === `${ROOT}/cli/login`) {
      const id = str("setup_id"), service = str("service_id"), installed = id ? cliRequestInstallation(home, id, service) : undefined;
      const environment: Record<string, string> = {};
      if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) for (const [name, value] of Object.entries(body.settings)) if (typeof value === "string" && value) environment[name] = value;
      const configure = body.configure === true;
      const started = await startCliLogin(home, service, installed, { id: id || undefined, configure, environment,
        beforeEffect: async () => { await beforeEffect(); if (id) preparedCliRequest(home, id, service); },
        ...(id ? { complete: async (signal: AbortSignal) => {
          if (!configure) return connectPreparedCli(home, id, { signal, beforeEffect }, service);
          await beforeEffect(); signal.throwIfAborted(); preparedCliRequest(home, id, service);
          saveConnectorAuthorizationPresentation(home, id, { cli_job: undefined });
        } } : {}),
      });
      if (id && cliLoginJob(home, started.job_id).status === "running" && ["prepared", "failed"].includes(connectorAuthorizationStatus(home, id)?.status ?? "")) saveConnectorAuthorizationPresentation(home, id, { cli_job: started.job_id });
      json(response, 200, started);
    }
    else if (url.pathname === `${ROOT}/cli/job`) json(response, 200, cliLoginJob(home, str("job_id"), typeof body.input === "string" ? body.input : undefined, body.cancel === true));
    else if (url.pathname === `${ROOT}/cli/connect`) {
      if (str("setup_id")) { json(response, 200, await connectPreparedCli(home, str("setup_id"), { beforeEffect }, str("service_id"))); return true; }
      const setup = startConnectorSetupSubmission(home, str("setup_id") || undefined, { service_id: str("service_id"), method: "cli" });
      try {
        const result = await connectCli(home, { serviceId: str("service_id"), displayName: str("display_name") }, undefined, beforeEffect, setup?.submit);
        json(response, "status" in result && result.status === "pending" ? 202 : 200, result);
      } catch (error) { setup?.fail(); throw error; }
    }
    else if (item) {
      const row = withConnectorConnections(home, store => store.require(item[1]!));
      json(response, 200, row.auth_method === "mcp" ? await inspectMcpConnection(home, row.connection_id).then(result => { mcpTools(row.connection_id, result.tools as ConnectorMcpTool[], result.resources); return result; })
        : row.auth_method === "cli" ? await inspectCliConnection(home, row.connection_id, item[2] === "preview")
          : await inspectApiConnection(home, row.connection_id, item[2] === "preview"));
    } else json(response, 404, { error: "连接操作不存在" });
  } catch (error) {
    if (request.method === "GET" && isOAuthCallback(url.pathname)) {
      const cancelled = url.searchParams.get("error") === "access_denied";
      const back = error instanceof ApiOAuthError ? oauthReturnLocation(error.returnTo, cancelled ? "cancelled" : "failed") : undefined;
      if (back) { response.writeHead(302, { location: back, "cache-control": "no-store" }); response.end(); }
      else connectorAuthorizationFailed(response, error instanceof ApiOAuthError ? error.serviceId : undefined, cancelled);
      return true;
    }
    json(response, 400, { error: error instanceof ApiOAuthError || error instanceof ConnectorCliError || error instanceof ActionError || (item && error instanceof Error) ? error.message : "连接失败，请检查应用配置、回调地址及权限后重试" });
  }
  return true;
}
