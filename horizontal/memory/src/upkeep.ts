import { isDeepStrictEqual } from "node:util";
import type { AgentMemoryMeta, AgentMemoryPreviewMutation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MemoryApplies, MemoryChangeKind, MemoryChangeRecord, MemoryEvidence, MemoryFormalKind, MemoryLedgerPort, MemoryRevision, MemoryScope, MemoryUndoPlan, MemoryUpkeepReport } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryBackendEntry, MemoryBackendPort } from "./backend.js";
import type { MemoryCaller } from "./service.js";
import type { Located } from "./scope-commands.js";
import type { MemoryPromotion } from "./promotion.js";
import { MemoryOperations } from "./operations.js";
import { fromEntryMeta, toEntryMeta } from "./facts.js";
import { memoryErrors } from "./errors.js";
import { MEMORY_UPKEEP_POLICY, MEMORY_UPKEEP_RULE, MEMORY_UPKEEP_VERSION } from "./policy.js";

type Count = "expired" | "unused" | "paused" | "resumed" | "merged";
type StateAction = "pause" | "disable" | "resume";
interface UpkeepSnapshot {
  version: number;
  text: string;
  kind: MemoryFormalKind;
  applies: MemoryApplies;
  snapshot: { origin: string; meta: AgentMemoryMeta };
}
interface Step {
  operation_id: string;
  change_id: string;
  scope: MemoryScope;
  owner: string;
  memory_id: string;
  expected_version: number;
  kind: StateAction | "merge";
  count: Count;
  reason: string;
  change: MemoryChangeKind;
  undo: Exclude<MemoryUndoPlan, { action: "recreate" }> | null;
  trigger_evidence?: MemoryEvidence[];
  at: string;
  authority: ReturnType<typeof authority>;
  drop?: { memory_id: string; expected_version: number; operation_id: string };
  merge?: { removed: UpkeepSnapshot };
  phase: "pending" | "committed" | "closed";
}
interface Ports {
  backend: MemoryBackendPort;
  ledger: MemoryLedgerPort;
  operations: MemoryOperations;
  promotions: MemoryPromotion;
  now(): Date;
  newId(): string;
}
const INDEX = "memory-operation:upkeep-pending";
// Upkeep commits each step before starting another; an actor never needs a queued batch here.
const MAX_PENDING_STEPS = 1;
const keyOf = (operation: string) => `memory-operation:${operation}:upkeep`;
const authority = (caller: MemoryCaller) => ({ actor_id: caller.actor_id, project_id: caller.project_id, consumer: caller.consumer,
  plugin_id: caller.plugin_id ?? null, character_id: caller.character?.id ?? null, session_id: caller.session_id ?? null,
  current_scene: caller.current_scene ?? null, person: caller.person === true, purpose: caller.purpose ?? "management" });

/** Fixed maintenance steps are reconciled before active-entry selection, using existing history and SDK receipts. */
export class MemoryUpkeep {
  constructor(private readonly ports: Ports) {}

  async recover(caller: MemoryCaller, scope: MemoryScope, owner: string, report: MemoryUpkeepReport): Promise<void> {
    for (const id of this.pending(caller)) {
      const step = this.read(caller, id);
      if (!step || step.phase === "committed" || step.scope !== scope || step.owner !== owner) continue;
      this.assertOpen(caller, step);
      await this.apply(caller, step);
      report[step.count] += 1;
    }
  }

  async state(caller: MemoryCaller, one: Located, count: Exclude<Count, "merged">, action: StateAction,
    reason: string, change: MemoryChangeKind, undo: Step["undo"], lastUsedAt?: string | null): Promise<boolean> {
    this.assertCapacity(caller);
    const operation = this.ports.operations.child(caller, `${count}:${one.entry.memory_id}`);
    const existing = this.read(caller, operation.operation_id!);
    if (existing?.phase === "committed") return false;
    const at = this.ports.now().toISOString();
    const trigger_evidence: MemoryEvidence[] = count === "expired"
      ? [{ kind: "expiry", text: `到期时间 ${one.meta.expires_at ?? ""}`.trim(), at }]
      : count === "unused"
        ? [{ kind: "unused", text: reason, at: lastUsedAt ?? at }]
        : one.meta.evidence.filter(item => item.kind === "object" && item.ref);
    let step: Step = existing ?? { operation_id: operation.operation_id!, change_id: this.ports.newId(), scope: one.scope, owner: one.owner,
      memory_id: one.entry.memory_id, expected_version: one.entry.version, kind: action, count, reason, change, undo,
      ...(trigger_evidence.length ? { trigger_evidence } : {}), at, authority: authority(caller), phase: "pending" };
    if (!existing) {
      await this.ports.backend.withCaller(caller).previewMutation({ ...this.condition(step, caller), mutation: this.stateMutation(step) });
      step = this.prepare(caller, step, { version: one.entry.version, change: "restored", by: "maintenance", at });
    }
    if (step.phase === "committed") return false;
    const result = await this.apply(caller, step);
    one.entry = result;
    one.meta = this.facts(step, result);
    return true;
  }

