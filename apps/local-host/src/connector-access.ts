import type { ConnectorCallControl } from "@molis-ai/molis-work-contracts/services/connector-host";
import { controlledConnectorFetch } from "@molis-ai/molis-work-plugin-sdk";
import { connectorAccountControl, oauthRefreshGuard } from "./connector-oauth-targets.js";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { CatalogLiveError, catalogWhoami, createCatalogProvider, getCatalogSpec, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import type { ConnectorConnectionRecord } from "@molis-ai/molis-work-contracts/services/connector-host";
import { withConnectorConnections } from "./connector-connection-store.js";
import { ApiOAuthError, apiOAuthConnectionId, apiOAuthContext, readApiOAuthAccount, resolveApiOAuthToken } from "./connector-api-oauth.js";
import { publicOAuthFetch, type OAuthNetwork } from "./connector-oauth-send.js";
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

interface ApiConnectionAccess {
  connection: ConnectorConnectionRecord;
  token: string;
  authExtras: Record<string, string> | undefined;
  fetchImpl: typeof fetch | undefined;
}

/**
 * A plugin's 401 retry: `null` means no refresh material or refresh path, never a failed refresh. `network` is for tests only: where an
 * OAuth refresh of the generic flow resolves and connects (it is sent by `sendPublicHttps` either way).
 */
export function resolveApiConnection(home: string, id: string, control: ConnectorCallControl, service: string | undefined, forceRefresh: "if_available", network?: OAuthNetwork): Promise<ApiConnectionAccess | null>;
/** Single account-bound resolver for API readers. The existing boolean force-refresh contract is unchanged. */
export function resolveApiConnection(home: string, id: string, control: ConnectorCallControl, service?: string, forceRefresh?: boolean, network?: OAuthNetwork): Promise<ApiConnectionAccess>;
export async function resolveApiConnection(home: string, id: string, control: ConnectorCallControl, service?: string, forceRefresh: boolean | "if_available" = false,
  network?: OAuthNetwork): Promise<ApiConnectionAccess | null> {
  control.current();
  const connection = withConnectorConnections(home, store => store.require(id, service));
  const accountCurrent = oauthRefreshGuard(home, id);
  const current = () => { control.current(); accountCurrent(); };
  if (!connection.enabled || connection.disconnected_at || connection.auth_method === "mcp" || connection.auth_method === "none") throw new Error("所选连接不能用于此 API 读取，请选择有效的 API 账号");
  const refresh = forceRefresh !== false;
  // A refresh the token endpoint refuses marks the connection (`connector-refresh-refusals.ts`); a forced refresh that succeeds clears it.
  const refreshing = async <T>(run: () => Promise<T>, refusedBy: (error: unknown) => boolean): Promise<T> => {
    try { const value = await run(); await control.beforeEffect(); current(); if (refresh) clearRefreshRefused(home, id); return value; }
    catch (error) { await control.beforeEffect(); current(); if (refusedBy(error)) markRefreshRefused(home, connection); throw error; }
  };
  return runWithMolisWorkHome(home, async () => {
    if (forceRefresh === "if_available" && (connection.auth_method !== "oauth" || !connection.refresh_ref
      || !createFileSecretStore().get(connection.refresh_ref))) return null;
    if (connection.auth_method === "cli") {
      if (connection.service_id !== "feishu") throw new Error("此 CLI 连接请通过连接设置中的只读操作使用");
      await inspectCliConnection(home, id);
      return { connection, token: feishuCliMarker(), fetchImpl: cliConnectionFetch(home, id), authExtras: undefined };
    }
    const oauthId = apiOAuthConnectionId(connection.credential_ref ?? undefined);
    if (oauthId) {
      const token = await refreshing(() => resolveApiOAuthToken(home, id, control, refresh, network && publicOAuthFetch(control, network)),
        error => error instanceof ApiOAuthError && error.refused);
      return { connection, token, authExtras: apiOAuthContext(home, id), fetchImpl: undefined };
    }
    if (connection.auth_method === "oauth" && connection.service_id === "notion" && connection.refresh_ref) {
      const token = await refreshing(() => resolveUsableNotionToken(id, control, refresh),
        error => error instanceof CatalogLiveError && error.kind === "needs_auth" && tokenEndpointRefused(error.status));
      if (!token) throw new Error("Notion 连接需要重新授权");
      return { connection, token, authExtras: undefined, fetchImpl: undefined };
    }
    if (connection.auth_method === "oauth" && connection.service_id === "gmail" && connection.credential_ref && connection.refresh_ref && connection.expires_ref) {
      const refs = { access: connection.credential_ref, refresh: connection.refresh_ref, expiresAt: connection.expires_ref };
      const result = await refreshing(async () => {
        const answer = await resolveUsableGmailAccessToken({ control, forceRefresh: refresh, tokenRefs: refs });
        if (!answer.ok) throw Object.assign(new Error("Gmail 连接需要重新授权"), { refused: answer.status === "needs_auth" && answer.refused === true });
        return answer;
      }, error => (error as { refused?: boolean }).refused === true);
      return { connection, token: result.accessToken, authExtras: undefined, fetchImpl: undefined };
    }
    if (forceRefresh === "if_available") return null;
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
      else await resolveApiConnection(home, connection.connection_id, connectorAccountControl(home, connection.connection_id), source.kind);
      const latest = withConnectorConnections(home, store => store.require(connection.connection_id));
      if (!latest.enabled || latest.disconnected_at || latest.updated_at !== connection.updated_at) return denied("检查期间连接已改变", latest.updated_at);
      return { authorized: true, connection_id: connection.connection_id, revision: connection.updated_at };
    }
    return denied("来源缺少当前有效的账号连接");
  } catch { return denied("账号需要重新授权或 CLI 当前账号已改变"); }
}

/** What a preview reads with the connection once its account is checked: the service's first page, if its reader has one. */
async function previewRead(home: string, service: string, access: ApiConnectionAccess, fetchImpl: typeof fetch, control: ConnectorCallControl,
  signal: AbortSignal, beforeRead?: () => void | Promise<void>): Promise<{ record_count?: number; items?: unknown[] }> {
  if (isCatalogConnectorId(service) && getCatalogSpec(service).feed_available === false) return {};
  const provider = isCatalogConnectorId(service)
    ? createCatalogProvider({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl })
    : service === "github" || service === "gmail"
      ? runWithMolisWorkHome(home, () => service === "github" ? createGithubConnector({ token: access.token, fetchImpl, allowFixture: false }) : createGmailConnector({ accessToken: access.token, fetchImpl, allowFixture: false }))
      : undefined;
  if (!provider) return {};
  await beforeRead?.(); signal.throwIfAborted();
  const read = await provider.sync({ cursor: null }, control);
  if (!read.ok) throw new Error(read.message);
  return { record_count: read.items.length, items: read.items };
}

/** `oauthFetch` is for tests only: how an OAuth connection's identity request is sent, `sendPublicHttps` otherwise. */
export async function inspectApiConnection(home: string, id: string, preview = false, signal?: AbortSignal, beforeRead?: () => void | Promise<void>,
  oauthFetch?: typeof fetch) {
  return withConnectorRequest(home, id, signal, async signal => {
  const control = connectorAccountControl(home, id, { signal, beforeEffect: beforeRead });
  let access = await resolveApiConnection(home, id, control);
  const fetchImpl: typeof fetch = controlledConnectorFetch((input, init) => (access.fetchImpl ?? globalThis.fetch)(input, init), control);
  const service = access.connection.service_id;
  // An OAuth connection of the generic flow is read by its declaration, the way its authorization read it (W5-11 §2.2).
  if (apiOAuthConnectionId(access.connection.credential_ref ?? undefined)) {
    const account = await readApiOAuthAccount(home, id, control, async refresh => {
      if (refresh) access = await resolveApiConnection(home, id, control, service, true);
      return access.token;
    }, { fetchImpl: oauthFetch });
    const verified = { ok: true, account: account.label, verified_account: { login: account.label, account_id: account.account_id }, checked_at: new Date().toISOString() };
    if (!preview) return verified;
    return { ...verified, ...await previewRead(home, service, access, fetchImpl, control, signal, beforeRead) };
  }
  if (isCatalogConnectorId(service)) {
    let result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
    await control.beforeEffect(); control.current();
    if (!result.ok && result.http_status === 401 && access.connection.auth_method === "oauth") {
      access = await resolveApiConnection(home, id, control, service, true);
      result = await catalogWhoami({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
      await control.beforeEffect(); control.current();
    }
    if (!result.ok) throw new Error(result.message);
    const verified = { ok: true, account: result.login, verified_account: { login: result.login, ...(result.account_id ? { account_id: result.account_id } : {}) }, checked_at: new Date().toISOString() };
    if (!preview) return verified;
    return { ...verified, ...await previewRead(home, service, access, fetchImpl, control, signal, beforeRead) };
  }
  if (!["github", "gmail"].includes(service)) throw new Error("请在使用此连接的模型、Images、Functions 或 Coding 设置中运行对应功能，验证目标服务");
  const provider = runWithMolisWorkHome(home, () => service === "github" ? createGithubConnector({ token: access.token, fetchImpl, allowFixture: false }) : createGmailConnector({ accessToken: access.token, fetchImpl, allowFixture: false }));
  const health = await provider.health(control);
  if (!health.ok) throw new Error(health.message);
  if (!preview) return { ...health, checked_at: new Date().toISOString() };
  return { ...health, ...await previewRead(home, service, access, fetchImpl, control, signal, beforeRead), checked_at: new Date().toISOString() };
  });
}
