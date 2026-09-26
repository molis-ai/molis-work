import { ActionError, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { createJellyActionHandlers, createJellyServiceHandlers, jellyManifest, openJellyStore } from "@molis-ai/molis-work-plugin-jelly";
import { createJellyCompletion, readJellyModelSettings, saveJellyModelSettings } from "./jelly-model.js";
import { extractJellyMaterial, readStoredJellyMaterial } from "./jelly-native-material.js";
import { readJellyMaterialSource } from "./jelly-source-providers.js";
import type { HostCompleteText } from "./host-complete-text.js";

/** One Home provider; opening a project must not create a second Jelly store or registry. */
export function jellyActionProvider(home: string, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? createJellyCompletion(home) : completion ?? undefined;
  return { provider: { provider_id: jellyManifest.plugin_id, plugin_id: jellyManifest.plugin_id, title: jellyManifest.name, kind: "plugin" }, definitions: jellyManifest.actions!,
    handlers: [...createJellyActionHandlers({
      withStore: run => { const store = openJellyStore(home); try { return run(store); } finally { store.close(); } },
      modelAvailability: () => {
        try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: "请先配置 Jelly 文字模型" }; }
        catch { return { available: false, code: "actions.connection_required", reason: "Jelly 模型配置不可用，请检查服务连接" }; }
      },
      ai: caller => ({ signal: caller.signal, onProgress: caller.on_progress,
        completeText: (prompt, options) => { const complete = model(); if (!complete) throw new ActionError("actions.connection_required", "请先配置 Jelly 文字模型"); return complete(prompt, options); },
        readSource: url => readJellyMaterialSource(home, url, { signal: caller.signal, onProgress: caller.on_progress }),
      }),
    }), ...createJellyServiceHandlers({
      material: (input, caller) => extractJellyMaterial(home, input, { signal: caller.signal, onProgress: caller.on_progress }),
      reread: (input, caller) => readStoredJellyMaterial(home, input, { signal: caller.signal, onProgress: caller.on_progress }),
      source: (input, caller) => readJellyMaterialSource(home, input.url, { allow_model_download: input.allow_model_download, signal: caller.signal, onProgress: caller.on_progress }),
      modelSettings: () => readJellyModelSettings(home),
      saveModelSettings: input => saveJellyModelSettings(home, input),
    })],
  };
}
