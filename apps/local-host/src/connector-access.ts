import { createFileSecretStore, peekSealedEntry, readProductEnv, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { catalogWhoami, createCatalogProvider, getCatalogSpec, isCatalogConnectorId } from "@molis-ai/molis-work-integration-catalog";
import { withConnectorConnections } from "./connector-connection-store.js";
import { apiOAuthConnectionId, apiOAuthContext, resolveApiOAuthToken } from "./connector-api-oauth.js";
import { resolveUsableNotionToken } from "./notion-oauth.js";
import { resolveUsableGmailAccessToken } from "./gmail-oauth.js";
import { feishuCliFetch, feishuCliMarker } from "./feishu-cli.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { inspectCliConnection } from "./connector-cli.js";
import { createGmailConnector } from "./gmail-connector.js";
import { createGithubConnector } from "./github-connector.js";

/** Single account-bound resolver for API readers. Never falls back to another saved account. */
export async function resolveApiConnection(home: string, id: string, service?: string, forceRefresh = false) {
  const connection = withConnectorConnections(home, store => store.require(id, service));
  if (connection.disconnected_at || connection.auth_method === "mcp" || connection.auth_method === "none") throw new Error("所选连接不能用于此 API 读取，请选择有效的 API 账号");
  return runWithMolisWorkHome(home, async () => {
    if (connection.auth_method === "cli") {
      if (connection.service_id !== "feishu") throw new Error("此 CLI 连接请通过连接设置中的只读操作使用");
      await inspectCliConnection(home, id);
      const fetchImpl: typeof fetch = async (input, init) => {
        await inspectCliConnection(home, id);
        const result = await feishuCliFetch(input, init);
        await inspectCliConnection(home, id);
        return result;
      };
      return { connection, token: feishuCliMarker(), fetchImpl, authExtras: undefined };
    }
    const oauthId = apiOAuthConnectionId(connection.credential_ref ?? undefined);
    if (oauthId) return { connection, token: await resolveApiOAuthToken(home, id, forceRefresh), authExtras: apiOAuthContext(home, id), fetchImpl: undefined };
    if (connection.auth_method === "oauth" && connection.service_id === "notion" && connection.refresh_ref) {
      const managed = /^connector-connection:([0-9a-f-]+):access$/u.exec(connection.credential_ref || "");
      if (!managed && connection.credential_ref !== "connector:notion:token") throw new Error("此旧 Notion 连接需要重新授权以恢复刷新配置");
      const token = await resolveUsableNotionToken(forceRefresh, undefined, managed?.[1]);
      if (!token) throw new Error("Notion 连接需要重新授权");
      return { connection, token, authExtras: undefined, fetchImpl: undefined };
    }
    if (connection.auth_method === "oauth" && connection.service_id === "gmail" && connection.credential_ref && connection.refresh_ref && connection.expires_ref) {
      const result = await resolveUsableGmailAccessToken({ forceRefresh, tokenRefs: { access: connection.credential_ref, refresh: connection.refresh_ref, expiresAt: connection.expires_ref } });
      if (!result.ok) throw new Error("Gmail 连接需要重新授权");
      return { connection, token: result.accessToken, authExtras: undefined, fetchImpl: undefined };
    }
    const token = connection.source === "external"
      ? readProductEnv(connection.service_id === "gmail" ? "GMAIL_ACCESS_TOKEN" : `${connection.service_id.replaceAll("-", "_").toUpperCase()}_TOKEN`)
      : connection.credential_ref ? createFileSecretStore().get(connection.credential_ref) : null;
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
    const connection = withConnectorConnections(home, store => id ? store.require(id, source.kind)
      : store.list(source.kind).find(row => row.credential_ref === source.credential_ref));
    if (connection) {
      if (connection.disconnected_at) return denied("连接已断开", connection.updated_at);
      if (connection.auth_method === "cli") await inspectCliConnection(home, connection.connection_id);
      else await resolveApiConnection(home, connection.connection_id, source.kind);
      const latest = withConnectorConnections(home, store => store.require(connection.connection_id));
      if (latest.disconnected_at || latest.updated_at !== connection.updated_at) return denied("检查期间连接已改变", latest.updated_at);
      return { authorized: true, connection_id: connection.connection_id, revision: connection.updated_at };
    }
    if (!id && source.credential_ref && runWithMolisWorkHome(home, () => peekSealedEntry(source.credential_ref!))) {
      return { authorized: true, connection_id: null, revision: source.credential_ref };
    }
    return denied("来源缺少当前有效的账号连接");
  } catch { return denied("账号需要重新授权或 CLI 当前账号已改变"); }
}

export async function inspectApiConnection(home: string, id: string, preview = false) {
  return withConnectorRequest(home, id, undefined, async signal => {
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
    const verified = { ok: true, account: result.login, checked_at: new Date().toISOString() };
    if (!preview || getCatalogSpec(service).feed_available === false) return verified;
    const provider = createCatalogProvider({ connectorId: service, token: access.token, authExtras: access.authExtras, fetchImpl });
    const read = await provider.sync({ cursor: null });
    if (!read.ok) throw new Error(read.message);
    return { ...verified, items: read.items };
  }
  if (!["github", "gmail"].includes(service)) throw new Error("请在使用此连接的模型、Images、Functions 或 Coding 设置中运行对应功能，验证目标服务");
  const provider = runWithMolisWorkHome(home, () => service === "github" ? createGithubConnector({ token: access.token, fetchImpl, allowFixture: false }) : createGmailConnector({ accessToken: access.token, fetchImpl, allowFixture: false }));
  const health = await provider.health();
  if (!health.ok) throw new Error(health.message);
  if (!preview) return { ...health, checked_at: new Date().toISOString() };
  const read = await provider.sync({ cursor: null });
  if (!read.ok) throw new Error(read.message);
  return { ...health, items: read.items, checked_at: new Date().toISOString() };
  });
}
