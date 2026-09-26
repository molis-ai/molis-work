import { bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCogniaActionHandlers, cogniaManifest, openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { createCogniaProloguePort } from "./cognia-prologue.js";
import { scanCogniaDirectory } from "./cognia-directory.js";
import type { HostCompleteText } from "./host-complete-text.js";
export function cogniaActionProvider(home: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = (actorId = "cognia") => completion === undefined ? createCogniaProloguePort({ homeDirectory: home, actorId }) : completion ? { runtimeLabel: "Host · Cognia", completeText: completion } : {};
  return { provider: { provider_id: cogniaManifest.plugin_id, plugin_id: cogniaManifest.plugin_id, title: cogniaManifest.name, kind: "plugin" }, definitions: cogniaManifest.actions!,
    handlers: createCogniaActionHandlers({
      withStore: run => { const store = openCogniaStore(home); try { return run(store); } finally { store.close(); } },
      model, ai: caller => ({ ...model(caller.actor_id), signal: caller.signal }),
      actions: caller => bindActionClient(actions, () => caller), scan: scanCogniaDirectory,
    }),
  };
}
