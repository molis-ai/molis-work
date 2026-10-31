import { CONNECTOR_CONNECTIONS_SCHEMA, CONNECTOR_PROTOCOLS_SCHEMA, CONNECTOR_OBSERVATIONS_SCHEMA } from "@molis-ai/molis-work-service-connector-host";
import { openBaselineHomeSqlite, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

/**
 * The Home connectors store's one current schema (repository-anti-corruption §4.1): connections and protocols as the
 * connector host defines them, and the authorization receipts the settings page reads.
 */
export const CONNECTORS_BASELINE: SqliteBaseline = { version: 1, schema: `${CONNECTOR_CONNECTIONS_SCHEMA}${CONNECTOR_PROTOCOLS_SCHEMA}${CONNECTOR_OBSERVATIONS_SCHEMA}
  CREATE TABLE connector_authorization_results (
    id TEXT PRIMARY KEY, state_hash TEXT UNIQUE NOT NULL, connection_id TEXT NOT NULL,
    service_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL,
    setup_json TEXT, initiator_json TEXT);
` };

export function openConnectorsStore(home: string) {
  return openBaselineHomeSqlite(home, CONNECTORS_HOME_STORE.path, CONNECTORS_BASELINE);
}

/** This store in the Home's store registry (W4-11). */
export const CONNECTORS_HOME_STORE: HomeStoreDeclaration = { path: "connectors", library: { baseline: CONNECTORS_BASELINE } };
