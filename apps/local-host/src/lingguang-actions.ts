import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { ActionError, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangManifest, createLingguangActionHandlers, createLingguangContentHandlers, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, type HostCompleteText } from "./host-complete-text.js";
import { extractJellyMaterial } from "./jelly-native-material.js";
import { readJellyMaterialSource } from "./jelly-source-providers.js";

export function lingguangActionProvider(home: string, projectId: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: lingguangManifest.plugin_id, plugin_id: lingguangManifest.plugin_id, title: lingguangManifest.name, kind: "plugin", project_id: projectId },
    definitions: lingguangManifest.actions!,
    handlers: [...createLingguangActionHandlers({
      withStore: run => { const store = openLingguangStore(home); try { return run(store); } finally { store.close(); } },
      // The Home's file and page readers (OCR, PDF, local transcription); a model download needs the person's yes.
      readFile: (input, caller) => extractJellyMaterial(home, input, { signal: caller.signal, beforeEffect: caller.beforeEffect, onProgress: caller.on_progress }),
      readSource: (input, caller) => readJellyMaterialSource(home, input.url, { allow_model_download: input.allow_model_download, signal: caller.signal, beforeEffect: caller.beforeEffect, onProgress: caller.on_progress }),
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置文字模型，再继续对话" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "文字模型配置无效，请检查服务连接" }; }
      },
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw new ActionError("actions.connection_required", "请先配置文字模型，再继续对话");
        return complete(resolveModelPrompt(home, prompt, "io.molis.work.lingguang"), options);
      }),
    }), ...createLingguangContentHandlers(actions)],
  };
}
