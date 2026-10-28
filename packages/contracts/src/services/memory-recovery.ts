import type { MemoryOwnerRelation, MemoryScope } from "./memory.js";
import type { AgentSessionDecision, AgentSessionPurgePreview, AgentSessionRef } from "./agent-host-runtime.js";
import type { AgentSessionOwner } from "./agent-host-start.js";
import type { ProjectDeletionRecoveryGroup } from "../modules/projects.js";
import type { AssistantSessionPurgeSelection } from "./assistant-session-purge.js";

/** Original body-free selection, saved by the Home recovery owner before SDK Session destruction. */
export interface CodingSessionPurgeSelection {
  readonly session: AgentSessionRef;
  readonly owner: AgentSessionOwner;
  readonly installation_generation: string;
  readonly sessions: readonly { readonly session_id: string; readonly created_at: string; readonly keys: readonly string[] }[];
  readonly waits: readonly { readonly wait_id: string; readonly keys: readonly string[] }[];
}

/** Explicit stopped working copies. This DTO carries no maintenance authority or default Home. */
export interface MemoryHomeRecoveryRequest {
  readonly homeDirectory: string;
  readonly sourceDirectory: string;
  readonly operation_id: string;
}
export interface MemoryHomeRecoveryResult {
  readonly outcome: "completed";
  readonly operation_id: string;
  readonly replayed: boolean;
}

/** Provenance already interpreted by the original owner; never an SDK write grant. */
export type MemoryHomeRecoverySource =
  | { readonly kind: "forgotten" }
  | { readonly kind: "original-purge" | "merge-drop" | "confirmed-plan"; readonly actor_id: string;
      readonly operation_id: string; readonly expected_version: number }
  | { readonly kind: "session-termination"; readonly session: AgentSessionRef };
export interface MemoryHomeRecoveryMemory {
  readonly identity: MemoryLedgerRecoveryIdentity;
  readonly source: MemoryHomeRecoverySource;
  readonly target: { readonly ref: { readonly kind: "memory" | "memory-candidate"; readonly id: string; readonly revision: 1 } } & (
    | { readonly mode: "present-purge"; readonly expected_version: number; readonly operation_id: string;
        readonly selection?: { readonly session: AgentSessionRef; readonly operation_id: string } }
    | { readonly mode: "already-cleared" });
}
export interface MemoryHomeRecoverySession {
  readonly session: AgentSessionRef;
  readonly owner: AgentSessionOwner;
  readonly source: { readonly preview: Omit<AgentSessionPurgePreview, "state">; readonly phase: "cleaning" | "complete";
    readonly version: number };
  readonly target: { readonly decision: AgentSessionDecision; readonly preview: AgentSessionPurgePreview };
  readonly business: { readonly kind: "coding"; readonly selection: CodingSessionPurgeSelection }
    | { readonly kind: "assistant"; readonly selection: AssistantSessionPurgeSelection };
}
/** One immutable selection and Catalog mapping, followed by one atomic final publication. */
export interface MemoryHomeRecoveryDecision {
  readonly kind: "home-recovery";
  readonly operation_id: string;
  readonly phase: "pending" | "committed";
  readonly known_scopes: readonly MemoryLedgerRecoveryIdentity[];
  readonly memories: readonly MemoryHomeRecoveryMemory[];
  readonly sessions: readonly MemoryHomeRecoverySession[];
  readonly barriers: readonly { readonly actor_id: string; readonly identity: MemoryLedgerRecoveryIdentity;
    readonly sources: readonly { readonly event_id: string; readonly version?: string }[] }[];
  readonly project_groups: readonly ProjectDeletionRecoveryGroup[];
}

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
  | { readonly kind: "home-recovery"; readonly operation_id: string; readonly phase: "pending" | "committed" }
  | { readonly kind: "home-recovery-target"; readonly operation_id: string; readonly memory: MemoryHomeRecoveryMemory }
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
