import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryCaller, AgentMemoryEntry, AgentMemoryPromotion, AgentMemoryPromotionApplied, AgentMemoryPromotionIdentity,
  AgentMemoryPromotionPreparation, AgentMemoryPromotionRequest, AgentMemorySourceRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { MEMORY_KINDS, type MemoryChangeRecord, type MemoryKind, type MemoryLedgerPort, type MemoryPrefs, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { fromEntryMeta } from "./facts.js";
import { memoryErrors } from "./errors.js";
import { MEMORY_GATE_POLICY, MEMORY_GATE_RULE, MEMORY_GATE_VERSION, automaticMemoryHold } from "./policy.js";
import { theirWords } from "./spoken.js";

interface PromotionMark extends AgentMemoryPromotionIdentity {
  kind: "promotion";
  scope: MemoryScope;
  owner: string;
  memory_id: string;
  before_version?: number;
  expected_version: number;
  sources: readonly AgentMemorySourceRef[];
  at: string;
  phase: "pending" | "committed" | "closed";
  change_id: string;
}
interface PromotionPorts {
  ledger: MemoryLedgerPort;
  now(): Date;
  newId(): string;
  prefs(actor: string, scope: MemoryScope, project: string | null): MemoryPrefs;
}
const scopeOf = (entry: Pick<AgentMemoryEntry, "scope">): MemoryScope => entry.scope === "user" ? "personal" : entry.scope;
const journalKey = (operation: string) => `memory-operation:${operation}:promotion-journal`;
const sourcesKey = (memory: string) => `memory-source-links:${memory}`;
const forgottenKey = (scope: MemoryScope, owner: string, event: string) => `memory-source-forgotten:${JSON.stringify([scope, owner, event])}`;

/** App approval and durable undo share the existing ledger; the SDK remains the only formal/candidate writer. */
export class MemoryPromotion {
  readonly capability: AgentMemoryPromotion = {
    policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
    decide: (caller, request) => this.decide(caller, request),
    undo: { prepare: (caller, request) => this.prepare(caller, request), record: (caller, request) => this.record(caller, request) },
  };
  constructor(private readonly ports: PromotionPorts) {}

  sourceAllowed(actor: string, scope: MemoryScope, owner: string, refs: readonly AgentMemorySourceRef[]): boolean {
    return refs.every(ref => !this.ports.ledger.marker(actor, forgottenKey(scope, owner, ref.event_id)));
  }

  linked(actor: string, memory: string): readonly AgentMemorySourceRef[] {
    return (this.ports.ledger.marker(actor, sourcesKey(memory))?.body as { sources?: AgentMemorySourceRef[] } | undefined)?.sources ?? [];
  }

  /** Retain every source that ever contributed to this canonical memory, including replaced versions. */
  link(actor: string, memory: string, refs: readonly AgentMemorySourceRef[]): void {
    if (!refs.length) return;
    const existing = this.linked(actor, memory);
    const sources = [...new Map([...existing, ...refs].map(ref => [JSON.stringify([ref.event_id, ref.version]), { event_id: ref.event_id, version: ref.version }])).values()];
    this.ports.ledger.setMarker(actor, sourcesKey(memory), { sources }, this.ports.now().toISOString());
  }

  /** Suppression survives a failed delete and applies to later versions of the same original event. */
  suppress(actor: string, scope: MemoryScope, owner: string, memories: readonly string[], extra: readonly AgentMemorySourceRef[] = []): void {
    this.ports.ledger.transaction(() => {
      const refs = [...extra, ...memories.flatMap(id => this.linked(actor, id))];
      for (const ref of refs) this.ports.ledger.setMarker(actor, forgottenKey(scope, owner, ref.event_id), { event_id: ref.event_id }, this.ports.now().toISOString());
    });
  }

  change(actor: string, operation: string): MemoryChangeRecord {
    const mark = this.mark(actor, operation), change = mark?.change_id ? this.ports.ledger.change(mark.change_id) : undefined;
    if (!mark || mark.phase !== "committed" || !change) throw memoryErrors.conflict("自动记忆已经提交，但原变动记录尚待补齐，请保留原操作重试");
    return change;
  }

  private mark(actor: string, operation: string): PromotionMark | undefined {
    return this.ports.ledger.marker(actor, journalKey(operation))?.body as PromotionMark | undefined;
  }

  private holder(caller: AgentMemoryCaller, identity: AgentMemoryPromotionIdentity) {
    const note = this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === identity.candidate.candidate_id);
    if (!note) throw memoryErrors.not_found("自动晋升需要当前候选的产品记录");
    return note;
  }

  private decide(caller: AgentMemoryCaller, request: AgentMemoryPromotionRequest): "promote" | "hold" {
    request.signal?.throwIfAborted();
    const entry = request.proposed, scope = scopeOf(entry), meta = request.desired.change.meta;
    const prefs = this.ports.prefs(caller.actor_id, scope, scope === "project" ? entry.owner : caller.project_id);
    if (caller.source_use !== "learning" || request.policy !== MEMORY_GATE_POLICY || request.version !== MEMORY_GATE_VERSION || !prefs.enabled || !prefs.form || !prefs.learn_from_work
      || !meta || !MEMORY_KINDS.includes(meta.kind as MemoryKind) || automaticMemoryHold(meta.kind as MemoryKind, meta.basis ?? null, prefs.auto)
      || meta.source !== "auto" || !isDeepStrictEqual(meta.approved_by, { by: "policy", policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION })
      || !this.sourceAllowed(caller.actor_id, scope, entry.owner, request.sources)) return "hold";
    const text = request.desired.change.text ?? entry.text;
    if (text !== entry.text || !isDeepStrictEqual(meta.classification, entry.meta.classification)
      || meta.namespace !== entry.meta.namespace || !isDeepStrictEqual(meta.applies_when, entry.meta.applies_when)) return "hold";
    const originals = request.sources.filter(source => source.speaker.kind === "person" && source.speaker.id === caller.actor_id
      && source.derivation === "original" && Number.isFinite(source.occurred_at_ms) && theirWords(text, [source.text]) !== null);
    return new Set(originals.map(source => source.event_id)).size >= 2 ? "promote" : "hold";
  }

  private async prepare(caller: AgentMemoryCaller, request: AgentMemoryPromotionPreparation): Promise<void> {
    request.signal?.throwIfAborted();
    const scope = scopeOf(request.after);
    const note = this.ports.ledger.candidates(caller.actor_id).find(item => item.candidate_id === request.candidate.candidate_id
      && item.scope === scope && item.owner === request.after.owner);
    if (!note?.source_refs?.length || !this.sourceAllowed(caller.actor_id, scope, request.after.owner, note.source_refs))
      throw memoryErrors.forbidden("来源已经遗忘或无法核验，停止自动记忆");
    const old = this.mark(caller.actor_id, request.operation_id);
    const mark: PromotionMark = { operation_id: request.operation_id, candidate: request.candidate, policy: request.policy, version: request.version, kind: "promotion", scope, owner: request.after.owner, memory_id: request.after.memory_id,
      expected_version: request.after.version, ...(request.before ? { before_version: request.before.version } : {}),
      sources: note.source_refs, at: old?.at ?? this.ports.now().toISOString(), phase: "pending", change_id: old?.change_id ?? `change-${this.ports.newId()}` };
    // Only identity is persisted here; before/after bodies belong in the existing revision history, not a second command log.
    this.ports.ledger.transaction(() => {
      if (old?.phase === "closed" || this.ports.ledger.marker("", `memory-forgotten:${mark.memory_id}`)) throw memoryErrors.conflict("这条自动记忆已遗忘，不能补回");
      if (old && !isDeepStrictEqual([old.candidate, old.policy, old.version, old.memory_id, old.expected_version, old.before_version, old.sources],
        [mark.candidate, mark.policy, mark.version, mark.memory_id, mark.expected_version, mark.before_version, mark.sources]))
        throw memoryErrors.conflict("同一晋升操作不能改为另一份候选或版本");
      if (request.before && !this.ports.ledger.revisions(mark.memory_id).some(item => item.version === request.before!.version)) {
        const facts = fromEntryMeta({ ...request.before, scope });
        if (!facts) throw memoryErrors.conflict("原记忆事实不完整，不能准备自动替换的撤销");
        this.ports.ledger.addRevision(mark.memory_id, { version: request.before.version, text: request.before.text, kind: facts.kind, applies: facts.applies,
          snapshot: { origin: request.before.origin, meta: request.before.meta }, change: "replaced", by: "policy", at: mark.at });
      }
      if (!old) this.ports.ledger.setMarker(caller.actor_id, journalKey(request.operation_id), mark, mark.at);
      this.link(caller.actor_id, mark.memory_id, mark.sources);
    });
  }

  private async record(caller: AgentMemoryCaller, request: AgentMemoryPromotionApplied) {
    const mark = this.mark(caller.actor_id, request.operation_id), entry = request.entry;
    if (!mark || mark.phase === "closed" || mark.memory_id !== entry.memory_id || mark.expected_version !== entry.version
      || !isDeepStrictEqual([mark.candidate, mark.policy, mark.version], [request.candidate, request.policy, request.version]))
      throw memoryErrors.conflict("自动提交与原准备记录不一致，不能补记为成功");
    const facts = fromEntryMeta({ ...entry, scope: mark.scope });
    if (!facts) throw memoryErrors.conflict("自动提交缺少可核验的记忆事实");
    const holder = this.holder(caller, request), change_id = mark.change_id;
    this.ports.ledger.transaction(() => {
      if (this.mark(caller.actor_id, request.operation_id)?.phase === "closed" || this.ports.ledger.marker("", `memory-forgotten:${entry.memory_id}`)
        || !this.sourceAllowed(caller.actor_id, mark.scope, mark.owner, mark.sources)) throw memoryErrors.conflict("自动记忆已遗忘，不能补回旧记录");
      if (!this.ports.ledger.change(change_id)) {
        this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, text: entry.text, kind: facts.kind, applies: facts.applies,
          snapshot: { origin: entry.origin, meta: entry.meta }, change: mark.before_version ? "replaced" : "created", by: "policy", at: mark.at });
        this.ports.ledger.saveChange({ change_id, operation_id: request.operation_id, applied_version: entry.version, actor_id: caller.actor_id,
          scope: mark.scope, owner: mark.owner, project_id: mark.scope === "personal" ? null : holder.project_id, memory_id: entry.memory_id,
          kind: mark.before_version ? "auto_replaced" : "auto_kept", text: entry.text, by: "policy", rule: MEMORY_GATE_RULE,
          reason: "两份独立的本人原始表态，经当前规则复核", work: holder.work ?? null, at: mark.at, undoable: true, state: "active",
          undo: mark.before_version ? { action: "restore", version: mark.before_version } : { action: "remove" } });
      }
      this.ports.ledger.setMarker(caller.actor_id, journalKey(request.operation_id), { ...mark, phase: "committed", change_id }, mark.at);
    });
    return { operation_id: request.operation_id, candidate: request.candidate, policy: request.policy, version: request.version,
      entry: { memory_id: entry.memory_id, version: entry.version }, change_id };
  }
}
