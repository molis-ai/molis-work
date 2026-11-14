import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { platformErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_PROVIDER_ID, type ObservationFactInput, type ObservationOutcome } from "@molis-ai/molis-work-contracts/services/observation";
import { pendingRecord, type ObservationEnvironment, type PendingEvidence, type PendingRecord } from "./records.js";

/** The action as the kernel described it to its exit: identity, provider and operation (the kernel's `CallDescription`). */
export interface ExitAction {
  readonly capability_id: string;
  readonly version: number;
  readonly provider_id?: string;
  readonly operation: string;
  /** An unsent draft's input: when the person saves it, its words are not kept, by rule (OCL-11). */
  readonly draft?: true;
}

/** What the kernel's exit was told of one call (the kernel's `CallObservation`). */
export interface ExitObservation {
  readonly invocation_id: string;
  readonly parent_invocation_id?: string;
  readonly started_at: number;
  readonly ended_at: number;
  readonly handler_started: boolean;
  readonly input?: unknown;
  readonly result?: unknown;
  readonly outcome: { readonly ok: true } | { readonly ok: false; readonly code?: string; readonly refused?: true };
  readonly aborted: boolean;
}

/**
 * The calls the exit never records: the ones the observation layer itself answered (one report would make another record). Known by the
 * provider that answered, not by a name, so another provider's action that happens to start with `observation.` is recorded like any.
 */
export const exitSkips = (action: Pick<ExitAction, "provider_id">): boolean => action.provider_id === OBSERVATION_PROVIDER_ID;

const json = (value: unknown): string | undefined => {
  try { return value === undefined ? undefined : JSON.stringify(value); }
  catch { return undefined; }
};

function outcomeOf(observation: ExitObservation): ObservationOutcome {
  if (observation.outcome.ok) return "succeeded";
  if (observation.outcome.refused) return "refused";
  const code = observation.outcome.code;
  return observation.aborted || (code !== undefined && platformErrorKind(code) === "cancelled") ? "cancelled" : "failed";
}

/** A piece of content, or why it is not there when it could not be put into text. */
const content = (role: string, value: unknown, digestOnly = false): PendingEvidence => {
  const text = json(value);
  if (text === undefined) return { role, ref: { kind: "missing", reason: "not_obtained" } };
  return { role, content: { media_type: "application/json", text }, ...(digestOnly ? { digest_only: true as const } : {}) };
};

/**
 * One `action.call` record from the kernel's exit (contract-design §7). A refusal before the handler keeps the minimal row (S-12); any
 * failure once the handler began keeps no content, only its code and duration (S-18); a success keeps its input and result, except that a
 * person's own page read keeps the result's digest and length only (`by_rule`). Successful reads fold within a minute when the same work
 * repeats the same read: the key joins the operation, the runtime session, the actor and the action here, the digests in the write batch.
 */
export function exitRecord(env: ObservationEnvironment, context: ActionCallContext, action: ExitAction, observation: ExitObservation): PendingRecord {
  const outcome = outcomeOf(observation), reference = `${action.capability_id}@${action.version}`;
  const detail: Record<string, string | number | boolean> = { action: reference, operation: action.operation };
  if (!observation.outcome.ok && observation.outcome.code) detail.code = observation.outcome.code;
  if (observation.handler_started) detail.duration_ms = Math.max(0, Math.round(observation.ended_at - observation.started_at));
  // Which runtime client acted (an MCP client and its session, an Agent round): the Host's audit name, never one read from input.
  if (context.audit_actor_id) detail.client = context.audit_actor_id;
  // The person's own page (the workbench, or a management command): what it read is already on their screen; the rule keeps its digest only.
  const pageRead = action.operation === "query" && context.audience === "user";
  // A draft the person has not sent is kept as saved, not as said: neither its words nor the result that echoes them. The flag is the
  // provider's word, so it holds only for the person's own call: an Agent, MCP client, workflow or plugin writing through the same action
  // is a write like any other and keeps its content (OCL-05), so a provider cannot use it to leave others' calls unrecorded.
  const unsentDraft = action.draft === true && context.audience === "user";
  const evidence: PendingEvidence[] = outcome === "succeeded" && unsentDraft
    ? [{ role: "input", ref: { kind: "missing", reason: "by_rule" } }, { role: "result", ref: { kind: "missing", reason: "by_rule" } }]
    : outcome === "succeeded" ? [content("input", observation.input), content("result", observation.result, pageRead)]
    : outcome === "refused" ? [{ role: "input", ref: { kind: "missing", reason: "by_rule" } }]
      : [{ role: "input", ref: { kind: "missing", reason: "by_rule" } }, { role: "result", ref: { kind: "missing", reason: "by_rule" } }];
  const fact: ObservationFactInput = { fact: "action.call", outcome, subjects: [{ kind: "action", id: reference }], detail, occurred_at: new Date(observation.started_at).toISOString() };
  const coalesce = outcome === "succeeded" && action.operation === "query"
    ? JSON.stringify([context.call_id ?? null, context.runtime_session_id ?? null, context.actor_id, context.audience, action.provider_id ?? null, reference]) : undefined;
  return pendingRecord(env, { kind: "service", id: "gateway" }, context, fact, {
    invocation_id: observation.invocation_id,
    ...(observation.parent_invocation_id ? { parent_invocation_id: observation.parent_invocation_id } : {}),
    ...(action.provider_id ? { provider_id: action.provider_id } : {}),
    ...(coalesce ? { coalesce_key: coalesce } : {}),
    evidence,
  });
}
