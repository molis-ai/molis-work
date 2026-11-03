import { existsSync } from "node:fs";
import { createFileSecretStore, homeSqlitePath, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openConnectorsStore } from "./connectors-store.js";
import { ConnectorConnectionStore, forgetPluginBindings, type ConnectorConnectionSecrets } from "@molis-ai/molis-work-service-connector-host";
import { invalidateConnectorBindingRequests, invalidateConnectorRequests } from "./connector-lifecycle.js";

export { ConnectorConnectionStore } from "@molis-ai/molis-work-service-connector-host";

/** Opens one short-lived connection to the Home-owned registry. */
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T): T {
  const db = openConnectorsStore(homeDirectory);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
    const secrets: ConnectorConnectionSecrets = {
      has: (ref) => runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref) !== null),
      get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
      put: (ref, value) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().put(ref, value)),
      delete: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().delete(ref)),
    };
    return operation(new ConnectorConnectionStore(db, secrets, undefined, id => invalidateConnectorRequests(homeDirectory, id),
      binding => invalidateConnectorBindingRequests(homeDirectory, binding)));
  } finally { db.close(); }
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
