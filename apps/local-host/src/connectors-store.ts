import { CONNECTOR_CONNECTIONS_SCHEMA, CONNECTOR_PROTOCOLS_SCHEMA } from "@molis-ai/molis-work-service-connector-host";
import { openBaselineHomeSqlite, type SqliteBaseline } from "@molis-ai/molis-work-storage";

/**
 * The Home connectors store's one current schema (repository-anti-corruption §4.1): connections and protocols as the
 * connector host defines them, and the authorization receipts the settings page reads.
 */
export const CONNECTORS_BASELINE: SqliteBaseline = { version: 1, schema: `${CONNECTOR_CONNECTIONS_SCHEMA}${CONNECTOR_PROTOCOLS_SCHEMA}
  CREATE TABLE connector_authorization_results (
    id TEXT PRIMARY KEY, state_hash TEXT UNIQUE NOT NULL, connection_id TEXT NOT NULL,
    service_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL);
` };

export function openConnectorsStore(home: string) {
  return openBaselineHomeSqlite(home, "connectors", CONNECTORS_BASELINE);
}
