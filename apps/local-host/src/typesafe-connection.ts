import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withConnectorConnections } from "./connector-connection-store.js";

/** The binding is stored once per Home under the plugin-slot id `functions`, which the judgment-rules service (modules/judgment-rules) reads; every caller uses that one binding. */
const CONSUMER = "functions";

export function selectedTypeSafeConnection(home: string) {
  return withConnectorConnections(home, (store) => store.binding("home", CONSUMER, "typesafe"));
}

export function bindTypeSafeConnection(home: string, connectionId: string): void {
  withConnectorConnections(home, (store) => store.bind({ scopeId: "home", pluginId: CONSUMER,
    slotId: "typesafe", serviceId: "typesafe", connectionId }));
}

export function unbindTypeSafeConnection(home: string): void {
  withConnectorConnections(home, (store) => store.unbind("home", CONSUMER, "typesafe"));
}

/** The key of the TypeSafe connection bound for the judgment-rules service; null when none is bound or it is unusable. */
export function typeSafeCredential(home: string): string | null {
  const selected = selectedTypeSafeConnection(home);
  if (!selected) return null;
  return withConnectorConnections(home, (store) => {
    // A disconnected or missing connection is no key; a locked Keychain is reported as itself.
    try { return store.resolveToken(selected.connection_id, "typesafe"); } catch (error) {
      if ((error instanceof ActionError && ["connector.connection.invalid","connector.connection.not_found","connector.connection.service_mismatch","connector.connection.disconnected"].includes(error.code))) return null;
      throw error;
    }
  });
}

/** Source identity and sealed revision for a single inference; never returns plaintext. */
export function typeSafeConfiguration(home: string): unknown {
  return withConnectorConnections(home, store => {
    const binding = store.binding("home", CONSUMER, "typesafe");
    const connection = binding && store.get(binding.connection_id);
    const ref = connection?.credential_ref;
    return { binding, connection, sealed: ref ? runWithMolisWorkHome(home, () => peekSealedEntry(ref)) : null };
  });
}