  async merge(caller: MemoryCaller, keep: Located, drop: Located, why = "合并了意思相同的记忆"): Promise<boolean> {
    this.assertCapacity(caller);
    const operation = this.ports.operations.child(caller, `merge:${keep.entry.memory_id}:${drop.entry.memory_id}`);
    const existing = this.read(caller, operation.operation_id!);
    if (existing?.phase === "committed") return false;
    const at = this.ports.now().toISOString();
    const trigger_evidence: MemoryEvidence[] = [{
      kind: "duplicate",
      text: why,
      ref: { kind: "memory", id: drop.entry.memory_id, revision: String(drop.entry.version), ...(keep.project ? { project_id: keep.project } : {}) },
      at,
    }];
    let step: Step = existing ?? { operation_id: operation.operation_id!, change_id: this.ports.newId(), scope: keep.scope, owner: keep.owner,
      memory_id: keep.entry.memory_id, expected_version: keep.entry.version, kind: "merge", count: "merged", reason: "合并了意思相同的记忆",
      change: "merged", undo: null, trigger_evidence, at, authority: authority(caller), phase: "pending",
      drop: { memory_id: drop.entry.memory_id, expected_version: drop.entry.version, operation_id: this.ports.newId() } };
    if (!existing) {
      // Removal intentionally does not screen old contents. Never copy those contents into new App history under that permission.
      const before = await this.snapshot(caller, step, keep.entry.memory_id, keep.entry.version, this.revision(keep));
      const removed = await this.snapshot(caller, step, drop.entry.memory_id, drop.entry.version, this.revision(drop));
      const change = this.merged(step, before, removed);
      const backend = this.ports.backend.withCaller(caller);
      await backend.previewMutation({ ...this.condition(step, caller), mutation: { kind: "update", change } });
      await backend.previewMutation({ ...this.dropCondition(step, caller), mutation: { kind: "remove" } });
      step = this.prepare(caller, { ...step, merge: { removed } }, { version: keep.entry.version, change: "restored", by: "maintenance", at });
    }
    if (step.phase === "committed") return false;
    keep.entry = await this.apply(caller, step);
    keep.meta = this.facts(step, keep.entry);
    return true;
  }

  private pending(caller: MemoryCaller): string[] {
    return (this.ports.ledger.marker(caller.actor_id, INDEX)?.body as { plans: string[] } | undefined)?.plans ?? [];
  }

  private read(caller: MemoryCaller, id: string): Step | undefined {
    return this.ports.ledger.marker(caller.actor_id, keyOf(id))?.body as Step | undefined;
  }

  private assertCapacity(caller: MemoryCaller): void {
    if (this.pending(caller).length >= MAX_PENDING_STEPS) throw memoryErrors.conflict("已有在途维护步骤，请先完成原操作对账");
  }

  private assertOpen(caller: MemoryCaller, step: Step): void {
    caller.signal?.throwIfAborted();
    if (!isDeepStrictEqual(step.authority, authority(caller))) throw memoryErrors.scope("维护原操作不属于当前调用身份或范围");
    if (this.read(caller, step.operation_id)?.phase === "closed") throw memoryErrors.conflict("维护原操作已随删除关闭");
    for (const id of [step.memory_id, ...(step.drop ? [step.drop.memory_id] : [])]) {
      if (this.ports.ledger.marker("", `memory-forgotten:${id}`)) throw memoryErrors.conflict("维护目标已被遗忘，不能补回历史");
    }
  }

