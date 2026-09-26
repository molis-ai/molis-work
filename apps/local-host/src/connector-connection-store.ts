import { createFileSecretStore, openHomeSqliteDatabase, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ConnectorConnectionStore, type ConnectorConnectionSecrets } from "@molis-ai/molis-work-service-connector-host";
import { inspectImageCredentialReferences } from "@molis-ai/molis-work-plugin-images";
import { invalidateConnectorRequests } from "./connector-lifecycle.js";

export { ConnectorConnectionStore, ConnectorConnectionError } from "@molis-ai/molis-work-service-connector-host";

/** Opens one short-lived connection to the Home-owned registry. */
export function withConnectorConnections<T>(homeDirectory: string, operation: (store: ConnectorConnectionStore) => T): T {
  const db = openHomeSqliteDatabase(homeDirectory, "connectors");
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

/** Adopt image credential references without opening the runner or decrypting keys. */
export function adoptLegacyImageConnections(homeDirectory: string): void {
  const references = inspectImageCredentialReferences(homeDirectory);
  if (!references.length) return;
  withConnectorConnections(homeDirectory, store => {
    for (const reference of references) store.adoptLegacy({
      serviceId: "image-api", displayName: `${reference.name.slice(0, 90)} · 原有密钥`,
      credentialRef: reference.credential_ref, authMethod: "token",
    });
  });
}
