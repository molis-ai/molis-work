import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ALCHEMIST_FORMAT_CORRECTION } from "../../../prompts.js";
import type { GenerationResult, RuntimeModel, StructuredGenerationRequest } from "../../domain/kernel/ports.js";
import { ZodError } from "zod";

/** Host-owned boundary. Model IDs are opaque; providers and credentials stay in the Host. */
export interface AlchemistAiPort {
  listModels(): Promise<readonly RuntimeModel[]>;
  generate(input: {
    operationId: string;
    purpose: string;
    systemPrompt: InstructedPrompt;
    userPrompt: string;
    jsonSchema: Record<string, unknown>;
    modelId?: string;
    /** Supplied by the Studio caller/job context, never by business input. */
    actorId?: string;
    signal?: AbortSignal;
    /** Preserve and compose with Host guards after prepare/credentials/queue, immediately before dispatch. */
    beforeModelDispatch?: () => Promise<void>;
  }): Promise<{ text: string; json: { ok: true; value: unknown } | { ok: false }; runtimeLabel: string; usage?: { inputTokens?: number; outputTokens?: number } }>;
  search(input: { query: string; lens?: "market_space" | "build_cost"; signal?: AbortSignal }): Promise<readonly { url: string; title: string; excerpt: string }[]>;
}

/** Malformed output never becomes a successful business object. */
export async function generateWithHost<Result>(ai: AlchemistAiPort, input: StructuredGenerationRequest<Result>, modelId?: string, beforeCorrection?: () => Promise<void>): Promise<GenerationResult<Result>> {
  input.signal?.throwIfAborted();
  await input.beforeModelDispatch?.();
  const { parse, ...request } = input;
  const result = await ai.generate({ ...request, ...(modelId === undefined ? {} : { modelId }) });
  input.signal?.throwIfAborted();
  await input.beforeModelDispatch?.();
  const parseResult = (result: Awaited<ReturnType<AlchemistAiPort["generate"]>>): Result => {
    if (!result.json.ok) throw new Error("AI_OUTPUT_INVALID");
    return parse(result.json.value);
  };
  try {
    return { operationId: input.operationId, runtimeLabel: result.runtimeLabel, value: parseResult(result), ...(result.usage ? { usage: result.usage } : {}) };
  } catch (error) {
    if (!beforeCorrection || !(error instanceof ZodError || error instanceof Error && error.message === "AI_OUTPUT_INVALID")) throw error;
    // The worker reserves and persists this extra call before it can reach Prologue.
    await beforeCorrection();
    input.signal?.throwIfAborted();
    await input.beforeModelDispatch?.();
    const corrected = await ai.generate({ ...request, operationId: input.operationId + ":format_correction",
      purpose: "修正研究输出的 JSON 格式（一次）", ...(modelId === undefined ? {} : { modelId }),
      systemPrompt: instructed(ALCHEMIST_FORMAT_CORRECTION, ""),
      userPrompt: JSON.stringify({ invalidOutput: result.text, schema: input.jsonSchema }),
    });
    input.signal?.throwIfAborted();
    await input.beforeModelDispatch?.();
    const usage = result.usage && corrected.usage ? {
      ...(typeof result.usage.inputTokens === "number" && typeof corrected.usage.inputTokens === "number" ? { inputTokens: result.usage.inputTokens + corrected.usage.inputTokens } : {}),
      ...(typeof result.usage.outputTokens === "number" && typeof corrected.usage.outputTokens === "number" ? { outputTokens: result.usage.outputTokens + corrected.usage.outputTokens } : {}),
    } : undefined;
    return { operationId: input.operationId, runtimeLabel: corrected.runtimeLabel, value: parseResult(corrected), ...(usage ? { usage } : {}) };
  }
}

export function composeModelDispatchGuards(...guards: Array<(() => Promise<void>) | undefined>): () => Promise<void> {
  return async () => { for (const guard of guards) await guard?.(); };
}
