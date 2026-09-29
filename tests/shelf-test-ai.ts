import type { ShelfAiPorts } from "@molis-ai/molis-work-contracts/modules/shelf";
import type { BoundedInferenceReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";

export const shelfTestReceipt: BoundedInferenceReceipt = {
  run_ref: { kind: "run", id: "test-run", revision: 1 }, state: "completed", configuredModel: "test-model", reportedModels: [],
  usage: [{ input: { source: "unknown" }, output: { source: "unknown" }, cacheRead: { source: "unknown" }, cacheWrite: { source: "unknown" }, cost: { source: "unknown" } }],
};
/** Domain tests inject the public Host port. Real Prologue transport is covered separately. */
export function shelfTestAi(generate?: ShelfAiPorts["generate"]): ShelfAiPorts {
  return { status: selection => ({ available: !selection || selection.provider_id === "test", reason: null,
    selected: selection ?? { provider_id: "test", model_id: "test-model" }, choices: [{ provider_id: "test", model_id: "test-model", label: "Test model", vision: true }] }),
    generate: generate ?? (async () => ({ text: "# 摘要\n\n材料的重点内容。", execution: shelfTestReceipt })),
  };
}
