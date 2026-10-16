import { beginConnectorAuthorization } from "./connector-authorization-status.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHost } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { feishuCliStatus, startFeishuCliLogin, startFeishuCliSetup } from "./feishu-cli.js";
import { startNotionOAuth } from "./notion-oauth.js";
import { pollGithubDeviceFlow, startGithubDeviceFlow, storeGithubClientId } from "./github-oauth.js";
import {
  startGmailOAuthFlow,
  storeGmailOAuthClient,
} from "./gmail-oauth.js";
import { prepareOAuthConnectionId, saveOAuthConnectionTarget } from "./connector-oauth-targets.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withContextJourneys, contextJourneyId } from "./context-onboarding-store.js";
import { handleConnectorOAuthCallback } from "./connector-oauth-callbacks.js";

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
  if (await handleConnectorOAuthCallback(request, response, url, homeDirectory)) return true;
  if (method === "POST" && url.pathname === "/api/settings/connectors/notion/oauth/start") {
    try {
      const body = await readBody(request);
      const targetId = prepareOAuthConnectionId(homeDirectory, "notion", typeof body.connection_id === "string" ? body.connection_id : undefined);
      const host = requestHost(request);
      if (!host) throw new Error("无法确认本机回调地址");
      const started = startNotionOAuth({
        origin: `http://${host}`,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
        connectionId: targetId,
        displayName: typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : undefined,
      });
      sendJson(response, 200, { ...started, connection_id: targetId, authorization_id: beginConnectorAuthorization(homeDirectory, new URL(started.authorizationUrl).searchParams.get("state")!, targetId, "notion") });
    } catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : L("Notion 授权启动失败") }); }
    return true;
  }
  if (method === "GET" && url.pathname === "/api/settings/connectors/feishu/cli/status") {
    sendJson(response, 200, feishuCliStatus({ fresh: true }));
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/feishu/cli/setup") {
    try { sendJson(response, 200, { authorizationUrl: await startFeishuCliSetup() }); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : L("无法配置飞书 CLI") }); }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/feishu/cli/login") {
    try { sendJson(response, 200, { authorizationUrl: await startFeishuCliLogin() }); }
    catch (error) { sendJson(response, 400, { error: error instanceof Error ? error.message : L("无法开始飞书授权") }); }
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
    // The authorized token becomes a GitHub connection (or renews the one being reauthorized).
    if (result.status === "authorized" && result.accessToken) {
      const existingId = typeof body.connection_id === "string" ? body.connection_id : null;
      const identity = await githubWhoami({ token: result.accessToken });
      if (!identity.ok) { sendJson(response, 401, { error: identity.message || "无法验证 GitHub 账号" }); return true; }
      const connection = withConnectorConnections(homeDirectory, (store) => {
        if (existingId) {
          const existing = store.require(existingId, "github");
          if (existing.account_label && existing.account_label !== identity.login) throw new Error("授权账号与原连接不同，请新增 GitHub 连接");
          return store.replaceToken(existingId, result.accessToken!);
        }
        return store.createToken({ serviceId: "github", displayName: `GitHub · ${identity.login}`,
          token: result.accessToken!, accountLabel: identity.login, authMethod: "oauth" });
      });
      sendJson(response, 200, { status: "authorized", connection_id: connection.connection_id });
      return true;
    }
    sendJson(response, 200, { status: result.status, message: result.message });
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
    const onboarding = typeof body.onboarding_id === "string" ? { id: contextJourneyId(body.onboarding_id), desktop: body.desktop === true } : undefined;
    if (onboarding) withContextJourneys(homeDirectory, store => { if (store.get(onboarding.id).phase !== "selecting") throw new Error("请从来源清单重新发起连接"); });
    const targetId = prepareOAuthConnectionId(homeDirectory, "gmail", typeof body.connection_id === "string" ? body.connection_id : undefined);
    const started = await startGmailOAuthFlow({
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
      redirectUri: onboarding ? `http://${requestHost(request)}/api/feed/connectors/gmail/oauth/callback` : typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
    });
    if (onboarding) withContextJourneys(homeDirectory, store => { const journey = store.get(onboarding.id); journey.oauth_status = "pending"; journey.oauth_state = started.state; journey.oauth_expires_at = Date.now() + 10 * 60_000; journey.error = null; store.save(journey); });
    saveOAuthConnectionTarget("gmail", started.state, targetId,
      typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) || undefined : undefined, onboarding);
    sendJson(response, 200, {
      authorizationUrl: started.authorizationUrl,
      state: started.state,
      redirectUri: started.redirectUri,
      connection_id: targetId, authorization_id: beginConnectorAuthorization(homeDirectory, started.state, targetId, "gmail"),
    });
    return true;
  }
  return false;
}
