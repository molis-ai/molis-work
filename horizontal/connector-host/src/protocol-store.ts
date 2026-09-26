import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
type Database = Pick<DatabaseSync, "prepare" | "exec">;

export const CONNECTOR_AUTH_TTL_MS = 10 * 60_000;
export interface ConnectorProtocolConfiguration {
  connectionId: string;
  serviceId: string;
  protocol: "mcp" | "oauth" | "cli";
}
export interface ConnectorAuthorizationSession<T extends ConnectorProtocolConfiguration> {
  state: string;
  origin: string;
  createdAt: number;
  configuration: T;
}

export class ConnectorProtocolStore {
  constructor(private readonly db: Database, private readonly discardStage?: (sessionId: string) => void) {
    db.exec(`CREATE TABLE IF NOT EXISTS connector_protocols (connection_id TEXT PRIMARY KEY, configuration_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS connector_authorization_sessions
        (state TEXT PRIMARY KEY, origin TEXT NOT NULL, created_at INTEGER NOT NULL, configuration_json TEXT NOT NULL);`);
  }
  private clearStage(configuration: string): void {
    const config = JSON.parse(configuration) as { sessionId?: string; connectionId: string };
    if (config.sessionId && config.sessionId !== config.connectionId) this.discardStage?.(config.sessionId);
  }
  get<T extends ConnectorProtocolConfiguration>(id: string): T | null {
    const row = this.db.prepare("SELECT configuration_json FROM connector_protocols WHERE connection_id=?").get(id) as { configuration_json: string } | undefined;
    return row ? JSON.parse(row.configuration_json) as T : null;
  }
  save(configuration: ConnectorProtocolConfiguration): void {
    this.db.prepare("INSERT INTO connector_protocols(connection_id,configuration_json) VALUES (?,?) ON CONFLICT(connection_id) DO UPDATE SET configuration_json=excluded.configuration_json")
      .run(configuration.connectionId, JSON.stringify(configuration));
  }
  begin<T extends ConnectorProtocolConfiguration>(origin: string, configuration: T, now = Date.now()): string {
    const expired = this.db.prepare("DELETE FROM connector_authorization_sessions WHERE created_at<? OR created_at>? RETURNING configuration_json")
      .all(now - CONNECTOR_AUTH_TTL_MS, now) as Array<{ configuration_json: string }>;
    for (const row of expired) this.clearStage(row.configuration_json);
    const state = randomBytes(32).toString("base64url");
    this.db.prepare("INSERT INTO connector_authorization_sessions(state,origin,created_at,configuration_json) VALUES (?,?,?,?)")
      .run(state, origin, now, JSON.stringify(configuration));
    return state;
  }
  update(state: string, configuration: ConnectorProtocolConfiguration): void {
    this.db.prepare("UPDATE connector_authorization_sessions SET configuration_json=? WHERE state=?").run(JSON.stringify(configuration), state);
  }
  discard(state: string): void { this.db.prepare("DELETE FROM connector_authorization_sessions WHERE state=?").run(state); }
  /** Atomic removal before exchanging a code makes callbacks one-use, including after a restart. */
  consume<T extends ConnectorProtocolConfiguration>(state: string, origin: string, now = Date.now()): ConnectorAuthorizationSession<T> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(state)) throw new Error("授权状态无效，请重新连接");
    const row = this.db.prepare("DELETE FROM connector_authorization_sessions WHERE state=? AND origin=? RETURNING created_at,configuration_json")
      .get(state, origin) as { created_at: number; configuration_json: string } | undefined;
    if (!row) throw new Error("授权会话不存在或已使用，请重新连接");
    if (now < row.created_at || now - row.created_at > CONNECTOR_AUTH_TTL_MS) {
      this.clearStage(row.configuration_json);
      throw new Error("授权已过期，请重新连接");
    }
    return { state, origin, createdAt: row.created_at, configuration: JSON.parse(row.configuration_json) as T };
  }
}

