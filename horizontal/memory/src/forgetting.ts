import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { isDeepStrictEqual } from "node:util";
import type { MemoryForgettingDecision, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendCandidate, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import { MemoryOperations } from "./operations.js";
import { MemoryPromotion } from "./promotion.js";
import { memoryErrors } from "./errors.js";

type Place = { scope: MemoryScope; owner: string };
type Selection = readonly { memory_id: string; version: number }[];
type Fixed = Pick<MemoryForgettingDecision, "selection_mode" | "memories" | "candidates" | "source_event_ids">;
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** A person's fixed deletion is durable before cleanup; the original SDK operations still own physical removal. */
export class MemoryForgetting {
  constructor(private readonly ports: { ledger: MemoryLedgerPort; backend: MemoryBackendPort | null; operations: MemoryOperations;
    promotions: Pick<MemoryPromotion, "linked" | "retainSuppression">; beforeEffect?(): void | Promise<void>; assertCurrent?(): void }) {}

  hidden(where: Place, kind: "memory" | "memory-candidate", id: string): boolean {
    return this.ports.ledger.forgetting.read().decisions.some(one => one.scope === where.scope && one.owner === where.owner
      && (kind === "memory" ? one.memories.some(item => item.memory_id === id) : one.candidates.some(item => item.candidate_id === id)));
  }

  private accepted(caller: MemoryCaller): MemoryForgettingDecision | undefined {
    return this.ports.ledger.forgetting.read().decisions.find(one => one.actor_id === caller.actor_id && one.operation_id === caller.operation_id);
  }

  /** Ledger-only projections participate too; no SDK list can prove their text was physically removed. */
  private related(caller: MemoryCaller, where: Place, memories: Selection, current: readonly MemoryBackendCandidate[], entireScope = false): Fixed {
    const notes = this.ports.ledger.candidates(caller.actor_id).filter(one => one.scope === where.scope && one.owner === where.owner);
    const ids = new Set(memories.map(one => one.memory_id));
    const sources = new Set([...ids].flatMap(id => this.ports.promotions.linked(caller.actor_id, id)).map(one => one.event_id));
    const selected: Array<{ candidate_id: string; version: number }> = [], associated: string[] = [];
    const sdk = new Map(current.map(one => [one.candidate_id, one])), projected = new Map(notes.map(one => [one.candidate_id, one]));
    for (const candidate_id of new Set([...sdk.keys(), ...projected.keys()])) {
      const entry = sdk.get(candidate_id), note = projected.get(candidate_id);
      const refs = [...entry?.sources ?? [], ...note?.source_refs ?? []];
      if (!entireScope && !(entry?.memory_id && ids.has(entry.memory_id) || note?.memory_id && ids.has(note.memory_id)
        || note?.supersedes && ids.has(note.supersedes) || refs.some(one => sources.has(one.event_id)))) continue;
      selected.push({ candidate_id, version: entry?.version ?? note!.version });
      associated.push(...refs.map(one => one.event_id));
    }
    return { selection_mode: "related", memories, candidates: selected.sort((a, b) => compare(a.candidate_id, b.candidate_id)),
      source_event_ids: [...new Set([...sources, ...associated])].sort() };
  }

  /** A missing SDK body does not erase an existing ledger projection's recorded identity/version. */
  private projectMemories(caller: MemoryCaller, where: Place, current: Selection): Selection {
    const found = new Map(current.map(one => [one.memory_id, one]));
    const changes = this.ports.ledger.changes(caller.actor_id, -1).filter(one => one.scope === where.scope && one.owner === where.owner && one.memory_id);
    for (const memory_id of new Set(changes.map(one => one.memory_id!))) {
      if (found.has(memory_id)) continue;
      const versions = [...changes.filter(one => one.memory_id === memory_id).map(one => one.applied_version),
        ...this.ports.ledger.revisions(memory_id).map(one => one.version)].filter((one): one is number => Number.isSafeInteger(one) && one! > 0);
      if (!versions.length) {
        // An already accepted decision is sufficient even if the only projection left is its body-free removal row.
        const accepted = this.ports.ledger.forgetting.read().decisions.flatMap(one => one.scope === where.scope && one.owner === where.owner ? one.memories : [])
          .find(one => one.memory_id === memory_id);
        if (!accepted) throw memoryErrors.conflict("项目记忆投影缺少可核验版本，不能猜测遗忘身份或清空后报完成");
        found.set(memory_id, accepted);
      } else found.set(memory_id, { memory_id, version: Math.max(...versions) });
    }
    return [...found.values()].sort((a, b) => compare(a.memory_id, b.memory_id));
  }

  /** Read failure means acceptance is unknown, never proof of a rollback. */
  failed(caller: MemoryCaller, error: unknown, knownAccepted = false): never {
    if (error instanceof ActionError && error.details?.operation_id === caller.operation_id
      && ["accepted", "unknown", "conflict", "not-accepted"].includes(String(error.details?.forgetting))) throw error;
    if (knownAccepted) throw memoryErrors.unavailable("遗忘决定已接受，清理未完成；请使用原操作号继续", {
      operation_id: caller.operation_id, forgetting: "accepted", cleanup: "pending" });
    let accepted: MemoryForgettingDecision | undefined;
    try { accepted = this.accepted(caller); }
    catch { throw memoryErrors.unavailable("遗忘决定的持久结果尚不能确认；内容已停止使用，请保留原操作号核对", {
      operation_id: caller.operation_id, forgetting: "unknown", cleanup: "pending" }); }
    if (accepted) throw memoryErrors.unavailable("遗忘决定已接受，清理未完成；请使用原操作号继续", {
      operation_id: accepted.operation_id, forgetting: "accepted", cleanup: "pending" });
    throw error;
  }

  async prepare(caller: MemoryCaller, where: Place, memories: Selection): Promise<void> {
    if (!this.ports.backend) throw memoryErrors.unavailable("普通遗忘需要当前记忆执行服务");
    await this.prepareSelection(caller, where, memories, false);
  }

  /** The same fixed subset acceptance, with no candidate or formal physical cleanup. */
  accept(caller: MemoryCaller, where: Place, memories: Selection): Promise<MemoryForgettingDecision | undefined> {
    return this.prepareSelection(caller, where, memories, false, undefined, false);
  }

  /** Internal fixed-identity collaborator; Session selection and its authorization stay with the caller. */
  acceptExact(caller: MemoryCaller, where: Place, selected: Pick<Fixed, "memories" | "candidates">): Promise<MemoryForgettingDecision | undefined> {
    return this.prepareSelection(caller, where, selected.memories, false, undefined, false, {
      selection_mode: "exact-identities", memories: selected.memories, candidates: [...selected.candidates]
        .sort((a, b) => compare(a.candidate_id, b.candidate_id)), source_event_ids: [],
    });
  }

  /** The original project receipt owns SDK cleanup; acceptance includes every candidate in its fixed scope. */
  prepareProjectScope(caller: MemoryCaller, where: Place, memories: Selection,
    candidates: readonly { candidate_id: string; version: number }[] = []): Promise<MemoryForgettingDecision | undefined> {
    return this.prepareSelection(caller, where, memories, true, candidates);
  }

  private async prepareSelection(caller: MemoryCaller, where: Place, memories: Selection, entireScope: boolean,
    expectedCandidates?: readonly { candidate_id: string; version: number }[], cleanup = true, exact?: Fixed): Promise<MemoryForgettingDecision | undefined> {
    memories = memories.map(one => ({ memory_id: one.memory_id, version: one.version })).sort((a, b) => compare(a.memory_id, b.memory_id));
    const backend = this.ports.backend?.withCaller(caller), previous = this.accepted(caller);
    const selection = (candidates: readonly MemoryBackendCandidate[]): Fixed => exact ? { ...exact, memories } : this.related(caller, where,
      entireScope ? this.projectMemories(caller, where, memories) : memories, candidates, entireScope);
    let fixed: Fixed;
    if (previous) {
      if (previous.selection_mode !== (exact?.selection_mode ?? "related") || previous.scope !== where.scope || previous.owner !== where.owner
        || exact && !isDeepStrictEqual({ selection_mode: previous.selection_mode, memories: previous.memories, candidates: previous.candidates, source_event_ids: previous.source_event_ids }, selection([])) || (entireScope
        ? memories.some(one => !previous.memories.some(prior => prior.memory_id === one.memory_id && prior.version === one.version))
        : !isDeepStrictEqual(previous.memories, memories)))
        throw memoryErrors.conflict("同一个遗忘操作号不能改变原固定选择", { operation_id: caller.operation_id, forgetting: "conflict" });
      fixed = { selection_mode: previous.selection_mode, memories: previous.memories, candidates: previous.candidates, source_event_ids: previous.source_event_ids };
    } else {
      const earlier = this.ports.operations.find(caller, "forget-selection");
      if (earlier && !earlier.forgetting) throw memoryErrors.conflict("原遗忘操作缺少完整固定选择，不能重新选择");
      fixed = earlier?.forgetting ?? selection(backend ? await backend.candidates.list(where.scope, where.owner) : []);
      if (fixed.selection_mode !== (exact?.selection_mode ?? "related") || exact && !isDeepStrictEqual(fixed, selection([])))
        throw memoryErrors.conflict("同一个遗忘操作号不能改变原固定选择");
      this.ports.operations.begin(caller, "forget-selection", { kind: "forget-selection", ...where, forgetting: fixed });
    }
    const { candidates, source_event_ids } = fixed;
    await this.ports.beforeEffect?.();
    caller.signal?.throwIfAborted();
    const unchanged = previous || !backend ? undefined : await backend.observeWrites();
    if (!previous) {
      // All waits, including source discovery and beforeEffect, precede the current canonical/CAS check.
      // No await separates the final canonical comparison from Storage's original-owner synchronous accept.
      for (const one of memories) await backend!.previewMutation({ ...where, memory_id: one.memory_id,
        expected_version: one.version, operation_id: `${caller.operation_id}:forget-preview:${one.memory_id}`,
        mutation: { kind: "remove" }, ...(caller.signal ? { signal: caller.signal } : {}) });
      const currentCandidates = backend ? await backend.candidates.list(where.scope, where.owner) : [];
      const current = backend ? await backend.list(where.scope, where.owner) : [];
      if (memories.some(one => !current.some(item => item.memory_id === one.memory_id && item.version === one.version)))
        throw memoryErrors.conflict("遗忘决定接受前记忆已变化，没有接受这次删除");
      if (entireScope && current.some(one => !memories.some(item => item.memory_id === one.memory_id && item.version === one.version)))
        throw memoryErrors.conflict("项目记忆在固定预览后已变化，没有接受新的删除选择");
      if (exact && exact.candidates.some(one => !currentCandidates.some(item => item.candidate_id === one.candidate_id && item.version === one.version)))
        throw memoryErrors.conflict("遗忘决定接受前所选候选已变化，没有接受这次删除");
      if (expectedCandidates && !isDeepStrictEqual([...expectedCandidates].sort((a, b) => compare(a.candidate_id, b.candidate_id)),
        currentCandidates.map(one => ({ candidate_id: one.candidate_id, version: one.version })).sort((a, b) => compare(a.candidate_id, b.candidate_id))))
        throw memoryErrors.conflict("项目候选在固定预览后已变化，没有接受新的删除选择");
      if (!isDeepStrictEqual(selection(currentCandidates), fixed))
        throw memoryErrors.conflict("遗忘决定接受前关联候选或来源已变化，请用新操作确认当前选择");
    }
    caller.signal?.throwIfAborted();
    unchanged?.();
    this.ports.assertCurrent?.();
    if (!fixed.memories.length && !candidates.length && !source_event_ids.length) return;
    let decision: MemoryForgettingDecision;
    try { decision = this.ports.ledger.forgetting.accept({ operation_id: caller.operation_id!, actor_id: caller.actor_id,
      ...where, selection_mode: fixed.selection_mode, memories: fixed.memories, candidates, source_event_ids }); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "memory.conflict")
        throw memoryErrors.conflict("同一个遗忘操作号不能改变原固定选择", { operation_id: caller.operation_id, forgetting: "conflict" });
      let absent = false;
      try { absent = this.accepted(caller) === undefined; } catch { /* Unknown facts remain a closed read gate. */ }
      if (absent) throw memoryErrors.unavailable("遗忘决定未被接受，没有开始清理；请保留原操作号重试", {
        operation_id: caller.operation_id, forgetting: "not-accepted", cleanup: "not-started" });
      throw memoryErrors.unavailable("遗忘决定的持久结果尚不能确认；请保留原操作号核对，尚未继续物理清理", {
        operation_id: caller.operation_id, forgetting: "unknown", cleanup: "pending" });
    }
    try {
    caller.signal?.throwIfAborted();
    // Ledger markers are projections. Retrying uses the accepted event identities even if source links were already cleared.
    this.ports.promotions.retainSuppression(caller.actor_id, where.scope, where.owner, decision.source_event_ids);
    if (entireScope || !cleanup) return decision;
    for (const selected of this.ports.operations.candidatePurges(caller, where, decision.candidates, [])) {
      await backend!.candidates.purge({ ...where, ...selected });
      await this.ports.beforeEffect?.();
      caller.signal?.throwIfAborted();
      this.ports.ledger.dropCandidate(selected.candidate_id);
    }
    } catch (error) { this.failed(caller, error, true); }
    return decision;
  }
}
