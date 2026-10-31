import type { DatabaseSync } from "node:sqlite";
import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";

/**
 * The signed package a connection was made for (T-134): its plugin id, the installation it ran as (`install_id` is the plugin id and the
 * publisher's verified signature, so another publisher's package of the same id has another one) and its title, which the settings show.
 * Written once, with the connection; a built-in or platform service's connection has none.
 */
export interface ConnectorConnectionDeclarer {
  readonly plugin_id: string;
  readonly install_id: string;
  readonly plugin_title: string;
}

function text(value: unknown, label: string, max: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed || [...trimmed].length > max) throw connectorErrors["connector.connection.invalid"](`${label}不能为空且最多 ${max} 个字符`);
  return trimmed;
}

/** The pin as it is stored: every part present and bounded. */
export function normalizeConnectorDeclarer(value: ConnectorConnectionDeclarer): ConnectorConnectionDeclarer {
  return { plugin_id: text(value.plugin_id, "插件", 160), install_id: text(value.install_id, "插件安装", 512), plugin_title: text(value.plugin_title, "插件名称", 200) };
}

/** Runs `work` as one write: all of it or none. */
export function inConnectorTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** The `connector_connection_declarers` table: the only reader and writer of the pin. A removed connection keeps its row with the record. */
export class ConnectorConnectionDeclarers {
  constructor(private readonly db: DatabaseSync) {}

  /** The package this connection was made for, `null` for a built-in or platform service's. The installation it names is never shown. */
  get(connectionId: string): ConnectorConnectionDeclarer | null {
    const row = this.db.prepare("SELECT plugin_id,install_id,plugin_title FROM connector_connection_declarers WHERE connection_id = ?")
      .get(connectionId) as ConnectorConnectionDeclarer | undefined;
    return row ? { plugin_id: row.plugin_id, install_id: row.install_id, plugin_title: row.plugin_title } : null;
  }

  /** Pins a connection that is there to the package it was made for. Written once: a connection that already has a pin keeps it, whatever is asked. */
  pin(connectionId: string, declarer: ConnectorConnectionDeclarer): void {
    const pin = normalizeConnectorDeclarer(declarer);
    if (!this.db.prepare("SELECT 1 FROM connector_connections WHERE connection_id = ? AND removed_at IS NULL").get(connectionId)) {
      throw connectorErrors["connector.connection.not_found"]("找不到这条连接");
    }
    const written = this.db.prepare("INSERT OR IGNORE INTO connector_connection_declarers (connection_id,plugin_id,install_id,plugin_title) VALUES (?,?,?,?)")
      .run(connectionId, pin.plugin_id, pin.install_id, pin.plugin_title);
    if (!written.changes) throw connectorErrors["connector.connection.invalid"]("这条连接已经记下了建它的插件，不能改");
  }
}
