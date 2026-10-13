import type { ActionAvailability } from "./actions.js";
import type { InstructedPrompt, InstructionPrompt } from "./model-prompts.js";

/**
 * What one call of the model service may ask for. The defaults are what the Host's text completion has always used
 * (120 seconds, 5000 tokens); the ceilings are the largest any built-in use asks for today (Shelf: 600 seconds, 12000 tokens).
 */
export const PLUGIN_MODEL_LIMITS = {
  default_timeout_ms: 120_000,
  max_timeout_ms: 600_000,
  default_output_tokens: 5_000,
  max_output_tokens: 12_000,
} as const;

export interface PluginModelRequest {
  /** Joined with the running action's own signal: either one ends the call. */
  readonly signal?: AbortSignal;
  /** One more of the plugin's own registered instructions, sent as the system prompt in the person's version. */
  readonly system?: InstructionPrompt;
  /** "json": the answer is decoded (a code fence around it is allowed) and handed over as `value`. The default is "text". */
  readonly output?: "text" | "json";
  /** Up to `PLUGIN_MODEL_LIMITS.max_timeout_ms`. */
  readonly timeout_ms?: number;
  /** Up to `PLUGIN_MODEL_LIMITS.max_output_tokens`. */
  readonly max_output_tokens?: number;
}

export interface PluginModelResult {
  readonly text: string;
  /** Only with `output: "json"`: the decoded answer. The plugin checks its shape; the service checks only that it is JSON. */
  readonly value?: unknown;
  /** Only when the provider reported it; a model the Host was given for a test reports nothing. */
  readonly usage?: { readonly input_tokens: number; readonly output_tokens: number };
}

/**
 * The Host's text model, for a plugin the Host runs itself that declares `model:invoke`. It works only inside one of the plugin's
 * own actions that declares `model:invoke` and is scheduled "concurrent": the Host knows which action is running, the plugin
 * passes no call context. The call's `beforeEffect()` is asked before the model is and again before the answer is handed over,
 * so a call that was cancelled, revoked, stopped, or whose action has already returned (`actions.expired`) gets no answer.
 * The plugin still checks `beforeEffect()` itself before it writes, and commits against the version it read.
 */
export interface PluginModelClient {
  /** Whether a call could be answered now: the plugin is running with the grant, and the Host has a model set up. */
  availability(): ActionAvailability;
  /**
   * `prompt` is the plugin's own registered instruction and this call's data (`instructed(instruction, data)`); a plain string is
   * refused. The person's version of the instruction is what is sent.
   */
  complete(prompt: InstructedPrompt, request?: PluginModelRequest): Promise<PluginModelResult>;
}
