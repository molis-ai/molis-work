import { clearInExistingHomeSqlite, createFileSecretStore, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { ProjectDeletionControl } from "@molis-ai/molis-work-contracts/modules/projects";
import { CONNECTORS_BASELINE, openConnectorsStore } from "./connectors-store.js";
import { ConnectorConnectionStore, type ConnectorConnectionSecrets } from "@molis-ai/molis-work-service-connector-host";
import { invalidateConnectorRequests } from "./connector-lifecycle.js";

export { ConnectorConnectionStore } from "@molis-ai/molis-work-service-connector-host";

/** Opens one short-lived connection to the Home-owned registry. */
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T): T {
  const db = openConnectorsStore(homeDirectory);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON");
    return operation(connectionStoreFor(homeDirectory, db));
  } finally { db.close(); }
}

/** Maintenance clears only the original project's bindings, without initializing the registry or touching accounts. */
export function clearExistingProjectConnectionBindings(homeDirectory: string, projectId: string, control: ProjectDeletionControl): void {
  clearInExistingHomeSqlite(homeDirectory, "connectors", CONNECTORS_BASELINE, db => {
    control.assertCurrent();
    connectionStoreFor(homeDirectory, db).forgetProjectBindings(projectId);
  }, control);
}

function connectionStoreFor(homeDirectory: string, db: ReturnType<typeof openConnectorsStore>): ConnectorConnectionStore {
  const secrets: ConnectorConnectionSecrets = {
    has: (ref) => runWithMolisWorkHome(homeDirectory, () => peekSealedEntry(ref) !== null),
    get: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().get(ref)),
    put: (ref, value) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().put(ref, value)),
    delete: (ref) => runWithMolisWorkHome(homeDirectory, () => createFileSecretStore().delete(ref)),
  };
  return new ConnectorConnectionStore(db, secrets, undefined, id => invalidateConnectorRequests(homeDirectory, id));
}
