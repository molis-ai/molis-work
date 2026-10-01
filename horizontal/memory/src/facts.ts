import type { AgentMemoryMeta } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryApplies, MemoryEvidence, MemoryKind, MemoryMetaRecord, MemoryScope, MemorySource, MemoryState } from "@molis-ai/molis-work-contracts/services/memory";

/**
 * The platform's facts about an entry, kept on the Prologue entry itself (spec §8.2 S3): kind, source, basis,
 * evidence, when it applies, expiry, who approved it and a plugin's namespace in `meta`; switched off and paused as
 * the entry's paused state with a reason. Nothing here is a second copy of the text.
 */
const DISABLED = "disabled";
const PAUSED = "paused";

/** The reason Prologue keeps for a paused entry: whether the person switched it off, or what it rests on is gone. */
export function pauseReason(state: Exclude<MemoryState, "active">, reason: string | null): string {
  return `${state === "disabled" ? DISABLED : PAUSED}:${(reason ?? "").slice(0, 180)}`;
}

export function stateOf(paused: { reason: string } | undefined): { state: MemoryState; state_reason: string | null } {
  if (!paused) return { state: "active", state_reason: null };
  const [kind, ...rest] = paused.reason.split(":");
  const reason = rest.join(":") || null;
  return kind === PAUSED ? { state: "paused", state_reason: reason } : { state: "disabled", state_reason: reason ?? "你停用了" };
}

export function toEntryMeta(record: Pick<MemoryMetaRecord, "kind" | "source" | "basis" | "evidence" | "applies" | "expires_at" | "approved_by" | "plugin_id">): AgentMemoryMeta {
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
  return {
    kind: record.kind, source: record.source, basis: record.basis,
    ...(Object.keys(when).length ? { applies_when: when } : {}),
    ...(record.evidence.length ? { evidence: record.evidence.slice(-6).map(item => ({ kind: item.kind, ...(item.text ? { text: item.text.slice(0, 200) } : {}),
      ...(item.ref ? { ref: JSON.stringify(item.ref).slice(0, 200) } : {}), ...(time(item.at) !== undefined ? { at_ms: time(item.at)! } : {}) })) } : {}),
    ...(time(record.expires_at) !== undefined ? { expires_at_ms: time(record.expires_at)! } : {}),
    approved_by: record.approved_by,
    ...(record.plugin_id ? { namespace: record.plugin_id } : {}),
  };
}

/** The facts an entry carries, when the platform wrote them (`source` is always there then); null for older entries. */
export function fromEntryMeta(input: { memory_id: string; scope: MemoryScope; owner: string; meta: AgentMemoryMeta; paused?: { reason: string }; created_at_ms: number; updated_at_ms: number },
  now: Date): MemoryMetaRecord | null {
  const meta = input.meta;
  if (!meta || typeof meta.source !== "string" || typeof meta.kind !== "string") return null;
  const iso = (ms: number | undefined) => ms === undefined ? undefined : new Date(ms).toISOString();
  const when = meta.applies_when ?? {};
  const applies: MemoryApplies = {
    ...(when.plugins?.length ? { plugin_ids: [...when.plugins] } : {}),
    ...(when.object_kinds?.length ? { object_kinds: [...when.object_kinds] } : {}),
    ...(when.goals?.length ? { goal_ids: [...when.goals] } : {}),
    ...(when.task ? { task: when.task } : {}),
    ...(when.from_ms !== undefined ? { from: iso(when.from_ms)! } : {}),
    ...(when.until_ms !== undefined ? { until: iso(when.until_ms)! } : {}),
  };
  const evidence: MemoryEvidence[] = (meta.evidence ?? []).map(item => {
    let ref: MemoryEvidence["ref"];
    if (item.ref) { try { ref = JSON.parse(item.ref) as MemoryEvidence["ref"]; } catch { ref = undefined; } }
    return { kind: (["said", "object", "work", "signal"].includes(item.kind) ? item.kind : "work") as MemoryEvidence["kind"], ...(item.text ? { text: item.text } : {}), ...(ref ? { ref } : {}),
      at: iso(item.at_ms) ?? now.toISOString() };
  });
  const { state, state_reason } = stateOf(input.paused);
  const created = input.created_at_ms > 0 ? new Date(input.created_at_ms).toISOString() : now.toISOString();
  return {
    memory_id: input.memory_id, scope: input.scope, owner: input.owner, kind: meta.kind as MemoryKind, source: meta.source as MemorySource,
    basis: meta.basis ?? "explicit", evidence, applies, state, state_reason, expires_at: iso(meta.expires_at_ms) ?? null,
    approved_by: meta.approved_by ?? { by: "person" }, plugin_id: meta.namespace ?? null, created_at: created,
    updated_at: input.updated_at_ms > 0 ? new Date(input.updated_at_ms).toISOString() : created,
  };
}
