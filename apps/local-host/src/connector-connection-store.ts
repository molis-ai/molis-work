import { createFileSecretStore, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openConnectorsStore } from "./connectors-store.js";
import { ConnectorConnectionStore, type ConnectorConnectionSecrets } from "@molis-ai/molis-work-service-connector-host";
import { invalidateConnectorRequests } from "./connector-lifecycle.js";

export { ConnectorConnectionStore, ConnectorConnectionError } from "@molis-ai/molis-work-service-connector-host";

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
    return operation(new ConnectorConnectionStore(db, secrets, undefined, id => invalidateConnectorRequests(homeDirectory, id)));
  } finally { db.close(); }
}
