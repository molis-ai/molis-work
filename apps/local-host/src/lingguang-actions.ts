import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import type { ActionClient, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { lingguangManifest, createLingguangActionHandlers, createLingguangContentHandlers, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hostCompleteText, textModelAvailability, textModelRequired, type HostCompleteText } from "./host-complete-text.js";
import { L } from "./web-locale.js";
import { extractUploadedMaterial } from "./material-upload.js";
import { readMaterialSource } from "./material-source-providers.js";

export function lingguangActionProvider(home: string, projectId: string, actions: ActionClient, completion?: HostCompleteText | null): ActionProviderRegistration {
  const model = () => completion === undefined ? hostCompleteText({ homeDirectory: home }) : completion ?? undefined;
  return {
    provider: { provider_id: lingguangManifest.plugin_id, plugin_id: lingguangManifest.plugin_id, title: lingguangManifest.name, kind: "plugin", project_id: projectId },
    definitions: lingguangManifest.actions!,
    handlers: [...createLingguangActionHandlers({
      withStore: run => { const store = openLingguangStore(home); try { return run(store); } finally { store.close(); } },
      // The Home's file and page readers (OCR, PDF, local transcription); a model download needs the person's yes.
      readFile: (input, caller) => extractUploadedMaterial(home, { ...input, allow_model_download: caller.audience === "user" && input.allow_model_download === true }, { signal: caller.signal, beforeEffect: caller.beforeEffect, onProgress: caller.on_progress }),
      readSource: (input, caller) => readMaterialSource(home, input.url, { allow_model_download: caller.audience === "user" && input.allow_model_download === true, signal: caller.signal, beforeEffect: caller.beforeEffect, onProgress: caller.on_progress }),
      modelAvailability: () => textModelAvailability(model, L("继续对话")),
      completeText: (prompt, options) => runWithMolisWorkHome(home, () => {
        const complete = model();
        if (!complete) throw textModelRequired(L("继续对话"));
        const { onText, ...rest } = options;
        return complete(resolveModelPrompt(home, prompt, "io.molis.work.lingguang"), { ...rest,
          ...(onText ? { onProgress: event => { if (event.type === "text-delta") onText(event.text); } } : {}) });
      }),
    }), ...createLingguangContentHandlers(actions)],
  };
}
