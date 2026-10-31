import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { installationBindingsWhere, installationProjectBindingsWhere, isPluginBindingScope, parsePluginBindingScope, pluginBindingErrors, projectBindingsWhere, type PluginBindingTarget } from "./plugin-binding-scopes.js";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type {
  ConnectorConnectionAuthMethod,
  ConnectorConnectionRecord,
  ConnectorConnectionState,
  ConnectorConnectionView,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { isLoopbackHttpUrl } from "@molis-ai/molis-work-contracts/platform/loopback";

const SERVICE_ID = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*$/u;
const CONNECTION_ID = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|external-[0-9a-f]{24})$/u;

type ConnectorProtocolConnectionInput = { connectionId: string; serviceId: string; displayName: string;
    credentialRef: string | null; refreshRef?: string | null; expiresRef?: string | null } &
    ({ endpoint: string; transport?: never } | { transport: "stdio"; endpoint?: never });

type Row = Record<string, unknown>;
export interface ConnectorConnectionSecrets {
  get(reference: string): string | null;
  put(reference: string, plaintext: string): void;
  delete(reference: string): void;
  has?(reference: string): boolean;
}

/** The exact owner key of one binding, not the account it happens to name. */
export interface ConnectorBindingKey {
  readonly scope_id: string;
  readonly plugin_id: string;
  readonly slot_id: string;
}



