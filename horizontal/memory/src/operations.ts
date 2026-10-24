import type { MemoryBatchRequest, MemoryCandidateRecord, MemoryChangeRequest, MemoryLedgerPort, MemoryScope, MemorySource } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "./service.js";
import { memoryErrors } from "./errors.js";

interface OperationIdentity {
  kind: string;
  scope: MemoryScope;
  owner: string;
  memory_id?: string;
  candidate_id?: string;
  expected_version?: number;
  original_state?: "active" | "paused" | "disabled";
  candidate_expected_version?: number;
  /** Number of evidence additions in a fixed duplicate adoption; never their contents. */
  evidence_count?: number;
  /** An absolute retention decision, not content or a reconstructed command. */
  formal_expires_at?: string | null;
  /** Identity of an entire normalized import, including items not yet dispatched. */
  input_digest?: string;
}
interface OperationMark extends OperationIdentity {
  operation_id: string;
  at: string;
  phase: "pending" | "committed" | "closed";
  result?: { memory_id?: string; candidate_id?: string; version?: number; outcome?: "duplicate" | "candidate" };
}
const PREFIX = "memory-operation:";

/** The UI freezes a canonical UTC instant, never a duration to recalculate on retry. */
function renewalDeadline(request: MemoryChangeRequest): string {
  if (!Number.isSafeInteger(request.expected_version) || request.expected_version! < 1)
    throw memoryErrors.invalid("续期需要页面所见的版本");
  if ([request.text, request.kind, request.classification, request.applies, request.to, request.version].some(value => value !== undefined))
    throw memoryErrors.invalid("续期只能修改截止时间，请单独提交其它修改");
  const value = request.expires_at, millis = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(millis) || millis < 0 || new Date(millis).toISOString() !== value)
    throw memoryErrors.invalid("续期需要明确且有效的 UTC ISO 截止时间");
  return new Date(millis).toISOString();
}

export interface MemoryPurgeTarget {
  scope: MemoryScope;
  owner: string;
  entry: { memory_id: string; version: number };
  condition?: { expected_version: number; operation_id: string; signal?: AbortSignal };
}

/** The fixed selection holds stable references and child identities, never body copies or local progress. */
export interface MemorySelection extends MemoryBatchRequest {
  project_id: string | null;
  children: string[];
}

/** The existing ledger keeps operation identity and receipts, never a proposed body or encoded command. */
export class MemoryOperations {
  constructor(private readonly ledger: MemoryLedgerPort, private readonly newId: () => string, private readonly now: () => Date) {}

  caller(caller: MemoryCaller): MemoryCaller {
    caller.signal?.throwIfAborted();
    return caller.operation_id ? caller : { ...caller, operation_id: this.newId() };
  }

  /** A multi-step command retains short identities without sending its parent or step key to the SDK. */
  child(caller: MemoryCaller, step: string): MemoryCaller {
    const parent = this.caller(caller);
    const key = `${PREFIX}${parent.operation_id}:step:${step}`;
    const operation_id = this.ledger.transaction(() => {
      const saved = this.ledger.marker(parent.actor_id, key)?.body as { operation_id: string } | undefined;
      if (saved) return saved.operation_id;
      const operation_id = this.newId();
      this.ledger.setMarker(parent.actor_id, key, { parent_operation_id: parent.operation_id, step, operation_id }, this.now().toISOString());
      return operation_id;
    });
    return { ...parent, operation_id };
  }

  selection(caller: MemoryCaller, previewId: string): MemorySelection | undefined {
    return this.ledger.marker(caller.actor_id, "memory-selection:" + previewId)?.body as MemorySelection | undefined;
  }

  saveSelection(caller: MemoryCaller, previewId: string, selection: MemorySelection): void {
    this.ledger.transaction(() => {
      const existing = this.selection(caller, previewId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(selection))
        throw memoryErrors.conflict("同一预览操作号不能改变原选集");
      if (!existing) this.ledger.setMarker(caller.actor_id, "memory-selection:" + previewId, selection, this.now().toISOString());
    });
  }

  /** Recreating a merged item belongs to the original change, even when the person's retry is a new request. */
  recreate(caller: MemoryCaller, change: { change_id: string; scope: MemoryScope; owner: string }): MemoryCaller {
    const operation = this.child({ ...caller, operation_id: change.change_id }, "undo-recreate");
    // This fixed creation must use its own SDK receipt rather than attach to an unrelated equal text.
    this.begin(operation, "commit", { kind: "commit", scope: change.scope, owner: change.owner });
    this.begin(operation, "append", { kind: "append", scope: change.scope, owner: change.owner });
    return operation;
  }

