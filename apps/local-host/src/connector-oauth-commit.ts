import { randomUUID } from "node:crypto";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { oauthConnectionRefs } from "./connector-oauth-targets.js";

const refsFor = (id: string) => ({ ...oauthConnectionRefs(id), workspace: `connector-connection:${id}:workspace` });
/** Dedicated OAuth drivers write temporary refs. The Host activates them only after its final cancellation check. */
export function createOAuthCredentialStage(home: string) {
  const refs = refsFor(randomUUID());
  const keys = [...Object.values(refs), `${refs.access}:client`];
  return {
    refs,
    commit(connectionId: string): void {
      runWithMolisWorkHome(home, () => {
        const store = createFileSecretStore();
        const target = refsFor(connectionId);
        const destinations = [...Object.values(target), `${target.access}:client`];
        keys.forEach((key, index) => { const value = store.get(key); if (value !== null) store.put(destinations[index]!, value); });
      });
    },
    clear(): void { runWithMolisWorkHome(home, () => { const store = createFileSecretStore(); for (const key of keys) store.delete(key); }); },
  };
}
