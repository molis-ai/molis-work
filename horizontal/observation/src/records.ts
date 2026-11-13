import { randomUUID } from "node:crypto";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  OBSERVATION_LIMITS, OBSERVATION_OWNER_SOURCE_CLASSES, OBSERVATION_SERVICE_PREFIXES, type ObservationBackgroundOrigin, type ObservationConditions, type ObservationDetail, type ObservationEntry,
  type ObservationFactInput, type ObservationMissingInput, type ObservationOwner, type ObservationOwnerVersionRef, type ObservationSourceClass, type ObservationSubject,
} from "@molis-ai/molis-work-contracts/services/observation";
import { currentObservationSource } from "./source-scope.js";

/** What the Host tells the observation layer about where it runs. Nothing here is read from a writer. */
export interface ObservationEnvironment {
  readonly platformVersion: string;
  now(): Date;
  /** The project's data class from the catalog; undefined for the Home itself or a project the catalog does not have. */
  projectClass(projectId: string): "user" | "regenerable_demo" | undefined;
}

export type Origin = ActionCallContext | ObservationBackgroundOrigin;

/**
 * One piece of evidence as it waits in the queue. Content is kept as the writer's text: redaction, the digest, compression and encryption
 * are the write batch's work, off the call's path (contract-design §6). `digest_only`: keep the digest and length, never the body.
 */
export type PendingEvidence =
  | { readonly role: string; readonly ref: ObservationOwnerVersionRef | ObservationMissingInput }
  | { readonly role: string; readonly content: { readonly media_type: string; readonly text: string }; readonly digest_only?: true };

/** The row's coverage key (contract-design §8). */
export interface CoverageKey { readonly owner: string; readonly fact: string; readonly entry: ObservationEntry; readonly project_id: string }

/** One record ready to be written: its columns but the evidence, which the batch resolves, and what it adds to the coverage register. */
export interface PendingRecord {
  readonly row: RecordRow;
  readonly evidence: readonly PendingEvidence[];
  readonly coverage: CoverageKey;
  /** Details, subjects or evidence beyond the bounds were dropped. */
  readonly cut: boolean;
  /** A repeated read folds into the record of this key written within the last minute (contract-design §7). */
  readonly coalesce_key?: string;
}

/** The columns of `records` (schema.ts) a writer's fact decides; `seq` and `evidence` are the batch's. */
export interface RecordRow {
  readonly record_id: string;
  readonly owner_kind: ObservationOwner["kind"];
  readonly owner_id: string | null;
  readonly fact: string;
  readonly provider_id: string | null;
  readonly stage: string | null;
  readonly outcome: string;
  readonly actor_id: string;
  readonly actor_kind: string | null;
  readonly audience: string;
  readonly delegated_by: string | null;
  readonly entry: ObservationEntry;
  readonly project_id: string | null;
  readonly install_id: string | null;
  readonly occurred_at: string;
  readonly received_at: string;
  readonly clock_adjusted: number;
  readonly call_id: string | null;
  readonly invocation_id: string | null;
  readonly parent_invocation_id: string | null;
  readonly runtime_session_id: string | null;
  readonly run_id: string | null;
  readonly work_ref: string | null;
  readonly source_class: ObservationSourceClass;
  readonly subjects: string;
  readonly conditions: string;
  readonly detail: string;
}

/** The owner as the coverage register and the prefix check name it. */
export const ownerName = (owner: ObservationOwner): string => owner.kind === "shell" ? "shell" : `${owner.kind}:${owner.id}`;

const isBackground = (origin: Origin): origin is ObservationBackgroundOrigin => "kind" in origin && origin.kind === "background";

/**
 * The way in, from the trusted caller (contract-design §3). The person's own calls reach the Host only through its local web transport
 * (the workbench) or a management command (the command line), so a `user` call is one of those two; anything else is said by its audience.
 */
export function entryOf(origin: Origin): ObservationEntry {
  if (isBackground(origin)) return origin.entry;
  switch (origin.audience) {
    case "user": return origin.user_action?.source === "management" ? "cli" : "workbench";
    case "mcp": return "mcp";
    case "agent": return "agent";
    case "workflow": return "workflow";
    case "plugin": return "plugin";
    default: return "host";
  }
}

/** The prefix an owner's fact names start with: a plugin's `plugin_id`, the shell's `ui`, a service's from the contract. */
export const ownerPrefix = (owner: ObservationOwner): string =>
  owner.kind === "plugin" ? owner.id : owner.kind === "shell" ? OBSERVATION_SERVICE_PREFIXES.shell : OBSERVATION_SERVICE_PREFIXES[owner.id];

/** Whether a fact name is under the owner's own prefix (contract-design §4). */
export const factOwned = (owner: ObservationOwner, fact: string): boolean => fact.startsWith(`${ownerPrefix(owner)}.`);

const cut = (value: unknown, max: number): string => String(value).slice(0, max);

