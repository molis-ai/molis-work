import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isDeepStrictEqual } from "node:util";
import type { MemoryApplies, MemoryEvidence, MemoryKind, MemoryMetaRecord, MemoryRevision, MemoryScope, MemorySource, MemoryState } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors } from "./errors.js";

/**
 * The platform's facts about an entry, kept on the Prologue entry itself (spec §8.2 S3): kind, source, basis,
 * evidence, when it applies, expiry, who approved it and a plugin's namespace in `meta`; switched off and paused as
 * the entry's paused state with a reason. Nothing here is a second copy of the text.
 */
const iso = (ms: number | undefined): string | null => ms !== undefined && Number.isFinite(ms) && Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : null;

/** Unknown evidence retains its stored kind and reference instead of acquiring a new meaning. */
function evidenceOf(item: NonNullable<AgentMemoryMeta["evidence"]>[number]): MemoryEvidence {
  let ref: MemoryEvidence["ref"] = item.ref;
  if (item.ref) {
    try {
      const value: unknown = JSON.parse(item.ref);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if (typeof record.kind === "string" && typeof record.id === "string"
          && Object.keys(record).every(key => ["kind", "id", "revision", "project_id"].includes(key))
          && [record.revision, record.project_id].every(value => value === undefined || value === null || typeof value === "string")) ref = record as Exclude<MemoryEvidence["ref"], string>;
      }
    } catch { /* Keep the opaque reference, without inventing an object identity. */ }
  }
  return { kind: item.kind, ...(item.text ? { text: item.text } : {}), ...(ref ? { ref } : {}), at: iso(item.at_ms) };
}

function provenance(meta: AgentMemoryMeta): Pick<MemoryMetaRecord, "basis" | "evidence" | "approved_by"> {
  return { basis: meta.basis ?? null, evidence: (meta.evidence ?? []).map(evidenceOf), approved_by: meta.approved_by ?? null };
}

/** Undo reconstructs only the classified, authorized snapshot; absent provenance remains absent. */
export function restoredEntryFacts(snapshot: MemoryRevision["snapshot"]) {
  if (!snapshot?.meta.classification) throw memoryErrors.invalid("原变动缺少分类快照，请明确分类后恢复，不能推断旧记忆用途");
  if (typeof snapshot.meta.source !== "string" || typeof snapshot.meta.kind !== "string")
    throw memoryErrors.invalid("原变动缺少可恢复的记忆事实，不能替它补造来源");
  return { ...provenance(snapshot.meta), retainedMeta: snapshot.meta, origin: snapshot.origin,
    expires_at: snapshot.meta.expires_at_ms === undefined ? null : new Date(snapshot.meta.expires_at_ms).toISOString() };
}

function stateOf(paused: { reason: string } | undefined, disabled: { reason: string } | undefined): { state: MemoryState; state_reason: string | null } {
  if (disabled) return { state: "disabled", state_reason: disabled.reason };
  if (paused) return { state: "paused", state_reason: paused.reason };
  return { state: "active", state_reason: null };
}

export function toEntryMeta(record: Pick<MemoryMetaRecord, "kind" | "source" | "basis" | "evidence" | "applies" | "expires_at" | "approved_by" | "plugin_id">, previous: AgentMemoryMeta = {}): AgentMemoryMeta {
  const time = (iso: string | null | undefined) => { const at = iso ? Date.parse(iso) : NaN; return Number.isFinite(at) ? at : undefined; };
  const applies = record.applies ?? {};
  const when = {
    ...(applies.plugin_ids?.length ? { plugins: applies.plugin_ids.slice(0, 20) } : {}),
    ...(applies.object_kinds?.length ? { object_kinds: applies.object_kinds.slice(0, 20) } : {}),
    ...(applies.goal_ids?.length ? { goals: applies.goal_ids.slice(0, 20) } : {}),
    ...(applies.task ? { task: applies.task.slice(0, 200) } : {}),
    ...(time(applies.from) !== undefined ? { from_ms: time(applies.from)! } : {}),
    ...(time(applies.until) !== undefined ? { until_ms: time(applies.until)! } : {}),
  };
  const { kind: _kind, source: _source, basis: _basis, evidence: _evidence, applies_when: _when,
    expires_at_ms: _expires, approved_by: _approved, namespace: _namespace, ...retained } = previous;
  return {
    ...retained,
    kind: record.kind, source: record.source, ...(record.basis === null ? {} : { basis: record.basis }),
    ...(Object.keys(when).length ? { applies_when: when } : {}),
    ...(record.evidence.length ? { evidence: record.evidence.slice(-6).map(item => previous.evidence?.find(raw => isDeepStrictEqual(evidenceOf(raw), item))
      ?? ({ kind: item.kind, ...(item.text ? { text: item.text.slice(0, 200) } : {}),
        ...(item.ref ? { ref: (typeof item.ref === "string" ? item.ref : JSON.stringify(item.ref)).slice(0, 200) } : {}), ...(time(item.at) !== undefined ? { at_ms: time(item.at)! } : {}) })) } : {}),
    ...(time(record.expires_at) !== undefined ? { expires_at_ms: time(record.expires_at)! } : {}),
    ...(record.approved_by === null ? {} : { approved_by: record.approved_by }),
    ...(record.plugin_id ? { namespace: record.plugin_id } : {}),
  };
}

/** The facts an entry carries, when the platform wrote them (`source` is always there then); null for older entries. */
export function fromEntryMeta(input: { memory_id: string; scope: MemoryScope; owner: string; meta: AgentMemoryMeta; paused?: { reason: string }; disabled?: { reason: string }; created_at_ms: number; updated_at_ms: number }): MemoryMetaRecord | null {
  const meta = input.meta;
  if (!meta || typeof meta.source !== "string" || typeof meta.kind !== "string") return null;
  const when = meta.applies_when ?? {};
  const applies: MemoryApplies = {
    ...(when.plugins?.length ? { plugin_ids: [...when.plugins] } : {}),
    ...(when.object_kinds?.length ? { object_kinds: [...when.object_kinds] } : {}),
    ...(when.goals?.length ? { goal_ids: [...when.goals] } : {}),
    ...(when.task ? { task: when.task } : {}),
    ...(when.from_ms !== undefined ? { from: iso(when.from_ms)! } : {}),
    ...(when.until_ms !== undefined ? { until: iso(when.until_ms)! } : {}),
  };
  const { state, state_reason } = stateOf(input.paused, input.disabled);
  return {
    memory_id: input.memory_id, scope: input.scope, owner: input.owner, kind: meta.kind as MemoryKind, source: meta.source as MemorySource,
    ...provenance(meta), applies, state, state_reason, expires_at: iso(meta.expires_at_ms), plugin_id: meta.namespace ?? null,
    created_at: input.created_at_ms > 0 ? iso(input.created_at_ms) : null,
    updated_at: input.updated_at_ms > 0 ? iso(input.updated_at_ms) : null,
  };
}
