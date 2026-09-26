/** Host-owned bounded inference. No Runtime, workspace or tool authority crosses this port. */
export interface PrologueCredentialInput {
  /** Host-only continuing authority check, immediately before each actual dispatch. */
  beforeDispatch?(): void | Promise<void>;
  credential_ref: string;
  resolveCredential(ref: string): string | null | Promise<string | null>;
}
export interface PrologueTextInput extends PrologueCredentialInput {
  protocol: string; endpoint: string; model: string; prompt: string;
  prompt_cache?: "off" | "best-effort" | "required";
  signal?: AbortSignal; max_output_tokens: number; timeout_ms: number;
}
export interface PrologueTextResult {
  value: string;
  configuredModel: string;
  /** Empty when the provider does not report a model; never inferred from the request. */
  reportedModels: readonly string[];
  usage: readonly unknown[];
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
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message); this.name = "PrologueInferenceError";
  }
}
