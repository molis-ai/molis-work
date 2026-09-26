import type { ActionView, ExactActionReference } from "../platform/actions.js";
import type {
  AgentPromptLayer,
  AgentPromptText,
  AgentRoleExecution,
  AgentSkillDeclaration,
  AgentSkillDefinition,
} from "../platform/plugin-agent.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { ArtifactReference, ArtifactProducerIdentity } from "../modules/artifacts.js";
import type { CharacterContent } from "../modules/characters.js";

export const servicesAgentHostContract = {
  contractId: "io.molis.work.service.agent-host.v1",
  kind: "service",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/horizontal/agent-host.md",
} as const satisfies ContractDescriptor;

export const AGENT_RUNTIME_CAPABILITIES = [
  "session.create",
  "session.read",
  "session.resume",
  "run.start",
  "run.observe",
  "run.control",
  "text-edit",
  "command",
  /**
   * Can report what a command it already ran produced.
   *
   * Separate from `command` on purpose: a Runtime may be unable to execute a
   * command under Host approval while still being able to say what it did run.
   * Folding the two together forced a surface that shows receipts to gate on
   * execution, which is a different question.
   */
  "command.receipts",
  "checkpoint",
  "rewind",
  "skills",
  "mcp",
  "subagents",
  "compaction",
  "usage",
] as const;

export type AgentRuntimeCapability = (typeof AGENT_RUNTIME_CAPABILITIES)[number];

export type AgentCapabilitySupport = "supported" | "partial" | "unsupported";

/**
 * What a Runtime can actually do. The product degrades against this matrix and
 * shows an unsupported capability as truly unavailable; it never simulates one.
 */
export type AgentRuntimeCapabilityMatrix = Record<AgentRuntimeCapability, AgentCapabilitySupport>;

export interface AgentRuntimeDescriptor {
  supports_action_tools?: boolean;
  supports_workspace_none?: boolean;
  runtime_id: string;
  display_name: string;
  provider_version: string;
  capabilities: AgentRuntimeCapabilityMatrix;
}

export type AgentRuntimeHealthStatus = "ready" | "needs_setup" | "unavailable";

export interface AgentRuntimeHealth {
  ok: boolean;
  status: AgentRuntimeHealthStatus;
  message: string;
  /** One concrete next step for the user. Never a raw provider diagnostic. */
  action?: string;
}

export interface AgentSessionRef {
  session_id: string;
  runtime_id: string;
}

export interface AgentRunRef {
  run_id: string;
  session_id: string;
}

export type AgentRunPhase =
  | "starting"
  | "running"
  | "awaiting-review"
  | "awaiting-input"
  | "paused"
  | "compacting"
  | "completed"
  | "failed"
  | "cancelled"
  | "stopped"
  | "reconcile-required";

const TERMINAL_AGENT_PHASES: readonly AgentRunPhase[] = [
  "completed",
  "failed",
  "cancelled",
  "stopped",
];

/** `reconcile-required` is not terminal: an unsettled effect still needs a decision. */
export function isTerminalAgentPhase(phase: AgentRunPhase): boolean {
  return TERMINAL_AGENT_PHASES.includes(phase);
}

/** An authorized directory. The Host resolves and verifies it; the Plugin never passes a raw path. */
export interface AgentWorkingDirectory {
  canonical_path: string;
  realpath_verified: boolean;
}

/** Absence retains the historical workspace requirement. No process cwd fallback is permitted. */
export type AgentWorkspace =
  | { workspace?: "required"; directory: AgentWorkingDirectory }
  | { workspace: "none"; directory?: never };

export interface AgentTextMaterial {
  material_id: string;
  title: string;
  /** Verbatim text the model may read. Frozen before the Run starts. */
  text: string;
  source_artifact_id: string;
  source_version: number;
}

/** Metadata and verbatim body share one data resource, never a role/system prompt. */
export function agentTextMaterialContent(material: AgentTextMaterial): string {
  if (!material || typeof material.title !== "string" || material.title.length > 2000
    || typeof material.material_id !== "string" || !material.material_id || material.material_id.length > 240
    || typeof material.source_artifact_id !== "string" || !material.source_artifact_id || material.source_artifact_id.length > 200
    || !Number.isSafeInteger(material.source_version) || material.source_version < 1 || typeof material.text !== "string") {
    throw new Error("固定材料的标题、来源或版本无效");
  }
  const header = JSON.stringify({ title: material.title, artifact_id: material.source_artifact_id, version: material.source_version });
  const content = `${header}\n\n${material.text}`;
  // Prologue's required text resources reject more than 20,000 UTF-16 units.
  if (content.length > 20_000) throw new Error("材料连同来源超过 20,000 字符，请在文件中选择较小片段后重新保存");
  return content;
}

export interface AgentSkillRef {
  skill_id: string;
  version: number;
}

