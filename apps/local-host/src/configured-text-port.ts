import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { resolveModelPrompt } from "./agent-definitions/instructions.js";
import { ONBOARDING_OWNER } from "./agent-definitions/system-prompts.js";
import { openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";
import { hostTextGeneration, type HostTextCommitResult } from "./host-complete-text.js";

export const ONBOARDING_TEXT_MODEL_MISSING = "材料已保存。请在设置中连接文字模型，再回来继续整理。";

export interface TextModelPort<Answer> {
  runtimeLabel?: string;
  unavailableReason?: string;
  completeText?: (prompt: InstructedPrompt, options?: { signal?: AbortSignal; beforeDispatch?: () => Promise<void> }) => Promise<Answer>;
}

/** Uses onboarding's registered instructions and keeps the selected model's result check with the reply. */
export async function onboardingTextModel(homeDirectory: string, injected?: (home: string) => Promise<TextModelPort<string>>): Promise<TextModelPort<HostTextCommitResult>> {
  if (injected) {
    const { completeText, ...metadata } = await injected(homeDirectory);
    return { ...metadata, ...(completeText ? {
      completeText: async (prompt, options) => ({ value: await completeText(prompt, options), validateResult() {} }),
    } : {}) };
  }
  const catalog = openConfiguredModels(homeDirectory);
  try {
    const selected = catalog && selectConfiguredTextModel(homeDirectory, catalog.store);
    if (!selected) return { unavailableReason: ONBOARDING_TEXT_MODEL_MISSING };
    const complete = hostTextGeneration({ homeDirectory, selection: { provider_id: selected.provider.provider_id, model_id: selected.model.model_id } });
    return { runtimeLabel: `Prologue · ${selected.provider.display_name} · ${selected.model.model_id}`,
      ...(complete ? { completeText: (prompt, request) => complete(resolveModelPrompt(homeDirectory, prompt, ONBOARDING_OWNER), {
        ...request, timeoutMs: 180_000,
      }) } : {}),
    };
  } finally { catalog?.storage.close(); }
}