function connectionFromRow(row: Row): ConnectorConnectionRecord {
  return {
    connection_id: String(row.connection_id), service_id: String(row.service_id),
    display_name: String(row.display_name), account_label: row.account_label === null ? null : String(row.account_label),
    auth_method: row.auth_method as ConnectorConnectionAuthMethod,
    credential_ref: row.credential_ref === null ? null : String(row.credential_ref),
    refresh_ref: row.refresh_ref === null ? null : String(row.refresh_ref),
    expires_ref: row.expires_ref === null ? null : String(row.expires_ref),
    source: row.source as ConnectorConnectionRecord["source"],
    enabled: row.enabled === 1,
    disconnected_at: row.disconnected_at === null ? null : String(row.disconnected_at),
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

/** Counts UTF-16 units, unless told otherwise: ids a port admits by characters (`bind`) must be counted the same way here. */
function requiredText(value: unknown, label: string, max: number, counted: "units" | "characters" = "units"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (typeof value !== "string" || !text || (counted === "characters" ? [...text].length : text.length) > max) {
    throw connectorErrors["connector.connection.invalid"](`${label}不能为空且最多 ${max} 个字符`);
  }
  return text;
}

export type ConnectorTokenInput = { serviceId: string; displayName: string; token: string; accountLabel?: string | null; authMethod?: "token" | "oauth" };
function tokenValue(value: string): string {
  const token = requiredText(value, "凭据", 16_384);
  if (token.length < 8 || /[\r\n]/u.test(token)) throw connectorErrors["connector.connection.invalid"]("凭据格式无效");
  return token;
}
/** The same validation applies before private staging and before creating a live token connection. */
export function normalizeConnectorTokenInput(input: ConnectorTokenInput): ConnectorTokenInput {
  const serviceId = requiredText(input.serviceId, "服务", 100);
  if (!SERVICE_ID.test(serviceId)) throw connectorErrors["connector.connection.invalid"]("服务 ID 无效");
  return { ...input, serviceId, displayName: requiredText(input.displayName, "连接名称", 100), token: tokenValue(input.token) };
}

/** Consumers use updated_at as a revision: two writes in one clock tick must still differ. */
function nextChange(db: DatabaseSync, id: string, now: Date): string {
  const row = db.prepare("SELECT updated_at FROM connector_connections WHERE connection_id=?").get(id) as { updated_at: string } | undefined;
  return new Date(Math.max(now.getTime(), row ? Date.parse(row.updated_at) + 1 : 0)).toISOString();
}

/**
 * The connection tables, for the Home connectors store's baseline to include (repository-anti-corruption §4.1).
 * `connector_bindings.scope_id` is an opaque scope key: `home`, a built-in consumer's, or a plugin installation's. A plugin's is
 * `plugin-installation:<install>` for an installation slot and `plugin-installation:<install>/project:<project>/record:<key>` for a
 * `per_record` slot, built and read only in plugin-binding-scopes.ts (S-57 extension X2, the hub's 2026-10-24 decision ①).
 */
export const CONNECTOR_CONNECTIONS_SCHEMA = `
  CREATE TABLE connector_connections (
    connection_id TEXT PRIMARY KEY,
    service_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    account_label TEXT,
    auth_method TEXT NOT NULL,
    credential_ref TEXT,
    refresh_ref TEXT,
    expires_ref TEXT,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
    removed_at TEXT,
    disconnected_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX connector_connections_service_idx
    ON connector_connections(service_id, created_at);
  CREATE UNIQUE INDEX connector_connections_credential_idx
    ON connector_connections(credential_ref) WHERE credential_ref IS NOT NULL;
  CREATE TABLE connector_bindings (
    scope_id TEXT NOT NULL,
    plugin_id TEXT NOT NULL,
    slot_id TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(scope_id, plugin_id, slot_id),
    FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
  );
  CREATE TABLE connector_connection_targets (
    connection_id TEXT PRIMARY KEY,
    origin TEXT NOT NULL,
    FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
  );
`;

/** Home-scoped metadata over the connectors store's baseline tables. Secret values only live in the existing SecretStore. */
export class ConnectorConnectionStore {
  constructor(private readonly db: DatabaseSync, private readonly secrets: ConnectorConnectionSecrets,
    private readonly now = () => new Date(), private readonly onChange?: (connectionId: string) => void,
    private readonly onBindingChange?: (binding: ConnectorBindingKey) => void) {}

  list(serviceId?: string): ConnectorConnectionRecord[] {
    const sql = serviceId
      ? "SELECT * FROM connector_connections WHERE removed_at IS NULL AND service_id = ? ORDER BY created_at, connection_id"
      : "SELECT * FROM connector_connections WHERE removed_at IS NULL ORDER BY service_id, created_at, connection_id";
    return (serviceId ? this.db.prepare(sql).all(serviceId) : this.db.prepare(sql).all())
      .map((row) => connectionFromRow(row as Row));
  }

  get(connectionId: string): ConnectorConnectionRecord | null {
    if (!CONNECTION_ID.test(connectionId)) return null;
    const row = this.db.prepare("SELECT * FROM connector_connections WHERE connection_id = ? AND removed_at IS NULL").get(connectionId) as Row | undefined;
    return row ? connectionFromRow(row) : null;
  }

  require(connectionId: string, serviceId?: string): ConnectorConnectionRecord {
    const connection = this.get(connectionId);
    if (!connection) throw connectorErrors["connector.connection.not_found"]("找不到这条连接");
    if (serviceId && connection.service_id !== serviceId) throw connectorErrors["connector.connection.service_mismatch"]("连接不属于这个服务");
    return connection;
  }

  state(connection: ConnectorConnectionRecord): ConnectorConnectionState {
    if (!connection.enabled) return "disconnected";
    if (connection.disconnected_at) return "disconnected";
    if (connection.auth_method === "none") return "connected";
    if (connection.auth_method === "mcp" && !connection.credential_ref) return "connected";
    if (connection.auth_method === "cli") return connection.account_label ? "connected" : "reauth_required";
    if (!connection.credential_ref) return "reauth_required";
    try {
      if (this.secrets.get(connection.credential_ref)?.trim()) return "connected";
    } catch { /* Unreadable secrets require repair. */ }
    return "reauth_required";
  }

  view(connection: ConnectorConnectionRecord): ConnectorConnectionView {
    const targetOrigin = this.targetOrigin(connection.connection_id);
    return {
      connection_id: connection.connection_id, service_id: connection.service_id,
      display_name: connection.display_name, account_label: connection.account_label,
      auth_method: connection.auth_method, source: connection.source, enabled: connection.enabled, state: this.state(connection),
      ...(targetOrigin ? { target_origin: targetOrigin } : {}),
    };
  }

  targetOrigin(connectionId: string): string | null {
    this.require(connectionId);
    const row = this.db.prepare("SELECT origin FROM connector_connection_targets WHERE connection_id = ?")
      .get(connectionId) as { origin: string } | undefined;
    return row?.origin ?? null;
  }

  /** Prevent an API or MCP key, or a tenant's service account (BL-595), from silently being sent to a different host. */
  assertTarget(connectionId: string, serviceId: "model-api" | "image-api" | "mcp-bearer" | "salesforce" | "jira" | "confluence", address: string): string {
    this.require(connectionId, serviceId);
    let endpoint: URL;
    try { endpoint = new URL(address); } catch { throw connectorErrors["connector.connection.invalid"]("服务地址无效"); }
    const localHttp = isLoopbackHttpUrl(endpoint);
    if ((!localHttp && endpoint.protocol !== "https:") || endpoint.username || endpoint.password) {
      throw connectorErrors["connector.connection.invalid"]("服务地址必须使用 HTTPS 或本机 HTTP，且不能包含账号密码");
    }
    const origin = endpoint.origin;
    const previous = this.targetOrigin(connectionId);
    if (previous && previous !== origin) throw connectorErrors["connector.connection.service_mismatch"](`这条连接已绑定 ${previous}；如需访问 ${origin}，请新建连接`);
    this.db.prepare("INSERT OR IGNORE INTO connector_connection_targets (connection_id,origin) VALUES (?,?)").run(connectionId, origin);
    if (this.targetOrigin(connectionId) !== origin) throw connectorErrors["connector.connection.service_mismatch"]("连接已绑定另一服务地址，请新建连接");
    return origin;
  }

  createToken(input: ConnectorTokenInput): ConnectorConnectionRecord {
    const { serviceId, displayName, token } = normalizeConnectorTokenInput(input);
    const connectionId = randomUUID();
    const ref = `connector-connection:${connectionId}:token`;
    const now = this.now().toISOString();
    this.secrets.put(ref, token);
    try {
      this.db.prepare(`INSERT INTO connector_connections
        (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(connectionId, serviceId, displayName,
        input.accountLabel?.trim() || null, input.authMethod ?? "token", ref, null, null, "managed", null, now, now);
    } catch (error) {
      this.secrets.delete(ref);
      throw error;
    }
    return this.require(connectionId);
  }

  /** Register only after the protocol adapter has completed its real handshake. */
  saveProtocol(input: ConnectorProtocolConnectionInput): ConnectorConnectionRecord {
    if (!CONNECTION_ID.test(input.connectionId) || !SERVICE_ID.test(input.serviceId)) throw connectorErrors["connector.connection.invalid"]("连接标识无效");
    const existing = this.get(input.connectionId);
    if (existing && (existing.service_id !== input.serviceId || existing.auth_method !== "mcp")) throw connectorErrors["connector.connection.service_mismatch"]("连接不属于这个 MCP 服务");
    const endpoint = input.transport === "stdio" ? null : new URL(input.endpoint);
    if (endpoint && (endpoint.username || endpoint.password || endpoint.hash || (endpoint.protocol !== "https:" && !isLoopbackHttpUrl(endpoint)))) throw connectorErrors["connector.connection.invalid"]("MCP 地址无效");
    for (const ref of [input.credentialRef, input.refreshRef, input.expiresRef]) {
      if (ref && !ref.startsWith(`connector-protocol:${input.connectionId}:`)) throw connectorErrors["connector.connection.invalid"]("MCP 凭据引用无效");
    }
    if (input.credentialRef && !this.secrets.get(input.credentialRef)?.trim()) throw connectorErrors["connector.connection.disconnected"]("MCP 凭据尚未保存");
    const now = nextChange(this.db, input.connectionId, this.now());
    this.db.prepare(`INSERT INTO connector_connections
      (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(connection_id) DO UPDATE SET
      display_name=excluded.display_name,credential_ref=excluded.credential_ref,refresh_ref=excluded.refresh_ref,
      expires_ref=excluded.expires_ref,disconnected_at=NULL,updated_at=excluded.updated_at`)
      .run(input.connectionId, input.serviceId, requiredText(input.displayName, "连接名称", 100), null, "mcp", input.credentialRef,
        input.refreshRef ?? null, input.expiresRef ?? null, "managed", null, existing?.created_at ?? now, now);
    if (endpoint) this.db.prepare("INSERT INTO connector_connection_targets(connection_id,origin) VALUES (?,?) ON CONFLICT(connection_id) DO UPDATE SET origin=excluded.origin").run(input.connectionId, endpoint.origin);
    else this.db.prepare("DELETE FROM connector_connection_targets WHERE connection_id=?").run(input.connectionId);
    if (existing) this.onChange?.(input.connectionId);
    return this.require(input.connectionId);
  }

  /** OAuth writes scoped secrets first; this registers their stable references and account identity. */
  upsertOAuth(input: {
    connectionId: string; serviceId: string; displayName: string; accountLabel?: string | null;
    accessRef: string; refreshRef: string | null; expiresRef?: string | null;
    stableAccountValidated?: boolean;
  }): ConnectorConnectionRecord {
    if (!CONNECTION_ID.test(input.connectionId) || !SERVICE_ID.test(input.serviceId)) {
      throw connectorErrors["connector.connection.invalid"]("OAuth 连接标识无效");
    }
    const existing = this.get(input.connectionId);
    if (existing && (existing.service_id !== input.serviceId || existing.auth_method !== "oauth")) {
      throw connectorErrors["connector.connection.service_mismatch"]("不能把授权写入另一服务的连接");
    }
    if (!input.stableAccountValidated && existing?.account_label && input.accountLabel && existing.account_label !== input.accountLabel.trim()) {
      throw connectorErrors["connector.connection.service_mismatch"]("授权账号与原连接不同，请新增连接");
    }
    if (!this.secrets.get(input.accessRef)?.trim() || (input.refreshRef && !this.secrets.get(input.refreshRef)?.trim())) {
      throw connectorErrors["connector.connection.disconnected"]("OAuth 凭据尚未保存完整");
    }
    const now = nextChange(this.db, input.connectionId, this.now());
    this.db.prepare(`INSERT INTO connector_connections
      (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(connection_id) DO UPDATE SET
        display_name=excluded.display_name,account_label=excluded.account_label,
        credential_ref=excluded.credential_ref,refresh_ref=excluded.refresh_ref,expires_ref=excluded.expires_ref,
        disconnected_at=NULL,updated_at=excluded.updated_at`)
      .run(input.connectionId, input.serviceId, requiredText(input.displayName, "连接名称", 100),
        input.accountLabel?.trim() || existing?.account_label || null, "oauth",
        input.accessRef, input.refreshRef, input.expiresRef ?? null, "managed", null,
        existing?.created_at ?? now, now);
    if (existing) this.onChange?.(input.connectionId);
    return this.require(input.connectionId);
  }

  /** CLI secrets stay in the official CLI; this records its verified current account under one stable id per CLI account. */
  cliRevisions(serviceId: string): ReadonlyMap<string, string> {
    const rows = this.db.prepare("SELECT connection_id,updated_at FROM connector_connections WHERE service_id=? AND auth_method='cli'").all(serviceId) as Array<{ connection_id: string; updated_at: string }>;
    return new Map(rows.map(row => [row.connection_id, row.updated_at]));
  }

  saveCli(input: { serviceId: string; displayName: string; externalId: string; accountLabel: string; expectedRevisions?: ReadonlyMap<string, string> }): ConnectorConnectionRecord {
    if (!SERVICE_ID.test(input.serviceId) || !input.externalId.trim()) throw connectorErrors["connector.connection.invalid"]("外部连接标识无效");
    const connectionId = `external-${createHash("sha256").update(input.serviceId).update("\0external\0").update(input.externalId).digest("hex").slice(0, 24)}`;
    const existing = this.db.prepare("SELECT updated_at,removed_at FROM connector_connections WHERE connection_id=?").get(connectionId) as { updated_at: string; removed_at: string | null } | undefined;
    if (input.expectedRevisions ? input.expectedRevisions.get(connectionId) !== existing?.updated_at : existing) throw connectorErrors["connector.connection.invalid"]("CLI 检查期间连接已变化，请重新读取后连接");
    const now = nextChange(this.db, connectionId, this.now());
    this.db.prepare(`INSERT INTO connector_connections
      (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
      VALUES (?,?,?,?,'cli',NULL,NULL,NULL,'external',NULL,?,?)
      ON CONFLICT(connection_id) DO UPDATE SET display_name=excluded.display_name,account_label=excluded.account_label,
        disconnected_at=NULL,removed_at=NULL,enabled=1,updated_at=excluded.updated_at`)
      .run(connectionId, input.serviceId, requiredText(input.displayName, "连接名称", 100), input.accountLabel, now, now);
    if (existing) this.onChange?.(connectionId);
    return this.require(connectionId);
  }

  rename(connectionId: string, displayName: string): ConnectorConnectionRecord {
    this.require(connectionId);
    this.db.prepare("UPDATE connector_connections SET display_name = ?, updated_at = ? WHERE connection_id = ?")
      .run(requiredText(displayName, "连接名称", 100), nextChange(this.db, connectionId, this.now()), connectionId);
    return this.require(connectionId);
  }

  replaceToken(connectionId: string, token: string): ConnectorConnectionRecord {
    const connection = this.require(connectionId);
    if (!(["token", "oauth"] as string[]).includes(connection.auth_method) || !connection.credential_ref) throw connectorErrors["connector.connection.invalid"]("这条连接不能用令牌更新");
    const value = tokenValue(token);
    this.secrets.put(connection.credential_ref, value);
    this.db.prepare("UPDATE connector_connections SET disconnected_at = NULL, updated_at = ? WHERE connection_id = ?")
      .run(nextChange(this.db, connectionId, this.now()), connectionId);
    this.onChange?.(connectionId);
    return this.require(connectionId);
  }

  setEnabled(connectionId: string, enabled: boolean): ConnectorConnectionRecord {
    this.require(connectionId);
    this.db.prepare("UPDATE connector_connections SET enabled = ?, updated_at = ? WHERE connection_id = ?")
      .run(enabled ? 1 : 0, nextChange(this.db, connectionId, this.now()), connectionId);
    this.onChange?.(connectionId);
    return this.require(connectionId);
  }

  remove(connectionId: string): void {
    this.disconnect(connectionId);
    this.db.prepare("UPDATE connector_connections SET removed_at = ? WHERE connection_id = ?").run(this.now().toISOString(), connectionId);
    this.onChange?.(connectionId);
  }

  disconnect(connectionId: string): ConnectorConnectionRecord {
    const connection = this.require(connectionId);
    // Leave the row in place so plugin bindings can show the missing account.
    if (connection.credential_ref && connection.source !== "external") { this.secrets.delete(connection.credential_ref); this.secrets.delete(`${connection.credential_ref}:client`); }
    if (connection.refresh_ref && connection.source !== "external") this.secrets.delete(connection.refresh_ref);
    if (connection.expires_ref && connection.source !== "external") this.secrets.delete(connection.expires_ref);
    if (/^[0-9a-f-]{36}$/u.test(connectionId)) for (const name of ["access", "oauth", "expires", "client", "verifier", "environment"]) this.secrets.delete(`connector-protocol:${connectionId}:${name}`);
    const now = nextChange(this.db, connectionId, this.now());
    this.db.prepare("UPDATE connector_connections SET disconnected_at = ?, updated_at = ? WHERE connection_id = ?")
      .run(now, now, connectionId);
    this.onChange?.(connectionId);
    return this.require(connectionId);
  }

  resolveToken(connectionId: string, serviceId: string): string {
    const connection = this.require(connectionId, serviceId);
    if (!connection.enabled || connection.disconnected_at || !connection.credential_ref) throw connectorErrors["connector.connection.disconnected"]("所选连接已断开，请重新选择或授权");
    const token = this.secrets.get(connection.credential_ref)?.trim();
    if (!token) throw connectorErrors["connector.connection.disconnected"]("所选连接需要重新授权");
    return token;
  }

  bind(input: { scopeId: string; pluginId: string; slotId: string; serviceId: string; connectionId: string }): void {
    const connection = this.require(input.connectionId, input.serviceId);
    if (this.state(connection) !== "connected") throw connectorErrors["connector.connection.disconnected"]("连接不可用，请先重新授权");
    // A plugin's scope is written only by `pluginBindingScope` (plugin-binding-scopes.ts, where the encoding is described):
    // `plugin-installation:<install>`, or `…/project:<project>/record:<key>` for a `per_record` slot. One that does not read back is refused.
    const scope = requiredText(input.scopeId, "作用域", 512);
    if (isPluginBindingScope(scope) && !parsePluginBindingScope(scope)) throw pluginBindingErrors.scope_invalid("插件连接槽的作用域无效");
    const plugin = requiredText(input.pluginId, "插件", 160, "characters");
    const slot = requiredText(input.slotId, "用途", 160, "characters");
    this.db.prepare(`INSERT INTO connector_bindings (scope_id,plugin_id,slot_id,connection_id,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(scope_id,plugin_id,slot_id) DO UPDATE SET connection_id=excluded.connection_id,updated_at=excluded.updated_at`)
      .run(scope, plugin, slot, connection.connection_id, this.now().toISOString());
    this.onBindingChange?.({ scope_id: scope, plugin_id: plugin, slot_id: slot });
  }

  binding(scopeId: string, pluginId: string, slotId: string): ConnectorConnectionRecord | null {
    const row = this.db.prepare(`SELECT c.* FROM connector_bindings b JOIN connector_connections c USING(connection_id)
      WHERE b.scope_id = ? AND b.plugin_id = ? AND b.slot_id = ?`).get(scopeId, pluginId, slotId) as Row | undefined;
    return row ? connectionFromRow(row) : null;
  }

  /** A deleted project's `per_record` bindings, of every plugin (S-57 extension X4); the accounts themselves stay. */
  forgetProjectBindings(projectId: string): number {
    const match = projectBindingsWhere(projectId);
    return forgetBindings(this.db, match, this.onBindingChange);
  }

  /**
   * One installation's `per_record` bindings in one project, when it is uninstalled there (S-57 extension X4). Its installation slot's
   * binding is shared by every project the same installation id is in, and stays until the person unbinds it.
   */
  forgetInstallationProjectBindings(installId: string, projectId: string): number {
    const match = installationProjectBindingsWhere(installId, projectId);
    return forgetBindings(this.db, match, this.onBindingChange);
  }

  /**
   * Every binding of one installation, in every project: its installation slot's and all its `per_record` ones. Taken when the last
   * installation of that `install_id` is uninstalled (BL-596); the accounts themselves stay.
   */
  forgetInstallationBindings(installId: string): number {
    const match = installationBindingsWhere(installId);
    return forgetBindings(this.db, match, this.onBindingChange);
  }

  /**
   * The plugins' bindings, each read back from its scope: installation slots and `per_record` ones, of every connection or of one. A caller
   * asks which installations have any, to see which are still installed (BL-596), or what one connection is bound to, which the platform
   * reports as its uses (`connectors.plugin_slot.usages`, T-121). A scope that is not a plugin's is a built-in consumer's, not listed.
   */
  pluginBindings(connectionId?: string): Array<PluginBindingTarget & { plugin_id: string; slot_id: string }> {
    const rows = (connectionId === undefined
      ? this.db.prepare("SELECT scope_id, plugin_id, slot_id FROM connector_bindings ORDER BY scope_id, plugin_id, slot_id").all()
      : this.db.prepare("SELECT scope_id, plugin_id, slot_id FROM connector_bindings WHERE connection_id = ? ORDER BY scope_id, plugin_id, slot_id").all(connectionId)) as Array<{ scope_id: string; plugin_id: string; slot_id: string }>;
    return rows.flatMap(row => { const target = parsePluginBindingScope(row.scope_id); return target ? [{ ...target, plugin_id: row.plugin_id, slot_id: row.slot_id }] : []; });
  }

  unbind(scopeId: string, pluginId: string, slotId: string): void {
    const result = this.db.prepare("DELETE FROM connector_bindings WHERE scope_id = ? AND plugin_id = ? AND slot_id = ?")
      .run(scopeId, pluginId, slotId);
    if (result.changes) this.onBindingChange?.({ scope_id: scopeId, plugin_id: pluginId, slot_id: slotId });
  }
}

/** Deletes the bindings `match` selects and tells `onBindingChange` about each one that went. */
function forgetBindings(db: DatabaseSync, match: { readonly where: string; readonly parameters: readonly (string | number)[] } | null,
  onBindingChange?: (binding: ConnectorBindingKey) => void): number {
  if (!match) return 0;
  const bindings = db.prepare(`SELECT scope_id,plugin_id,slot_id FROM connector_bindings WHERE ${match.where}`).all(...match.parameters)
    .map(row => ({ scope_id: String(row.scope_id), plugin_id: String(row.plugin_id), slot_id: String(row.slot_id) }));
  const result = db.prepare(`DELETE FROM connector_bindings WHERE ${match.where}`).run(...match.parameters);
  for (const binding of bindings) onBindingChange?.(binding);
  return Number(result.changes);
}