export interface AgentMcpToolRef {
  server: string;
  tool: string;
  /** Required for execution; older unversioned selections must be reselected. */
  version?: string;
  server_label?: string;
  /** Pins the endpoint, credentials and launch configuration, independently of tool schema. */
  configuration_version?: number;
}

/** Explicit access to the documents of a configured MCP service, without its external tools. */
export type AgentMcpSourceRef = Pick<AgentMcpToolRef, "server" | "configuration_version" | "server_label">;

export interface AgentRunBudget {
  max_turns?: number;
  max_output_tokens?: number;
  max_total_tokens?: number;
  max_duration_ms?: number;
}

/** Runtime limits are explicit positive safe integers; omitted values keep SDK defaults. */
export function parseAgentRunBudget(value: AgentRunBudget | undefined): AgentRunBudget | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("执行预算格式无效");
  const budget: AgentRunBudget = {};
  for (const field of ["max_turns", "max_output_tokens", "max_total_tokens", "max_duration_ms"] as const) {
    const limit = value[field];
    if (limit === undefined) continue;
    if (!Number.isSafeInteger(limit) || limit < 1 || field === "max_duration_ms" && limit > 2_147_483_647) throw new Error(`执行预算 ${field} 必须为有效的正整数`);
    budget[field] = limit;
  }
  return budget;
}

/** Ordered steps supplied by the caller from its immutable confirmed Artifact. */
export interface AgentExecutionPlan {
  source: ArtifactReference;
  title: string;
  /** `depends_on` names earlier steps this one waits for; absent, a step waits for the one before it. */
  steps: Array<{ id: string; title: string; acceptance: string; depends_on?: string[] }>;
}

/** Original SDK facts. A reported success is never a user acceptance. */
/** Who holds a step: only its holder reports on it. */
export interface AgentStepOwner {
  kind: "session" | "subtask" | "person" | "none" | "other";
  /** How the holder reads: 本会话, 子任务「…」, 用户, 没人认领. */
  label: string;
  /** The subtask holding it, as listed in the round's subagents. */
  subagent_id?: string;
  /** The person holding it. */
  actor_id?: string;
}

export interface AgentStepBoard {
  board_id: string;
  version: number;
  terminal: boolean;
  /** In execution order: dependencies first, the original plan order breaking ties. */
  nodes: Array<{
    id: string;
    state: "not-started" | "ready" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";
    /** Who reported (本会话, 子任务「…」, 用户); a handover says so. */
    reports: Array<{ note: string; at_ms: number; by?: string; handover?: true }>;
    owner?: AgentStepOwner;
    /** The SDK node title; a person's inserted step carries its own. */
    title?: string;
    depends_on?: string[];
    /** Added by a person during the run, not part of the confirmed plan. */
    inserted?: boolean;
  }>;
}

/**
 * A person's change to a running plan. Each one is an SDK board operation recorded as a report on the
 * board itself; the confirmed plan Artifact is never rewritten.
 */
export type AgentStepAmendment =
  | { kind: "skip"; node: string; reason: string }
  /** `mine`: the person takes the new step on themselves. */
  | { kind: "insert"; after: string; title: string; acceptance: string; mine?: true }
  | { kind: "unblock"; node: string; note: string }
  | { kind: "move"; node: string; direction: "up" | "down" }
  /** Hand an unfinished step to the person themselves, or back to the round's session. */
  | { kind: "assign"; node: string; to: "me" | "session" }
  /** The person's own result on a step they hold. */
  | { kind: "resolve"; node: string; state: "succeeded" | "failed"; note: string };

/**
 * Exactly what the Host froze for one Run. Later settings changes never alter a
 * started Run; the product shows this, not the next-run selection.
 */
export interface AgentFrozenCharacter extends CharacterContent {
  reference: ArtifactReference;
  board_id: string;
  content_digest: string;
  producer: ArtifactProducerIdentity;
  published_at: string;
}

