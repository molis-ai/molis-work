import type { AgentMemoryFormationResult, AgentMemorySourceRef, AgentMemorySourceSnapshot } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_KINDS, type MemoryEvidenceInput, type MemoryKind, type MemoryLedgerPort, type MemoryScope, type MemoryWriteResult } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendPort } from "./backend.js";
import type { MemoryCaller, MemoryService } from "./service.js";
import type { MemoryOperations } from "./operations.js";
import type { MemoryScopeCommands } from "./scope-commands.js";
import { formationContext, formationPending, formationSlots, formationSources, formedRecord, type FormationSnapshot } from "./formation.js";
import { memoryErrors } from "./errors.js";
import { callerClassAllowed, callerClassReadPossible } from "./class-restrictions.js";
import { newMemoryClassification } from "./classification.js";
import { consumerAccess, formationAllowed } from "./prefs.js";
import { sameText } from "./text.js";

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
  beforeEffect?(): void | Promise<void>;
  bindFormationSources?(refs: readonly AgentMemorySourceRef[]): void | Promise<void>;
  isForgotten: MemoryService["isForgotten"];
}
/** A suggestion left alone this long has gone quietly (the service's candidate TTL). */
const TWIN_WAITING = "同样的建议已经在等你认可";
const PENDING_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DO_NOT_REMEMBER = /(?:不要|别|不用|无需|不必)(?:帮我)?(?:记|记住|记下|记录)(?!得)|(?:don['’]?t|do not|never) (?:remember|save|store)/i;
const STANDING_WISH = /以后|今后|往后|每次|每回|总是|一律|一直|都要|都用|都别|都不|别再|不要再|下次|下回|记住|习惯|偏好|喜欢|讨厌|统一|规范|约定|规定|改成|应该|不对|always|never|from now on|every time|prefer|going forward|next time/i;

/** Product admission and promotion surround the SDK's sole automatic formation owner. */
export class MemoryLearning {
  constructor(private readonly ports: LearningPorts) {}

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
        && callerClassAllowed(prefs, caller, where.scope, { kind, classification: newMemoryClassification(caller, null).classification }, "form"));
      return prefs.enabled && formationAllowed(this.ports.scopes.prefsAt(caller.actor_id, { scope: "personal", owner: caller.actor_id }), prefs) && prefs.learn_from_work && access.allowed && (!plugin || plugin.allowed) && kinds.length
        ? [{ ...where, auto: prefs.auto, kinds }] : [];
    });
  }

  private async snapshot(caller: MemoryCaller): Promise<FormationSnapshot> {
    const snapshot: FormationSnapshot = { places: this.places(caller), existing: [], pending: [] };
    for (const where of snapshot.places) {
      // Extraction is a task read, even when its later candidate decision needs a management binding.
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, where);
      if (consumerAccess(prefs, caller.consumer, caller.plugin_id, "task").allowed
        && callerClassReadPossible(prefs, caller, where.scope, "task"))
        snapshot.existing.push(...await this.ports.scopes.located({ ...caller, purpose: "task" }, where.scope, where.owner));
      const canonical = consumerAccess(prefs, caller.consumer, caller.plugin_id, "task").allowed
        && callerClassReadPossible(prefs, caller, where.scope, "task")
        ? await this.ports.backend.withCaller({ ...caller, purpose: "management", source_use: undefined }).candidates.list(where.scope, where.owner) : [];
      for (const note of this.ports.ledger.candidates(caller.actor_id).filter(item => item.scope === where.scope && item.owner === where.owner)) {
        const entry = canonical.find(item => item.candidate_id === note.candidate_id);
        if (entry && entry.version === note.version && formationPending(caller, entry)
          && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, where), caller, where.scope, entry.meta, "form")
          && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, where), caller, where.scope, entry.meta, "task")) snapshot.pending.push({ note, entry });
      }
    }
    snapshot.existing = snapshot.existing.filter(row => !this.ports.isForgotten(row.scope, row.owner, "memory", row.entry.memory_id) && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, row), caller, row.scope, row.entry.meta, "task")).slice(-30);
    snapshot.pending = snapshot.pending.filter(row => !this.ports.isForgotten(row.note.scope, row.note.owner, "memory-candidate", row.entry.candidate_id) && formationPending(caller, row.entry) && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, row.note), caller, row.note.scope, row.entry.meta, "form")
      && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, row.note), caller, row.note.scope, row.entry.meta, "task")).slice(-20);
    return snapshot;
  }

  async context(caller: MemoryCaller) { return formationContext(caller, await this.snapshot(caller)); }

  private async validateContext(caller: MemoryCaller, snapshot: FormationSnapshot): Promise<void> {
    caller.signal?.throwIfAborted();
    for (const where of snapshot.places) {
      const expected = snapshot.existing.filter(row => row.scope === where.scope && row.owner === where.owner);
      if (expected.length) {
        const current = await this.ports.scopes.located({ ...caller, purpose: "task" }, where.scope, where.owner);
        if (expected.some(row => !current.some(next => next.entry.memory_id === row.entry.memory_id && next.entry.version === row.entry.version))) {
          throw memoryErrors.conflict("提炼所参考的记忆已改变或不再允许读取");
        }
      }
      const pending = snapshot.pending.filter(row => row.note.scope === where.scope && row.note.owner === where.owner);
      if (pending.length) {
        const current = await this.ports.backend.withCaller({ ...caller, purpose: "management", source_use: undefined }).candidates.list(where.scope, where.owner);
        if (pending.some(row => !current.some(next => next.candidate_id === row.entry.candidate_id && next.version === row.entry.version && formationPending(caller, next)
          && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, where), caller, where.scope, next.meta, "form")
          && callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, where), caller, where.scope, next.meta, "task")))) {
          throw memoryErrors.conflict("提炼所参考的候选已改变或不再允许读取");
        }
      }
    }
    caller.signal?.throwIfAborted();
    if (snapshot.existing.some(row => {
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, row);
      return !consumerAccess(prefs, caller.consumer, caller.plugin_id, "task").allowed
        || !callerClassAllowed(prefs, caller, row.scope, row.entry.meta, "task");
    }) || snapshot.pending.some(row => !callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, row.note), caller, row.note.scope, row.entry.meta, "form")
      || !callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, row.note), caller, row.note.scope, row.entry.meta, "task")
      || !consumerAccess(this.ports.scopes.prefsAt(caller.actor_id, row.note), caller.consumer, caller.plugin_id, "task").allowed
      || !formationPending(caller, row.entry)))
      throw memoryErrors.off("提炼派发前记忆分类权限已变化");
    if (snapshot.existing.some(one => this.ports.isForgotten(one.scope, one.owner, "memory", one.entry.memory_id))
      || snapshot.pending.some(one => this.ports.isForgotten(one.note.scope, one.note.owner, "memory-candidate", one.entry.candidate_id)))
      throw memoryErrors.conflict("提炼所参考的记忆或候选已被遗忘");
    const places = this.places(caller);
    if (snapshot.places.some(where => !places.some(current => current.scope === where.scope && current.owner === where.owner
      && where.kinds.every(kind => current.kinds.includes(kind))))) {
      throw memoryErrors.off("提炼派发前记忆形成已关闭");
    }
  }

  async learn(caller: MemoryCaller, input: { said: readonly string[]; sources?: readonly AgentMemorySourceSnapshot[] }): Promise<MemoryLearningResult> {
    caller = this.ports.operations.caller({ ...caller, source_use: "learning" });
    const backend = this.ports.backend.withCaller(caller);
    const skipped = async (): Promise<MemoryLearningResult> => ({ learned: [], formation: await backend.candidates.form({
      operation_id: caller.operation_id!, trigger: "none", ...(caller.signal ? { signal: caller.signal } : {}) }) });
    if (!this.worthLearning(caller, input.said)) return skipped();
    const snapshot = await this.snapshot(caller), sources = formationSources(caller, snapshot, input.sources ?? []);
    await this.ports.bindFormationSources?.(sources.refs);
    const retrying = this.ports.operations.find(caller, "form");
    const mark = this.ports.operations.begin(caller, "form", { kind: "form", scope: "personal", owner: caller.actor_id });
    const slots = formationSlots(caller, snapshot, mark.at).filter(slot => {
      const prefs = this.ports.scopes.prefsAt(caller.actor_id, { ...slot, project: caller.project_id });
      const before = slot.replacement && snapshot.existing.find(row => row.entry.memory_id === slot.replacement!.memory_id);
      return callerClassAllowed(prefs, caller, slot.scope, slot.meta, "form")
        && (!before || callerClassAllowed(prefs, caller, before.scope, before.entry.meta, "form"));
    });
    if (!slots.length) return skipped();
    const formation = await backend.candidates.form({ operation_id: mark.operation_id, trigger: "run-end", sources: sources.refs,
      slots, context: formationContext(caller, snapshot, !!retrying), validate_context: () => this.validateContext(caller, snapshot),
      ...(caller.signal ? { signal: caller.signal } : {}) });
    const learned: MemoryLearned[] = [];
    try {
      caller.signal?.throwIfAborted();
      for (const item of formation.items) {
        if (!item.candidate || (item.outcome !== "created" && item.outcome !== "replayed")) continue;
        const slot = slots.find(slot => slot.id === item.slot_id);
        if (!slot) throw memoryErrors.conflict("形成回执的目标不在本次授权范围");
        const receiptCaller: MemoryCaller = { ...caller, purpose: "management", candidate_access: { purpose: "formation-receipt",
          scope: slot.scope === "personal" ? "user" : slot.scope, owner: slot.owner, ...item.candidate } };
        const receiptBackend = this.ports.backend.withCaller(receiptCaller);
        const lookup = { scope: slot.scope, owner: slot.owner, candidate_id: item.candidate.candidate_id, ...(caller.signal ? { signal: caller.signal } : {}) };
        const entry = await receiptBackend.candidates.get(lookup);
        if (entry?.sources?.some(source => !sources.refs.some(ref => ref.event_id === source.event_id && ref.version === source.version)))
          throw memoryErrors.conflict("形成回执含本次实际来源之外的引用");
        if (!entry || entry.version !== item.candidate.version) throw memoryErrors.conflict("形成候选已改变，不能登记另一版本");
        if (this.ports.beforeEffect) {
          await this.ports.beforeEffect();
          const current = await receiptBackend.candidates.get(lookup);
          if (!current || current.version !== entry.version || current.state !== entry.state)
            throw memoryErrors.conflict("来源核验期间候选已改变，不能登记旧版本");
        }
        caller.signal?.throwIfAborted();
        if (!this.places(caller).some(place => place.scope === slot.scope && place.owner === slot.owner)
          || !callerClassAllowed(this.ports.scopes.prefsAt(caller.actor_id, { ...slot, project: caller.project_id }), caller, slot.scope, entry.meta, "form")) throw memoryErrors.off("登记期间记忆形成已关闭");
        const saved = this.ports.ledger.candidates(caller.actor_id).find(note => note.candidate_id === entry.candidate_id);
        if (saved && saved.version !== entry.version && entry.state === "pending") throw memoryErrors.conflict("原候选版本已改变，不能追随新版本晋升");
        const record = saved ?? formedRecord(caller, slot, entry, snapshot, sources, input.said);
        // Another work already suggested the same thing and it is still waiting: unless this one adds an independent original (repeated), one suggestion is enough.
        const twin = !saved && entry.state === "pending" && record.basis !== "repeated" ? this.ports.ledger.candidates(caller.actor_id).find(note => note.scope === slot.scope && note.owner === slot.owner
          && note.state === "pending" && note.kind === record.kind && sameText(note.text, entry.text) && Date.parse(note.created_at) > Date.now() - PENDING_TTL_MS
          && !this.ports.isForgotten(note.scope, note.owner, "memory-candidate", note.candidate_id)) : undefined;
        if (twin) {
          // The App does not register it (the SDK's own copy is left to its 14-day expiry: a learning caller may not decline a suggestion).
          learned.push({ text: entry.text, outcome: "skipped", reason: TWIN_WAITING, candidate_id: twin.candidate_id, memory_id: null });
          continue;
        }
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
        const result = await this.ports.offer(this.ports.operations.child(receiptCaller, `formed:${entry.candidate_id}`), {
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
