import type { MemoryForgettingSelection } from "./memory-forgetting.js";
import type { MemoryScope } from "./memory.js";

/** Body-free owner facts for the existing offline Home restore transaction. */
export interface MemoryRestoreIdentity { readonly scope: MemoryScope; readonly owner: string }
export interface MemoryRestoreSourceBarrier extends MemoryRestoreIdentity {
  readonly actor_id: string;
  readonly event_id: string;
  readonly at: string;
}
export interface MemoryRestoreLedgerFacts {
  readonly forgotten: readonly string[];
  readonly identities: readonly (MemoryRestoreIdentity & { readonly memory_id: string })[];
  readonly sources: readonly MemoryRestoreSourceBarrier[];
  readonly candidates: readonly (MemoryRestoreIdentity & { readonly candidate_id: string; readonly memory_id?: string;
    readonly supersedes?: string; readonly source_event_ids: readonly string[] })[];
}
export interface MemoryRestoreRetention {
  readonly memories: readonly (MemoryRestoreIdentity & { readonly memory_id: string; readonly selection_mode: MemoryForgettingSelection["selection_mode"] })[];
  readonly candidates: readonly (MemoryRestoreIdentity & { readonly candidate_id: string })[];
  readonly sources: readonly MemoryRestoreSourceBarrier[];
}
export interface MemoryRestoreTarget extends MemoryRestoreIdentity {
  readonly kind: "memory" | "memory-candidate";
  readonly id: string;
  readonly version: number;
  readonly sources?: readonly { readonly event_id: string; readonly version: string }[] | null;
}
/** Canonical reads and selected deletes only; no Runtime, model, source body or general storage capability. */
export interface MemoryRestoreSdkPort {
  inspect(target: MemoryRestoreIdentity & { readonly kind: MemoryRestoreTarget["kind"]; readonly id: string }):
    Promise<{ readonly state: "present"; readonly target: MemoryRestoreTarget } | { readonly state: "absent" | "cleared" }>;
  candidates(identity: MemoryRestoreIdentity): Promise<readonly MemoryRestoreTarget[]>;
  /** Existing authoritative materials confirmed by SDK maintenance, relative to its root. Several records may share one file;
   * this is no general write/delete capability and never authorizes deleting that shared database. */
  purge(targets: readonly MemoryRestoreTarget[]): Promise<readonly string[]>;
  close(): Promise<void>;
}
