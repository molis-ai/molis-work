import { decodePrologueJsonOutput } from "@molis-ai/molis-work-service-agent-host";
import type { AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";

/** A model-text fixture crosses the same SDK JSON boundary as the production Host. */
export function alchemistOutput(text: string, runtimeLabel = "fixture", usage?: { inputTokens?: number; outputTokens?: number }): Awaited<ReturnType<AlchemistAiPort["generate"]>> {
  return { text, json: decodePrologueJsonOutput(text, { allowCodeFence: true }), runtimeLabel, ...(usage ? { usage } : {}) };
}
