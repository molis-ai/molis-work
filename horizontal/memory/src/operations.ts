import type { MemoryChangeRequest, MemoryLedgerPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
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
  /** An absolute retention decision, not content or a reconstructed command. */
  formal_expires_at?: string | null;
}
interface OperationMark extends OperationIdentity {
  operation_id: string;
  at: string;
  phase: "pending" | "committed" | "closed";
  result?: { memory_id?: string; candidate_id?: string; version?: number };
}
const PREFIX = "memory-operation:";

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

  /** Recreating a merged item belongs to the original change, even when the person's retry is a new request. */
  recreate(caller: MemoryCaller, change: { change_id: string; scope: MemoryScope; owner: string }): MemoryCaller {
    const operation = this.child({ ...caller, operation_id: change.change_id }, "undo-recreate");
    // This fixed creation must use its own SDK receipt rather than attach to an unrelated equal text.
    this.begin(operation, "commit", { kind: "commit", scope: change.scope, owner: change.owner });
    return operation;
  }

  find(caller: MemoryCaller, key: string): OperationMark | undefined {
    if (!caller.operation_id) return undefined;
    return this.ledger.marker(caller.actor_id, `${PREFIX}${caller.operation_id}:${key}`)?.body as OperationMark | undefined;
  }

  /** Claim a whole change before its first SDK step; an existing claim only checks identity, including after deletion. */
  changeRequest(caller: MemoryCaller, request: Pick<MemoryChangeRequest, "action" | "memory_id" | "expected_version">,
    located?: { scope: MemoryScope; owner: string; version: number }): void {
    const existing = this.find(caller, "change-request");
    if (existing) {
      if (existing.kind !== request.action || existing.memory_id !== request.memory_id
        || request.expected_version !== undefined && existing.expected_version !== request.expected_version
        || located && (existing.scope !== located.scope || existing.owner !== located.owner))
        throw memoryErrors.conflict("同一记忆操作号不能改变目标、动作或确认版本");
      // Closed child operations still refuse writes; the original purge receipt may finish its deletion projection.
      return;
    }
    if (!located) return;
    const original = this.find(caller, `change:${request.memory_id}`);
    this.begin(caller, "change-request", { kind: request.action, scope: located.scope, owner: located.owner,
      memory_id: request.memory_id, expected_version: request.expected_version ?? original?.expected_version ?? located.version });
  }

  begin(caller: MemoryCaller, key: string, identity: OperationIdentity): OperationMark {
    if (!caller.operation_id) throw memoryErrors.invalid("记忆变更需要稳定操作号");
    const operation_id = `${caller.operation_id}:${key}`;
    return this.ledger.transaction(() => {
      const existing = this.ledger.marker(caller.actor_id, `${PREFIX}${operation_id}`)?.body as OperationMark | undefined;
      if (existing) {
        if (existing.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能重放");
        for (const name of ["kind", "scope", "owner", "memory_id", "candidate_id", "formal_expires_at"] as const) {
          if (existing[name] !== identity[name]) throw memoryErrors.conflict("同一个记忆操作号不能改为另一个目标或动作");
        }
        return existing;
      }
      const mark: OperationMark = { ...identity, operation_id, at: this.now().toISOString(), phase: "pending" };
      this.ledger.setMarker(caller.actor_id, `${PREFIX}${operation_id}`, mark, mark.at);
      return mark;
    });
  }

  condition(caller: MemoryCaller, key: string, identity: OperationIdentity & { expected_version: number }) {
    const mark = this.begin(caller, key, identity);
    if (!Number.isSafeInteger(mark.expected_version) || mark.expected_version! < 1) throw memoryErrors.invalid("记忆变更需要读取时的版本");
    return { expected_version: mark.expected_version!, operation_id: mark.operation_id,
      ...(caller.signal ? { signal: caller.signal } : {}) };
  }

  formal(caller: MemoryCaller, located: { scope: MemoryScope; owner: string; entry: { memory_id: string; version: number } }, kind: string) {
    return this.condition(caller, `${kind}:${located.entry.memory_id}`, { kind, scope: located.scope, owner: located.owner,
      memory_id: located.entry.memory_id, expected_version: located.entry.version });
  }

  candidate(caller: MemoryCaller, record: { scope: MemoryScope; owner: string; candidate_id: string; version: number }, kind: string) {
    return this.condition(caller, `${kind}:${record.candidate_id}`, { kind, scope: record.scope, owner: record.owner,
      candidate_id: record.candidate_id, expected_version: record.version });
  }

  committed(caller: MemoryCaller, mark: OperationMark, result: OperationMark["result"]): void {
    // Called in the same ledger transaction as the corresponding history/change projections.
    const current = this.ledger.marker(caller.actor_id, `${PREFIX}${mark.operation_id}`)?.body as OperationMark | undefined;
    if (current?.phase === "closed") throw memoryErrors.conflict("这次记忆操作已随删除关闭，不能补回旧正文");
    this.ledger.setMarker(caller.actor_id, `${PREFIX}${mark.operation_id}`, { ...mark, phase: "committed", result }, mark.at);
  }
}
