import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { beginConnectorAuthorization } from "./connector-authorization-status.js";
import { checkConnectorSetupSubmission } from "./connector-setup-submission.js";
import { saveConnectorAuthorizationPresentation } from "./connector-authorization-presentation.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHost } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards } from "./connector-directory.js";
import { feishuCliStatus, startFeishuCliLogin, startFeishuCliSetup } from "./feishu-cli.js";
import { startNotionOAuth } from "./notion-oauth.js";
import { storeGithubClientId } from "./github-oauth.js";
import { startGithubConnection, pollGithubConnection } from "./connector-github-device.js";
import {
  startGmailOAuthFlow,
  storeGmailOAuthClient,
} from "./gmail-oauth.js";
import { prepareOAuthConnectionTarget, saveOAuthConnectionTarget } from "./connector-oauth-targets.js";
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
    sendJson(response, 200, { connectors: await listConnectorSettingsCards(homeDirectory) });
    return true;
  }
  if (await handleConnectorOAuthCallback(request, response, url, homeDirectory)) return true;
  if (method === "POST" && url.pathname === "/api/settings/connectors/notion/oauth/start") {
    try {
      const body = await readBody(request);
      checkConnectorSetupSubmission(homeDirectory, typeof body.setup_id === "string" ? body.setup_id : undefined,
        { service_id: "notion", method: "oauth", connection_id: typeof body.connection_id === "string" ? body.connection_id : undefined });
      const target = prepareOAuthConnectionTarget(homeDirectory, "notion", typeof body.connection_id === "string" ? body.connection_id : undefined);
      const targetId = target.connectionId;
      const host = requestHost(request);
      if (!host) throw new Error("无法确认本机回调地址");
      const started = startNotionOAuth({
        origin: `http://${host}`,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
        ...target,
        displayName: typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : undefined,
      });
      const authorizationId = beginConnectorAuthorization(homeDirectory, new URL(started.authorizationUrl).searchParams.get("state")!, targetId, "notion", Date.now(), typeof body.setup_id === "string" ? body.setup_id : undefined);
      saveConnectorAuthorizationPresentation(homeDirectory, authorizationId, { authorization_url: started.authorizationUrl });
      sendJson(response, 200, { ...started, connection_id: targetId, authorization_id: authorizationId });
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
    sendJson(response, 200, { connectors: await listConnectorSettingsCards(homeDirectory) });
    return true;
  }
  if (method === "POST" && ["/api/settings/connectors/github/device/start", "/api/settings/connectors/github/device/poll"].includes(url.pathname)) {
    try {
      const body = await readBody(request), origin = `http://${requestHost(request)}`;
      const result = url.pathname.endsWith("/start") ? await startGithubConnection(homeDirectory, { origin,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        connectionId: typeof body.connection_id === "string" ? body.connection_id : undefined,
        displayName: typeof body.display_name === "string" ? body.display_name : undefined,
        setupId: typeof body.setup_id === "string" ? body.setup_id : undefined,
      }) : await pollGithubConnection(homeDirectory, { origin, state: typeof body.state === "string" ? body.state : "" });
      sendJson(response, 200, result);
    } catch (error) { sendJson(response, 400, { error: error instanceof ActionError && error.code === "connector.connection.invalid" ? error.message : L("设备授权未完成，请重新准备接入") }); }
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
    sendJson(response, 200, { connectors: await listConnectorSettingsCards(homeDirectory) });
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/gmail/oauth/start") {
    const body = await readBody(request);
    checkConnectorSetupSubmission(homeDirectory, typeof body.setup_id === "string" ? body.setup_id : undefined,
      { service_id: "gmail", method: "oauth", connection_id: typeof body.connection_id === "string" ? body.connection_id : undefined });
    const onboarding = typeof body.onboarding_id === "string" ? { id: contextJourneyId(body.onboarding_id), desktop: body.desktop === true } : undefined;
    if (onboarding) withContextJourneys(homeDirectory, store => { if (store.get(onboarding.id).phase !== "selecting") throw new Error("请从来源清单重新发起连接"); });
    const target = prepareOAuthConnectionTarget(homeDirectory, "gmail", typeof body.connection_id === "string" ? body.connection_id : undefined);
    const targetId = target.connectionId;
    const started = await startGmailOAuthFlow({
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
      redirectUri: onboarding ? `http://${requestHost(request)}/api/feed/connectors/gmail/oauth/callback` : typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
    });
    if (onboarding) withContextJourneys(homeDirectory, store => { const journey = store.get(onboarding.id); journey.oauth_status = "pending"; journey.oauth_state = started.state; journey.oauth_expires_at = Date.now() + 10 * 60_000; journey.error = null; store.save(journey); });
    saveOAuthConnectionTarget("gmail", started.state, target,
      typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) || undefined : undefined, onboarding);
    const authorizationId = beginConnectorAuthorization(homeDirectory, started.state, targetId, "gmail", Date.now(), typeof body.setup_id === "string" ? body.setup_id : undefined);
    saveConnectorAuthorizationPresentation(homeDirectory, authorizationId, { authorization_url: started.authorizationUrl });
    sendJson(response, 200, {
      authorizationUrl: started.authorizationUrl,
      state: started.state,
      redirectUri: started.redirectUri,
      connection_id: targetId, authorization_id: authorizationId,
    });
    return true;
  }
  return false;
}
