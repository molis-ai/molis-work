import { CANDIDATE_TTL_MS } from "./shapes.js";
import type { AgentMemorySourceRef, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_KINDS, MEMORY_LIFECYCLES, type MemoryPrefs, type MemoryCandidateRecord, type MemoryKind, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendCandidate, MemoryFormationInput } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { Located } from "./scope-commands.js";
import { newMemoryClassification } from "./classification.js";
import { fromEntryMeta } from "./facts.js";
import { automaticMemoryHold } from "./policy.js";
import { theirWords } from "./spoken.js";
import { looksLikeInstruction, sameWords } from "./text.js";
import { memoryErrors } from "./errors.js";
import { consumerAccess } from "./prefs.js";
import { memoryClassReadPossible, memoryClassReadAllowed, memoryClassFormationAllowed, type MemoryClassTarget } from "./class-restrictions.js";

export interface FormationPlace { scope: MemoryScope; owner: string; project: string | null; auto: boolean; kinds: readonly MemoryKind[] }
export interface FormationSnapshot {
  places: FormationPlace[];
  existing: Located[];
  pending: Array<{ note: MemoryCandidateRecord; entry: MemoryBackendCandidate }>;
}
export type FormationSlot = NonNullable<MemoryFormationInput["slots"]>[number];
const WAITING_MS = 14 * 24 * 60 * 60 * 1000;

/** Current and Run-frozen restrictions share the same canonical target; they cannot restore one another. */
export function formationClassAllowed(caller: MemoryCaller, prefs: MemoryPrefs, scope: MemoryScope, target: MemoryClassTarget): boolean {
  const context = { consumer: caller.consumer, current_scene: newMemoryClassification(caller, null).classification!.scenes[0]! };
  const frozen = caller.class_restrictions?.[scope === "personal" ? "personal" : "project"];
  return memoryClassFormationAllowed(prefs.class_restrictions, context, target)
    && (!frozen || memoryClassFormationAllowed(frozen, context, target));
}

/** An unreadable scope must not hydrate formal bodies merely to discard them later. */
export function formationReadPossible(caller: MemoryCaller, prefs: MemoryPrefs, scope: MemoryScope): boolean {
  if (caller.session_id && !caller.class_restrictions) return false;
  const access = consumerAccess(prefs, caller.consumer, caller.plugin_id, "task");
  const plugin = caller.plugin_id ? consumerAccess(prefs, "plugin", caller.plugin_id, "task") : undefined;
  if (!access.allowed || (plugin && !plugin.allowed)) return false;
  const kinds = access.kinds && plugin?.kinds ? access.kinds.filter(kind => plugin.kinds!.includes(kind)) : access.kinds ?? plugin?.kinds;
  if (kinds?.length === 0) return false;
  const context = { consumer: caller.consumer, current_scene: newMemoryClassification(caller, null).classification!.scenes[0]! };
  const frozen = caller.class_restrictions?.[scope === "personal" ? "personal" : "project"];
  return memoryClassReadPossible([...prefs.class_restrictions, ...(frozen ?? [])], context, "task", kinds ? { kinds } : {});
}

/** Recheck already-captured context synchronously after the last asynchronous canonical read. */
export function formationReferenceAllowed(caller: MemoryCaller, prefs: MemoryPrefs, scope: MemoryScope, target: MemoryClassTarget, mode: "read" | "form"): boolean {
  if (caller.session_id && !caller.class_restrictions) return false;
  const accessMode = mode === "read" ? "task" : "explicit";
  const access = consumerAccess(prefs, caller.consumer, caller.plugin_id, accessMode);
  const plugin = caller.plugin_id ? consumerAccess(prefs, "plugin", caller.plugin_id, accessMode) : undefined;
  if (!access.allowed || (plugin && !plugin.allowed)
    || (target.kind && (access.kinds && !access.kinds.some(kind => kind === target.kind) || plugin?.kinds && !plugin.kinds.some(kind => kind === target.kind)))) return false;
  if (mode === "form") return prefs.form && (caller.source_use === "explicit" || prefs.learn_from_work) && formationClassAllowed(caller, prefs, scope, target);
  const context = { consumer: caller.consumer, current_scene: newMemoryClassification(caller, null).classification!.scenes[0]! };
  const frozen = caller.class_restrictions?.[scope === "personal" ? "personal" : "project"];
  return memoryClassReadAllowed(prefs.class_restrictions, context, target, "task")
    && (!frozen || memoryClassReadAllowed(frozen, context, target, "task"));
}

