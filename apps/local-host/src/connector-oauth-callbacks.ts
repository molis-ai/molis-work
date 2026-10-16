import type { IncomingMessage, ServerResponse } from "node:http";
import { requestHost } from "./web-http.js";
import { assertConnectorAuthorizationPending, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { completeNotionOAuth } from "./notion-oauth.js";
import { completeGmailOAuthFlow, cancelGmailOAuthFlow } from "./gmail-oauth.js";
import { clearOAuthConnectionTarget, oauthConnectionRefs, readOAuthConnectionTarget } from "./connector-oauth-targets.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withContextJourneys } from "./context-onboarding-store.js";
import { refreshFeedConnectionState } from "./connector-source-state.js";
import { connectorAuthorizationFailed } from "./connector-authorization-return.js";
import { createOAuthCredentialStage } from "./connector-oauth-commit.js";

export async function handleConnectorOAuthCallback(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string): Promise<boolean> {
  const method = request.method;
  if (method === "GET" && url.pathname === "/api/feed/connectors/gmail/oauth/callback") {
    const stage = createOAuthCredentialStage(homeDirectory);
    let target: ReturnType<typeof readOAuthConnectionTarget> = null;
    const state = url.searchParams.get("state") ?? "";
    const returnToOnboarding = (status: string) => `/onboarding?mode=new-project&journey=${target!.onboarding!.id}&oauth=${status}${target!.onboarding!.desktop ? "&desktop=1" : ""}`;
    try {
      target = readOAuthConnectionTarget("gmail", state, { allowExpired: true });
      assertConnectorAuthorizationPending(homeDirectory, state);
      if (!target) throw new Error("这次授权已结束，请从连接设置重新开始");
      if (target.expired) throw new Error("Google 授权已过期，请重新连接");
      if (target?.onboarding) withContextJourneys(homeDirectory, store => {
        const journey = store.get(target!.onboarding!.id);
        if (journey.phase !== "selecting" || journey.oauth_status !== "pending" || (journey.oauth_state && journey.oauth_state !== state)) throw new Error("这次授权已结束，请使用最新的连接入口");
      });
      if (url.searchParams.has("error")) throw new Error("Google 授权未完成");
      const targetId = target.connectionId;
      {
        const existing = withConnectorConnections(homeDirectory, (store) => store.get(targetId));
        const refs = oauthConnectionRefs(targetId);
        const result = await completeGmailOAuthFlow({
          code: url.searchParams.get("code") ?? "", state,
          resolveRefs: (email) => {
            assertConnectorAuthorizationPending(homeDirectory, state);
            if (existing?.account_label && email && existing.account_label.toLowerCase() !== email.toLowerCase()) {
              throw new Error("授权邮箱与原连接不同，请新增 Gmail 连接");
            }
            return stage.refs;
          },
        });
        assertConnectorAuthorizationPending(homeDirectory, state);
        stage.commit(targetId);
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
      }
      finishConnectorAuthorization(homeDirectory, state, "connected");
      response.writeHead(302, {
        location: target.onboarding ? returnToOnboarding("connected") : `/settings/connectors?connected=gmail&connection=${targetId}`,
        "cache-control": "no-store",
      });
      response.end();
    } catch (error) {
      finishConnectorAuthorization(homeDirectory, state, url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
      if (target?.onboarding) {
        withContextJourneys(homeDirectory, store => { const journey = store.get(target!.onboarding!.id); if ((!journey.oauth_state || journey.oauth_state === state) && journey.oauth_status === "pending") { journey.auto_start = false; journey.oauth_status = url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"; journey.error = target?.expired ? "Google 授权已过期，已选材料仍在。请重新连接，或跳过 Gmail。" : null; store.save(journey); } });
        cancelGmailOAuthFlow(state);
        clearOAuthConnectionTarget("gmail", state);
        response.writeHead(302, { location: returnToOnboarding(url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed"), "cache-control": "no-store" }); response.end();
      } else {
        cancelGmailOAuthFlow(state);
        clearOAuthConnectionTarget("gmail", state);
        connectorAuthorizationFailed(response, "gmail", url.searchParams.get("error") === "access_denied");
      }
    } finally { stage.clear(); }
    return true;
  }
  if (method === "GET" && url.pathname === "/api/settings/connectors/notion/oauth/callback") {
    const stage = createOAuthCredentialStage(homeDirectory);
    const state = url.searchParams.get("state") ?? "";
    try {
      assertConnectorAuthorizationPending(homeDirectory, state);
      const host = requestHost(request);
      if (!host) throw new Error("无法确认本机回调地址");
      const callbackUrl = new URL(url.pathname + url.search, `http://${host}`);
      const result = await completeNotionOAuth({ code: url.searchParams.get("code") ?? "", state: url.searchParams.get("state") ?? "", callbackUrl,
        resolveRefs: (tokens, connectionId) => {
          assertConnectorAuthorizationPending(homeDirectory, state);
          const existing = withConnectorConnections(homeDirectory, (store) => store.get(connectionId));
          if (existing?.account_label && existing.account_label !== tokens.workspaceId) {
            throw new Error("授权工作区与原连接不同，请新增 Notion 连接");
          }
          return stage.refs;
        },
      });
      assertConnectorAuthorizationPending(homeDirectory, state);
      stage.commit(result.connectionId);
      const existing = withConnectorConnections(homeDirectory, (store) => store.get(result.connectionId));
      const refs = oauthConnectionRefs(result.connectionId);
      withConnectorConnections(homeDirectory, (store) => store.upsertOAuth({
        connectionId: result.connectionId, serviceId: "notion",
        displayName: existing?.display_name ?? result.displayName ?? `Notion · ${result.workspaceName || "新连接"}`,
        accountLabel: result.workspaceId || result.workspaceName,
        accessRef: refs.access, refreshRef: refs.refresh,
      }));
      refreshFeedConnectionState(homeDirectory, result.connectionId);
      finishConnectorAuthorization(homeDirectory, url.searchParams.get("state") ?? "", "connected");
      response.writeHead(302, { location: `/settings/connectors?connected=notion&connection=${result.connectionId}`, "cache-control": "no-store" });
      response.end();
    } catch (error) {
      finishConnectorAuthorization(homeDirectory, url.searchParams.get("state") ?? "", url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
      connectorAuthorizationFailed(response, "notion", url.searchParams.get("error") === "access_denied");
    } finally { stage.clear(); }
    return true;
  }
  return false;
}
