import { ActionError, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { datasetManifest, createDatasetActionHandlers, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { registerDatasetArtifactVersion, readDatasetArtifactVersion } from "./creative-artifacts.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function datasetActionProvider(home: string, runtime: MolisWorkProjectRuntime, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: datasetManifest.plugin_id, plugin_id: datasetManifest.plugin_id, title: datasetManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: datasetManifest.actions!,
    handlers: createDatasetActionHandlers({
      withStore: run => { const store = openDatasetStore(home); try { return run(store); } finally { store.close(); } },
      publishArtifact: (input, caller) => registerDatasetArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: (input, caller) => readDatasetArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置可用的文字模型" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "文字模型配置无效，请检查服务连接" }; }
      },
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model(); if (!complete) throw new ActionError("actions.connection_required", "请先配置可用的文字模型");
        return complete(prompt, options);
      }),
    }),
  };
}