/** Detail as the contract bounds it; what does not fit is dropped and counted as a truncation of this record. */
function boundedDetail(detail: ObservationDetail | undefined): { value: ObservationDetail; cut: boolean } {
  if (!detail) return { value: {}, cut: false };
  const all = Object.entries(detail), kept = all.filter(([, value]) => ["string", "number", "boolean"].includes(typeof value));
  let dropped = kept.length !== all.length || kept.length > OBSERVATION_LIMITS.detail_keys;
  const value: Record<string, string | number | boolean> = {};
  for (const [key, item] of kept.slice(0, OBSERVATION_LIMITS.detail_keys)) {
    if (typeof item === "string" && item.length > OBSERVATION_LIMITS.detail_text) dropped = true;
    value[cut(key, OBSERVATION_LIMITS.ref_text)] = typeof item === "string" ? item.slice(0, OBSERVATION_LIMITS.detail_text) : item;
  }
  return { value, cut: dropped };
}

/** What only the exit knows: which call this was, which provider answered, and how a repeated read folds. */
export interface CallFacts {
  readonly invocation_id?: string;
  readonly parent_invocation_id?: string;
  readonly provider_id?: string;
  readonly coalesce_key?: string;
  /** Evidence the exit made itself (the call's input and result); it replaces `input.evidence`. */
  readonly evidence?: readonly PendingEvidence[];
}

/**
 * Make one record from a writer's fact (contract-design §3, §5). Who, where and which operation come from `origin`; `owner` from the wiring
 * or the Host-issued caller; the prefix was checked by whoever calls this. The class: a demonstration project, then the Host's source scope,
 * then what a plugin or service said of its own batch (only the three it may know), then `real`.
 */
export function pendingRecord(env: ObservationEnvironment, owner: ObservationOwner, origin: Origin, input: ObservationFactInput, call: CallFacts = {}): PendingRecord {
  const received = env.now(), receivedAt = received.toISOString();
  const said = input.occurred_at ? Date.parse(input.occurred_at) : NaN;
  const late = Number.isFinite(said) && said > received.getTime();
  const occurredAt = Number.isFinite(said) && !late ? new Date(said).toISOString() : receivedAt;
  const background = isBackground(origin) ? origin : undefined, context = background ? undefined : origin as ActionCallContext;
  const projectId = origin.project_id;
  const own = owner.kind !== "shell" && input.source_class && (OBSERVATION_OWNER_SOURCE_CLASSES as readonly string[]).includes(input.source_class) ? input.source_class : undefined;
  const source: ObservationSourceClass = projectId && env.projectClass(projectId) === "regenerable_demo" ? "demo" : currentObservationSource() ?? own ?? "real";
  const detail = boundedDetail(input.detail);
  const subjects: ObservationSubject[] = (input.subjects ?? []).slice(0, OBSERVATION_LIMITS.subjects).map(subject => ({ kind: cut(subject.kind, OBSERVATION_LIMITS.ref_text),
    id: cut(subject.id, OBSERVATION_LIMITS.ref_text), ...(subject.version !== undefined ? { version: subject.version } : {}) }));
  const evidence: PendingEvidence[] = call.evidence ? [...call.evidence] : (input.evidence ?? []).slice(0, OBSERVATION_LIMITS.evidence).map(item => item.ref.kind === "content"
    ? { role: cut(item.role, OBSERVATION_LIMITS.ref_text), content: { media_type: cut(item.ref.media_type, OBSERVATION_LIMITS.ref_text), text: item.ref.text } }
    : { role: cut(item.role, OBSERVATION_LIMITS.ref_text), ref: item.ref });
  const conditions: ObservationConditions = { platform_version: env.platformVersion, ...input.conditions };
  const entry = entryOf(origin);
  const row: RecordRow = {
    record_id: randomUUID(), owner_kind: owner.kind, owner_id: owner.kind === "shell" ? null : owner.id, fact: input.fact, provider_id: call.provider_id ?? null,
    stage: input.stage ?? null, outcome: input.outcome,
    actor_id: background?.actor_id ?? context!.actor_id, actor_kind: context?.actor_kind ?? null, audience: context?.audience ?? "background",
    delegated_by: context?.delegated_by ?? null, entry, project_id: projectId, install_id: context?.plugin_install_id ?? context?.host_plugin?.install_id ?? null,
    occurred_at: occurredAt, received_at: receivedAt, clock_adjusted: late ? 1 : 0,
    call_id: context?.call_id ?? null, invocation_id: call.invocation_id ?? null, parent_invocation_id: call.parent_invocation_id ?? null,
    runtime_session_id: context?.runtime_session_id ?? null, run_id: input.work?.run_id ?? null, work_ref: input.work?.work_ref ?? null,
    source_class: source, subjects: JSON.stringify(subjects), conditions: JSON.stringify(conditions), detail: JSON.stringify(detail.value),
  };
  const dropped = detail.cut || (input.subjects?.length ?? 0) > OBSERVATION_LIMITS.subjects || (input.evidence?.length ?? 0) > OBSERVATION_LIMITS.evidence;
  return { row, evidence, coverage: { owner: ownerName(owner), fact: input.fact, entry, project_id: projectId ?? "" }, cut: dropped,
    ...(call.coalesce_key ? { coalesce_key: call.coalesce_key } : {}) };
}
