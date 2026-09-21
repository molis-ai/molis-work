import type { IncomingMessage, ServerResponse } from "node:http";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import {
  bindConnectorToken,
  connectorCredentialStatus,
  resolveGithubToken,
  unbindConnectorToken,
} from "./connector-credentials.js";
import { pollGithubDeviceFlow, startGithubDeviceFlow, storeGithubClientId } from "./github-oauth.js";
import {
  completeGmailOAuthFlow,
  startGmailOAuthFlow,
  storeGmailOAuthClient,
} from "./gmail-oauth.js";

const TOKEN_PATH = /^\/api\/settings\/connectors\/([a-z][a-z0-9-]*)\/token$/u;

export async function handleLocalConnectorsSettingsHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string | undefined,
): Promise<boolean> {
  if (!homeDirectory) return false;
  const method = request.method ?? "";
  if (method === "GET" && url.pathname === "/api/settings/connectors") {
    sendJson(response, 200, { connectors: listConnectorSettingsCards() });
    return true;
  }
  if (method === "GET" && url.pathname === "/api/feed/connectors/gmail/oauth/callback") {
    try {
      await completeGmailOAuthFlow({
        code: url.searchParams.get("code") ?? "",
        state: url.searchParams.get("state") ?? undefined,
      });
      response.writeHead(302, {
        location: "/settings/connectors?connected=gmail",
        "cache-control": "no-store",
      });
      response.end();
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : L("Gmail 授权失败") });
    }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/github/whoami") {
    const token = resolveGithubToken();
    if (!token) {
      sendJson(response, 409, { error: L("GitHub 未连接"), code: "connector_disconnected" });
      return true;
    }
    const result = await githubWhoami({ token });
    if (!result.ok) {
      sendJson(response, result.failure === "needs_auth" ? 401 : 502, {
        error: result.failure === "needs_auth" ? L("GitHub 需要重新授权") : (result.message || L("无法读取 GitHub 账号")),
        failure: result.failure,
      });
      return true;
    }
    sendJson(response, 200, { login: result.login, scopes: result.scopes });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/github/client") {
    const body = await readBody(request);
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    if (!clientId) {
      sendJson(response, 400, { error: L("GitHub Client ID 不能为空") });
      return true;
    }
    storeGithubClientId(clientId);
    sendJson(response, 200, { connectors: listConnectorSettingsCards() });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/github/device/start") {
    const body = await readBody(request);
    const started = await startGithubDeviceFlow({
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
    });
    sendJson(response, 200, {
      device_code: started.deviceCode,
      user_code: started.userCode,
      verification_uri: started.verificationUri,
      expires_in: started.expiresIn,
      interval: started.interval,
    });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/github/device/poll") {
    const body = await readBody(request);
    const result = await pollGithubDeviceFlow({
      deviceCode: typeof body.device_code === "string" ? body.device_code : "",
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
    });
    sendJson(response, 200, { status: result.status, message: result.message, connectors: listConnectorSettingsCards() });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/gmail/client") {
    const body = await readBody(request);
    const clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    if (!clientId) {
      sendJson(response, 400, { error: L("Gmail Client ID 不能为空") });
      return true;
    }
    storeGmailOAuthClient({
      clientId,
      clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
    });
    sendJson(response, 200, { connectors: listConnectorSettingsCards() });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/gmail/oauth/start") {
    const body = await readBody(request);
    const started = await startGmailOAuthFlow({
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
      redirectUri: typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
    });
    sendJson(response, 200, {
      authorizationUrl: started.authorizationUrl,
      state: started.state,
      redirectUri: started.redirectUri,
    });
    return true;
  }
  const tokenMatch = url.pathname.match(TOKEN_PATH);
  if (tokenMatch && (method === "POST" || method === "DELETE")) {
    const connectorId = tokenMatch[1]!;
    if (connectorId !== "github" && connectorId !== "gmail") {
      sendJson(response, 404, { error: L("没有这个 Connector") });
      return true;
    }
    try {
      if (method === "DELETE") unbindConnectorToken(connectorId);
      else {
        const body = await readBody(request);
        bindConnectorToken(connectorId, typeof body.token === "string" ? body.token : "");
      }
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : L("无法保存连接") });
      return true;
    }
    sendJson(response, 200, {
      connectors: listConnectorSettingsCards(),
      status: connectorCredentialStatus(connectorId),
    });
    return true;
  }
  return false;
}
