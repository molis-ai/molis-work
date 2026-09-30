import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { pptManifest, createPptActionHandlers, createPptContentHandlers, openPptStore, type PptStore } from "@molis-ai/molis-work-plugin-ppt";
import { registerPptArtifactVersion, readPptArtifactVersion } from "./creative-artifacts.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function pptActionProvider(home: string, runtime: MolisWorkProjectRuntime): ActionProviderRegistration {
  const withStore = <T>(run: (store: PptStore) => T): T => { const store = openPptStore(home); try { return run(store); } finally { store.close(); } };
  return {
    provider: { provider_id: pptManifest.plugin_id, plugin_id: pptManifest.plugin_id, title: pptManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: pptManifest.actions!,
    handlers: [...createPptActionHandlers({
      withStore,
      publishArtifact: (input, caller) => registerPptArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: (input, caller) => readPptArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
    }), ...createPptContentHandlers(withStore)],
  };
}
