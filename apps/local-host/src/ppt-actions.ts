import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { pptManifest, createPptActionHandlers, openPptStore } from "@molis-ai/molis-work-plugin-ppt";
import { registerPptArtifactVersion, readPptArtifactVersion } from "./creative-artifacts.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function pptActionProvider(home: string, runtime: MolisWorkProjectRuntime): ActionProviderRegistration {
  return {
    provider: { provider_id: pptManifest.plugin_id, plugin_id: pptManifest.plugin_id, title: pptManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: pptManifest.actions!,
    handlers: createPptActionHandlers({
      withStore: run => { const store = openPptStore(home); try { return run(store); } finally { store.close(); } },
      publishArtifact: (input, caller) => registerPptArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: (input, caller) => readPptArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
    }),
  };
}