  find(caller: MemoryCaller, key: string): OperationMark | undefined {
    if (!caller.operation_id) return undefined;
    return this.ledger.marker(caller.actor_id, `${PREFIX}${caller.operation_id}:${key}`)?.body as OperationMark | undefined;
  }

  /** Claim a whole change before its first SDK step; an existing claim only checks identity, including after deletion. */
  changeRequest(caller: MemoryCaller, request: MemoryChangeRequest,
    located?: { scope: MemoryScope; owner: string; version: number }): void {
    const expiry = request.action === "renew" ? renewalDeadline(request) : undefined;
    const existing = this.find(caller, "change-request");
    if (existing) {
      if (existing.kind !== request.action || existing.memory_id !== request.memory_id || existing.formal_expires_at !== expiry
        || request.expected_version !== undefined && existing.expected_version !== request.expected_version
        || located && (existing.scope !== located.scope || existing.owner !== located.owner))
        throw memoryErrors.conflict("同一记忆操作号不能改变目标、动作、确认版本或续期期限");
      // Closed child operations still refuse writes; the original purge receipt may finish its deletion projection.
      return;
    }
    if (!located) return;
    const original = this.find(caller, `change:${request.memory_id}`);
    this.begin(caller, "change-request", { kind: request.action, scope: located.scope, owner: located.owner,
      memory_id: request.memory_id, expected_version: request.expected_version ?? original?.expected_version ?? located.version,
      ...(expiry === undefined ? {} : { formal_expires_at: expiry }) });
  }