  private prepare(caller: MemoryCaller, step: Step, revision: MemoryRevision): Step {
    return this.ports.ledger.transaction(() => {
      this.assertOpen(caller, step);
      const existing = this.read(caller, step.operation_id);
      if (existing) return existing;
      const pending = this.pending(caller);
      this.assertCapacity(caller);
      if (this.ports.ledger.revisions(step.memory_id).some(item => item.version > step.expected_version)
        || (step.drop && this.ports.ledger.revisions(step.drop.memory_id).some(item => item.version > step.drop!.expected_version)))
        throw memoryErrors.conflict("目标已有后继历史，请重新读取后维护，不能登记过时计划");
      this.ports.ledger.addRevision(step.memory_id, revision);
      this.ports.ledger.setMarker(caller.actor_id, keyOf(step.operation_id), step, step.at);
      this.ports.ledger.setMarker(caller.actor_id, INDEX, { plans: [...new Set([...pending, step.operation_id])] }, step.at);
      return step;
    });
  }

  private revision(one: Located): UpkeepSnapshot {
    return { version: one.entry.version, text: one.entry.text, kind: one.meta.kind, applies: one.meta.applies,
      snapshot: { origin: one.entry.origin, meta: one.entry.meta } };
  }

  private async snapshot(caller: MemoryCaller, step: Step, id = step.memory_id, version = step.expected_version, exact?: UpkeepSnapshot): Promise<UpkeepSnapshot> {
    this.assertOpen(caller, step);
    const row = this.ports.ledger.revisions(id).find(item => item.version === version);
    if (!row) throw memoryErrors.conflict("维护未执行：原版本没有可核对的安全历史快照");
    const history = await this.ports.backend.withCaller(caller).history({ scope: step.scope, owner: step.owner, memory_id: id, ...(caller.signal ? { signal: caller.signal } : {}) });
    const canonical = history.revisions.find(item => item.version === version);
    const facts = canonical ? fromEntryMeta({ memory_id: id, scope: step.scope, owner: step.owner, meta: canonical.meta, created_at_ms: 0, updated_at_ms: 0 }) : null;
    const loaded: UpkeepSnapshot | null = canonical && facts ? { version: canonical.version, text: canonical.text, kind: facts.kind, applies: facts.applies,
      snapshot: { origin: canonical.origin, meta: canonical.meta } } : null;
    if (!loaded || exact && !isDeepStrictEqual([loaded.text, loaded.kind, loaded.applies, loaded.snapshot], [exact.text, exact.kind, exact.applies, exact.snapshot]))
      throw memoryErrors.conflict("维护未执行：原版本没有可核对的安全历史快照");
    return loaded;
  }

  private facts(step: Step, entry: MemoryBackendEntry) {
    const facts = fromEntryMeta({ ...entry, scope: step.scope, owner: step.owner });
    if (!facts) throw memoryErrors.conflict("维护目标的原事实不完整");
    return facts;
  }

  private merged(step: Step, before: UpkeepSnapshot, removed: UpkeepSnapshot) {
    const first = before.snapshot, second = removed.snapshot;
    const facts = this.facts(step, { memory_id: step.memory_id, version: before.version, text: before.text, origin: first.origin,
      meta: first.meta, tags: [], tombstoned: false, created_at_ms: 0, updated_at_ms: 0 });
    const other = this.facts(step, { memory_id: step.drop!.memory_id, version: removed.version, text: removed.text, origin: second.origin,
      meta: second.meta, tags: [], tombstoned: false, created_at_ms: 0, updated_at_ms: 0 });
    const evidence = [...facts.evidence, ...other.evidence.filter(item => !facts.evidence.some(existing => isDeepStrictEqual(existing, item)))].slice(-6);
    return { text: before.text, meta: toEntryMeta({ ...facts, evidence }, first.meta) };
  }

