import type { ContractDescriptor } from "../platform/package.js";

export const modulesContextLedgerContract = {
  contractId: "io.molis.work.module.context-ledger.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/context-ledger.md",
} as const satisfies ContractDescriptor;

/** Scope identity is supplied by the authenticated host, not inferred from an object ID. */
export interface ContextScope {
  kind: "personal" | "team_project";
  id: string;
}

export interface ObjectRef {
  module: "goals" | "artifacts" | "feed" | "private-work-context" | "projects";
  id: string;
  /** null means an identity reference, not an invented historical version. Artifacts require a version. */
  version: number | null;
  scope: ContextScope;
  /** Object namespace, distinct from privacy scope. null preserves unknown legacy provenance. */
  project_id?: string | null;
  object_type?: string;
}

export interface ContextAccess {
  actor_id: string;
  scope: ContextScope;
}

export interface ContextEdge {
  key: string;
  revision: number;
  type: string;
  source: ObjectRef;
  target: ObjectRef;
  actor_id: string;
  cause: string;
  recorded_at: string;
  state: "active" | "removed";
}

export interface ContextEdgeInput {
  key: string;
  type: string;
  source: ObjectRef;
  target: ObjectRef;
  cause: string;
  recorded_at?: string;
}

export interface ContextEdgeQuery {
  include_removed?: boolean;
  type?: string;
  source?: ObjectRef;
  target?: ObjectRef;
}

export interface ContextLedgerApi {
  query: {
    get(access: ContextAccess, key: string): ContextEdge | null;
    list(access: ContextAccess, query?: ContextEdgeQuery): ContextEdge[];
    history(access: ContextAccess, key: string): ContextEdge[];
  };
  commands: {
    /** The semantic owner chooses the key and validates the business transition. */
    put(access: ContextAccess, input: ContextEdgeInput): ContextEdge;
    remove(access: ContextAccess, key: string, cause: string, recordedAt?: string): ContextEdge | null;
  };
}

export type ContextObjectRead<T> =
  | { state: "resolved"; ref: ObjectRef; value: T }
  | { state: "missing" | "denied" | "unavailable" };

export type ContextMaterializedNode<T> = { requested: ObjectRef } & (
  | { state: "resolved"; ref: ObjectRef; value: T }
  | { state: "missing" | "denied" | "unavailable" | "stale" }
);

export interface ContextRebuildRequest {
  roots: readonly ObjectRef[];
  direction: "incoming" | "outgoing" | "both";
  relation_types: readonly string[];
  max_depth: number;
  max_nodes: number;
}

export interface ContextMaterializationApi {
  /** Transient projection only. Readers must apply their owner's content-access policy. */
  rebuild<T>(access: ContextAccess, request: ContextRebuildRequest,
    read: (ref: ObjectRef, access: ContextAccess) => ContextObjectRead<T>): {
      nodes: ContextMaterializedNode<T>[];
      edges: ContextEdge[];
      truncated: boolean;
    };
}
