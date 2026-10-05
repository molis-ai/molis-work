import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ConnectorConnectionError, withConnectorConnections } from "./connector-connection-store.js";

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

/** The key of the TypeSafe connection bound for this consumer; null when none is bound or it is unusable. */
export function typeSafeCredential(home: string, consumer: TypeSafeConsumer): string | null {
  const selected = selectedTypeSafeConnection(home, consumer);
  if (!selected) return null;
  return withConnectorConnections(home, (store) => {
    // A disconnected or missing connection is no key; a locked Keychain is reported as itself.
    try { return store.resolveToken(selected.connection_id, "typesafe"); } catch (error) {
      if (error instanceof ConnectorConnectionError) return null;
      throw error;
    }
  });
}

/** Source identity and sealed revision for a single inference; never returns plaintext. */
export function typeSafeConfiguration(home: string, consumer: TypeSafeConsumer): unknown {
  return withConnectorConnections(home, store => {
    const binding = store.binding("home", consumer, "typesafe");
    const connection = binding && store.get(binding.connection_id);
    const ref = connection?.credential_ref;
    return { binding, connection, sealed: ref ? runWithMolisWorkHome(home, () => peekSealedEntry(ref)) : null };
  });
}
