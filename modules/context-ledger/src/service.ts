import type {
  ContextAccess, ContextEdge, ContextEdgeInput, ContextEdgeQuery, ContextLedgerApi, ContextScope, ObjectRef,
} from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ContextLedgerRepository } from "./repository.js";

export class ContextLedgerError extends Error {
  constructor(readonly code: "context.access_denied" | "context.invalid_reference" | "context.scope_mismatch" | "context.key_conflict", message: string) {
    super(message);
    this.name = "ContextLedgerError";
  }
}

export interface ContextLedgerOptions {
  authorize(access: ContextAccess, operation: "read" | "write"): boolean;
  now?: () => Date;
}

function sameScope(a: ContextScope, b: ContextScope): boolean { return a.kind === b.kind && a.id === b.id; }
export function sameRef(a: ObjectRef, b: ObjectRef): boolean {
  return a.module === b.module && a.id === b.id && a.version === b.version && sameScope(a.scope, b.scope)
    && (a.project_id ?? null) === (b.project_id ?? null) && a.object_type === b.object_type;
}

/** Knows reference integrity, not the business meaning of a Feed or Session transition. */
export class ContextLedgerService implements ContextLedgerApi {
  readonly query = {
    get: (access: ContextAccess, key: string) => {
      this.checkAccess(access, "read");
      const value = this.repository.latest(access.scope, key);
      return value?.state === "active" ? value : null;
    },
    list: (access: ContextAccess, query: ContextEdgeQuery = {}) => {
      this.checkAccess(access, "read");
      if (query.source) this.checkRef(access, query.source);
      if (query.target) this.checkRef(access, query.target);
      return this.repository.list(access.scope, query).filter((value) =>
        (!query.type || query.type === value.type)
        && (!query.source || sameRef(query.source, value.source))
        && (!query.target || sameRef(query.target, value.target)));
    },
    history: (access: ContextAccess, key: string) => {
      this.checkAccess(access, "read");
      return this.repository.history(access.scope, key);
    },
  };

  readonly commands = {
    put: (access: ContextAccess, input: ContextEdgeInput) => this.put(access, input),
    remove: (access: ContextAccess, key: string, cause: string, recordedAt?: string) => {
      this.checkAccess(access, "write");
      return this.repository.transaction(() => {
        const previous = this.repository.latest(access.scope, key);
        if (!previous || previous.state === "removed") return previous;
        const value: ContextEdge = { ...previous, revision: previous.revision + 1, state: "removed",
          actor_id: access.actor_id, cause, recorded_at: recordedAt ?? this.now() };
        this.repository.insert(access.scope, value);
        return value;
      });
    },
  };

  constructor(private readonly repository: ContextLedgerRepository, private readonly options: ContextLedgerOptions) {}

  private put(access: ContextAccess, input: ContextEdgeInput): ContextEdge {
    this.checkAccess(access, "write");
    this.checkRef(access, input.source);
    this.checkRef(access, input.target);
    if (!input.key.trim() || !input.type.trim() || !input.cause.trim()) {
      throw new ContextLedgerError("context.invalid_reference", "关系 key、type 和 cause 不能为空");
    }
    return this.repository.transaction(() => {
      const previous = this.repository.latest(access.scope, input.key);
      if (previous && (!sameRef(previous.source, input.source) || previous.type !== input.type)) {
        throw new ContextLedgerError("context.key_conflict", "关系 key 已属于另一个来源或关系类型");
      }
      if (previous?.state === "active" && sameRef(previous.target, input.target)) return previous;
      const value: ContextEdge = { ...input, revision: (previous?.revision ?? 0) + 1,
        state: "active", actor_id: access.actor_id, recorded_at: input.recorded_at ?? this.now() };
      this.repository.insert(access.scope, value);
      return value;
    });
  }

  private now(): string { return (this.options.now?.() ?? new Date()).toISOString(); }

  private checkAccess(access: ContextAccess, operation: "read" | "write"): void {
    if (!access.actor_id.trim() || !access.scope.id.trim() || !this.options.authorize(access, operation)) {
      throw new ContextLedgerError("context.access_denied", "无权访问这个关系分区");
    }
  }

  private checkRef(access: ContextAccess, ref: ObjectRef): void {
    if (!sameScope(access.scope, ref.scope)) throw new ContextLedgerError("context.scope_mismatch", "跨分区引用不能进入同一关系记录");
    if (!ref.id.trim() || (ref.version !== null && (!Number.isSafeInteger(ref.version) || ref.version < 1))
      || (ref.module === "artifacts" && ref.version === null)) {
      throw new ContextLedgerError("context.invalid_reference", "对象引用必须具有有效身份；Artifact 必须指定精确版本");
    }
  }
}
