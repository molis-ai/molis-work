import { ActionError, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangManifest, createLingguangActionHandlers, createLingguangContentHandlers, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";

export function lingguangActionProvider(home: string, projectId: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: lingguangManifest.plugin_id, plugin_id: lingguangManifest.plugin_id, title: lingguangManifest.name, kind: "plugin", project_id: projectId },
    definitions: lingguangManifest.actions!,
    handlers: [...createLingguangActionHandlers({
      withStore: run => { const store = openLingguangStore(home); try { return run(store); } finally { store.close(); } },
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型，再继续对话" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "文字模型配置无效，请检查服务连接" }; }
      },
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw new ActionError("actions.connection_required", "请先配置文字模型，再继续对话");
        return complete(prompt, options);
      }),
    }), ...createLingguangContentHandlers(actions)],
  };
}
