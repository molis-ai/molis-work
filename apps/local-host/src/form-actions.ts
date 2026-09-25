import { ActionError, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { formManifest, createFormActionHandlers, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { registerFormArtifactVersion, readFormArtifactVersion } from "./creative-artifacts.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

export function formActionProvider(home: string, runtime: MolisWorkProjectRuntime, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: formManifest.plugin_id, plugin_id: formManifest.plugin_id, title: formManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: formManifest.actions!,
    handlers: createFormActionHandlers({
      withStore: run => { const store = openFormStore(home); try { return run(store); } finally { store.close(); } },
      publishArtifact: (input, caller) => registerFormArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
      readArtifact: (input, caller) => readFormArtifactVersion(runtime.coordinator, runtime.board_id, runtime.project_id, caller.actor_id)(input),
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
