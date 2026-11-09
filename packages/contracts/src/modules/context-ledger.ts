import type { ContractDescriptor } from "../platform/package.js";

export const modulesContextLedgerContract = {
  contractId: /* @version contract.io.molis.work.module.context-ledger "io.molis.work.module.context-ledger.v{version}" */ "io.molis.work.module.context-ledger.v1",
  kind: "module",
  schemaVersion: /* @version contract.io.molis.work.module.context-ledger */ 1,
  maturity: "partial",
  ssot: "docs/modules/context-ledger.md",
} as const satisfies ContractDescriptor;

/** Scope identity is supplied by the authenticated host, not inferred from an object ID. */
export interface ContextScope {
  kind: "personal" | "team_project";
  id: string;
}

export interface ObjectRef {
  /**
   * Whose object it is. `assistant` is an Assistant work; `plugins` is an object a Plugin owns, named by
   * `object_type` (the subject kind its context reader declares, e.g. `pages_document`) within `project_id`.
   * `agent-host` is something an agent run holds, not Molis: `agent_input` (one input of a run session, id
   * `<session>/<input_id>`) or `runtime_session`. Molis keeps only the reference and does not check that it exists
   * (specs/ai-input-receipts S3).
   */
  module: "goals" | "artifacts" | "feed" | "private-work-context" | "projects" | "assistant" | "plugins" | "agent-host";
  id: string;
  /** null means an identity reference, not an invented historical version. Artifacts require a version. */
  version: number | null;
  /** The owner's own revision when it is not a counter (an opaque token). Compared exactly, never interpreted. */
  revision?: string;
  scope: ContextScope;
  /** Object namespace, distinct from privacy scope; absent for objects outside any project (Sessions, Home-level). */
  project_id?: string | null;
  object_type?: string;
}

export interface ContextAccess {
  actor_id: string;
  scope: ContextScope;
}

/**
 * The relation types the platform knows between two objects (specs/shared-sources-and-surfaces §6). An edge's `type` stays the string its
 * writer names; only these say that two objects are one piece of work, which a composed surface shows once (`SurfaceItem.merged`).
 * `copied_from`: a copy made of an object; `derived_from`: a version made from another object's content. Placement writes both, under its
 * own names. `created_from`: another thing made from this one on a surface (「从这件新建」), written by the platform path that makes it and
 * never claimed by a plugin; the two may have different owners.
 */
export const CONTEXT_RELATION_TYPES = { copied_from: "placement.copied_from", derived_from: "placement.derived_from", created_from: "created_from" } as const;
export type ContextRelationType = (typeof CONTEXT_RELATION_TYPES)[keyof typeof CONTEXT_RELATION_TYPES];

export interface ContextEdge {
  key: string;
  revision: number;
  /** Free for its writer; a relation the platform reads is one of `CONTEXT_RELATION_TYPES`. */
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

/** Trusted same-connection replica port. Replacing reference history never grants access or executes referenced objects. */
export interface ContextHistoryReplication {
  read(source:ObjectRef):ContextEdge[];
  validate(source:ObjectRef,input:unknown):ContextEdge[];
  replace(source:ObjectRef,history:readonly ContextEdge[]):void;
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
