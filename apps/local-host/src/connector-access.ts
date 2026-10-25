import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { CatalogLiveError, catalogWhoami, createCatalogProvider, getCatalogSpec, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { withConnectorConnections } from "./connector-connection-store.js";
import { ApiOAuthError, apiOAuthConnectionId, apiOAuthContext, resolveApiOAuthToken } from "./connector-api-oauth.js";
import { clearRefreshRefused, markRefreshRefused, tokenEndpointRefused } from "./connector-refresh-refusals.js";
import { resolveUsableNotionToken } from "./notion-oauth.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import { feishuCliFetch, feishuCliMarker } from "./feishu-cli.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { inspectCliConnection } from "./connector-cli.js";
import { createGmailConnector } from "./gmail-connector.js";
import { createGithubConnector } from "./github-connector.js";

/** Fetch through the official CLI, checking before and after that its current account is still this connection's. */
function cliConnectionFetch(home: string, id: string): typeof fetch {
  return async (input, init) => {
    await inspectCliConnection(home, id);
    const result = await feishuCliFetch(input, init);
    await inspectCliConnection(home, id);
    return result;
  };
}

/** Single account-bound resolver for API readers. Never falls back to another saved account. */
export async function resolveApiConnection(home: string, id: string, service?: string, forceRefresh = false) {
  const connection = withConnectorConnections(home, store => store.require(id, service));
  if (!connection.enabled || connection.disconnected_at || connection.auth_method === "mcp" || connection.auth_method === "none") throw new Error("所选连接不能用于此 API 读取，请选择有效的 API 账号");
  // A refresh the token endpoint refuses marks the connection (`connector-refresh-refusals.ts`); a forced refresh that succeeds clears it.
  const refreshing = async <T>(run: () => Promise<T>, refusedBy: (error: unknown) => boolean): Promise<T> => {
    try { const value = await run(); if (forceRefresh) clearRefreshRefused(home, id); return value; }
    catch (error) { if (refusedBy(error)) markRefreshRefused(home, connection); throw error; }
  };
  return runWithMolisWorkHome(home, async () => {
    if (connection.auth_method === "cli") {
      if (connection.service_id !== "feishu") throw new Error("此 CLI 连接请通过连接设置中的只读操作使用");
      await inspectCliConnection(home, id);
      return { connection, token: feishuCliMarker(), fetchImpl: cliConnectionFetch(home, id), authExtras: undefined };
    }
    const oauthId = apiOAuthConnectionId(connection.credential_ref ?? undefined);
    if (oauthId) {
      const token = await refreshing(() => resolveApiOAuthToken(home, id, forceRefresh), error => error instanceof ApiOAuthError && error.refused);
      return { connection, token, authExtras: apiOAuthContext(home, id), fetchImpl: undefined };
    }
    if (connection.auth_method === "oauth" && connection.service_id === "notion" && connection.refresh_ref) {
      const token = await refreshing(() => resolveUsableNotionToken(id, forceRefresh),
        error => error instanceof CatalogLiveError && error.kind === "needs_auth" && tokenEndpointRefused(error.status));
      if (!token) throw new Error("Notion 连接需要重新授权");
      return { connection, token, authExtras: undefined, fetchImpl: undefined };
    }
    if (connection.auth_method === "oauth" && connection.service_id === "gmail" && connection.credential_ref && connection.refresh_ref && connection.expires_ref) {
      const refs = { access: connection.credential_ref, refresh: connection.refresh_ref, expiresAt: connection.expires_ref };
      const result = await refreshing(async () => {
        const answer = await resolveUsableGmailAccessToken({ forceRefresh, tokenRefs: refs });
        if (!answer.ok) throw Object.assign(new Error("Gmail 连接需要重新授权"), { refused: answer.status === "needs_auth" && answer.refused === true });
        return answer;
      }, error => (error as { refused?: boolean }).refused === true);
      return { connection, token: result.accessToken, authExtras: undefined, fetchImpl: undefined };
    }
    const token = connection.credential_ref ? createFileSecretStore().get(connection.credential_ref) : null;
    if (!token) throw new Error("所选连接凭据缺失，请重新授权");
    return { connection, token, authExtras: undefined, fetchImpl: undefined };
  });
}

/** Local authorization facts for model consumers; no remote material or secret leaves this port. */
export async function inspectSourceAuthorization(home: string, source: {
  kind: string; sync_kind: string; status: string; enabled: boolean;
  config: Record<string, unknown>; credential_ref: string | null;
}): Promise<{ authorized: boolean; connection_id: string | null; revision: string | null; reason?: string }> {
  const id = typeof source.config.connection_id === "string" ? source.config.connection_id : null;
  const denied = (reason: string, revision: string | null = null) => ({ authorized: false, connection_id: id, revision, reason });
  const lifecycle = source.config._molis_work_lifecycle as { deleted_at?: string } | undefined;
  if (!source.enabled || source.status !== "active" || lifecycle?.deleted_at) return denied("来源已暂停、断开或移除");
  if (["manual", "public_source"].includes(source.sync_kind)) return { authorized: true, connection_id: null, revision: null };
  try {
    const connection = id ? withConnectorConnections(home, store => store.require(id, source.kind)) : null;
    if (connection) {
      if (!connection.enabled || connection.disconnected_at) return denied("连接已断开", connection.updated_at);
      if (connection.auth_method === "cli") await inspectCliConnection(home, connection.connection_id);
      else await resolveApiConnection(home, connection.connection_id, source.kind);
      const latest = withConnectorConnections(home, store => store.require(connection.connection_id));
      if (!latest.enabled || latest.disconnected_at || latest.updated_at !== connection.updated_at) return denied("检查期间连接已改变", latest.updated_at);
      return { authorized: true, connection_id: connection.connection_id, revision: connection.updated_at };
    }
    return denied("来源缺少当前有效的账号连接");
  } catch { return denied("账号需要重新授权或 CLI 当前账号已改变"); }
}

export async function inspectApiConnection(home: string, id: string, preview = false, signal?: AbortSignal, beforeRead?: () => void | Promise<void>) {
  return withConnectorRequest(home, id, signal, async signal => {
  let access = await resolveApiConnection(home, id);
  const fetchImpl: typeof fetch = (input, init) => (access.fetchImpl ?? globalThis.fetch)(input, { ...init,
    signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) });
  const service = access.connection.service_id;
  if (isCatalogConnectorId(service)) {
    let result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
    if (!result.ok && result.http_status === 401 && access.connection.auth_method === "oauth") {
      access = await resolveApiConnection(home, id, service, true);
      result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
    }
    if (!result.ok) throw new Error(result.message);
    const verified = { ok: true, account: result.login, verified_account: { login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) }, checked_at: new Date().toISOString() };
    if (!preview || getCatalogSpec(service).feed_available === false) return verified;
    const provider = createCatalogProvider({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
    await beforeRead?.(); signal.throwIfAborted();
    const read = await provider.sync({ cursor: null });
    if (!read.ok) throw new Error(read.message);
    return { ...verified, record_count: read.items.length, items: read.items };
  }
  if (!["github", "gmail"].includes(service)) throw new Error("请在使用此连接的模型、Images、Functions 或 Coding 设置中运行对应功能，验证目标服务");
  const provider = runWithMolisWorkHome(home, () => service === "github" ? createGithubConnector({ token: access.token, fetchImpl, allowFixture: false }) : createGmailConnector({ accessToken: access.token, fetchImpl, allowFixture: false }));
  const health = await provider.health();
  if (!health.ok) throw new Error(health.message);
  if (!preview) return { ...health, checked_at: new Date().toISOString() };
  await beforeRead?.(); signal.throwIfAborted();
  const read = await provider.sync({ cursor: null });
  if (!read.ok) throw new Error(read.message);
  return { ...health, record_count: read.items.length, items: read.items, checked_at: new Date().toISOString() };
  });
}