/** Keep a kind if a new or replacement destination in the declared current scenes could still be formed. */
export function formationKindPossible(caller: MemoryCaller, prefs: MemoryPrefs, scope: MemoryScope, kind: MemoryKind): boolean {
  const scene = newMemoryClassification(caller, null).classification!.scenes[0]!;
  return [scene, "common"].some(value => MEMORY_LIFECYCLES.some(lifecycle =>
    formationClassAllowed(caller, prefs, scope, { kind, classification: { scenes: [value], lifecycle } })));
}

/** Pending review context is not formal recall: apply the App's current scene and private namespace boundary. */
export function formationPending(caller: MemoryCaller, entry: MemoryBackendCandidate): boolean {
  const scene = newMemoryClassification(caller, null).classification!.scenes[0]!;
  return entry.state === "pending" && !!entry.meta.classification?.scenes.some(value => value === scene || value === "common")
    && (!entry.meta.namespace || entry.meta.namespace === caller.plugin_id)
    && (!entry.meta.session_ref || entry.meta.session_ref.id === caller.session_id)
    && (entry.meta.expires_at_ms === undefined || entry.meta.expires_at_ms > Date.now());
}

/** Product destinations and canonical context are frozen together before the one SDK extraction. */
export function formationSlots(caller: MemoryCaller, snapshot: FormationSnapshot, at: string): FormationSlot[] {
  const slots: FormationSlot[] = [];
  for (const place of snapshot.places) for (const kind of place.kinds) for (let index = 0; index < 3; index += 1) {
    slots.push({ id: `new:${place.scope}:${kind}:${index}`, scope: place.scope, owner: place.owner, origin: "建议 · extraction",
      meta: { ...newMemoryClassification(caller, null), kind, source: "accepted", expires_at_ms: Date.parse(at) + WAITING_MS } });
  }
  for (const located of snapshot.existing) {
    // Unclassified memories remain readable, but are not silently assigned a new class by an automatic correction.
    if (!located.entry.meta.classification) continue;
    const place = snapshot.places.find(where => where.scope === located.scope && where.owner === located.owner)!;
    for (const kind of place.kinds) {
      const meta = located.entry.meta;
      slots.push({ id: `replace:${located.entry.memory_id}:${kind}`, scope: located.scope, owner: located.owner, origin: "建议 · extraction",
        meta: { kind, source: "accepted", classification: meta.classification,
          ...(meta.namespace ? { namespace: meta.namespace } : {}), ...(meta.session_ref ? { session_ref: meta.session_ref } : {}),
          ...(meta.applies_when ? { applies_when: meta.applies_when } : {}),
          expires_at_ms: Math.min(meta.expires_at_ms ?? Infinity, Date.parse(at) + WAITING_MS) },
        replacement: { memory_id: located.entry.memory_id, expected_version: located.entry.version } });
    }
  }
  return slots;
}

export function formationContext(caller: MemoryCaller, snapshot: FormationSnapshot, replaying = false): NonNullable<MemoryFormationInput["context"]> {
  return { replaying, ...(caller.work ? { work_title: caller.work.title } : {}),
    existing: snapshot.existing.map(({ entry, scope, meta }) => ({ memory_id: entry.memory_id, version: entry.version, scope, kind: meta.kind, text: entry.text })),
    pending: snapshot.pending.map(({ note, entry }) => ({ candidate_id: entry.candidate_id, version: entry.version,
      scope: note.scope, kind: note.kind, text: entry.text, work_title: note.work?.title ?? null,
      ...(note.basis === "explicit" && note.from === "extraction" && entry.suggested_basis !== "inferred" ? {
        sources: entry.sources?.map(({ event_id, version }) => ({ event_id, version })), applies: entry.meta.applies_when ?? {} } : {}) })) };
}

