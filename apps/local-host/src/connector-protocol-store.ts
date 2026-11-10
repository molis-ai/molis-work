import { openExistingBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { openConnectorsStore, CONNECTORS_BASELINE, CONNECTORS_HOME_STORE } from "./connectors-store.js";
import { ConnectorProtocolStore } from "@molis-ai/molis-work-service-connector-host";
export { ConnectorProtocolStore, CONNECTOR_AUTH_TTL_MS, type ConnectorProtocolConfiguration, type ConnectorAuthorizationSession } from "@molis-ai/molis-work-service-connector-host";

export function withConnectorProtocols<T>(home: string, operation: (store: ConnectorProtocolStore) => T): T;
export function withConnectorProtocols<T>(home: string, operation: (store: ConnectorProtocolStore) => T, existingOnly: true): T | undefined;
export function withConnectorProtocols<T>(home: string, operation: (store: ConnectorProtocolStore) => T, existingOnly = false): T | undefined {
  const db = existingOnly ? openExistingBaselineHomeSqlite(home, CONNECTORS_HOME_STORE.path, CONNECTORS_BASELINE) : openConnectorsStore(home);
  if (!db) return undefined;
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
      for (const name of ["access", "oauth", "expires", "client", "verifier", "environment", "device"]) store.delete(reference(name));
    }),
  };
}
