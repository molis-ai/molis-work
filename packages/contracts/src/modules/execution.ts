import type { GoalPolicy } from "./goals.js";
import type { ContractDescriptor } from "../platform/package.js";

export const modulesExecutionContract = {
  contractId: "io.molis.work.module.execution.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/modules/execution.md",
} as const satisfies ContractDescriptor;

export type ExecutionClaimRole =
  | "clarifier"
  | "executor"
  | "self_verifier"
  | "cross_reviewer"
  | "adversarial_reviewer"
  | "revalidator";

export type ExecutionClaimState = "active" | "released" | "expired" | "revoked";
export type ExecutionRunState = "started" | "blocked" | "completed" | "failed" | "abandoned";

export type ExecutionActionKind =
  | "clarify"
  | "execute"
  | "submit_evidence"
  | "revise"
  | "review"
  | "revalidate"
  | "mitigate_risk"
  | "accept_risk"
  | "release"
  | "renew"
  | "repair"
  | "wait";

export interface ExecutionClaimRecord {
  claim_id: string;
  board_id: string;
  goal_id: string;
  actor_id: string;
  role: ExecutionClaimRole;
  contract_revision: number;
  action_kind: ExecutionActionKind | null;
  action_target_id: string | null;
  state: ExecutionClaimState;
  capabilities: string[];
  goal_mode_attestation: boolean;
  resolved_policy: GoalPolicy;
  claimed_at: string;
  expires_at: string;
  renewed_at: string | null;
  released_at: string | null;
  release_reason: string | null;
}

export interface ExecutionRunRecord {
  run_id: string;
  board_id: string;
  goal_id: string;
  claim_id: string;
  actor_id: string;
  role: ExecutionClaimRole;
  state: ExecutionRunState;
  block_reason: string | null;
  output_refs: string[];
  discovery_refs: string[];
  started_at: string;
  ended_at: string | null;
}

export interface ExecutionRunWithClaim {
  run: ExecutionRunRecord;
  claim: ExecutionClaimRecord;
}

export interface ExecutionQueryApi {
  activeClaimCount(boardId: string, at: string): number;
  nonterminalRunCount(boardId: string): number;
  activeRunIdsForGoal(boardId: string, goalId: string): string[];
  listClaimsForGoal(boardId: string, goalId: string): ExecutionClaimRecord[];
  latestRunForGoal(boardId: string, goalId: string, roles?: readonly ExecutionRunRecord["role"][]): ExecutionRunRecord | null;
  latestClaimForGoal(boardId: string, goalId: string, roles?: readonly ExecutionClaimRecord["role"][]): ExecutionClaimRecord | null;
  latestActiveRunForClaim(claimId: string): ExecutionRunRecord | null;
  activeClaimIdsForGoal(boardId: string, goalId: string, at?: string): string[];
  listLifecycleEvents(boardId: string): import("../platform/storage.js").StoredModuleEvent[];
  getClaim(boardId: string, claimId: string): ExecutionClaimRecord | null;
  getRun(boardId: string, runId: string): ExecutionRunRecord | null;
  getRunWithClaim(boardId: string, runId: string): ExecutionRunWithClaim | null;
  listClaims(boardId: string): ExecutionClaimRecord[];
  listRuns(boardId: string): ExecutionRunRecord[];
  listNonterminalRuns(boardId: string): ExecutionRunRecord[];
}

export interface ExecutionApplicationApi {
  query: ExecutionQueryApi;
}