interface AgentFrozenStartFields {
  action_tools?: ExactActionReference[];
  /** Exact imported Skill ids used by this Run; the full Character snapshot remains immutable. */
  character_skill_ids?: string[];
  execution_plan?: AgentExecutionPlan;
  /** The earlier round of this session whose unfinished step graph this Run continues, instead of a new graph. */
  continues_step_board_of?: string;
  /** Child directory grants frozen for this run; never a grant to write the parent. */
  subagent_workspaces?: AgentSubagentWorkspace[];
  /** Authoritative fixed Character content and source at start, never looked up for history. */
  character?: AgentFrozenCharacter;
  role_id: string;
  role_version: number;
  execution: AgentRoleExecution;
  model_id: string;
  /** Host-frozen context selection policy, absent when not wired for this runtime. */
  compaction?: { prompt_id: string; version: number; above_tokens: number };
  /**
   * The window this Run was packed against (the model's own, capped by the runtime), and whether the provider's input
   * count already includes cached prompt tokens. Absent on runs started before it was recorded.
   */
  model_context?: { window_tokens: number; prompt_includes_cache: boolean };
  /** Present when this Run started from the Host's digest of earlier rounds instead of their verbatim history. */
  history?: "digest";
  /** Present when the model was asked to think before answering (the provider's setting when the Run started). */
  thinking?: "adaptive";
  /**
   * Exactly the prompts this Run was frozen with, layer included.
   *
   * The layer travels so a surface can show *who* said each part — product,
   * Plugin role, or project. Without it the list is a flat set of ids that
   * nobody can attribute, which is the state this used to be in.
   */
  prompts: Array<{ prompt_id: string; version: number; layer: AgentPromptLayer }>;
  skills: AgentSkillDeclaration[];
  mcp_tools: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  host_tools: string[];
  text_materials: Array<{ material_id: string; title?: string; source_artifact_id: string; source_version: number }>;
  budget: AgentRunBudget | null;
}
export type AgentFrozenStart = AgentFrozenStartFields & AgentWorkspace;

interface AgentCreateSessionFields {
  board_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  title: string;
}
export type AgentCreateSessionInput = AgentCreateSessionFields & (
  | { workspace?: "required"; directory: AgentWorkingDirectory; role_id?: string }
  | { workspace: "none"; directory?: never; role_id: string }
);

/**
 * The role as the Host froze it, taken from the Plugin's own declarations.
 *
 * An adapter receives this and never invents a prompt, a version or a wider
 * execution level: prompt bodies belong to the Plugin package, and the Host is
 * the only place allowed to decide what a Run is permitted to do.
 */
export interface AgentFrozenSubagentRole {
  role_id: string; version: number; name: string; execution: AgentRoleExecution;
  prompts: AgentPromptText[]; host_tools: string[];
}

export interface AgentSubagentWorkspace {
  workspace_id: string;
  directory: AgentWorkingDirectory;
}

export interface AgentActionClient {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ExactActionReference, input: unknown, signal?: AbortSignal): Promise<unknown>;
}

export interface AgentFrozenRole {
  workspace?: "required" | "none";
  /** Trusted Host composition only. Never serialized into run history. */
  actions?: { tools: ActionView[]; client: AgentActionClient };
  character_skill_ids?: string[];
  subagent_workspaces?: AgentSubagentWorkspace[];
  subagents?: AgentFrozenSubagentRole[];
  character?: AgentFrozenCharacter;
  role_id: string;
  version: number;
  execution: AgentRoleExecution;
  /** Separate selection prompt: never composed into the executing role. */
  compaction?: { prompt: AgentPromptText; above_tokens: number };
  /** Prompt bodies in composition order. */
  prompts: AgentPromptText[];
  /** Exact method bodies resolved by the Host, never accepted from the request. */
  skills?: AgentSkillDefinition[];
  /** Host tool names this role may call. */
  host_tools: string[];
}

interface AgentStartRequestFields {
  action_tools?: ExactActionReference[];
  /** Explicit subset of the selected Character's imported Skills. Empty uses rules only. */
  character_skill_ids?: string[];
  execution_plan?: AgentExecutionPlan;
  /**
   * Continue the unfinished step graph of this earlier round in the same session. The plan must be exactly the
   * one that round was frozen with; a person's inserted and skipped steps carry over because the graph does.
   */
  continue_step_board_of?: string;
  /**
   * How earlier rounds of the session reach this one. Absent or `session` carries every earlier round verbatim, tool
   * output included. `digest` starts without that raw history: the task itself carries the caller's digest of earlier
   * rounds, which is how a long session keeps working once its history no longer fits the model's window.
   */
  history?: "session" | "digest";
  /** Selected child roots; the Host must independently verify every directory grant. */
  subagent_workspaces?: AgentSubagentWorkspace[];
  /** Only a reference is accepted from the caller; the Host resolves its immutable content. */
  character?: ArtifactReference | null;
  session: AgentSessionRef;
  board_id: string;
  plugin_id: string;
  install_id: string;
  actor_id: string;
  /** The user's instruction for this Run. */
  task: string;
  role_id: string;
  /** A configured provider/model selected for this run, resolved by the Host. */
  model_selection?: { provider_id: string; model_id: string };
  /**
   * Filled in by the Host before the adapter is called. Absent only on a direct
   * adapter call, which an adapter must refuse rather than guess around.
   */
  role?: AgentFrozenRole;
  text_materials?: AgentTextMaterial[];
  skills?: AgentSkillRef[];
  mcp_tools?: AgentMcpToolRef[];
  mcp_sources?: AgentMcpSourceRef[];
  budget?: AgentRunBudget;
}
export type AgentStartRequest = AgentStartRequestFields & AgentWorkspace;

