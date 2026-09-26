import { createFileSecretStore, openHomeSqliteDatabase, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ConnectorProtocolStore } from "@molis-ai/molis-work-service-connector-host";
export { ConnectorProtocolStore, CONNECTOR_AUTH_TTL_MS, type ConnectorProtocolConfiguration, type ConnectorAuthorizationSession } from "@molis-ai/molis-work-service-connector-host";

export function withConnectorProtocols<T>(home: string, operation: (store: ConnectorProtocolStore) => T): T {
  const db = openHomeSqliteDatabase(home, "connectors");
  try {
    db.exec("PRAGMA busy_timeout = 5000");
    return operation(new ConnectorProtocolStore(db, sessionId => connectorProtocolSecrets(home, sessionId).clear()));
  } finally { db.close(); }
}

/** These values never enter protocol JSON or HTTP responses. */
export function connectorProtocolSecrets(home: string, sessionId: string) {
  if (!/^[0-9a-f-]{36}$/u.test(sessionId)) throw new Error("连接凭据标识无效");
  const reference = (name: string) => `connector-protocol:${sessionId}:${name}`;
  return {
    reference,
    get: (name: string) => runWithMolisWorkHome(home, () => createFileSecretStore().get(reference(name))),
    put: (name: string, value: string) => runWithMolisWorkHome(home, () => createFileSecretStore().put(reference(name), value)),
    delete: (name: string) => runWithMolisWorkHome(home, () => createFileSecretStore().delete(reference(name))),
    clear: () => runWithMolisWorkHome(home, () => {
      const store = createFileSecretStore();
      for (const name of ["access", "oauth", "expires", "client", "verifier"]) store.delete(reference(name));
    }),
  };
}
