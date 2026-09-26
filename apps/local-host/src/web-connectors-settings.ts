import type { IncomingMessage, ServerResponse } from "node:http";
import { githubWhoami } from "@molis-ai/molis-work-integration-github";
import { catalogWhoami, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody, requestHost } from "./web-http.js";
import { L } from "./web-locale.js";
import { listConnectorSettingsCards, liveConnectorIds } from "./connector-directory.js";
import {
  bindConnectorToken,
  bindFeishuCli,
  clearGmailOAuthForManualToken,
  connectorCredentialStatus,
  resolveConnectorToken,
  unbindConnectorToken,
} from "./connector-credentials.js";
import { feishuCliFetch, feishuCliMarker, feishuCliStatus, startFeishuCliLogin, startFeishuCliSetup } from "./feishu-cli.js";
import { completeNotionOAuth, resolveUsableNotionToken, startNotionOAuth } from "./notion-oauth.js";
import { pollGithubDeviceFlow, startGithubDeviceFlow, storeGithubClientId } from "./github-oauth.js";
import {
  completeGmailOAuthFlow, cancelGmailOAuthFlow,
  startGmailOAuthFlow,
  storeGmailOAuthClient,
} from "./gmail-oauth.js";
import { clearOAuthConnectionTarget, oauthConnectionRefs, prepareOAuthConnectionId, readOAuthConnectionTarget, saveOAuthConnectionTarget } from "./connector-oauth-targets.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withContextJourneys, contextJourneyId } from "./context-onboarding-store.js";
import { refreshFeedConnectionState } from "./web-connector-connections.js";

const TOKEN_PATH = /^\/api\/settings\/connectors\/([a-z][a-z0-9-]*)\/token$/u;
const WHOAMI_PATH = /^\/api\/settings\/connectors\/([a-z][a-z0-9-]*)\/whoami$/u;

