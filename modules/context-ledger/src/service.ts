import type {
  ContextAccess, ContextEdge, ContextEdgeInput, ContextEdgeQuery, ContextLedgerApi, ContextScope, ObjectRef, ContextEdgePurgeIdentity,
} from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { ContextLedgerRepository } from "./repository.js";
import { ledgerErrors } from "./errors.js";

export interface ContextLedgerOptions {
  authorize(access: ContextAccess, operation: "read" | "write"): boolean;
  now?: () => Date;
  /** The owning Host already initialized and verified the schema. */
  initializeSchema?: boolean;
}

function sameScope(a: ContextScope, b: ContextScope): boolean { return a.kind === b.kind && a.id === b.id; }
export function sameRef(a: ObjectRef, b: ObjectRef): boolean {
  return a.module === b.module && a.id === b.id && a.version === b.version && (a.revision ?? null) === (b.revision ?? null) && sameScope(a.scope, b.scope)
    && (a.project_id ?? null) === (b.project_id ?? null) && a.object_type === b.object_type;
}

const purgeIdentity = ({ key, revision, type, source, target }: ContextEdge): ContextEdgePurgeIdentity =>
  ({ key, revision, type, source: structuredClone(source), target: structuredClone(target) });
const samePurgeIdentity = (a: ContextEdgePurgeIdentity, b: ContextEdgePurgeIdentity) => a.key === b.key && a.revision === b.revision
  && a.type === b.type && sameRef(a.source, b.source) && sameRef(a.target, b.target);

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

  /** Maintenance retains only source-owned identities. Targets never confer ownership of an incoming edge. */
  readonly retention = {
    prepare: (access: ContextAccess, source: ObjectRef): ContextEdgePurgeIdentity[] => {
      this.checkAccess(access, "read"); this.checkRef(access, source);
      return this.repository.list(access.scope, { source, include_removed: true }).flatMap(latest =>
        this.repository.history(access.scope, latest.key).map(edge => {
          if (!sameRef(edge.source, source)) throw ledgerErrors.key_conflict("关系历史不属于原来源");
          return purgeIdentity(edge);
        }));
    },
    clear: (access: ContextAccess, source: ObjectRef, selected: readonly ContextEdgePurgeIdentity[], current: () => void): void => {
      this.checkAccess(access, "write"); this.checkRef(access, source);
      if (new Set(selected.map(edge => JSON.stringify([edge.key, edge.revision]))).size !== selected.length
        || selected.some(edge => !edge.key || !Number.isSafeInteger(edge.revision) || edge.revision < 1 || !sameRef(edge.source, source)))
        throw ledgerErrors.key_conflict("原关系选择无效");
      this.repository.transaction(() => {
        current();
        const remaining = this.retention.prepare(access, source);
        if (remaining.some(edge => !selected.some(original => samePurgeIdentity(edge, original))))
          throw ledgerErrors.key_conflict("关系原件已变化，保留原选择核对");
        for (const edge of remaining) { current(); this.repository.removeRevision(access.scope, edge.key, edge.revision); }
        current();
      });
    },
    verifyOriginal: (access: ContextAccess, source: ObjectRef, selected: readonly ContextEdgePurgeIdentity[]): void => {
      this.checkAccess(access, "read"); this.checkRef(access, source);
      for (const original of selected) {
        if (!sameRef(original.source, source) || this.repository.history(access.scope, original.key).some(edge => edge.revision === original.revision))
          throw ledgerErrors.key_conflict("原关系历史尚未清除或身份冲突");
      }
    },
  };

  constructor(private readonly repository: ContextLedgerRepository, private readonly options: ContextLedgerOptions) {}

  private put(access: ContextAccess, input: ContextEdgeInput): ContextEdge {
    this.checkAccess(access, "write");
    this.checkRef(access, input.source);
    this.checkRef(access, input.target);
    if (!input.key.trim() || !input.type.trim() || !input.cause.trim()) {
      throw ledgerErrors.invalid_reference("关系 key、type 和 cause 不能为空");
    }
    return this.repository.transaction(() => {
      const previous = this.repository.latest(access.scope, input.key);
      if (previous && (!sameRef(previous.source, input.source) || previous.type !== input.type)) {
        throw ledgerErrors.key_conflict("关系 key 已属于另一个来源或关系类型");
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
      throw ledgerErrors.access_denied("无权访问这个关系分区");
    }
  }

  private checkRef(access: ContextAccess, ref: ObjectRef): void {
    if (!sameScope(access.scope, ref.scope)) throw ledgerErrors.scope_mismatch("跨分区引用不能进入同一关系记录");
    if (!ref.id.trim() || (ref.version !== null && (!Number.isSafeInteger(ref.version) || ref.version < 1))
      || (ref.module === "artifacts" && ref.version === null)) {
      throw ledgerErrors.invalid_reference("对象引用必须具有有效身份；成果必须指定精确版本");
    }
  }
}