export interface AgentRunHandle {
  ref: AgentRunRef;
  frozen: AgentFrozenStart;
}

export type AgentRunControl =
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "cancel" }
  /** Append an instruction to the running task. Never a new Run. */
  | { kind: "steer"; text: string }
  /**
   * Answer one question the Run is stopped on.
   *
   * Deliberately not `steer`: an answer is addressed to a specific pending
   * question and closes it. Sending it as a free instruction would leave the
   * question open while the Run reads the text as unrelated guidance.
   */
  | { kind: "answer"; pending_id: string; pending_revision?: number; text?: string;
      answers?: ReadonlyArray<{ question: number; indexes: readonly number[]; other?: string }> };

export type AgentTurnKind = "user" | "assistant" | "system" | "notice";

export interface AgentTurnView {
  turn_id: string;
  kind: AgentTurnKind;
  text: string;
  /** Observation time; null when the original replay has no recorded time. */
  at: string | null;
  /** Relative presentation order within this Run, reconstructed from its events. */
  sequence?: number;
  /** Run-owned supplemental input; applied means context inclusion, not compliance. */
  steer?: { id: string; state: "received" | "applied" | "unconfirmed" };
}

export type AgentToolActivityState = "started" | "completed" | "failed" | "unknown";

export interface AgentToolActivity {
  call_id: string;
  name: string;
  /** Safe target summary (path, command, query). Never raw credentials. */
  target: string;
  state: AgentToolActivityState;
  summary: string;
  /** Bounded execution evidence, shown only when the user expands the activity. */
  output?: string;
  output_truncated?: boolean;
  /** On a display copy only: lines of output left out because the surface never shows them. */
  output_hidden_lines?: number;
  /** Last observation time; null when absent from the original replay. */
  at: string | null;
  /** Position of the original call; a result updates it without moving it. */
  sequence?: number;
}

export interface AgentTokenCount {
  input: number;
  output: number;
  cached_input?: number;
  cache_creation?: number;
  reasoning?: number;
}

/** Partial values are known subtotals; estimated values are not provider bills. */
export type AgentUsageCoverage = "unknown" | "reported" | "estimated" | "partial" | "partial-estimated";

export interface AgentRunUsage {
  /** These totals include attributed calls; incomplete operations may lack final receipts. */
  compaction?: { recorded_calls: number; incomplete: boolean };
  tokens: AgentTokenCount;
  cost_usd?: number;
  /** Per-field provenance; absent on legacy runtimes. Unknown numeric placeholders must not be displayed. */
  coverage?: Record<"input" | "output" | "cached_input" | "cache_creation" | "cost_usd", AgentUsageCoverage>;
  /** Missing, interrupted or estimated scope; known subtotals remain readable with this warning. */
  unavailable_reason?: string;
  /**
   * How much of the model's window the latest main call used: its whole prompt as the provider counted it (cached
   * parts included). Absent until a call is recorded; compaction calls never count.
   */
  context?: { tokens: number; coverage: AgentUsageCoverage };
}

export interface AgentCommandOutputRef {
  call_id: string;
  /** Required for unambiguous product links; legacy callers may omit it. */
  run_id?: string;
}

export interface AgentCommandOutput {
  ref: AgentCommandOutputRef;
  command: string;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  timed_out?: boolean;
  cancelled?: boolean;
  stop_reason?: "cancelled" | "timed-out";
}

/**
 * A question the Run stopped on and is waiting for a person to answer.
 *
 * Options are what the Runtime offered. An empty list means free text only —
 * never a hidden default, because answering on the user's behalf is the one
 * thing a question surface must not do.
 */
export interface AgentPendingQuestion {
  pending_id: string;
  pending_revision?: number;
  /** Position of the original waiting event among this Run's visible entries. */
  sequence?: number;
  /** The Runtime's own category, e.g. a plan choice or a clarification. */
  kind: string;
  /** The question as the Runtime phrased it. Shown as-is. */
  prompt: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Whether a written answer is accepted alongside, or instead of, the options. */
  allows_free_text: boolean;
  /** Frozen questionnaire read from its execution owner, never reconstructed from prose. */
  questions?: ReadonlyArray<{ index: number; prompt: string;
    options: ReadonlyArray<{ index: number; label: string }>; multiple: boolean; allow_other: boolean }>;
  answerable?: boolean;
  unavailable_reason?: string;
}

