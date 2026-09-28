import type { CogniaAiPorts } from "@molis-ai/molis-work-plugin-cognia";
import { hostCompleteText } from "./host-complete-text.js";
import { openConfiguredModels, selectConfiguredTextModel } from "./configured-models.js";

/** Cognia owns the evidence prompt. The Host binds its selection to the Home's shared inference owner. */
export function createCogniaProloguePort(options: { homeDirectory: string }): CogniaAiPorts {
  const catalog = openConfiguredModels(options.homeDirectory);
  try {
    const selected = catalog && selectConfiguredTextModel(options.homeDirectory, catalog.store);
    if (!selected) return { unavailableReason: "当前没有可用的文字模型，请检查模型设置和服务连接；导入、搜索和阅读仍可使用。" };
    const complete = hostCompleteText({ homeDirectory: options.homeDirectory,
      selection: { provider_id: selected.provider.provider_id, model_id: selected.model.model_id } });
    return { runtimeLabel: `Prologue · ${selected.provider.display_name} · ${selected.model.model_id}`,
      ...(complete ? { completeText: (prompt, request) => complete(prompt, { ...request, timeoutMs: 180_000 }) } : {}),
    };
  } finally { catalog?.storage.close(); }
}
