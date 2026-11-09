import { createHash } from "node:crypto";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ConnectorCheckObservation } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { ModelProviderCheck, ModelProviderHealth, ModelProviderRecord } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { withConnectorConnections } from "./connector-connection-store.js";
import { rememberConnectorCheck, withConnectorObservations } from "./connector-observations.js";

/**
 * A model provider's last real check (batch 13, PF-A04): not a second record of the provider or its key. The key is held by a `model-api`
 * connection, so the check is remembered as that connection's last check, with `subject` naming the provider and the version of it that
 * was checked. A key two providers share keeps the later check only; the other provider then reads as not checked, never as verified.
 */

/**
 * The version of a provider a check speaks for: how it is reached (address, format and the two request modes), not its name or which
 * models are switched on, so renaming it or switching a model off does not make a verified provider look unchecked. A model switched on
 * is checked by the save itself (`planConnectionCheck`).
 */
export function modelCheckRevision(provider: ModelProviderRecord): string {
  const reached = [provider.base_url, provider.api_format, provider.thinking ?? "off", provider.prompt_cache];
  return createHash("sha256").update(JSON.stringify(reached)).digest("hex").slice(0, 16);
}

/**
 * Why a check of a provider failed: a closed set, recorded as `ModelProviderCheck.code` (and raised where a caller wants an error). A 429
 * is `rate_limited` whether the provider is throttling or the account is out of credit: the model path (Prologue) hands back the status
 * only, not the body that would tell the two apart, so the page says both are possible rather than guessing one.
 */
export const modelProviderCheckErrors = defineErrorCodes("model_provider", {
  key_rejected: "forbidden", rate_limited: "rate_limited", request_refused: "invalid", provider_failed: "upstream",
  unreachable: "unavailable", timed_out: "timeout", response_invalid: "upstream", check_failed: "internal",
});
export type ModelProviderCheckReason = keyof typeof modelProviderCheckErrors;

/** The reason a failed check gives, from the error's code and status only, never its text (it may carry what the provider echoed). */
export function modelCheckReason(raw: string): ModelProviderCheckReason {
  const code = /^(MODEL_[A-Z_]+)/.exec(raw)?.[1];
  const status = Number(/\((\d{3})\)/.exec(raw)?.[1] ?? 0);
  if (code === "MODEL_HTTP_ERROR") {
    if (status === 401 || status === 403) return "key_rejected";
    if (status === 429) return "rate_limited";
    if (status === 404 || status === 400 || status === 422) return "request_refused";
    if (status >= 500) return "provider_failed";
  }
  if (code === "MODEL_NETWORK_FAILED") return "unreachable";
  if (/超时/.test(raw)) return "timed_out";
  if (code === "MODEL_RESPONSE_INVALID" || raw === "模型返回了空内容") return "response_invalid";
  return "check_failed";
}

/** The connection holding the provider's key, and its version, read before the check runs; none when the key has no connection. */
export interface ModelCheckTarget { connection_id: string; revision: string }
export function modelCheckTarget(home: string, provider: ModelProviderRecord): ModelCheckTarget | undefined {
  const connection = withConnectorConnections(home, store => store.list("model-api").find(row => row.credential_ref === provider.credential_ref), true);
  return connection ? { connection_id: connection.connection_id, revision: connection.updated_at } : undefined;
}

/**
 * Remember a check against the key's version read before it ran (`modelCheckTarget`): a key replaced while the model answered is a
 * new version, and `rememberConnectorCheck` writes nothing for an older one, so the old key's result never lands on the new key.
 */
export function rememberModelCheck(home: string, provider: ModelProviderRecord, target: ModelCheckTarget | undefined, outcome: "connected" | "failed", reason?: ModelProviderCheckReason): void {
  if (!target) return;
  rememberConnectorCheck(home, target.connection_id, { at: new Date().toISOString(), revision: target.revision, outcome,
    authorization: outcome === "connected" ? "verified" : reason === "key_rejected" ? "required" : "unknown",
    ...(reason ? { code: `model_provider.${reason}` } : {}), subject: { kind: "model-provider", id: provider.provider_id, revision: modelCheckRevision(provider) } });
}

function checkOf(provider: ModelProviderRecord, check: ConnectorCheckObservation | undefined, connectionRevision: string | undefined): ModelProviderCheck | undefined {
  if (!check?.subject || check.subject.kind !== "model-provider" || check.subject.id !== provider.provider_id) return undefined;
  return { at: check.at, outcome: check.outcome, ...(check.code ? { code: check.code } : {}), ...(check.retry_at ? { retry_at: check.retry_at } : {}),
    current: check.subject.revision === modelCheckRevision(provider) && check.revision === connectionRevision };
}

/** Health with each provider's last check, read in one pass over the connections and their checks. */
export function withModelChecks(home: string | undefined, providers: readonly ModelProviderRecord[], health: readonly ModelProviderHealth[]): ModelProviderHealth[] {
  if (!home || providers.length === 0) return [...health];
  const connections = withConnectorConnections(home, store => store.list("model-api"), true) ?? [];
  const checks = withConnectorObservations(home, store => new Map(connections.map(row => [row.connection_id, store.read(row.connection_id).check])), true) ?? new Map();
  return health.map(entry => {
    const provider = providers.find(one => one.provider_id === entry.provider_id);
    const connection = provider && connections.find(row => row.credential_ref === provider.credential_ref);
    const last = provider && connection ? checkOf(provider, checks.get(connection.connection_id), connection.updated_at) : undefined;
    return last ? { ...entry, last_check: last } : entry;
  });
}