export interface AgentRunView {
  step_board?: AgentStepBoard;
  step_board_error?: string;
  ref: AgentRunRef;
  phase: AgentRunPhase;
  frozen: AgentFrozenStart;
  turns: AgentTurnView[];
  activity: AgentToolActivity[];
  /** References to durable command facts, not inferred from assistant text. */
  command_outputs?: AgentCommandOutputRef[];
  usage: AgentRunUsage;
  /**
   * Questions this Run is stopped on. Empty while it is running.
   *
   * The phase alone was not enough: a surface could see `awaiting-input` but
   * had no way to show what was being asked, so the Run stalled with the user
   * unable to act.
   */
  awaiting_input: readonly AgentPendingQuestion[];
  /** Content-free reason when the Run stopped, failed or needs reconciliation. */
  stop_reason?: string;
  started_at: string;
  ended_at: string | null;
}

export interface AgentSessionView {
  /** Immutable session mode; missing historical values mean required. */
  workspace?: "required" | "none";
  /** A manual rewind is in progress or has an unresolved execution outcome. */
  checkpoint_busy?: boolean;
  /** Persisted work exists but is not safe to continue automatically. */
  recovery?: { required: true; reason: string };
  owner: Pick<AgentCreateSessionInput, "board_id" | "plugin_id" | "install_id"> & { actor_id?: string };
  session: AgentSessionRef;
  title: string;
  runs: AgentRunRef[];
  latest_run: AgentRunView | null;
}

/** Where a session stands, without its rounds: enough for a directory of many sessions. */
export interface AgentSessionStatus {
  session_id: string;
  /** The latest round's phase; null before the first round. */
  latest_phase: AgentRunPhase | null;
  /** Persisted work exists but is not safe to continue automatically. */
  recovery: boolean;
  checkpoint_busy: boolean;
  /** Unfinished steps on the session's latest unfinished plan graph, by who holds them; absent when there are none. */
  steps?: { mine: number; subtasks: number; unowned: number };
}

export type AgentReviewKind = "text-edit" | "command" | "tool-operation" | "mcp" | "rewind" | "git-index" | "git-integration";

export interface AgentTextReviewDocument {
  kind: "text-edit";
  /** Actual child root, when this proposal comes from an isolated subtask. */
  workspace_path?: string;
  target_path: string;
  exists: boolean;
  before_text: string | null;
  after_text: string;
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
}

export interface AgentToolOperationReviewDocument {
  kind: "tool-operation";
  tool: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
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
  board_id: string;
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
  /**
   * A person approving a command may also allow the same command for the rest of this Agent session.
   * Only an in-boundary command qualifies; the Host records who set it and applies it to exact repeats.
   */
  remember?: "session";
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
  list(boardId: string, status?: AgentReviewStatus): AgentReviewRequest[];
  get(reviewId: string): AgentReviewRequest | null;
  decide(input: AgentReviewDecisionInput): AgentReviewReceipt;
  receipt(reviewId: string): AgentReviewReceipt | null;
  observe(listener: (request: AgentReviewRequest) => void): () => void;
}

export interface AgentCheckpoint {
  checkpoint_id: string;
  origin_run_id?: string;
  paths?: string[];
  directory?: AgentWorkingDirectory;
  session_id: string;
  label: string;
  created_at: string;
  /** When a reviewed rewind to this checkpoint last took effect, if one has; the files may have changed since. */
  rewound_at?: string;
}

export interface AgentCheckpointsCapability {
  busy?(session: AgentSessionRef): boolean;
  list(session: AgentSessionRef): Promise<AgentCheckpoint[]>;
  prepareRewind(session: AgentSessionRef, checkpointId: string): Promise<AgentReviewRequest>;
}

export interface AgentSkillCatalogEntry extends AgentSkillDeclaration {
  source: "builtin" | "installed";
  enabled: boolean;
}

export interface AgentSkillOwner { board_id: string; plugin_id: string }
export interface AgentSkillCandidate {
  candidate_id: string;
  name: string;
  summary: string;
  source_label: string;
  files: string[];
  body: string;
}
export interface AgentSkillLibrary {
  list(owner: AgentSkillOwner): Promise<AgentSkillCatalogEntry[]>;
  read(owner: AgentSkillOwner, ref: AgentSkillRef): Promise<AgentSkillDefinition>;
  discover(owner: AgentSkillOwner, directory: AgentWorkingDirectory, path: string): Promise<AgentSkillCandidate[]>;
  install(owner: AgentSkillOwner, candidateId: string): Promise<AgentSkillCatalogEntry>;
}

export interface AgentSkillsCapability {
  catalog(session: AgentSessionRef): Promise<AgentSkillCatalogEntry[]>;
}

export interface AgentMcpServerHealth {
  server: string;
  status: "ready" | "failed" | "unknown";
}

