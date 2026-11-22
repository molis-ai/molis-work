import { CONNECTOR_CONNECTIONS_SCHEMA, CONNECTOR_PROTOCOLS_SCHEMA, CONNECTOR_OBSERVATIONS_SCHEMA } from "@molis-ai/molis-work-service-connector-host";
import { withHeldHomeSqlite, type openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";

/** The connection the connectors store is used through: the Home store connection the storage package opens. */
export type ConnectorsDatabase = ReturnType<typeof openHomeSqliteDatabase>;

/**
 * The Home connectors store's one current schema (repository-anti-corruption §4.1): connections and protocols as the
 * connector host defines them, and the authorization receipts the settings page reads.
 */
export const CONNECTORS_BASELINE: SqliteBaseline = { version: /* @version database.connectors_baseline */ 1, schema: `${CONNECTOR_CONNECTIONS_SCHEMA}${CONNECTOR_PROTOCOLS_SCHEMA}${CONNECTOR_OBSERVATIONS_SCHEMA}
  CREATE TABLE connector_authorization_results (
    id TEXT PRIMARY KEY, state_hash TEXT UNIQUE NOT NULL, connection_id TEXT NOT NULL,
    service_id TEXT NOT NULL, status TEXT NOT NULL, expires_at INTEGER NOT NULL,
    setup_json TEXT, initiator_json TEXT);
` };

/** Set once on the held connection: every borrower waits for a busy file and keeps the bindings' foreign keys. */
const prepareConnectors = (db: ConnectorsDatabase) => db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");

/**
 * Runs `work` on the Home's one held connection to the connectors store (batch 103-1), created at its baseline when missing; the caller
 * borrows it synchronously and never closes it. `existingOnly`: a Home without the store answers `undefined` and stays without it.
 */
export function withConnectorsStore<T>(home: string, work: (db: ConnectorsDatabase) => T): T;
export function withConnectorsStore<T>(home: string, work: (db: ConnectorsDatabase) => T, existingOnly: true): T | undefined;
export function withConnectorsStore<T>(home: string, work: (db: ConnectorsDatabase) => T, existingOnly = false): T | undefined {
  return existingOnly ? withHeldHomeSqlite(home, CONNECTORS_HOME_STORE.path, CONNECTORS_BASELINE, work, { prepare: prepareConnectors, existingOnly: true })
    : withHeldHomeSqlite(home, CONNECTORS_HOME_STORE.path, CONNECTORS_BASELINE, work, { prepare: prepareConnectors });
}

/** This store in the Home's store registry (W4-11). */
export const CONNECTORS_HOME_STORE: HomeStoreDeclaration = { path: "connectors", library: { baseline: CONNECTORS_BASELINE } };

/** Pure queries leave an empty Home unchanged; the caller supplies its own empty result. */
export function readConnectorsStore<T>(home: string, empty: T, read: (db: ConnectorsDatabase) => T): T {
  return withConnectorsStore(home, read, true) ?? empty;
}