/** Only full current statements can select old canonical sources; model aliases and fragments do not count. */
export function formationSources(caller: MemoryCaller, snapshot: FormationSnapshot, supplied: readonly AgentMemorySourceSnapshot[]) {
  const originals = supplied.filter(source => source.speaker.kind === "person" && source.speaker.id === caller.actor_id
    && source.derivation === "original" && Number.isFinite(source.occurred_at_ms));
  const matching = snapshot.pending.filter(({ note, entry }) => note.basis === "explicit" && note.from === "extraction"
    && entry.state === "pending" && entry.suggested_basis !== "inferred" && entry.sources?.length
    && originals.some(source => theirWords(entry.text, [source.text]) !== null));
  const refs: AgentMemorySourceRef[] = [...new Map([...matching.flatMap(({ entry }) => entry.sources ?? []), ...originals]
    .map(source => [source.event_id, { event_id: source.event_id, version: source.version }])).values()];
  return { originals, matching, refs };
}

/** A product note is only a projection of the SDK-confirmed candidate, never a second proposal. */
export function formedRecord(caller: MemoryCaller, slot: FormationSlot, entry: MemoryBackendCandidate, snapshot: FormationSnapshot,
  sources: ReturnType<typeof formationSources>, said: readonly string[]): MemoryCandidateRecord {
  if (!MEMORY_KINDS.includes(entry.meta.kind as MemoryKind)) throw memoryErrors.invalid("形成候选没有有效的产品类别");
  const facts = fromEntryMeta({ memory_id: entry.candidate_id, scope: slot.scope, owner: slot.owner, meta: entry.meta,
    created_at_ms: entry.created_at_ms, updated_at_ms: entry.created_at_ms });
  if (!facts) throw memoryErrors.invalid("形成候选没有可登记的事实");
  const refs = entry.sources ?? [];
  const explicit = entry.suggested_basis === "explicit" && theirWords(entry.text, said) !== null
    && refs.length > 0 && refs.every(ref => sources.originals.some(source => source.event_id === ref.event_id && source.version === ref.version
      && theirWords(entry.text, [source.text]) !== null) || sources.matching.some(({ entry: prior }) => sameWords(prior.text, entry.text)
        && prior.sources!.some(old => old.event_id === ref.event_id && old.version === ref.version)));
  const basis = explicit ? new Set(refs.map(ref => ref.event_id)).size >= 2 ? "repeated" : "explicit" : "inferred";
  const place = snapshot.places.find(where => where.scope === slot.scope && where.owner === slot.owner)!;
  const target = slot.replacement ? snapshot.existing.find(one => one.entry.memory_id === slot.replacement!.memory_id) : undefined;
  const single = entry.meta.kind === "fact" ? "背景事实" : entry.meta.kind === "experience" ? "经验" : "这项要求";
  const why = basis === "repeated" ? "你在两份独立的原始输入里都这样要求" : basis === "explicit" ? "你在这次原始输入里完整表达了这项要求" : "从这次工作里推断";
  return { candidate_id: entry.candidate_id, version: entry.version,
    classification: entry.meta.classification ?? null, waiting_expires_at: new Date(Math.min(entry.created_at_ms + CANDIDATE_TTL_MS, entry.meta.expires_at_ms ?? Infinity)).toISOString(), source_refs: refs.map(({ event_id, version }) => ({ event_id, version })),
    actor_id: caller.actor_id, owner: slot.owner, scope: slot.scope, project_id: place.project, formal_expires_at: target?.meta.expires_at ?? null,
    kind: entry.meta.kind as MemoryKind, text: entry.text, applies: facts.applies, basis, why, from: "extraction", work: caller.work ?? null,
    hold_reason: looksLikeInstruction(entry.text) ?? (basis === "inferred" ? "只是推断或缺少可核验的原件，需要你认可才会生效"
      : basis === "explicit" ? `${single}只有一份原始表态，需要你认可才会生效`
      : automaticMemoryHold(entry.meta.kind as MemoryKind, basis, place.auto)),
    supersedes: entry.replacement?.memory_id ?? null, state: entry.state === "promoted" ? "accepted" : entry.state,
    created_at: new Date(entry.created_at_ms).toISOString(), memory_id: entry.memory_id ?? null };
}
