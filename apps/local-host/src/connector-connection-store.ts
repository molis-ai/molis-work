import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type {
  ConnectorConnectionAuthMethod,
  ConnectorConnectionRecord,
  ConnectorConnectionState,
  ConnectorConnectionView,
} from "@molis-ai/molis-work-contracts/services/connector-host";
import { createFileSecretStore, openHomeSqliteDatabase, peekSealedEntry, runWithMolisWorkHome, type SecretStore } from "@molis-ai/molis-work-storage";

const SERVICE_ID = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)*$/u;
const CONNECTION_ID = /^(?:[0-9a-f]{8}-[0-9a-f-]{27,}|legacy-[0-9a-f]{24})$/u;

type Row = Record<string, unknown>;
type Secrets = Pick<SecretStore, "get" | "put" | "delete"> & { has?(reference: string): boolean };

export class ConnectorConnectionError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "service_mismatch" | "disconnected", message: string) {
    super(message);
    this.name = "ConnectorConnectionError";
  }
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
    disconnected_at: row.disconnected_at === null ? null : String(row.disconnected_at),
    created_at: String(row.created_at), updated_at: String(row.updated_at),
  };
}

function requiredText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ConnectorConnectionError("invalid", `${label}不能为空且最多 ${max} 个字符`);
  }
  return value.trim();
}

