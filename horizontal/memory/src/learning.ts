import type { AgentMemoryFormationResult, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_KINDS, type MemoryEvidenceInput, type MemoryKind, type MemoryLedgerPort, type MemoryScope, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller, MemoryService } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import { formationReadPossible, formationReferenceAllowed, formationClassAllowed, formationKindPossible, formationContext, formationPending, formationSlots, formationSources, formedRecord, type FormationSnapshot, type FormationSlot } from "./formation.js";
import { memoryErrors } from "./errors.js";
import { consumerAccess } from "./prefs.js";

export interface MemoryProposal {
  text: string;
  kind: MemoryKind;
  scope: MemoryScope;
  applies_when?: string | null;
  basis: "explicit" | "inferred";
  quote: string;
  /** A model pointer never proves equivalence or independent evidence. */
  same_as?: string | null;
  supersedes?: string | null;
}
export interface MemoryLearned {
  text: string;
  outcome: MemoryWriteResult["outcome"] | "skipped";
  reason: string;
  candidate_id: string | null;
  memory_id: string | null;
}
export interface MemoryLearningResult { learned: MemoryLearned[]; formation: AgentMemoryFormationResult; recording_error?: { code: string } }
interface LearningPorts {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  scopes: MemoryScopeCommands;
  operations: MemoryOperations;
  offer: MemoryService["offer"];
}
const DO_NOT_REMEMBER = /(?:不要|别|不用|无需|不必)(?:帮我)?(?:记|记住|记下|记录)(?!得)|(?:don['’]?t|do not|never) (?:remember|save|store)/i;
const STANDING_WISH = /以后|今后|往后|每次|每回|总是|一律|一直|都要|都用|都别|都不|别再|不要再|下次|下回|记住|习惯|偏好|喜欢|讨厌|统一|规范|约定|规定|改成|应该|不对|always|never|from now on|every time|prefer|going forward|next time/i;

/** Product admission and promotion surround the SDK's sole automatic formation owner. */
export class MemoryLearning {
  constructor(private readonly ports: LearningPorts) {}

  /** Internal candidate review does not change the task identity used for formal reads or formation. */
  private candidates(caller: MemoryCaller) {
    return this.ports.backend.withCaller({ ...caller, purpose: "management", source_use: "learning" }).candidates;
  }

  worthLearning(caller: MemoryCaller, said: readonly string[]): boolean {
    const latest = said.at(-1) ?? "";
    if (!latest.trim() || said.some(text => DO_NOT_REMEMBER.test(text))) return false;
    return STANDING_WISH.test(latest) && this.places(caller).length > 0;
  }

  private places(caller: MemoryCaller) {
    return this.ports.scopes.scopesFor(caller, ["personal", "project"], true).flatMap(where => {
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, where);
      const access = consumerAccess(prefs, caller.consumer, caller.plugin_id, "explicit");
      const plugin = caller.plugin_id ? consumerAccess(prefs, "plugin", caller.plugin_id, "explicit") : undefined;
      const kinds = MEMORY_KINDS.filter(kind => (!access.kinds || access.kinds.includes(kind)) && (!plugin?.kinds || plugin.kinds.includes(kind))
        && formationKindPossible(caller, prefs, where.scope, kind));
      return prefs.enabled && prefs.form && prefs.learn_from_work && access.allowed && (!plugin || plugin.allowed) && kinds.length
        ? [{ ...where, auto: prefs.auto, kinds }] : [];
    });
  }

  private async snapshot(caller: MemoryCaller): Promise<FormationSnapshot> {
    const snapshot: FormationSnapshot = { places: this.places(caller), existing: [], pending: [] };
    for (const where of snapshot.places) {
      // Extraction is a task read, even when its later candidate decision needs a management binding.
      if (formationReadPossible(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope))
        snapshot.existing.push(...await this.ports.scopes.located({ ...caller, purpose: "task" }, where.scope, where.owner));
      const canonical = await this.candidates(caller).list(where.scope, where.owner);
      for (const note of this.ports.ledger.candidates(caller.actor_id).filter(item => item.scope === where.scope && item.owner === where.owner)) {
        const entry = canonical.find(item => item.candidate_id === note.candidate_id);
        if (entry && entry.version === note.version && formationPending(caller, entry)
          && formationClassAllowed(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope, entry.meta)) snapshot.pending.push({ note, entry });
      }
    }
    snapshot.existing = snapshot.existing.slice(-30);
    snapshot.pending = snapshot.pending.slice(-20);
    return snapshot;
  }

  async context(caller: MemoryCaller) {
    caller = { ...caller, purpose: "task", source_use: "learning" };
    return formationContext(caller, await this.snapshot(caller));
  }

  private slotAllowed(caller: MemoryCaller, snapshot: FormationSnapshot, slot: FormationSlot): boolean {
    const prefs = this.ports.scopes.prefsAt(caller.actor_id, { scope: slot.scope, owner: slot.owner, project: caller.project_id });
    if (!formationClassAllowed(caller, prefs, slot.scope, slot.meta)) return false;
    if (!slot.replacement) return true;
    const before = snapshot.existing.find(row => row.scope === slot.scope && row.owner === slot.owner
      && row.entry.memory_id === slot.replacement!.memory_id && row.entry.version === slot.replacement!.expected_version);
    return !!before && formationClassAllowed(caller, prefs, slot.scope, before.entry.meta);
  }

  private async validateContext(caller: MemoryCaller, snapshot: FormationSnapshot, slots: readonly FormationSlot[]): Promise<void> {
    caller.signal?.throwIfAborted();
    for (const where of snapshot.places) {
      const expected = snapshot.existing.filter(row => row.scope === where.scope && row.owner === where.owner);
      if (expected.length) {
        if (!formationReadPossible(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope))
          throw memoryErrors.off("提炼所参考的记忆不再允许读取");
        const current = await this.ports.scopes.located({ ...caller, purpose: "task" }, where.scope, where.owner);
        if (expected.some(row => !current.some(next => next.entry.memory_id === row.entry.memory_id && next.entry.version === row.entry.version))) {
          throw memoryErrors.conflict("提炼所参考的记忆已改变或不再允许读取");
        }
      }
      const pending = snapshot.pending.filter(row => row.note.scope === where.scope && row.note.owner === where.owner);
      if (pending.length) {
        const current = await this.candidates(caller).list(where.scope, where.owner);
        if (pending.some(row => !current.some(next => next.candidate_id === row.entry.candidate_id && next.version === row.entry.version && formationPending(caller, next)
          && formationClassAllowed(caller, this.ports.scopes.prefsAt(caller.actor_id, where), where.scope, next.meta)))) {
          throw memoryErrors.conflict("提炼所参考的候选已改变或不再允许读取");
        }
      }
    }
    caller.signal?.throwIfAborted();
    // A later scope read may yield while an earlier scope's permission is revoked; no await after this sweep.
    if (snapshot.existing.some(row => !formationReferenceAllowed(caller, this.ports.scopes.prefsAt(caller.actor_id, row), row.scope, row.entry.meta, "read"))
      || snapshot.pending.some(row => !formationReferenceAllowed(caller,
        this.ports.scopes.prefsAt(caller.actor_id, { scope: row.note.scope, owner: row.note.owner, project: row.note.project_id }), row.note.scope, row.entry.meta, "form"))) {
      throw memoryErrors.off("提炼派发前所参考的记忆或候选权限已改变");
    }
    const places = this.places(caller);
    if (slots.some(slot => !this.slotAllowed(caller, snapshot, slot) || !places.some(current => current.scope === slot.scope && current.owner === slot.owner
      && current.kinds.includes(slot.meta.kind as MemoryKind)))) {
      throw memoryErrors.off("提炼派发前记忆形成已关闭");
    }
  }

  async learn(caller: MemoryCaller, input: { said: readonly string[]; sources?: readonly AgentMemorySourceSnapshot[] }): Promise<MemoryLearningResult> {
    caller = this.ports.operations.caller({ ...caller, purpose: "task", source_use: "learning" });
    const backend = this.ports.backend.withCaller(caller);
    const skipped = async (): Promise<MemoryLearningResult> => ({ learned: [], formation: await backend.candidates.form({
      operation_id: caller.operation_id!, trigger: "none", ...(caller.signal ? { signal: caller.signal } : {}) }) });
    if (!this.worthLearning(caller, input.said)) return skipped();
    const snapshot = await this.snapshot(caller), sources = formationSources(caller, snapshot, input.sources ?? []);
    const retrying = this.ports.operations.find(caller, "form");
    const mark = this.ports.operations.begin(caller, "form", { kind: "form", scope: "personal", owner: caller.actor_id });
    const slots = formationSlots(caller, snapshot, mark.at).filter(slot => this.slotAllowed(caller, snapshot, slot));
    if (!slots.length) return skipped();
    const formation = await backend.candidates.form({ operation_id: mark.operation_id, trigger: "run-end", sources: sources.refs,
      slots, context: formationContext(caller, snapshot, !!retrying), validate_context: () => this.validateContext(caller, snapshot, slots),
      ...(caller.signal ? { signal: caller.signal } : {}) });
    const learned: MemoryLearned[] = [];
    try {
      caller.signal?.throwIfAborted();
      for (const item of formation.items) {
        if (!item.candidate) continue;
        const slot = slots.find(slot => slot.id === item.slot_id);
        if (!slot) throw memoryErrors.conflict("形成回执的目标不在本次授权范围");
        const entry = await this.candidates(caller).get({ scope: slot.scope, owner: slot.owner, candidate_id: item.candidate.candidate_id,
          ...(caller.signal ? { signal: caller.signal } : {}) });
        if (!entry || entry.version !== item.candidate.version) throw memoryErrors.conflict("形成候选已改变，不能登记另一版本");
        caller.signal?.throwIfAborted();
        if (!this.slotAllowed(caller, snapshot, slot) || !this.places(caller).some(place => place.scope === slot.scope && place.owner === slot.owner
          && place.kinds.includes(slot.meta.kind as MemoryKind))) throw memoryErrors.off("登记期间记忆形成已关闭");
        const saved = this.ports.ledger.candidates(caller.actor_id).find(note => note.candidate_id === entry.candidate_id);
        if (saved && saved.version !== entry.version && entry.state === "pending") throw memoryErrors.conflict("原候选版本已改变，不能追随新版本晋升");
        const record = saved ?? formedRecord(caller, slot, entry, snapshot, sources, input.said);
        if (!saved) this.ports.ledger.saveCandidate(record);
        if (entry.state !== "pending") {
          learned.push({ text: entry.text, outcome: entry.memory_id ? "duplicate" : "skipped", reason: "这份候选已有决定",
            candidate_id: entry.candidate_id, memory_id: entry.memory_id ?? null });
          continue;
        }
        // Preserve every confirmed candidate even when the same extraction later stopped; do not add a new write after cancellation/unknown.
        if (formation.outcome !== "completed" || record.basis !== "repeated") {
          learned.push({ text: entry.text, outcome: "candidate", reason: record.hold_reason ?? "等你认可", candidate_id: entry.candidate_id, memory_id: null });
          continue;
        }
        const evidence: MemoryEvidenceInput[] = (entry.sources ?? []).map(source => ({ kind: "said", ref: { kind: "memory-source", id: source.event_id, revision: source.version },
          at: new Date(source.occurred_at_ms).toISOString() }));
        const result = await this.ports.offer(this.ports.operations.child(caller, `formed:${entry.candidate_id}`), {
          scope: slot.scope, text: entry.text, kind: record.kind, applies: record.applies, basis: record.basis, why: record.why,
          evidence, from: "extraction", supersedes: record.supersedes, candidate_id: entry.candidate_id, candidate_version: record.version });
        learned.push({ text: entry.text, outcome: result.outcome, reason: result.reason, candidate_id: entry.candidate_id, memory_id: result.memory?.memory_id ?? null });
      }
    } catch (error) {
      const value = error && typeof error === "object" && "code" in error ? error.code : undefined;
      const code = typeof value === "string" && /^(?:(?:memory|agent)\.[a-z_]+|[A-Z][A-Z0-9_]{0,79})$/.test(value) ? value : "memory.conflict";
      return { learned, formation, recording_error: { code } };
    }
    return { learned, formation };
  }
}
