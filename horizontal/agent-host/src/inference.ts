import type { ExactRef, ModelEvent, StructuredRequest, TerminalRunState, UsageReceipt } from "@prologue/sdk";

export { decodeJsonOutput as decodePrologueJsonOutput } from "@prologue/sdk";

export type PrologueUsageReceipt = UsageReceipt;
export type PrologueStructuredRequest = StructuredRequest;
export type PrologueRunRef = ExactRef<"run">;
export type PrologueTextProgress = { type: "started"; run_ref: PrologueRunRef }
  | Extract<ModelEvent, { type: "text-delta" | "model-reported" | "usage-recorded" }>;

/** Host-owned bounded inference. No Runtime, workspace or tool authority crosses this port. */
export interface PrologueCredentialInput {
  /** Host-only continuing authority check, immediately before each actual dispatch. */
  beforeDispatch?(): void | Promise<void>;
  credential_ref: string;
  resolveCredential(ref: string): string | null | Promise<string | null>;
}
export interface PrologueTextInput extends PrologueCredentialInput {
  protocol: string; endpoint: string; model: string; prompt: string;
  system?: string;
  structured?: PrologueStructuredRequest;
  onProgress?(event: PrologueTextProgress): void;
  prompt_cache?: "off" | "best-effort" | "required";
  signal?: AbortSignal; max_output_tokens: number; timeout_ms: number;
}
export interface PrologueExecutionReceipt {
  run_ref: PrologueRunRef;
  state: TerminalRunState;
  configuredModel: string;
  /** Empty when the provider does not report a model; never inferred from the request. */
  reportedModels: readonly string[];
  usage: readonly PrologueUsageReceipt[];
}
export interface PrologueTextResult extends PrologueExecutionReceipt {
  state: "completed";
  value: string;
  /** Present only when a requested structure was checked by Prologue. */
  structured?: unknown;
}
export interface PrologueImageInput extends PrologueCredentialInput {
  protocol: "openai-images" | "gemini"; endpoint: string; model: string; prompt: string;
  size?: string; aspect_ratio?: string; signal?: AbortSignal; timeout_ms: number;
}
export interface PrologueTypeSafeInput extends PrologueCredentialInput {
  endpoint: string; model: string; state: string; questions: Record<string, unknown>;
  signal?: AbortSignal; timeout_ms: number;
}
export interface PrologueInferenceClient {
  completeText(input: PrologueTextInput): Promise<string>;
  completeTextResult(input: PrologueTextInput): Promise<PrologueTextResult>;
  generateImages(input: PrologueImageInput): Promise<readonly { bytes: Uint8Array; mime?: string }[]>;
  evaluateTypeSafe(input: PrologueTypeSafeInput): Promise<unknown>;
}
export class PrologueInferenceError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number, readonly execution?: PrologueExecutionReceipt) {
    super(message); this.name = "PrologueInferenceError";
  }
}

/** A total is reported only if every call reports this direction; unknown/estimated never becomes zero. */
export function reportedTokenTotal(receipts: readonly PrologueUsageReceipt[], direction: "input" | "output"): number | undefined {
  if (!receipts.length) return undefined;
  let total = 0;
  for (const receipt of receipts) {
    const count = receipt[direction];
    if (count.source !== "reported" || count.tokens === undefined) return undefined;
    total += count.tokens;
  }
  return total;
}

// A registry symbol, so a refusal still reads as one when two copies of this module are loaded (source and build).
const REFUSAL = Symbol.for("molis-work.agent-host.dispatch-refusal");
/** What the Host's own dispatch check threw (a revoked source, a changed key): it reaches the caller unchanged. */
export function markDispatchRefusal(error: Error): Error { Object.defineProperty(error, REFUSAL, { value: true }); return error; }
/**
 * The Host's own check refused before anything was sent. The SDK reports that as `EFFECT_NOT_AUTHORIZED`; consumers
 * get the check's own error back and must say it was not sent, not blame the model or the network.
 */
export function isDispatchRefusal(error: unknown): error is Error { return error instanceof Error && (error as { [REFUSAL]?: boolean })[REFUSAL] === true; }

/**
 * When the Home's execution service itself cannot take the request, the person needs that reason, not a
 * provider or network hint. Returns undefined for model and provider failures, which consumers explain themselves.
 */
export function inferenceServiceUnavailableReason(error: unknown): string | undefined {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code === "agent.storage_busy") return "这台电脑上另一个 Molis Work 进程正在使用 AI 执行服务，请在那个窗口操作，或关闭它后重试";
  if (code === "inference.unbound" || code === "inference.closed" || code === "inference.home_in_use") return "AI 执行服务尚未就绪或已停止，请稍后重试";
  return undefined;
}
