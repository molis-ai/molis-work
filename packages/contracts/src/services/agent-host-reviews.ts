/** The agent-host contract (`services/agent-host`): what a run asks a person to review, and the review queue. */
import type { AgentRunRef } from "./agent-host-runtime.js";

export type AgentReviewKind = "text-edit" | "command" | "tool-operation" | "mcp" | "rewind" | "git-index" | "git-integration";

export interface AgentTextReviewDocument {
  kind: "text-edit";
  /** Actual child root, when this proposal comes from an isolated subtask. */
  workspace_path?: string;
  target_path: string;
  exists: boolean;
  before_text: string | null;
  after_text: string;
  /** Other sessions whose work under way in the same directory covers this file, as the proposal was made. */
  concurrent?: string[];
}

export interface AgentCommandReviewDocument {
  kind: "command";
  /** Authorized root; cwd may be relative to it. */
  workspace_path?: string;
  command: string;
  args: string[];
  cwd: string;
  timeout_ms: number;
  env_allowlist?: string[];
  escalate?: boolean;
  /**
   * Access this one command names beyond the Host boundary: extra paths (absolute) and the network. The person approves
   * exactly this, for this command only; it is never remembered for the session. The command still runs as itself:
   * a Host without operating-system isolation enforces none of it, so it is shown as asked, not as confined.
   */
  grants?: AgentCommandGrants;
  /** Started in the background: the round does not wait for it. */
  background?: boolean;
  /** A background command that keeps running after the round ends, until it ends or is stopped. */
  outlives_run?: boolean;
}

export interface AgentCommandGrants {
  paths: ReadonlyArray<{ path: string; access: "read" | "write" }>;
  network: boolean;
}

export interface AgentToolOperationReviewDocument {
  kind: "tool-operation";
  tool: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  /** Reversible desktop action not yet allowed this round; the card may offer allowing that app (specs/computer-use D06). */
  round_allow?: { app: string; label: string };
}

export interface AgentMcpReviewDocument {
  kind: "mcp";
  server: string;
  tool: string;
  arguments_json: string;
}

export interface AgentRewindReviewDocument {
  kind: "rewind";
  checkpoint_id: string;
  files: Array<{ path: string; change: "restore" | "delete" | "create"; before_text: string | null; after_text: string | null }>;
}

export interface AgentGitIndexReviewDocument {
  kind: "git-index";
  action: "stage" | "unstage";
  workspace_name: string;
  files: Array<{ path: string; before_text: string | null; after_text: string | null; before_mode: "100644" | "100755" | null; after_mode: "100644" | "100755" | null }>;
}

export interface AgentGitIntegrationReviewDocument {
  kind: "git-integration";
  source: { session_id: string; run_id: string; subagent_id: string; branch: string; base_commit: string; directory: string };
  target_directory: string;
  files: AgentGitIndexReviewDocument["files"];
}

export type AgentReviewDocument =
  | AgentTextReviewDocument
  | AgentCommandReviewDocument
  | AgentToolOperationReviewDocument
  | AgentMcpReviewDocument
  | AgentGitIndexReviewDocument
  | AgentGitIntegrationReviewDocument
  | AgentRewindReviewDocument;

export type AgentReviewStatus = "pending" | "approved" | "rejected" | "cancelled" | "expired";

export interface AgentReviewRequest {
  review_id: string;
  /** Null for a manual operation; never fabricate an Agent Run. */
  run: AgentRunRef | null;
  operation?: { operation_id: string; session_id: string; kind: "checkpoint-rewind"; workspace_id?: never }
    | { operation_id: string; workspace_id: string; kind: "git-index" | "git-worktree" | "git-integration" | "git-operation"; session_id?: never };
  project_id: string;
  plugin_id: string;
  kind: AgentReviewKind;
  document: AgentReviewDocument;
  requested_at: string;
  expires_at: string | null;
}

export interface AgentReviewDecisionInput {
  review_id: string;
  decision: "approve" | "reject";
  actor_id: string;
  note?: string;
  /** "session" repeats one in-boundary command; "app-this-round" allows that desktop app until the run ends (specs/computer-use D06). */
  remember?: "session" | "app-this-round";
}

export interface AgentReviewReceipt {
  review_id: string;
  status: AgentReviewStatus;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  /** True once the approved effect really happened and the Runtime returned a receipt. */
  effect_settled: boolean;
  effect_error: string | null;
  /** The effect owner cannot yet determine what happened; never safe to retry automatically. */
  effect_uncertain?: string;
  /** Host recorded a decision, but the execution owner did not confirm receiving it. */
  delivery_error?: string;
  /** Human evidence, projected only after the execution owner has settled the original effect. */
  reconciliation?: { actor_id: string; at: string; reason: string };
  /** Approved by a person's earlier "allow this command for this session", not by a new click. */
  standing_rule?: { set_by: string; set_at: string };
}

export interface AgentGitIndexObservation {
  revision: string;
  observed_at: string;
  files: Array<{ path: string; text: string | null; mode: "100644" | "100755" | null }>;
  matches_before: boolean;
  matches_after: boolean;
}

export interface AgentReviewRecoveryView {
  review_id: string;
  receipt: AgentReviewReceipt;
  observation: AgentGitIndexObservation | null;
  can_confirm_not_happened: boolean;
  message: string;
}

export interface AgentReviewRecoveryInput {
  review_id: string;
  action: "refresh" | "not-happened";
  actor_id: string;
  revision?: string;
  reason?: string;
}

/**
 * Host-owned approval queue. A Plugin can observe and present it, but only the
 * Host records a decision, and only a recorded approval releases an effect.
 */
export interface AgentReviewQueueApi {
  list(projectId: string, status?: AgentReviewStatus): AgentReviewRequest[];
  get(reviewId: string): AgentReviewRequest | null;
  decide(input: AgentReviewDecisionInput): AgentReviewReceipt;
  receipt(reviewId: string): AgentReviewReceipt | null;
  observe(listener: (request: AgentReviewRequest) => void): () => void;
}