export interface AgentMcpServerInput {
  id?: string;
  expected_version: number;
  label: string;
  enabled: boolean;
  timeout_ms: number;
  transport: "stdio" | "http";
  directory?: AgentWorkingDirectory;
  executable?: string;
  argv?: string[];
  endpoint?: string;
  auth?: { kind: "none" | "keep-existing" | "replace-secret" | "connection"; secret?: string; connection_id?: string };
}
export interface AgentMcpServerView {
  id: string; version: number; label: string; enabled: boolean;
  transport: "stdio" | "http"; timeout_ms: number;
  directory?: AgentWorkingDirectory; executable?: string; argv?: string[]; endpoint?: string;
  credential: "none" | "present";
  auth_connection_id?: string;
  health: "connected" | "disconnected" | "unavailable" | "not-reattached";
  busy?: string; error?: string;
  tools: Array<AgentMcpToolRef & { description: string }>;
  resources: string[];
}
export interface AgentMcpLibrary {
  list(owner: AgentSkillOwner): Promise<AgentMcpServerView[]>;
  save(owner: AgentSkillOwner, input: AgentMcpServerInput): Promise<AgentMcpServerView>;
  control(owner: AgentSkillOwner, id: string, action: "connect" | "disconnect" | "cancel" | "remove"): Promise<void>;
  validateSources(owner: AgentSkillOwner, selected: readonly AgentMcpSourceRef[]): Promise<AgentMcpSourceRef[]>;
  validate(owner: AgentSkillOwner, selected: readonly AgentMcpToolRef[]): Promise<AgentMcpToolRef[]>;
}

export interface AgentMcpCapability {
  catalog(session: AgentSessionRef): Promise<{
    servers: AgentMcpServerHealth[];
    tools: AgentMcpToolRef[];
  }>;
}

export type AgentSubagentState = "running" | "completed" | "failed" | "cancelled" | "reconcile-required";

export interface AgentSubagentView {
  child_run?: AgentRunRef;
  activity?: AgentToolActivity[];
  usage?: AgentRunUsage;
  host_tools?: string[];
  error?: string;
  subagent_id: string;
  parent_run: AgentRunRef;
  role_id: string;
  /** Name frozen at dispatch, unaffected by later role edits. */
  role_name?: string;
  task: string;
  state: AgentSubagentState;
  result: string | null;
  workspace_path: string | null;
}

export interface AgentSubagentsCapability {
  /** Distinct child roots and their review/recovery bridge are actually wired. */
  workspaces?: true;
  list(run: AgentRunRef): Promise<AgentSubagentView[]>;
  cancel(run: AgentRunRef, subagentId: string, actorId: string): Promise<void>;
}

/**
 * One Agent Runtime. An adapter reports facts and executes approved work; it
 * never owns approval, business meaning or durable product state.
 */
export interface AgentRecoveryReport {
  session_id: string;
  blockers: string[];
  runs: Array<{
    run_id: string;
    version: number;
    live: boolean;
    waiting: number;
    can_close: boolean;
    blockers: string[];
    operations: Array<{ effect_id: string; kind: string; summary: string; outcome: "completed" | "failed" | "not-dispatched" | "unknown" }>;
    /** The interrupted round belongs to this subtask of the session; closing it settles the subtask. */
    subagent?: { subagent_id: string };
  }>;
}

/** Inspect authoritative receipts; closing records an interruption and never replays work. */
export interface AgentRecoveryCapability {
  inspect(session: AgentSessionRef): Promise<AgentRecoveryReport>;
  close(session: AgentSessionRef, runId: string, expectedVersion: number): Promise<AgentRecoveryReport>;
}

/** Host-owned, in-memory authority checks; never part of a Plugin payload or persisted run. */
export interface AgentStartExecution {
  beforeStart?(): void | Promise<void>;
  /** Live owner authority, valid beyond the start invocation's lifetime. */
  beforeDispatch?(): void | Promise<void>;
}

export interface AgentRuntimeAdapter {
  readonly recovery?: AgentRecoveryCapability;
  readonly descriptor: AgentRuntimeDescriptor;
  health(): Promise<AgentRuntimeHealth>;
  createSession(input: AgentCreateSessionInput): Promise<AgentSessionRef>;
  readSession(session: AgentSessionRef): Promise<AgentSessionView>;
  /** The session's standing without copying its rounds; a Runtime without it is read through readSession. */
  readSessionStatus?(session: AgentSessionRef): Promise<{ owner: AgentSessionView["owner"]; status: AgentSessionStatus }>;
  start(request: AgentStartRequest, execution?: AgentStartExecution): Promise<AgentRunHandle>;
  read(run: AgentRunRef): Promise<AgentRunView>;
  observe(run: AgentRunRef, listener: (view: AgentRunView) => void): () => void;
  control(run: AgentRunRef, control: AgentRunControl): Promise<void>;
  readCommandOutput(
    session: AgentSessionRef,
    ref: AgentCommandOutputRef,
  ): Promise<AgentCommandOutput>;
  readonly checkpoints?: AgentCheckpointsCapability;
  readonly skills?: AgentSkillsCapability;
  readonly skillLibrary?: AgentSkillLibrary;
  readonly mcpLibrary?: AgentMcpLibrary;
  readonly mcp?: AgentMcpCapability;
  readonly subagents?: AgentSubagentsCapability;
  /** Adjust a running plan's step graph on behalf of a person. Absent when the Runtime has no step graphs. */
  amendStepBoard?(run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number, actorId: string): Promise<AgentStepBoard>;
}