function isLiveConnector(connectorId: string): boolean {
  return liveConnectorIds().includes(connectorId);
}

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
    let target: ReturnType<typeof readOAuthConnectionTarget> = null;
    const state = url.searchParams.get("state") ?? "";
    const returnToOnboarding = (status: string) => `/onboarding?mode=new-project&journey=${target!.onboarding!.id}&oauth=${status}${target!.onboarding!.desktop ? "&desktop=1" : ""}`;
    try {
      target = readOAuthConnectionTarget("gmail", state, { allowExpired: true });
      if (target?.expired) throw new Error("Google 授权已过期，请重新连接");
      if (target?.onboarding) withContextJourneys(homeDirectory, store => {
        const journey = store.get(target!.onboarding!.id);
        if (journey.phase !== "selecting" || journey.oauth_status !== "pending" || (journey.oauth_state && journey.oauth_state !== state)) throw new Error("这次授权已结束，请使用最新的连接入口");
      });
      if (url.searchParams.has("error")) throw new Error("Google 授权未完成");
      const targetId = target?.connectionId;
      if (targetId) {
        const existing = withConnectorConnections(homeDirectory, (store) => store.get(targetId));
        const refs = oauthConnectionRefs(targetId);
        const result = await completeGmailOAuthFlow({
          code: url.searchParams.get("code") ?? "", state,
          mirrorLegacy: false,
          resolveRefs: (email) => {
            if (existing?.account_label && email && existing.account_label.toLowerCase() !== email.toLowerCase()) {
              throw new Error("授权邮箱与原连接不同，请新增 Gmail 连接");
            }
            return refs;
          },
        });
        withConnectorConnections(homeDirectory, (store) => store.upsertOAuth({
          connectionId: targetId, serviceId: "gmail",
          displayName: existing?.display_name ?? target?.displayName ?? `Gmail · ${result.email || "新连接"}`,
          accountLabel: result.email ?? existing?.account_label,
          accessRef: refs.access, refreshRef: refs.refresh, expiresRef: refs.expiresAt,
        }));
        refreshFeedConnectionState(homeDirectory, targetId);
        if (target?.onboarding) withContextJourneys(homeDirectory, store => {
          const journey = store.get(target!.onboarding!.id);
          if (journey.phase === "selecting" && journey.oauth_status === "pending" && (!journey.oauth_state || journey.oauth_state === state)) {
            const gmail = journey.sources.find(s => s.kind === "gmail");
            if (gmail) gmail.connection_id = targetId;
            journey.oauth_status = "connected";
            store.save(journey);
          }
        });
        clearOAuthConnectionTarget("gmail", state);
      } else {
        await completeGmailOAuthFlow({ code: url.searchParams.get("code") ?? "", state: state || undefined });
      }
      response.writeHead(302, {
        location: target?.onboarding ? returnToOnboarding("connected") : targetId ? `/settings/connectors?connected=gmail&connection=${targetId}` : "/settings/connectors?connected=gmail",
        "cache-control": "no-store",
      });
      response.end();
    } catch (error) {
      if (target?.onboarding) {
        withContextJourneys(homeDirectory, store => { const journey = store.get(target!.onboarding!.id); if ((!journey.oauth_state || journey.oauth_state === state) && journey.oauth_status === "pending") { journey.auto_start = false; journey.oauth_status = url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"; journey.error = target?.expired ? "Google 授权已过期，已选材料仍在。请重新连接，或跳过 Gmail。" : null; store.save(journey); } });
        cancelGmailOAuthFlow(state);
        clearOAuthConnectionTarget("gmail", state);
        response.writeHead(302, { location: returnToOnboarding(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"), "cache-control": "no-store" }); response.end();
      } else sendJson(response, 400, { error: error instanceof Error ? error.message : L("Gmail 授权失败") });
    }
    return true;
  }
  if (method === "GET" && url.pathname === "/api/settings/connectors/notion/oauth/callback") {
    try {
      const host = requestHost(request);
      if (!host) throw new Error("无法确认本机回调地址");
      const callbackUrl = new URL(url.pathname + url.search, `http://${host}`);
      const result = await completeNotionOAuth({ code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "", callbackUrl,
        validateAccount: (tokens, connectionId) => {
          if (!connectionId) return;
          const existing = withConnectorConnections(homeDirectory, (store) => store.get(connectionId));
          if (existing?.account_label && existing.account_label !== tokens.workspaceId) {
            throw new Error("授权工作区与原连接不同，请新增 Notion 连接");
          }
        },
      });
      if (result.connectionId) {
        const existing = withConnectorConnections(homeDirectory, (store) => store.get(result.connectionId!));
        const refs = oauthConnectionRefs(result.connectionId);
        withConnectorConnections(homeDirectory, (store) => store.upsertOAuth({
          connectionId: result.connectionId!, serviceId: "notion",
          displayName: existing?.display_name ?? result.displayName ?? `Notion · ${result.workspaceName || "新连接"}`,
          accountLabel: result.workspaceId || result.workspaceName,
          accessRef: refs.access, refreshRef: refs.refresh,
        }));
        refreshFeedConnectionState(homeDirectory, result.connectionId);
      }
      response.writeHead(302, { location: result.connectionId
        ? `/settings/connectors?connected=notion&connection=${result.connectionId}` : "/settings/connectors?connected=notion", "cache-control": "no-store" });
      response.end();
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : L("Notion 授权失败") });
    }
    return true;
  }
  if (method === "POST" && url.pathname === "/api/settings/connectors/notion/oauth/start") {
    try {
      const body = await readBody(request);
      const managed = body.manage_connection === true || typeof body.connection_id === "string";
      const targetId = managed ? prepareOAuthConnectionId(homeDirectory, "notion", typeof body.connection_id === "string" ? body.connection_id : undefined) : undefined;
      const host = requestHost(request);
      if (!host) throw new Error("无法确认本机回调地址");
      const started = startNotionOAuth({
        origin: `http://${host}`,
        clientId: typeof body.client_id === "string" ? body.client_id : undefined,
        clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
        connectionId: targetId,
        displayName: typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) : undefined,
      });
      sendJson(response, 200, { ...started, ...(targetId ? { connection_id: targetId } : {}) });
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
  if (method === "POST" && url.pathname === "/api/settings/connectors/feishu/cli/use") {
    try { bindFeishuCli(); sendJson(response, 200, { connectors: listConnectorSettingsCards() }); }
    catch (error) { sendJson(response, 409, { error: error instanceof Error ? error.message : L("飞书 CLI 尚未授权") }); }
    return true;
  }
  const whoamiMatch = url.pathname.match(WHOAMI_PATH);
  if (whoamiMatch && method === "POST") {
    const connectorId = whoamiMatch[1]!;
    const token = connectorId === "notion" ? await resolveUsableNotionToken() : resolveConnectorToken(connectorId);
    if (!token) {
      sendJson(response, 409, { error: L("未连接"), code: "connector_disconnected" });
      return true;
    }
    if (connectorId === "github") {
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
    if (!isCatalogConnectorId(connectorId)) {
      sendJson(response, 404, { error: L("没有这个 Connector") });
      return true;
    }
    const fetchImpl = connectorId === "feishu" && token === feishuCliMarker() ? feishuCliFetch : undefined;
    let result = await catalogWhoami({ connectorId, token, fetchImpl });
    if (!result.ok && result.failure === "needs_auth" && connectorId === "notion") {
      try {
        const renewed = await resolveUsableNotionToken(true);
        if (renewed) result = await catalogWhoami({ connectorId, token: renewed });
      } catch { /* Keep the original account error. */ }
    }
    if (!result.ok) {
      sendJson(response, result.failure === "needs_auth" ? 401 : result.failure === "configuration" ? 400 : 502, {
        error: result.message || L("无法读取账号"),
        failure: result.failure,
      });
      return true;
    }
    sendJson(response, 200, { login: result.login });
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
    const managed = body.manage_connection === true || typeof body.connection_id === "string";
    const result = await pollGithubDeviceFlow({
      deviceCode: typeof body.device_code === "string" ? body.device_code : "",
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      bind: !managed,
    });
    if (managed && result.status === "authorized" && result.accessToken) {
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
    const onboarding = typeof body.onboarding_id === "string" ? { id: contextJourneyId(body.onboarding_id), desktop: body.desktop === true } : undefined;
    if (onboarding) withContextJourneys(homeDirectory, store => { if (store.get(onboarding.id).phase !== "selecting") throw new Error("请从来源清单重新发起连接"); });
    const managed = Boolean(onboarding) || body.manage_connection === true || typeof body.connection_id === "string";
    const targetId = managed ? prepareOAuthConnectionId(homeDirectory, "gmail", typeof body.connection_id === "string" ? body.connection_id : undefined) : null;
    const started = await startGmailOAuthFlow({
      clientId: typeof body.client_id === "string" ? body.client_id : undefined,
      clientSecret: typeof body.client_secret === "string" ? body.client_secret : undefined,
      redirectUri: onboarding ? `http://${requestHost(request)}/api/feed/connectors/gmail/oauth/callback` : typeof body.redirect_uri === "string" ? body.redirect_uri : undefined,
    });
    if (onboarding) withContextJourneys(homeDirectory, store => { const journey = store.get(onboarding.id); journey.oauth_status = "pending"; journey.oauth_state = started.state; journey.oauth_expires_at = Date.now() + 10 * 60_000; journey.error = null; store.save(journey); });
    if (targetId) saveOAuthConnectionTarget("gmail", started.state, targetId,
      typeof body.display_name === "string" ? body.display_name.trim().slice(0, 100) || undefined : undefined, onboarding);
    sendJson(response, 200, {
      authorizationUrl: started.authorizationUrl,
      state: started.state,
      redirectUri: started.redirectUri,
      ...(targetId ? { connection_id: targetId } : {}),
    });
    return true;
  }
  const tokenMatch = url.pathname.match(TOKEN_PATH);
  if (tokenMatch && (method === "POST" || method === "DELETE")) {
    const connectorId = tokenMatch[1]!;
    if (!isLiveConnector(connectorId)) {
      sendJson(response, 404, { error: L("没有这个 Connector") });
      return true;
    }
    try {
      if (method === "DELETE") unbindConnectorToken(connectorId);
      else {
        const body = await readBody(request);
        bindConnectorToken(connectorId, typeof body.token === "string" ? body.token : "");
        if (connectorId === "gmail") clearGmailOAuthForManualToken();
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
