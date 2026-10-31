import { submitConnectorActivation } from "./connector-authorization-commit.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { requestHost } from "./web-http.js";
import { assertConnectorAuthorizationPending, finishConnectorAuthorization } from "./connector-authorization-status.js";
import { completeNotionOAuth } from "./notion-oauth.js";
import { oauthConnectionRefs } from "./connector-oauth-targets.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { connectorAuthorizationFailed } from "./connector-authorization-return.js";
import { createOAuthCredentialStage } from "./connector-oauth-commit.js";

export async function handleConnectorOAuthCallback(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string): Promise<boolean> {
  const method = request.method;
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
      const existing = withConnectorConnections(homeDirectory, (store) => store.get(result.connectionId));
      const refs = oauthConnectionRefs(result.connectionId);
      const committed = submitConnectorActivation(homeDirectory, state, { kind: "oauth", target: { connectionId: result.connectionId, expectedRevision: result.expectedRevision },
        credentials: stage.credentials(result.connectionId), input: {
        connectionId: result.connectionId, serviceId: "notion",
        displayName: existing?.display_name ?? result.displayName ?? `Notion · ${result.workspaceName || "新连接"}`,
        accountLabel: result.workspaceId || result.workspaceName,
        accessRef: refs.access, refreshRef: refs.refresh,
      } });
      response.writeHead(302, { location: committed.status === "pending" ? `/capabilities/connections?setup=${committed.authorization_id}` : `/settings/connectors?connected=notion&connection=${result.connectionId}`, "cache-control": "no-store" });
      response.end();
    } catch (error) {
      finishConnectorAuthorization(homeDirectory, url.searchParams.get("state") ?? "", url.searchParams.get("error") === "access_denied" ? "cancelled" : "failed");
      connectorAuthorizationFailed(response, "notion", url.searchParams.get("error") === "access_denied");
    } finally { stage.clear(); }
    return true;
  }
  return false;
}
