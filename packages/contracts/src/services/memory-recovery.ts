import type { MemoryOwnerRelation, MemoryScope } from "./memory.js";

/** Body-free provenance. Row numbers locate defects without echoing corrupt JSON or marker keys. */
export interface MemoryLedgerRecoveryLocation {
  readonly table: "markers" | "owners" | "candidates" | "changes";
  readonly row: number;
}
export interface MemoryLedgerRecoveryIdentity { readonly scope: MemoryScope; readonly owner: string }
export type MemoryLedgerRecoveryFamily = "scope-clear" | "selection" | "project-clear" | "adoption-cleanup";
export interface MemoryLedgerRecoveryOperation extends MemoryLedgerRecoveryIdentity {
  readonly operation_id: string;
  readonly action: string;
  readonly phase: "pending" | "committed" | "closed";
  readonly memory_id?: string;
  readonly candidate_id?: string;
  readonly expected_version?: number;
  readonly candidate_expected_version?: number;
  readonly result?: { readonly memory_id?: string; readonly candidate_id?: string; readonly version?: number; readonly outcome?: "duplicate" | "candidate" };
}
export type MemoryLedgerRecoveryFact = { readonly location: MemoryLedgerRecoveryLocation; readonly actor_id: string; readonly at?: string } & (
  | { readonly kind: "forgotten"; readonly memory_id: string }
  | ({ readonly kind: "source-forgotten"; readonly event_id: string } & MemoryLedgerRecoveryIdentity)
  | { readonly kind: "source-link"; readonly event_id: string; readonly version: string;
      readonly memory_id?: string; readonly candidate_id?: string; readonly operation_id?: string }
  | ({ readonly kind: "operation" } & MemoryLedgerRecoveryOperation)
  | ({ readonly kind: "promotion"; readonly candidate_id: string; readonly candidate_version: number;
      readonly policy: string; readonly policy_version: number; readonly before_version?: number; readonly change_id: string } & MemoryLedgerRecoveryOperation)
  | ({ readonly kind: "upkeep"; readonly change_id: string;
      readonly drop?: { readonly memory_id: string; readonly expected_version: number; readonly operation_id: string } } & MemoryLedgerRecoveryOperation)
  | { readonly kind: "upkeep-pending"; readonly operation_id: string }
  | { readonly kind: "step"; readonly parent_operation_id: string; readonly step: string; readonly operation_id: string }
  | { readonly kind: "plan"; readonly family: MemoryLedgerRecoveryFamily; readonly plan_id: string;
      readonly operation_id?: string; readonly phase?: "pending" | "committed"; readonly started?: boolean;
      readonly action?: "disable" | "remove"; readonly identity?: MemoryLedgerRecoveryIdentity; readonly project_id?: string | null }
  | { readonly kind: "plan-target"; readonly family: MemoryLedgerRecoveryFamily; readonly plan_id: string;
      readonly identity: MemoryLedgerRecoveryIdentity; readonly target: "memory" | "memory-candidate";
      readonly id: string; readonly expected_version: number; readonly operation_id: string; readonly ref_revision?: number;
      readonly completed?: boolean; readonly session_id?: string; readonly session_revision?: number; readonly state?: string }
  | { readonly kind: "project-delete"; readonly project_id: string; readonly operation_id: string; readonly complete: boolean }
  | { readonly kind: "owner"; readonly relation: MemoryOwnerRelation }
  | ({ readonly kind: "candidate"; readonly candidate_id: string; readonly memory_id: string | null;
      readonly project_id: string | null; readonly state: string; readonly version: number;
      readonly supersedes: string | null; readonly sources_known: boolean } & MemoryLedgerRecoveryIdentity)
  | ({ readonly kind: "change"; readonly change_id: string; readonly memory_id: string | null; readonly project_id: string | null;
      readonly action: string; readonly operation_id?: string; readonly applied_version?: number; readonly undone: boolean } & MemoryLedgerRecoveryIdentity)
);
export interface MemoryLedgerRecoveryIssue {
  readonly location: MemoryLedgerRecoveryLocation;
  readonly reason: "invalid-json" | "invalid-fact" | "unknown-kind";
}
export interface MemoryLedgerRecoveryPage {
  readonly facts: readonly MemoryLedgerRecoveryFact[];
  readonly issues: readonly MemoryLedgerRecoveryIssue[];
  /** Only this source scan is exhausted; neither coverage nor recovery completion is implied. */
  readonly exhausted: boolean;
}
