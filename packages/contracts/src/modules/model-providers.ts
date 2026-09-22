import type { ContractDescriptor } from "../platform/package.js";

export const modulesModelProvidersContract = {
  contractId: "io.molis.work.module.model-providers.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

/**
 * Model providers the user configured, and the shape each one speaks.
 *
 * A provider's key never appears in these records. It lives in the Host's
 * secret store and is named here by an opaque reference, so a provider list can
 * be read, rendered and logged without ever touching the credential.
 */

/** The two request shapes the product speaks. Both are verified against a real provider. */
export type ModelApiFormat = "anthropic-messages" | "openai-chat-completions";

export interface ModelRecord {
  /** Exactly what the provider expects in the request. Not a display name. */
  model_id: string;
  display_name?: string;
  /** Context window, used for the badge. Absent means unknown — never guessed. */
  context_tokens?: number;
  vision?: boolean;
  enabled: boolean;
}

/**
 * How hard to try for a cached prompt prefix.
 *
 * `required` fails rather than falling back. A caller that asked for a
 * guaranteed hit and silently got a full-price call learns nothing at the
 * time, and finds out from the bill.
 */
export type ModelPromptCacheMode = "off" | "best-effort" | "required";

export interface ModelProviderRecord {
  provider_id: string;
  display_name: string;
  /** Base URL as the user typed it, without a trailing slash. */
  base_url: string;
  api_format: ModelApiFormat;
  /** Opaque handle into the secret store. Never the key itself. */
  credential_ref: string;
  enabled: boolean;
  /** Absent means `off`, which behaves exactly as if caching did not exist. */
  prompt_cache?: ModelPromptCacheMode;
  models: ModelRecord[];
  created_at: string;
  updated_at: string;
}

/**
 * Whether this format has a cache breakpoint **we** can set.
 *
 * Anthropic-compatible takes a `cache_control` marker on the system block, so
 * the choice is ours. OpenAI-compatible caches prefixes on the provider's side
 * with no field for us to set — which is not the same as "this model does not
 * cache", and not something we can promise on the user's behalf.
 */
export function promptCacheIsClientControlled(format: ModelApiFormat): boolean {
  return format === "anthropic-messages";
}

/**
 * Why this provider cannot have the cache mode it was given, or null when it can.
 *
 * Checked when the provider is **saved**, not when a Run starts. Asking for a
 * guaranteed cache hit on a protocol with no breakpoint is a configuration
 * mistake, and the moment to say so is while the user is looking at the field
 * they just changed — not at the first Run, days later, in a different screen.
 */
export function inspectPromptCacheChoice(
  provider: Pick<ModelProviderRecord, "api_format" | "prompt_cache">,
): string | null {
  if ((provider.prompt_cache ?? "off") !== "required") return null;
  if (promptCacheIsClientControlled(provider.api_format)) return null;
  return "这个 API 格式没有可以由我们打开的缓存断点，选不了「要求缓存支持」";
}

/**
 * Whether a provider can actually be used right now.
 *
 * `needs-credential` and `disabled` are different situations and the settings
 * page shows them differently: one is unfinished setup, the other is a choice.
 */
export type ModelProviderStatus = "ready" | "needs-credential" | "credential-unavailable" | "no-models" | "disabled";

export interface ModelProviderHealth {
  provider_id: string;
  status: ModelProviderStatus;
  credential_status?: "present" | "missing" | "unavailable";
  /** Shown next to the provider. Empty when ready. */
  detail: string;
}

/**
 * Judge a provider from its record plus whether its secret is actually present.
 *
 * `hasCredential` is asked of the secret store rather than stored on the
 * record: a record claiming a key exists would go stale the moment the key is
 * deleted, and the page would show a usable provider that cannot run.
 */
export function providerHealth(
  provider: ModelProviderRecord,
  hasCredential: boolean,
): ModelProviderHealth {
  if (!provider.enabled) {
    return { provider_id: provider.provider_id, status: "disabled", detail: "已关闭" };
  }
  if (!hasCredential) {
    return { provider_id: provider.provider_id, status: "needs-credential", detail: "还没有填 API Key" };
  }
  if (!provider.models.some((model) => model.enabled)) {
    return { provider_id: provider.provider_id, status: "no-models", detail: "没有启用任何模型" };
  }
  return { provider_id: provider.provider_id, status: "ready", detail: "" };
}

export interface ModelRequestShape {
  url: string;
  headers: Record<string, string>;
  /** Where the reply text sits in the response, as a dotted description for logs. */
  reply_path: string;
}

const TRAILING_SLASHES = /\/+$/u;

/**
 * Where a request goes and what identifies it, per format.
 *
 * Both shapes are exercised against a live provider by `scripts/verify-model.mjs`;
 * the paths below are the ones that actually answered.
 */
export function modelRequestShape(
  provider: Pick<ModelProviderRecord, "base_url" | "api_format">,
  apiKey: string,
): ModelRequestShape {
  const base = provider.base_url.trim().replace(TRAILING_SLASHES, "");
  if (provider.api_format === "anthropic-messages") {
    return {
      url: /\/messages$/u.test(base) ? base : `${base}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      reply_path: "content[].text",
    };
  }
  return {
    url: /completion/iu.test(base) ? base : `${base}/chat/completions`,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    reply_path: "choices[0].message.content",
  };
}

export interface ModelProviderRegistryApi {
  list(): ModelProviderRecord[];
  get(providerId: string): ModelProviderRecord | null;
  upsert(record: Omit<ModelProviderRecord, "created_at" | "updated_at">): ModelProviderRecord;
  remove(providerId: string): boolean;
  /** Health for every provider, asking the secret store which keys really exist. */
  health(): ModelProviderHealth[];
}
