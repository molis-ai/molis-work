import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";
import { hostCompleteText } from "./host-complete-text.js";

/** One owner's bounded text calls on the person's configured text model, or why there is none. */
export interface TextModelPort {
  runtimeLabel?: string;
  unavailableReason?: string;
  completeText?: (prompt: InstructedPrompt, options?: { signal?: AbortSignal; beforeDispatch?: () => Promise<void> }) => Promise<string>;
}

/**
 * Binds the configured text model for `owner`: its registered instructions resolve as the person left them and their
 * use is recorded under that owner. `system` is the owner's own role text, read at each call so an edit applies at once.
 */
export function configuredTextPort(homeDirectory: string, options: { owner: string; unavailableReason: string; timeoutMs: number; system?: () => string }): TextModelPort {
  const catalog = openConfiguredModels(homeDirectory);
  try {
    const selected = catalog && selectConfiguredTextModel(homeDirectory, catalog.store);
    if (!selected) return { unavailableReason: options.unavailableReason };
    const complete = hostCompleteText({ homeDirectory, selection: { provider_id: selected.provider.provider_id, model_id: selected.model.model_id } });
    return { runtimeLabel: `Prologue · ${selected.provider.display_name} · ${selected.model.model_id}`,
      ...(complete ? { completeText: (prompt, request) => complete(resolveModelPrompt(homeDirectory, prompt, options.owner), {
        ...request, timeoutMs: options.timeoutMs, ...(options.system ? { system: options.system() } : {}),
      }) } : {}),
    };
  } finally { catalog?.storage.close(); }
}
