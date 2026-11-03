import type { BoundedInferenceReceipt } from "../services/agent-host.js";
import type { ActionAvailability, ActionError } from "./actions.js";
import type { InstructedPrompt, InstructionPrompt } from "./model-prompts.js";
export type { PluginModelConfigurationInput, PluginModelConfigurationView, PluginModelConfigurationClient, PluginModelConfigurationDeclaration } from "./plugin-model-configuration.js";

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

/** A model already configured by the person in this Home; never an endpoint or a credential. */
export interface PluginModelSelection {
  readonly provider_id: string;
  readonly model_id: string;
}

export interface PluginModelChoice extends PluginModelSelection {
  readonly label: string;
  readonly vision: boolean;
  readonly reasoning_effort: boolean;
}

/** Original image bytes; no caller-supplied path, URL or credential. */
export interface PluginModelImage {
  readonly bytes: Uint8Array;
  readonly label?: string;
}

export interface PluginModelRequest {
  /** Copied before the first wait; at most 50 images, 32 MiB each and 128 MiB total. */
  readonly images?: readonly PluginModelImage[];
  /** Exact selection for this call; absent uses the Host default. An unavailable selection is refused, never replaced. */
  readonly selection?: PluginModelSelection;
  /** Joined with the running action's own signal: either one ends the call. */
  readonly signal?: AbortSignal;
  /** Text as it is generated, in provider order. Refused after cancellation, loss of authority, or completion of this request. */
  readonly onText?: (delta: string) => void;
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
  /** Original inference facts, absent only when the Host injected a text-only implementation. */
  readonly execution?: BoundedInferenceReceipt;
  /**
   * After beforeEffect, immediately before synchronous commit: rechecks this original call and model binding. The platform also
   * runs this check itself (PG-047): at every write the call makes through a platform service, at each nested call, and at the end
   * of the call's every `beforeEffect`, the one its background work is given included; an answer that no longer stands is refused
   * there with the same code, called or not, and so is every later write of the call, whatever it rests on.
   */
  validateResult(): void;
  readonly text: string;
  /** Only with `output: "json"`: the decoded answer. The plugin checks its shape; the service checks only that it is JSON. */
  readonly value?: unknown;
  /** Only when the provider reported it; a model the Host was given for a test reports nothing. */
  readonly usage?: { readonly input_tokens: number; readonly output_tokens: number };
}

/** Execution failures keep their original receipt and commit guard when inference actually ran. */
export type PluginModelFailure = ActionError & {
  readonly execution?: BoundedInferenceReceipt;
  readonly validateResult?: () => void;
};

/**
 * Model display metadata only; never a credential reference or endpoint. `vision` is true when the model this call would use
 * declares that it reads images: `complete()` refuses images otherwise, so a plugin attaches them only when this is true.
 */
export type PluginModelAvailability = ActionAvailability & { readonly runtime_label?: string; readonly vision?: boolean };

/**
 * The Host's text model, for a plugin the Host runs itself that declares `model:read` or `model:invoke`. The list and availability
 * need either, declared and held: a plugin that only lists and picks models declares the read-only `model:read`. `complete()`
 * needs `model:invoke`, and works only inside one of the plugin's own actions that declares `model:invoke` and is scheduled
 * "concurrent": the Host knows which action is running, the plugin passes no call context. The call's `beforeEffect()` is asked before the model is and again before the answer is handed over,
 * so a call that was cancelled, revoked, stopped, or whose action has already returned (`actions.expired`) gets no answer.
 * The plugin still checks `beforeEffect()` itself before it writes, and commits against the version it read.
 */
export interface PluginModelClient {
  /** The declared Home consumer's model settings; writes only through its exact settings action. */
  readonly configuration?: import("./plugin-model-configuration.js").PluginModelConfigurationClient;
  /** Available model names and capabilities only; no request or credential decryption. Needs `model:read` or `model:invoke`. */
  choices(): readonly PluginModelChoice[];
  /** Whether this selection (or the Host default) is available now, while the plugin is running with `model:read` or `model:invoke`. */
  availability(selection?: PluginModelSelection): PluginModelAvailability;
  /**
   * `prompt` is the plugin's own registered instruction and this call's data (`instructed(instruction, data)`); a plain string is
   * refused. The person's version of the instruction is what is sent.
   */
  complete(prompt: InstructedPrompt, request?: PluginModelRequest): Promise<PluginModelResult>;
}
