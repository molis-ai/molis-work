import type { GenerationResult, RuntimeModel, StructuredGenerationRequest } from "../../domain/kernel/ports.js";

/** Host-owned boundary. Model IDs are opaque; providers and credentials stay in the Host. */
export interface AlchemistAiPort {
  listModels(): Promise<readonly RuntimeModel[]>;
  generate(input: {
    operationId: string;
    purpose: string;
    systemPrompt: string;
    userPrompt: string;
    jsonSchema: Record<string, unknown>;
    modelId?: string;
    signal?: AbortSignal;
  }): Promise<{ text: string; runtimeLabel: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
  search(input: { query: string; lens?: "market_space" | "build_cost"; signal?: AbortSignal }): Promise<readonly { url: string; title: string; excerpt: string }[]>;
}

/** Malformed output never becomes a successful business object. */
export async function generateWithHost<Result>(ai: AlchemistAiPort, input: StructuredGenerationRequest<Result>, modelId?: string): Promise<GenerationResult<Result>> {
  input.signal?.throwIfAborted();
  const { parse, ...request } = input;
  const result = await ai.generate({ ...request, ...(modelId === undefined ? {} : { modelId }) });
  input.signal?.throwIfAborted();
  let value: unknown;
  try {
    const text = result.text.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(text);
    value = JSON.parse(fenced?.[1] ?? text);
  } catch { throw new Error("AI_OUTPUT_INVALID"); }
  return { operationId: input.operationId, runtimeLabel: result.runtimeLabel, value: parse(value), ...(result.usage ? { usage: result.usage } : {}) };
}
