import { modelRequestShape } from "@molis-ai/molis-work-contracts/modules/model-providers";
import type {
  ModelApiFormat,
  ModelProviderRecord,
  ModelRecord,
} from "@molis-ai/molis-work-contracts/modules/model-providers";

import type { PrologueModelConfiguration } from "./adapters/prologue.js";

/**
 * Turn what the user configured in settings into what a Runtime is started
 * with.
 *
 * Nothing here invents a default. A provider that is disabled, has no key, or
 * has no enabled model resolves to null, and the adapter then reports
 * `needs_setup` — which is a state the user can act on, unlike a Run that fails
 * at the provider with a key that was never there.
 */

/**
 * Our API-format names, mapped to the protocol keys Prologue looks up.
 *
 * Two vocabularies on purpose. Ours is user-facing: the settings page says
 * `/v1/messages` and `/chat/completions`, which is what somebody copying a
 * provider's documentation recognises. Prologue's is its own adapter key.
 * Renaming ours to match would let another system's internals surface on a
 * screen the user reads.
 *
 * Passing ours straight through was a real defect: Prologue selects the
 * adapter by exact string and throws `MODEL_PROTOCOL_UNSUPPORTED` for anything
 * else, so **every Run started this way failed before reaching a model**. The
 * compiler could not catch it — both sides are `string` — and neither could the
 * test, which asserted our own name and therefore only checked that we agreed
 * with ourselves. `tests/model-protocol-mapping.test.ts` now pins this table
 * against Prologue's own adapter list instead.
 */
const PROLOGUE_PROTOCOL: Record<ModelApiFormat, string> = {
  "anthropic-messages": "anthropic-compatible",
  "openai-chat-completions": "openai-compatible",
};

export function prologueProtocolFor(format: ModelApiFormat): string {
  return PROLOGUE_PROTOCOL[format];
}

export interface ResolvedModelSelection {
  provider: ModelProviderRecord;
  model: ModelRecord;
  /** The real key, read from the Host's secret store at call time. */
  api_key: string;
}

export interface ModelSelectionPort {
  /** The selection to start with, or null when nothing usable is configured. */
  resolve(): ResolvedModelSelection | null | Promise<ResolvedModelSelection | null>;
}

/**
 * Map a resolved selection onto the Prologue adapter's port.
 *
 * `credential_ref` stays a reference rather than the key: the adapter never
 * receives a secret, and the execution owner resolves the reference through its
 * own secrets service.
 *
 * The Node adapter exchanges this reference with Prologue's credential store.
 * This mapper never puts key material in an execution record.
 */
export function prologueModelConfiguration(
  selection: ResolvedModelSelection | null,
): PrologueModelConfiguration | null {
  if (selection === null) return null;
  return {
    protocol: prologueProtocolFor(selection.provider.api_format),
    endpoint: modelRequestShape(selection.provider, "").url,
    model: selection.model.model_id,
    credential_ref: selection.provider.credential_ref,
    ...(selection.model.context_tokens ? { context_tokens: selection.model.context_tokens } : {}),
    // Left out when off, so nothing downstream has to special-case it.
    ...(selection.provider.prompt_cache === undefined || selection.provider.prompt_cache === "off"
      ? {}
      : { prompt_cache: selection.provider.prompt_cache }),
  };
}

/** Build the adapter's `modelConfiguration` port from a selection source. */
export function createModelConfigurationPort(
  port: ModelSelectionPort,
): () => Promise<PrologueModelConfiguration | null> {
  return async () => prologueModelConfiguration(await port.resolve());
}