  begin(caller: MemoryCaller, key: string, identity: OperationIdentity): OperationMark {
    if (!caller.operation_id) throw memoryErrors.invalid("记忆变更需要稳定操作号");
    const operation_id = `${caller.operation_id}:${key}`;
    return this.ledger.transaction(() => {
      const existing = this.ledger.marker(caller.actor_id, `${PREFIX}${operation_id}`)?.body as OperationMark | undefined;
      if (existing) {
        if (existing.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能重放");
        for (const name of ["kind", "scope", "owner", "memory_id", "candidate_id", "formal_expires_at", "evidence_count", "input_digest"] as const) {
          if (existing[name] !== identity[name]) throw memoryErrors.conflict("同一个记忆操作号不能改为另一个目标或动作");
        }
        return existing;
      }
      const mark: OperationMark = { ...identity, operation_id, at: this.now().toISOString(), phase: "pending" };
      this.ledger.setMarker(caller.actor_id, `${PREFIX}${operation_id}`, mark, mark.at);
      return mark;
    });
  }

  /** Bind before the first child. A pre-existing child cannot prove which unstarted items belonged to its package. */
  importPackage(caller: MemoryCaller, scope: MemoryScope, owner: string, input_digest: string): void {
    this.ledger.transaction(() => {
      if (!this.find(caller, "import-package") && this.find({ ...caller, operation_id: `${caller.operation_id}:import:0` }, "import"))
        throw memoryErrors.conflict("原导入缺少整包身份，不能用本次文件继续未完成条目，请核对已提交结果");
      this.begin(caller, "import-package", { kind: "import-package", scope, owner, input_digest });
    });
  }

  condition(caller: MemoryCaller, key: string, identity: OperationIdentity & { expected_version: number }) {
    const mark = this.begin(caller, key, identity);
    if (!Number.isSafeInteger(mark.expected_version) || mark.expected_version! < 1) throw memoryErrors.invalid("记忆变更需要读取时的版本");
    return { expected_version: mark.expected_version!, operation_id: mark.operation_id,
      ...(caller.signal ? { signal: caller.signal } : {}) };
  }

  formal(caller: MemoryCaller, located: { scope: MemoryScope; owner: string; entry: { memory_id: string; version: number } }, kind: string, expectedVersion?: number) {
    const condition = this.condition(caller, `${kind}:${located.entry.memory_id}`, { kind, scope: located.scope, owner: located.owner,
      memory_id: located.entry.memory_id, expected_version: expectedVersion ?? located.entry.version });
    if (expectedVersion !== undefined && condition.expected_version !== expectedVersion)
      throw memoryErrors.conflict("原删除条件与确认版本不一致，不能重试删除后来版本");
    return condition;
  }

  /** Missing bodies can converge only under the original decision and the caller's current scopes. */
  purgeRecovery(caller: MemoryCaller, memoryId: string, decisionKey: string, kind: string,
    scopes: readonly { scope: MemoryScope; owner: string }[], expectedVersion?: number): MemoryPurgeTarget {
    caller.signal?.throwIfAborted();
    const decision = this.find(caller, decisionKey), purge = this.find(caller, `purge:${memoryId}`);
    if (!decision || !purge || decision.kind !== kind || purge.kind !== "purge"
      || decision.memory_id !== memoryId || purge.memory_id !== memoryId
      || decision.scope !== purge.scope || decision.owner !== purge.owner
      || !["pending", "committed", "closed"].includes(purge.phase)
      || !["pending", "committed", "closed"].includes(decision.phase)
      || !Number.isSafeInteger(decision.expected_version) || decision.expected_version! < 1
      || purge.expected_version !== decision.expected_version
      || expectedVersion !== undefined && expectedVersion !== decision.expected_version)
      throw memoryErrors.conflict("没有一致的原删除决定，不能按当前缺失推断清理完成");
    if (!scopes.some(scope => scope.scope === purge.scope && scope.owner === purge.owner))
      throw memoryErrors.scope("原删除目标不在本次调用的记忆范围内");
    return { scope: purge.scope, owner: purge.owner, entry: { memory_id: memoryId, version: purge.expected_version! },
      condition: { expected_version: purge.expected_version!, operation_id: purge.operation_id, ...(caller.signal ? { signal: caller.signal } : {}) } };
  }

  candidate(caller: MemoryCaller, record: { scope: MemoryScope; owner: string; candidate_id: string; version: number }, kind: string) {
    return this.condition(caller, `${kind}:${record.candidate_id}`, { kind, scope: record.scope, owner: record.owner,
      candidate_id: record.candidate_id, expected_version: record.version });
  }

  /** Retain original cleanup conditions when the SDK candidate is gone but its ledger projection remains. */
  candidatePurges(caller: MemoryCaller, where: { scope: MemoryScope; owner: string },
    current: readonly { candidate_id: string; version: number }[], projected: readonly { candidate_id: string }[]) {
    const selected = new Map(current.map(item => [item.candidate_id, item.version]));
    for (const note of projected) {
      const old = this.find(caller, `candidate-purge:${note.candidate_id}`);
      if (old?.scope === where.scope && old.owner === where.owner && old.candidate_id === note.candidate_id && !selected.has(note.candidate_id))
        selected.set(note.candidate_id, old.expected_version!);
    }
    return [...selected].map(([candidate_id, version]) => ({ candidate_id,
      ...this.condition(caller, `candidate-purge:${candidate_id}`, { kind: "purge", ...where, candidate_id, expected_version: version }) }));
  }

  /** A formed candidate kept waiting is a fixed decision, not a new creation on the next offer. */
  holdCandidate(caller: MemoryCaller, record: MemoryCandidateRecord | undefined,
    input: { candidate_id?: string; candidate_version?: number; source: MemorySource; why?: string }, reason: string): MemoryCandidateRecord {
    caller.signal?.throwIfAborted();
    const commit = this.find(caller, "commit");
    if (!record || !commit || record.candidate_id !== input.candidate_id || record.scope !== commit.scope || record.owner !== commit.owner
      || record.state !== "pending" || input.candidate_version !== undefined && record.version !== input.candidate_version)
      throw memoryErrors.conflict("原等待候选已变化或不在当前范围，不能继续原决定");
    const mark = this.begin(caller, "candidate-hold", { kind: `candidate-hold:${input.source}`, scope: record.scope, owner: record.owner,
      candidate_id: record.candidate_id, expected_version: record.version });
    if (mark.expected_version !== record.version) throw memoryErrors.conflict("原等待候选已有后继版本，不能追随更新");
    if (mark.phase === "committed") {
      if (mark.result?.outcome !== "candidate" || mark.result.candidate_id !== record.candidate_id || mark.result.version !== record.version)
        throw memoryErrors.conflict("原等待候选回执不可确认");
      return record;
    }
    const held = { ...record, hold_reason: reason, ...(input.why ? { why: input.why.slice(0, 300) } : {}) };
    this.ledger.transaction(() => {
      this.ledger.saveCandidate(held);
      const result = { outcome: "candidate" as const, candidate_id: record.candidate_id, version: record.version };
      this.committed(caller, mark, result);
      this.committed(caller, commit, result);
    });
    return held;
  }

  committed(caller: MemoryCaller, mark: OperationMark, result: OperationMark["result"]): void {
    // Called in the same ledger transaction as the corresponding history/change projections.
    const current = this.ledger.marker(caller.actor_id, `${PREFIX}${mark.operation_id}`)?.body as OperationMark | undefined;
    if (current?.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能补回旧正文");
    this.ledger.setMarker(caller.actor_id, `${PREFIX}${mark.operation_id}`, { ...mark, phase: "committed", result }, mark.at);
  }
}