  private condition(step: Step, caller: MemoryCaller) {
    return { scope: step.scope, owner: step.owner, memory_id: step.memory_id, expected_version: step.expected_version,
      operation_id: step.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) };
  }

  private dropCondition(step: Step, caller: MemoryCaller) {
    return { ...this.condition(step, caller), ...step.drop! };
  }

  private stateMutation(step: Step): AgentMemoryPreviewMutation {
    if (step.kind === "merge") throw memoryErrors.invalid("合并必须预检固定的更新与删除命令");
    return step.kind === "resume" ? { kind: "resume" } : { kind: step.kind, reason: step.reason };
  }

  private async apply(caller: MemoryCaller, step: Step): Promise<MemoryBackendEntry> {
    this.assertOpen(caller, step);
    const backend = this.ports.backend.withCaller(caller), condition = this.condition(step, caller);
    let entry: MemoryBackendEntry, removed: UpkeepSnapshot | undefined;
    if (step.kind === "merge") {
      const before = await this.snapshot(caller, step);
      if (!step.merge || !this.ports.ledger.revisions(step.drop!.memory_id).some(item => item.version === step.drop!.expected_version))
        throw memoryErrors.conflict("维护未执行：原版本没有可核对的安全历史快照");
      removed = step.merge.removed;
      const change = this.merged(step, before, removed);
      entry = await backend.update({ ...condition, change });
      this.ports.ledger.transaction(() => {
        this.assertOpen(caller, step);
        this.ports.promotions.link(caller.actor_id, entry.memory_id, this.ports.promotions.linked(caller.actor_id, step.drop!.memory_id));
      });
      await backend.tombstone(this.dropCondition(step, caller));
      // The target may have changed while removal awaited. Only the original SDK receipt can confirm it again.
      entry = await backend.update({ ...condition, change });
    } else {
      await this.snapshot(caller, step);
      if (step.kind === "resume") entry = await backend.resume(condition);
      else entry = await backend[step.kind]({ ...condition, reason: step.reason });
    }
    this.record(caller, step, entry, removed);
    return entry;
  }

  private record(caller: MemoryCaller, step: Step, entry: MemoryBackendEntry, removed?: UpkeepSnapshot): void {
    this.ports.ledger.transaction(() => {
      this.assertOpen(caller, step);
      this.facts(step, entry);
      let undo: MemoryUndoPlan | null = step.undo;
      if (removed) {
        const meta = removed.snapshot.meta;
        const original = fromEntryMeta({ memory_id: step.drop!.memory_id, scope: step.scope, owner: step.owner, meta, created_at_ms: 0, updated_at_ms: 0 });
        if (!original) throw memoryErrors.conflict("合并撤销缺少原记忆事实");
        undo = { action: "recreate", text: removed.text, kind: removed.kind, source: original.source, basis: original.basis, applies: removed.applies,
          snapshot: removed.snapshot, source_refs: this.ports.promotions.linked(caller.actor_id, step.drop!.memory_id) };
        this.ports.promotions.link(caller.actor_id, entry.memory_id, this.ports.promotions.linked(caller.actor_id, step.drop!.memory_id));
      }
      const change: MemoryChangeRecord = { change_id: step.change_id, operation_id: step.operation_id, applied_version: entry.version,
        actor_id: caller.actor_id, owner: step.owner, scope: step.scope, project_id: step.scope === "personal" ? null : step.authority.project_id,
        kind: step.change, memory_id: entry.memory_id, text: entry.text, by: "maintenance", rule: MEMORY_UPKEEP_RULE,
        policy: { policy: MEMORY_UPKEEP_POLICY, version: MEMORY_UPKEEP_VERSION },
        ...(step.trigger_evidence?.length ? { trigger_evidence: step.trigger_evidence } : {}),
        reason: removed ? `合并了意思相同的「${removed.text.slice(0, 60)}」` : step.reason,
        work: null, at: step.at, undoable: undo !== null, state: "active", undo };
      this.ports.ledger.addRevision(entry.memory_id, { version: entry.version, change: step.kind === "merge" ? "merged" : "restored", by: "maintenance", at: step.at });
      this.ports.ledger.saveChange(change);
      const { merge: _merge, trigger_evidence: _evidence, ...committed } = step;
      this.ports.ledger.setMarker(caller.actor_id, keyOf(step.operation_id), { ...committed, phase: "committed" }, step.at);
      this.ports.ledger.setMarker(caller.actor_id, INDEX, { plans: this.pending(caller).filter(id => id !== step.operation_id) }, step.at);
      if (step.drop) this.ports.ledger.forget(step.drop.memory_id, "related");
    });
  }
}