/** Home-scoped metadata. Secret values only live in the existing SecretStore. */
export class ConnectorConnectionStore {
  constructor(private readonly db: DatabaseSync, private readonly secrets: Secrets, private readonly now = () => new Date()) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS connector_connections (
        connection_id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        account_label TEXT,
        auth_method TEXT NOT NULL,
        credential_ref TEXT,
        refresh_ref TEXT,
        expires_ref TEXT,
        source TEXT NOT NULL,
        disconnected_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS connector_connections_service_idx
        ON connector_connections(service_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS connector_connections_credential_idx
        ON connector_connections(credential_ref) WHERE credential_ref IS NOT NULL;
      CREATE TABLE IF NOT EXISTS connector_bindings (
        scope_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        slot_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(scope_id, plugin_id, slot_id),
        FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
      );
      CREATE TABLE IF NOT EXISTS connector_connection_targets (
        connection_id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        FOREIGN KEY(connection_id) REFERENCES connector_connections(connection_id)
      );
    `);
  }

  list(serviceId?: string): ConnectorConnectionRecord[] {
    const sql = serviceId
      ? "SELECT * FROM connector_connections WHERE service_id = ? ORDER BY created_at, connection_id"
      : "SELECT * FROM connector_connections ORDER BY service_id, created_at, connection_id";
    return (serviceId ? this.db.prepare(sql).all(serviceId) : this.db.prepare(sql).all())
      .map((row) => connectionFromRow(row as Row));
  }

  get(connectionId: string): ConnectorConnectionRecord | null {
    if (!CONNECTION_ID.test(connectionId)) return null;
    const row = this.db.prepare("SELECT * FROM connector_connections WHERE connection_id = ?").get(connectionId) as Row | undefined;
    return row ? connectionFromRow(row) : null;
  }

  require(connectionId: string, serviceId?: string): ConnectorConnectionRecord {
    const connection = this.get(connectionId);
    if (!connection) throw new ConnectorConnectionError("not_found", "找不到这条连接");
    if (serviceId && connection.service_id !== serviceId) throw new ConnectorConnectionError("service_mismatch", "连接不属于这个服务");
    return connection;
  }

  state(connection: ConnectorConnectionRecord): ConnectorConnectionState {
    if (connection.disconnected_at) return "disconnected";
    if (connection.auth_method === "none") return "connected";
    if (connection.auth_method === "cli") return "reauth_required"; // Caller must check the external CLI session.
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
      auth_method: connection.auth_method, source: connection.source, state: this.state(connection),
      ...(targetOrigin ? { target_origin: targetOrigin } : {}),
    };
  }

  targetOrigin(connectionId: string): string | null {
    this.require(connectionId);
    const row = this.db.prepare("SELECT origin FROM connector_connection_targets WHERE connection_id = ?")
      .get(connectionId) as { origin: string } | undefined;
    return row?.origin ?? null;
  }

  /** Prevent an API or MCP key from silently being sent to a different host. */
  assertTarget(connectionId: string, serviceId: "model-api" | "image-api" | "mcp-bearer", address: string): string {
    this.require(connectionId, serviceId);
    let endpoint: URL;
    try { endpoint = new URL(address); } catch { throw new ConnectorConnectionError("invalid", "服务地址无效"); }
    const localHttp = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    if ((!localHttp && endpoint.protocol !== "https:") || endpoint.username || endpoint.password) {
      throw new ConnectorConnectionError("invalid", "服务地址必须使用 HTTPS 或本机 HTTP，且不能包含账号密码");
    }
    const origin = endpoint.origin;
    const previous = this.targetOrigin(connectionId);
    if (previous && previous !== origin) throw new ConnectorConnectionError("service_mismatch", `这条连接已绑定 ${previous}；如需访问 ${origin}，请新建连接`);
    this.db.prepare("INSERT OR IGNORE INTO connector_connection_targets (connection_id,origin) VALUES (?,?)").run(connectionId, origin);
    if (this.targetOrigin(connectionId) !== origin) throw new ConnectorConnectionError("service_mismatch", "连接已绑定另一服务地址，请新建连接");
    return origin;
  }

  createToken(input: { serviceId: string; displayName: string; token: string; accountLabel?: string | null; authMethod?: "token" | "oauth" }): ConnectorConnectionRecord {
    const serviceId = requiredText(input.serviceId, "服务", 100);
    if (!SERVICE_ID.test(serviceId)) throw new ConnectorConnectionError("invalid", "服务 ID 无效");
    const displayName = requiredText(input.displayName, "连接名称", 100);
    const token = requiredText(input.token, "凭据", 16_384);
    if (token.length < 8 || /[\r\n]/u.test(token)) throw new ConnectorConnectionError("invalid", "凭据格式无效");
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

  /** OAuth writes scoped secrets first; this registers their stable references and account identity. */
  upsertOAuth(input: {
    connectionId: string; serviceId: string; displayName: string; accountLabel?: string | null;
    accessRef: string; refreshRef: string; expiresRef?: string | null;
  }): ConnectorConnectionRecord {
    if (!CONNECTION_ID.test(input.connectionId) || !SERVICE_ID.test(input.serviceId)) {
      throw new ConnectorConnectionError("invalid", "OAuth 连接标识无效");
    }
    const existing = this.get(input.connectionId);
    if (existing && (existing.service_id !== input.serviceId || existing.auth_method !== "oauth")) {
      throw new ConnectorConnectionError("service_mismatch", "不能把授权写入另一服务的连接");
    }
    if (existing?.account_label && input.accountLabel && existing.account_label !== input.accountLabel.trim()) {
      throw new ConnectorConnectionError("service_mismatch", "授权账号与原连接不同，请新增连接");
    }
    if (!this.secrets.get(input.accessRef)?.trim() || !this.secrets.get(input.refreshRef)?.trim()) {
      throw new ConnectorConnectionError("disconnected", "OAuth 凭据尚未保存完整");
    }
    const now = this.now().toISOString();
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
    return this.require(input.connectionId);
  }

  adoptExternal(input: { serviceId: string; displayName: string; authMethod: "cli" | "token" | "none"; externalId: string; accountLabel?: string | null }): ConnectorConnectionRecord {
    if (!SERVICE_ID.test(input.serviceId) || !input.externalId.trim()) throw new ConnectorConnectionError("invalid", "外部连接标识无效");
    const connectionId = `legacy-${createHash("sha256").update(input.serviceId).update("\0external\0").update(input.externalId).digest("hex").slice(0, 24)}`;
    const existing = this.get(connectionId);
    if (existing) return existing;
    const now = this.now().toISOString();
    this.db.prepare(`INSERT INTO connector_connections
      (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(connectionId, input.serviceId,
      requiredText(input.displayName, "连接名称", 100), input.accountLabel?.trim() || null,
      input.authMethod, null, null, null, "external", null, now, now);
    return this.require(connectionId);
  }

  /** Idempotently exposes an existing secret without copying or deleting it. */
  adoptLegacy(input: {
    serviceId: string; displayName: string; credentialRef: string; authMethod?: ConnectorConnectionAuthMethod;
    refreshRef?: string | null; expiresRef?: string | null; accountLabel?: string | null;
  }): ConnectorConnectionRecord | null {
    if (!SERVICE_ID.test(input.serviceId) || !input.credentialRef) throw new ConnectorConnectionError("invalid", "原有连接参数无效");
    const existing = this.db.prepare("SELECT * FROM connector_connections WHERE credential_ref = ?").get(input.credentialRef) as Row | undefined;
    if (existing) return connectionFromRow(existing);
    let present = false;
    try { present = this.secrets.has ? this.secrets.has(input.credentialRef) : Boolean(this.secrets.get(input.credentialRef)?.trim()); } catch { /* Status will be repaired separately. */ }
    if (!present) return null;
    const connectionId = `legacy-${createHash("sha256").update(input.serviceId).update("\0").update(input.credentialRef).digest("hex").slice(0, 24)}`;
    const now = this.now().toISOString();
    this.db.prepare(`INSERT OR IGNORE INTO connector_connections
      (connection_id,service_id,display_name,account_label,auth_method,credential_ref,refresh_ref,expires_ref,source,disconnected_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(connectionId, input.serviceId, requiredText(input.displayName, "连接名称", 100),
      input.accountLabel?.trim() || null, input.authMethod ?? "token", input.credentialRef,
      input.refreshRef ?? null, input.expiresRef ?? null, "legacy", null, now, now);
    return this.require(connectionId);
  }

  rename(connectionId: string, displayName: string): ConnectorConnectionRecord {
    this.require(connectionId);
    this.db.prepare("UPDATE connector_connections SET display_name = ?, updated_at = ? WHERE connection_id = ?")
      .run(requiredText(displayName, "连接名称", 100), this.now().toISOString(), connectionId);
    return this.require(connectionId);
  }

  replaceToken(connectionId: string, token: string): ConnectorConnectionRecord {
    const connection = this.require(connectionId);
    if (!(["token", "oauth"] as string[]).includes(connection.auth_method) || !connection.credential_ref) throw new ConnectorConnectionError("invalid", "这条连接不能用令牌更新");
    const value = requiredText(token, "凭据", 16_384);
    if (value.length < 8 || /[\r\n]/u.test(value)) throw new ConnectorConnectionError("invalid", "凭据格式无效");
    this.secrets.put(connection.credential_ref, value);
    this.db.prepare("UPDATE connector_connections SET disconnected_at = NULL, updated_at = ? WHERE connection_id = ?")
      .run(this.now().toISOString(), connectionId);
    return this.require(connectionId);
  }

  disconnect(connectionId: string): ConnectorConnectionRecord {
    const connection = this.require(connectionId);
    // Leave the row in place so plugin bindings can show the missing account.
    if (connection.credential_ref && connection.source !== "external") this.secrets.delete(connection.credential_ref);
    if (connection.refresh_ref && connection.source !== "external") this.secrets.delete(connection.refresh_ref);
    if (connection.expires_ref && connection.source !== "external") this.secrets.delete(connection.expires_ref);
    const now = this.now().toISOString();
    this.db.prepare("UPDATE connector_connections SET disconnected_at = ?, updated_at = ? WHERE connection_id = ?")
      .run(now, now, connectionId);
    return this.require(connectionId);
  }

  resolveToken(connectionId: string, serviceId: string): string {
    const connection = this.require(connectionId, serviceId);
    if (connection.disconnected_at || !connection.credential_ref) throw new ConnectorConnectionError("disconnected", "所选连接已断开，请重新选择或授权");
    const token = this.secrets.get(connection.credential_ref)?.trim();
    if (!token) throw new ConnectorConnectionError("disconnected", "所选连接需要重新授权");
    return token;
  }

  bind(input: { scopeId: string; pluginId: string; slotId: string; serviceId: string; connectionId: string }): void {
    const connection = this.require(input.connectionId, input.serviceId);
    if (this.state(connection) !== "connected") throw new ConnectorConnectionError("disconnected", "连接不可用，请先重新授权");
    const scope = requiredText(input.scopeId, "作用域", 160);
    const plugin = requiredText(input.pluginId, "插件", 160);
    const slot = requiredText(input.slotId, "用途", 160);
    this.db.prepare(`INSERT INTO connector_bindings (scope_id,plugin_id,slot_id,connection_id,updated_at)
      VALUES (?,?,?,?,?) ON CONFLICT(scope_id,plugin_id,slot_id) DO UPDATE SET connection_id=excluded.connection_id,updated_at=excluded.updated_at`)
      .run(scope, plugin, slot, connection.connection_id, this.now().toISOString());
  }

  binding(scopeId: string, pluginId: string, slotId: string): ConnectorConnectionRecord | null {
    const row = this.db.prepare(`SELECT c.* FROM connector_bindings b JOIN connector_connections c USING(connection_id)
      WHERE b.scope_id = ? AND b.plugin_id = ? AND b.slot_id = ?`).get(scopeId, pluginId, slotId) as Row | undefined;
    return row ? connectionFromRow(row) : null;
  }

  unbind(scopeId: string, pluginId: string, slotId: string): void {
    this.db.prepare("DELETE FROM connector_bindings WHERE scope_id = ? AND plugin_id = ? AND slot_id = ?")
      .run(scopeId, pluginId, slotId);
  }
}

/** Opens one short-lived connection to the Home-owned registry. */
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T): T {
  const db = openHomeSqliteDatabase(homeDirectory, "connectors");
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
    const secrets: Secrets = {
      has: (ref) => runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref) !== null),
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
      put: (ref, value) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().put(ref, value)),
      delete: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().delete(ref)),
    };
    return operation(new ConnectorConnectionStore(db, secrets));
  } finally { db.close(); }
}

/** Adopt image credential references without opening the runner or decrypting keys. */
export function adoptLegacyImageConnections(homeDirectory: string): void {
  const path = join(homeDirectory, "images", "images.db");
  if (!existsSync(path)) return;
  const images = new DatabaseSync(path, { readOnly: true });
  try {
    if (!images.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='connections'").get()) return;
    const rows = images.prepare("SELECT id,name FROM connections").all() as Array<{ id: string; name: string }>;
    withConnectorConnections(homeDirectory, store => {
      for (const row of rows) store.adoptLegacy({ serviceId: "image-api", displayName: `${row.name.slice(0, 90)} · 原有密钥`, credentialRef: `images:${row.id}`, authMethod: "token" });
    });
  } finally { images.close(); }
}