/**
 * Every failure the Agent Host and its adapters can report.
 *
 * This is the whole domain, not a sample: each error class narrows from it with
 * `Extract`, so a code that is thrown but not listed here stops compiling. An
 * earlier version listed eight codes while seventeen were in use, and declared
 * one (`agent.review_required`) that nothing ever threw.
 */
export type AgentHostErrorCode =
  // Runtime registry
  | "agent.runtime_unknown"
  | "agent.runtime_duplicate"
  | "agent.runtime_missing"
  // Start authority: the three gates, plus what the adapter needs before it runs
  | "agent.capability_unavailable"
  | "agent.role_not_declared"
  | "agent.role_not_frozen"
  | "agent.role_execution_exceeded"
  | "agent.directory_unauthorized"
  | "agent.model_not_configured"
  // Session and run lookup
  | "agent.session_unknown"
  | "agent.session_busy"
  | "agent.run_unknown"
  // Host-owned review queue
  | "agent.review_unknown"
  | "agent.review_already_decided"
  | "agent.review_expired"
  | "agent.review_not_approved"
  // Approval bridge between a Runtime's pending effect and the queue
  | "agent.pending_unknown"
  | "agent.pending_not_open";

export interface AgentHostApi {
  register(adapter: AgentRuntimeAdapter): void;
  descriptors(): AgentRuntimeDescriptor[];
  adapter(runtimeId: string): AgentRuntimeAdapter;
  matrix(runtimeIds: string[]): Array<{
    runtime_id: string;
    capabilities: AgentRuntimeCapabilityMatrix;
  }>;
  readonly reviews: AgentReviewQueueApi;
}

/**
 * Capabilities the Host registers so Plugins can reach the Agent Host.
 *
 * A Plugin never holds the Agent Host itself: it declares these under
 * `capabilities.consumes` and `requires`, and the Host checks the declaration
 * before the call lands. That keeps the Manifest a complete account of what a
 * Plugin can reach, and keeps start authority in one place.
 */
/** What to draft: the purpose in a few words, how to write it, and the material it is drawn from. */
export interface AgentDraftTextRequest {
  purpose: string;
  instructions: string;
  material: string;
  model_selection?: { provider_id: string; model_id: string };
}
export interface AgentDraftTextResult {
  text: string;
  /** Tokens the call used, when the provider reported them. */
  usage: { input: number; output: number } | null;
}

