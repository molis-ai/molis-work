import { createLazyFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { FUNCTIONS_CREDENTIAL_REF } from "@molis-ai/molis-work-contracts/modules/functions";
import { withConnectorConnections } from "./connector-connection-store.js";

export type TypeSafeConsumer = "functions" | "experiments" | "plugin-builder";

export function selectedTypeSafeConnection(home: string, consumer: TypeSafeConsumer) {
  return withConnectorConnections(home, (store) => store.binding("home", consumer, "typesafe"));
}

export function bindTypeSafeConnection(home: string, consumer: TypeSafeConsumer, connectionId: string): void {
  withConnectorConnections(home, (store) => store.bind({ scopeId: "home", pluginId: consumer,
    slotId: "typesafe", serviceId: "typesafe", connectionId }));
}

export function unbindTypeSafeConnection(home: string, consumer: TypeSafeConsumer): void {
  withConnectorConnections(home, (store) => store.unbind("home", consumer, "typesafe"));
}

export function typeSafeCredential(home: string, consumer: TypeSafeConsumer): string | null {
  const selected = selectedTypeSafeConnection(home, consumer);
  if (selected) {
    return withConnectorConnections(home, (store) => {
      try { return store.resolveToken(selected.connection_id, "typesafe"); } catch { return null; }
    });
  }
  return runWithMolisWorkHome(home, () => createLazyFileSecretStore(home).get(FUNCTIONS_CREDENTIAL_REF))?.trim() || null;
}
