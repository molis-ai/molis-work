import { connectorErrors } from "@molis-ai/molis-work-contracts/services/connector-host";
import { existsSync } from "node:fs";
import { openExistingBaselineHomeSqlite, createFileSecretStore, homeSqlitePath, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openConnectorsStore, CONNECTORS_BASELINE, CONNECTORS_HOME_STORE } from "./connectors-store.js";
import { ConnectorConnectionStore, ConnectorObservationStore, forgetPluginBindings, type ConnectorCheckObservation, type ConnectorConnectionSecrets } from "@molis-ai/molis-work-service-connector-host";
import { invalidateConnectorBindingRequests, invalidateConnectorRequests } from "./connector-lifecycle.js";
import { settleConnectionNotices } from "./assistant/assistant-connection-notices.js";

export { ConnectorConnectionStore } from "@molis-ai/molis-work-service-connector-host";

/** Opens one short-lived connection to the Home-owned registry. */
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T): T;
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T, existingOnly: true): T | undefined;
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T, existingOnly: "required"): T;
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T, existingOnly: boolean | "required" = false): T | undefined {
  const db = existingOnly ? openExistingBaselineHomeSqlite(homeDirectory, CONNECTORS_HOME_STORE.path, CONNECTORS_BASELINE) : openConnectorsStore(homeDirectory);
  if (!db) {
    if (existingOnly === "required") throw connectorErrors["connector.connection.not_found"]("连接不存在");
    return undefined;
  }
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
    const secrets: ConnectorConnectionSecrets = {
      has: (ref) => runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref) !== null),
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
      put: (ref, value) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().put(ref, value)),
      delete: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().delete(ref)),
    };
    // A reconnect, a replaced key, enabling or disabling, disconnecting or removing ends whatever the connection's notices said (ASC-58).
    const store = new ConnectorConnectionStore(db, secrets, undefined, id => { invalidateConnectorRequests(homeDirectory, id); settleConnectionNotices(homeDirectory, id); },
      binding => invalidateConnectorBindingRequests(homeDirectory, binding));
    observationsOf.set(store, new ConnectorObservationStore(db));
    return operation(store);
  } finally { db.close(); }
}

/** Each open store's checks, on the same database handle: the observations live in the same file, so a read inside needs no second open. */
const observationsOf = new WeakMap<ConnectorConnectionStore, ConnectorObservationStore>();

/**
 * A connection's last check, read through the handle `store` holds (S-70 reads it on every plugin request). `undefined` for a store this
 * module did not open, so the caller reads it itself rather than taking "no check" for "not refused".
 */
export function lastConnectorCheck(store: ConnectorConnectionStore, connectionId: string): ConnectorCheckObservation | null | undefined {
  const observations = observationsOf.get(store);
  return observations ? observations.read(connectionId).check ?? null : undefined;
}

/** Unbinds every slot one plugin name holds in one scope (a sandboxed installation's image namespace, BL-491); the accounts stay. A Home without connectors is left as it is. */
export function forgetConnectorPluginBindings(homeDirectory: string, scopeId: string, pluginId: string): number {
  if (!existsSync(homeSqlitePath(homeDirectory, "connectors"))) return 0;
  const db = openConnectorsStore(homeDirectory);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
    return forgetPluginBindings(db, scopeId, pluginId, binding => invalidateConnectorBindingRequests(homeDirectory, binding));
  } finally { db.close(); }
}
