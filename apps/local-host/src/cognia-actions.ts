import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { COGNIA_OWNER } from "./agent-definitions/system-prompts.js";
import { bindActionClient, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createCogniaActionHandlers, cogniaManifest, openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { createCogniaProloguePort } from "./cognia-prologue.js";
import { scanCogniaDirectory } from "./cognia-directory.js";
import type { HostCompleteText } from "./host-complete-text.js";
export function cogniaActionProvider(home: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  // Either path sends the registered instructions as the person left them: the Prologue port resolves them itself; a
  // plain Host completion is given the resolved text.
  const model = (actorId = "cognia") => completion === undefined ? createCogniaProloguePort({ homeDirectory: home, actorId })
    : completion ? { runtimeLabel: "Host · Cognia", completeText: (prompt: InstructedPrompt, options?: { signal?: AbortSignal }) => completion(resolveModelPrompt(home, prompt, COGNIA_OWNER), options) } : {};
  return { provider: { provider_id: cogniaManifest.plugin_id, plugin_id: cogniaManifest.plugin_id, title: cogniaManifest.name, kind: "plugin" }, definitions: cogniaManifest.actions!,
    handlers: createCogniaActionHandlers({
      withStore: run => { const store = openCogniaStore(home); try { return run(store); } finally { store.close(); } },
      model, ai: caller => ({ ...model(caller.actor_id), signal: caller.signal }),
      actions: caller => bindActionClient(actions, () => caller), scan: scanCogniaDirectory,
    }),
  };
}