export const agentHostCapabilities = {
  listActions: { capability_id: "agent.actions.list.v1", version: 1, operation: "query" } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], readonly ActionView[]>,
  /** Which Runtimes exist and what each one really supports. */
  listRuntimes: {
    capability_id: "agent.runtimes.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[], AgentRuntimeDescriptor[]>,
  /** Roles this Runtime can carry for one Plugin, with a reason for each it cannot. */
  availableRoles: {
    capability_id: "agent.roles.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [runtimeId: string, pluginId: string],
    Array<{ role_id: string; available: boolean; reason?: string }>
  >,
  createSession: {
    capability_id: "agent.session.create.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, input: AgentCreateSessionInput],
    AgentSessionRef
  >,
  listSubagents: {
    capability_id: "agent.subagents.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentSubagentView[]>,
  cancelSubagent: {
    capability_id: "agent.subagents.cancel.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, subagentId: string, actorId: string], void>,
  /** A person adjusts the running plan's step graph; the version guards against a concurrent change. */
  amendStepBoard: {
    capability_id: "agent.run.step-board.amend.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, amendment: AgentStepAmendment, expectedVersion: number], AgentStepBoard>,
  readSession: {
    capability_id: "agent.session.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentSessionView>,
  /**
   * Many sessions' standing in one call, for a directory: one queued operation instead of one per session. A session
   * this project cannot read comes back with an error of its own rather than failing the others.
   */
  readSessionStatuses: {
    capability_id: "agent.sessions.status.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, sessionIds: string[]], Array<AgentSessionStatus | { session_id: string; error: string }>>,
  listSkills: {
    capability_id: "agent.skills.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentSkillCatalogEntry[]>,
  readSkill: {
    capability_id: "agent.skills.read.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, ref: AgentSkillRef], AgentSkillDefinition>,
  discoverSkills: {
    capability_id: "agent.skills.discover.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, directory: AgentWorkingDirectory, path: string], AgentSkillCandidate[]>,
  installSkill: {
    capability_id: "agent.skills.install.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, candidateId: string], AgentSkillCatalogEntry>,
  listMcp: {
    capability_id: "agent.mcp.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string], AgentMcpServerView[]>,
  saveMcp: {
    capability_id: "agent.mcp.save.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, input: AgentMcpServerInput], AgentMcpServerView>,
  controlMcp: {
    capability_id: "agent.mcp.control.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[runtimeId: string, pluginId: string, id: string, action: "connect" | "disconnect" | "cancel" | "remove"], void>,
  /** Start a Run. The Host checks role, capability and directory before the Runtime is asked. */
  startRun: {
    capability_id: "agent.run.start.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [runtimeId: string, request: AgentStartRequest],
    AgentRunHandle
  >,
  readRun: {
    capability_id: "agent.run.read.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], AgentRunView>,
  /**
   * Resolves once the run's view differs from the version the caller holds, or at the timeout (at most 25 s).
   * How a surface follows a live round as it happens instead of rereading it on a timer; nothing is replayed.
   */
  /**
   * One short text from the model — a commit message, say — with no tools, no conversation and nothing recorded as a
   * round. It is a model call and costs what one costs; the usage comes back so the page can say so. It writes nothing
   * of the project's, so a draft that takes a minute runs beside the project's other operations instead of ahead of them.
   */
  draftText: {
    capability_id: "agent.draft-text.v1",
    version: 1,
    operation: "command",
    scheduling: "concurrent",
  } as HostCapabilityDefinition<AgentDraftTextRequest, AgentDraftTextResult>,
  waitRun: {
    capability_id: "agent.run.wait.v1",
    version: 1,
    operation: "wait",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, since: string | null, timeoutMs: number], { version: string; view: AgentRunView }>,
  controlRun: {
    capability_id: "agent.run.control.v1",
    version: 1,
    operation: "command",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, run: AgentRunRef, control: AgentRunControl],
    void
  >,
  /**
   * Read what one command this Run executed produced.
   *
   * This is a receipt of work already done, never a way to run something: there
   * is deliberately no command-execution Capability. A Runtime that has not
   * wired command execution to the Host's approval queue reports `command` as
   * unsupported, and this call then fails with `agent.capability_unavailable`
   * rather than returning an empty result.
   */
  readCommandOutput: {
    capability_id: "agent.command-output.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [session: AgentSessionRef, ref: AgentCommandOutputRef],
    AgentCommandOutput
  >,
  inspectRecovery: {
    capability_id: "agent.session.recovery.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentRecoveryReport>,
  recoverRun: {
    capability_id: "agent.session.recover.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef, expectedVersion: number], AgentRecoveryReport>,
  listCheckpoints: {
    capability_id: "agent.checkpoints.list.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef], AgentCheckpoint[]>,
  prepareRewind: {
    capability_id: "agent.checkpoints.prepare-rewind.v1", version: 1, operation: "command",
  } as HostCapabilityDefinition<[session: AgentSessionRef, checkpointId: string, roleId: string], AgentReviewRequest>,
  /** Read the approval queue. Deciding is a user action and is not exposed to Plugins. */
  readRunReviews: {
    capability_id: "agent.run.reviews.v1", version: 1, operation: "query",
  } as HostCapabilityDefinition<[session: AgentSessionRef, run: AgentRunRef], Array<{ request: AgentReviewRequest; receipt: AgentReviewReceipt | null }>>,
  listReviews: {
    capability_id: "agent.reviews.list.v1",
    version: 1,
    operation: "query",
  } as HostCapabilityDefinition<
    [boardId: string, status?: AgentReviewStatus],
    AgentReviewRequest[]
  >,
} as const;

export type AgentHostCapabilityId =
  (typeof agentHostCapabilities)[keyof typeof agentHostCapabilities]["capability_id"];

/** Dedicated generated-plugin authoring port; implementations remain in Agent Host. */
export interface BuilderAgentActivity {
  type: 'file' | 'check' | 'tool';
  name: string;
  detail: string;
  path?: string;
}
export interface BuilderAgentRequest {
  /** `model` is a generated plugin's own model call: one turn, no tools, the plugin's instructions. */
  role: 'designer' | 'coder' | 'model';
  instruction: string;
  promptVersion: string;
  task: string;
  contractRevision: string;
  operationIds?: readonly string[];
  signal?: AbortSignal;
  checks?(operationIds: readonly string[], signal: AbortSignal): Promise<unknown>;
  onActivity?(activity: BuilderAgentActivity): void;
}
export interface BuilderAgentRecord {
  id: string;
  role: BuilderAgentRequest['role'];
  promptVersion: string;
  contractRevision: string;
  instruction: string;
  input: string;
  output: string;
  configuredModel: string;
  /** Empty means the provider did not report its actual model; never substitute the requested model. */
  reportedModels: string[];
  sessionId?: string;
  runId?: string;
  phase: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  activity: BuilderAgentActivity[];
  usage: unknown[];
}
